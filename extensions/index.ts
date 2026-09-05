// pi-mason-bridge — expose Neovim Mason's language-server binaries to OMP.
//
// OMP ships built-in LSP definitions (gopls, pyright, rust-analyzer, …) but
// only activates a server whose executable is discoverable. This extension
// prepends Mason's bin dir to PATH once, at session load — before OMP
// resolves its LSP config — so the built-ins find Mason's servers. It never
// spawns or manages servers, never installs packages, and fails open when
// Mason is absent.
//
// Optionally, opt in via $PI_MASON_BRIDGE_STATUS to report in the status
// line what this bridge exposed — never what OMP actually activated, since
// OMP has no API for that. "static" lists the server binaries Mason has
// available; "full" additionally marks (best-effort) which of those are
// currently running processes. Unset/unrecognized values are "off": no
// behavior change on upgrade unless set explicitly.
//
// Pure helpers are exported for unit testing (pi-output-styles convention).

import { exec } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

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

// ─────────────────────────────────────────────────────────────────────────
// Status line reporting (opt-in via $PI_MASON_BRIDGE_STATUS)
// ─────────────────────────────────────────────────────────────────────────

export type MasonStatusMode = "off" | "static" | "full";

/**
 * Pure: parse $PI_MASON_BRIDGE_STATUS. Unset or unrecognized values default
 * to "off" — installing/upgrading this plugin never changes existing
 * behavior unless the env var is set explicitly.
 */
export function resolveStatusMode(raw: string | undefined): MasonStatusMode {
  const value = raw?.trim().toLowerCase();
  if (value === "static") return "static";
  if (value === "full") return "full";
  return "off";
}

/** Server binary names present in Mason's bin dir, sorted. Empty array if unreadable. */
export function listMasonServers(masonBin: string): string[] {
  try {
    return readdirSync(masonBin).sort();
  } catch {
    return [];
  }
}

/**
 * Pure: parse `ps -A -o comm=`-style output (one command per line, bare
 * name or full path) into a set of basenames.
 */
export function parseRunningCommands(psOutput: string): Set<string> {
  const out = new Set<string>();
  for (const line of psOutput.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) out.add(basename(trimmed));
  }
  return out;
}

const execAsync = promisify(exec);

/**
 * Best-effort: which of `names` are currently running as processes. Empty
 * set on any failure, on Windows, or when `names` is empty. This is a
 * heuristic, not a guarantee of what OMP activated: it misses non-Mason
 * servers (e.g. a project's own .venv basedpyright), and a same-named
 * process could be running for an unrelated reason.
 */

export async function currentlyRunningMasonServers(names: string[]): Promise<Set<string>> {
  if (names.length === 0 || process.platform === "win32") return new Set();
  try {
    const { stdout } = await execAsync("ps -A -o comm=", { timeout: 2000 });
    const running = parseRunningCommands(stdout);
    return new Set(names.filter((name) => running.has(name)));
  } catch {
    return new Set();
  }
}

/**
 * Pure: build the status line text. Undefined means "nothing to show" (no
 * servers found) — callers should clear any prior status with this value.
 */
export function formatMasonStatus(names: string[], running: ReadonlySet<string>): string | undefined {
  if (names.length === 0) return undefined;
  const parts = names.map((name) => (running.has(name) ? `${name} \u25cf` : name));
  return `mason: ${parts.join(", ")}`;
}

/** Minimal structural shape of the OMP/Pi extension hook API this file uses. */
interface StatusUI {
  setStatus(key: string, text: string | undefined): void;
}
interface HookContext {
  ui: StatusUI;
}
interface ExtensionApi {
  on(event: "session_start" | "turn_end", handler: (event: unknown, ctx: HookContext) => void | Promise<void>): void;
}

export function registerStatusHooks(pi: ExtensionApi | undefined, masonBin: string): void {
  const mode = resolveStatusMode(process.env.PI_MASON_BRIDGE_STATUS);
  if (mode === "off" || typeof pi?.on !== "function") return;

  const refresh = async (_event: unknown, ctx: HookContext): Promise<void> => {
    try {
      const names = listMasonServers(masonBin);
      const running = mode === "full" ? await currentlyRunningMasonServers(names) : new Set<string>();
      ctx.ui.setStatus("mason-bridge", formatMasonStatus(names, running));
    } catch {
      // Fail open: a status refresh must never break a turn.
    }
  };

  pi.on("session_start", refresh);
  if (mode === "full") {
    pi.on("turn_end", refresh);
  }
}

export default async function (pi?: ExtensionApi): Promise<void> {
  // Fail open: Mason absent (or dir missing) → no-op, never throw.
  try {
    const masonBin = masonBinDir();
    if (!masonBin || !existsSync(masonBin)) return;
    applyMasonPath();
    registerStatusHooks(pi, masonBin);
  } catch {
    // never break OMP startup
  }
}
