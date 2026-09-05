import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMasonPath,
  applyThemeColor,
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

  it("extracts a script name from an interpreter-launched full command line (regression: Node-based LSP servers report as \"node\", not their script name)", () => {
    const running = parseRunningCommands("node /home/u/.local/share/nvim/mason/bin/bash-language-server start\n");
    expect(running.has("bash-language-server")).toBe(true);
    expect(running.has("node")).toBe(true);
  });

  it("extracts a symlinked binary's invoked name even when it differs from the resolved target's own process name (regression: Mason's marksman -> marksman-macos)", () => {
    // The OS still records the invoked path (the symlink name) as an argv
    // token, even though the resolved binary reports its own comm as
    // "marksman-macos" -- observed on a real Mason install.
    const running = parseRunningCommands("/home/u/.local/share/nvim/mason/bin/marksman\n");
    expect(running.has("marksman")).toBe(true);
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
  it("returns undefined when nothing is running (silent, not an inventory)", () => {
    expect(formatMasonStatus(new Set())).toBeUndefined();
  });

  it("stays silent even for a large candidate set with nothing running (regression: 73-entry real Mason dir)", () => {
    // formatMasonStatus only ever sees the running set, never the full candidate
    // list, so a large Mason install with nothing active produces no output at all.
    expect(formatMasonStatus(new Set())).toBeUndefined();
  });

  it("shows a single running name with the LSP icon prefix", () => {
    expect(formatMasonStatus(new Set(["gopls"]))).toBe("\uf1e6 gopls running");
  });

  it("shows multiple running names, sorted", () => {
    expect(formatMasonStatus(new Set(["pyright", "gopls"]))).toBe("\uf1e6 gopls, pyright running");
  });

  it("caps the running-name list and summarizes the overflow as a count", () => {
    const running = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]); // 8 running, cap is 6
    expect(formatMasonStatus(running)).toBe("\uf1e6 a, b, c, d, e, f +2 more running");
  });
});

describe("applyThemeColor", () => {
  it("wraps text using the provided theme", () => {
    const fakeTheme = { fg: (color: string, text: string) => `<${color}>${text}</${color}>` };
    expect(applyThemeColor(fakeTheme, "gopls running")).toBe("<success>gopls running</success>");
  });

  it("returns plain text when no theme is provided", () => {
    expect(applyThemeColor(undefined, "gopls running")).toBe("gopls running");
  });

  it("falls back to plain text when theming throws (fail open, never throws itself)", () => {
    const throwingTheme = {
      fg: () => {
        throw new Error("unknown theme color");
      },
    };
    expect(() => applyThemeColor(throwingTheme, "gopls running")).not.toThrow();
    expect(applyThemeColor(throwingTheme, "gopls running")).toBe("gopls running");
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
