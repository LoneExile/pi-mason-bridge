import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMasonPath,
  currentlyRunningMasonServers,
  formatMasonStatus,
  listMasonServers,
  parseRunningCommands,
  prependMasonToPath,
  registerStatusHooks,
  resolveStatusMode,
} from "../extensions/index";

const MASON = "/home/u/.local/share/nvim/mason/bin";

describe("prependMasonToPath", () => {
  it("prepends mason bin once at the front when absent", () => {
    const out = prependMasonToPath("/usr/bin:/bin", MASON, ":");
    expect(out).toBe(`${MASON}:/usr/bin:/bin`);
  });

  it("leaves the path unchanged when mason bin is already present", () => {
    const path = `${MASON}:/usr/bin:/bin`;
    expect(prependMasonToPath(path, MASON, ":")).toBe(path);
  });

  it("does not duplicate mason bin when present not at the front", () => {
    const path = `/usr/bin:${MASON}:/bin`;
    expect(prependMasonToPath(path, MASON, ":")).toBe(path);
  });

  it("handles empty PATH", () => {
    expect(prependMasonToPath("", MASON, ":")).toBe(MASON);
  });

  it("drops empty entries", () => {
    expect(prependMasonToPath("/usr/bin::/bin", MASON, ":")).toBe(`${MASON}:/usr/bin:/bin`);
  });

  it("uses windows delimiter on win32 default", () => {
    expect(prependMasonToPath("C:\\bin;D:\\bin", "C:\\mason\\bin", ";")).toBe(
      "C:\\mason\\bin;C:\\bin;D:\\bin",
    );
  });
});

describe("applyMasonPath", () => {
  it("is idempotent across repeated calls", () => {
    const original = process.env.PATH;
    try {
      process.env.MASON = "/tmp/fake-mason";
      process.env.PATH = "/usr/bin:/bin";
      applyMasonPath();
      const once = process.env.PATH;
      applyMasonPath();
      expect(process.env.PATH).toBe(once);
      expect(process.env.PATH!.split(":").filter((p) => p.includes("fake-mason")).length).toBe(1);
    } finally {
      process.env.PATH = original;
      delete process.env.MASON;
    }
  });
});

/** Run `fn` with `process.env[name]` set to `value` (or deleted, if undefined), then restore it. */
function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const original = process.env[name];
  try {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    fn();
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}

describe("resolveStatusMode", () => {
  it("defaults to off when unset", () => {
    expect(resolveStatusMode(undefined)).toBe("off");
  });

  it("defaults to off for an empty string", () => {
    expect(resolveStatusMode("")).toBe("off");
  });

  it("defaults to off for an unrecognized value", () => {
    expect(resolveStatusMode("verbose")).toBe("off");
  });

  it("recognizes static", () => {
    expect(resolveStatusMode("static")).toBe("static");
  });

  it("recognizes full", () => {
    expect(resolveStatusMode("full")).toBe("full");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveStatusMode("  FULL  ")).toBe("full");
  });
});

describe("listMasonServers", () => {
  it("returns sorted binary names from a real directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "mason-bridge-test-"));
    try {
      writeFileSync(join(dir, "rust-analyzer"), "");
      writeFileSync(join(dir, "gopls"), "");
      writeFileSync(join(dir, "pyright-langserver"), "");
      expect(listMasonServers(dir)).toEqual(["gopls", "pyright-langserver", "rust-analyzer"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty array for a nonexistent directory", () => {
    expect(listMasonServers("/nonexistent/mason/bin/for-real")).toEqual([]);
  });
});

describe("parseRunningCommands", () => {
  it("parses bare names, one per line", () => {
    expect(parseRunningCommands("bash\ngopls\n")).toEqual(new Set(["bash", "gopls"]));
  });

  it("reduces full paths to basenames", () => {
    expect(parseRunningCommands("/usr/local/bin/gopls\n")).toEqual(new Set(["gopls"]));
  });

  it("ignores blank lines", () => {
    expect(parseRunningCommands("gopls\n\n  \nrust-analyzer\n")).toEqual(new Set(["gopls", "rust-analyzer"]));
  });

  it("returns an empty set for empty input", () => {
    expect(parseRunningCommands("")).toEqual(new Set());
  });
});

describe("currentlyRunningMasonServers", () => {
  it("returns an empty set for an empty names list", async () => {
    expect(await currentlyRunningMasonServers([])).toEqual(new Set());
  });

  it("resolves without throwing for a name that is not a running process", async () => {
    const result = await currentlyRunningMasonServers(["definitely-not-a-real-process-xyz"]);
    expect(result).toEqual(new Set());
  });
});

describe("formatMasonStatus", () => {
  it("returns undefined when there are no servers", () => {
    expect(formatMasonStatus([], new Set())).toBeUndefined();
  });

  it("summarizes as a count when nothing is running (never dumps every name)", () => {
    expect(formatMasonStatus(["gopls", "pyright"], new Set())).toBe("mason: 2 available");
  });

  it("stays short even for a large install with nothing running (regression: 73-entry real Mason dir)", () => {
    const names = Array.from({ length: 73 }, (_, i) => `tool-${i}`);
    const out = formatMasonStatus(names, new Set());
    expect(out).toBe("mason: 73 available");
    expect(out!.length).toBeLessThan(20);
  });

  it("lists running names with a count of the rest", () => {
    expect(formatMasonStatus(["gopls", "pyright"], new Set(["gopls"]))).toBe("mason: gopls running · 2 available");
  });

  it("lists multiple running names", () => {
    expect(formatMasonStatus(["gopls", "pyright", "rust-analyzer"], new Set(["gopls", "pyright"]))).toBe(
      "mason: gopls, pyright running · 3 available",
    );
  });

  it("caps the running-name list and summarizes the overflow as a count", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const running = new Set(names); // all 8 running, cap is 6
    expect(formatMasonStatus(names, running)).toBe("mason: a, b, c, d, e, f +2 more running · 8 available");
  });
});

describe("registerStatusHooks", () => {
  function fakePi() {
    const registered: string[] = [];
    const pi = { on: (event: string) => registered.push(event) } as unknown as Parameters<typeof registerStatusHooks>[0];
    return { pi, registered };
  }

  it("registers nothing when the mode is off (default, unset env)", () => {
    const { pi, registered } = fakePi();
    withEnv("PI_MASON_BRIDGE_STATUS", undefined, () => {
      registerStatusHooks(pi, "/tmp/whatever");
      expect(registered).toEqual([]);
    });
  });

  it("registers only session_start in static mode", () => {
    const { pi, registered } = fakePi();
    withEnv("PI_MASON_BRIDGE_STATUS", "static", () => {
      registerStatusHooks(pi, "/tmp/whatever");
      expect(registered).toEqual(["session_start"]);
    });
  });

  it("registers session_start and turn_end in full mode", () => {
    const { pi, registered } = fakePi();
    withEnv("PI_MASON_BRIDGE_STATUS", "full", () => {
      registerStatusHooks(pi, "/tmp/whatever");
      expect(registered).toEqual(["session_start", "turn_end"]);
    });
  });

  it("registers nothing when pi is undefined", () => {
    withEnv("PI_MASON_BRIDGE_STATUS", "full", () => {
      expect(() => registerStatusHooks(undefined, "/tmp/whatever")).not.toThrow();
    });
  });
});
