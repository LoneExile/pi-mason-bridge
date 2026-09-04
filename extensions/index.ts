// omp-mason-bridge — expose Neovim Mason's language-server binaries to OMP.
//
// OMP ships built-in LSP definitions (gopls, pyright, rust-analyzer, …) but
// only activates a server whose executable is discoverable. This extension
// prepends Mason's bin dir to PATH once, at session load — before OMP
// resolves its LSP config — so the built-ins find Mason's servers. It never
// spawns or manages servers, never installs packages, and fails open when
// Mason is absent.
//
// Pure helpers are exported for unit testing (pi-output-styles convention).

import { homedir } from "node:os";
import { join } from "node:path";

/** Default Mason bin dir; override with $MASON. */
export function masonBinDir(): string | null {
  const base = process.env.MASON || join(homedir(), ".local", "share", "nvim", "mason");
  return join(base, "bin");
}

/** PATH list separator: ";" on Windows, ":" elsewhere. */
export function defaultPathDelimiter(): string {
  return process.platform === "win32" ? ";" : ":";
}

/**
 * Pure: return `currentPath` with `masonBin` present exactly once, at the
 * front. No side effects. Empty entries are dropped. If `masonBin` is already
 * present anywhere, the original string is returned unchanged (idempotent).
 */
export function prependMasonToPath(
  currentPath: string,
  masonBin: string,
  delimiter: string = defaultPathDelimiter(),
): string {
  const parts = currentPath.split(delimiter).filter((p) => p.length > 0);
  if (parts.includes(masonBin)) return currentPath;
  return [masonBin, ...parts].join(delimiter);
}

/** Idempotently prepend Mason bin to the live process PATH. */
export function applyMasonPath(): void {
  const masonBin = masonBinDir();
  if (!masonBin) return;
  process.env.PATH = prependMasonToPath(process.env.PATH ?? "", masonBin);
}

export default async function (): Promise<void> {
  // Fail open: Mason absent (or dir missing) → no-op, never throw.
  try {
    const { existsSync } = await import("node:fs");
    if (!existsSync(masonBinDir() ?? "")) return;
    applyMasonPath();
  } catch {
    // never break OMP startup
  }
}
