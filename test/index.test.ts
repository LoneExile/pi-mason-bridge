import { describe, expect, it } from "bun:test";
import { applyMasonPath, prependMasonToPath } from "../extensions/index";

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
