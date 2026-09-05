// pi-mason-bridge — expose Neovim Mason's language-server binaries to OMP.
//
// OMP ships built-in LSP definitions (gopls, pyright, rust-analyzer, …) but
// only activates a server whose executable is discoverable. This extension
// prepends Mason's bin dir to PATH once, at session load — before OMP
// resolves its LSP config — so the built-ins find Mason's servers. It never
// spawns or manages servers, never installs packages, and fails open when
// Mason is absent.
//
// Optionally, opt in via $PI_MASON_BRIDGE_STATUS to show a presence
// indicator in the status line: which Mason-bridged binaries are currently
// running (best-effort process check), never what OMP itself activated —
// OMP has no API for that. Silent whenever nothing is running. "static"
// checks once per session; "full" re-checks every turn. Unset/unrecognized
// values are "off": no behavior change on upgrade unless set explicitly.
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
 * Pure: parse `ps -A -o args=`-style output (one full command line per
 * process, e.g. "node /path/to/bash-language-server start" for
 * interpreter-launched servers, or "/opt/mason/bin/marksman" for native
 * binaries) into the set of basenames of every whitespace-separated token
 * across every line. Splitting the full command line -- not just the
 * process's own short name -- is what still catches an interpreted
 * script (whose own process name is just "node"/"python3") and a binary
 * invoked through a differently-named symlink than its resolved target
 * self-reports (observed: Mason's `marksman` symlink resolves to a
 * binary whose own process name is `marksman-macos`).
 */
export function parseRunningCommands(psOutput: string): Set<string> {
  const out = new Set<string>();
  for (const line of psOutput.split("\n")) {
    for (const token of line.trim().split(/\s+/)) {
      if (token) out.add(basename(token));
    }
  }
  return out;
}

const execAsync = promisify(exec);

/**
 * Best-effort: which of `names` are currently running as processes. Empty
 * set on any failure, on Windows, or when `names` is empty. This is a
 * heuristic, not a guarantee of what OMP activated: it misses non-Mason
 * servers (e.g. a project's own .venv basedpyright), and matching against
 * full command lines (not just each process's own short name) means a
 * same-named process -- or one that merely passes a tracked name as an
 * argument -- could be running for an unrelated reason.
 */
export async function currentlyRunningMasonServers(names: string[]): Promise<Set<string>> {
  if (names.length === 0 || process.platform === "win32") return new Set();
  try {
    const { stdout } = await execAsync("ps -A -o args=", { timeout: 2000 });
    const running = parseRunningCommands(stdout);
    return new Set(names.filter((name) => running.has(name)));
  } catch {
    return new Set();
  }
}

/** Nerd Font "plug" glyph (nf-fa-plug) — conventional LSP/connection-status icon. */
const LSP_ICON = "\uf1e6";

/** Max running-server names listed before summarizing the rest as a count. */
const MAX_LISTED_RUNNING = 6;

/**
 * Pure: build the status line text. Undefined means "nothing to show" —
 * deliberately silent whenever nothing is currently running, not merely
 * when Mason is absent. This is a presence indicator, not an inventory: it
 * never reports how many binaries Mason has available, only what is
 * actually running right now.
 */
export function formatMasonStatus(running: ReadonlySet<string>): string | undefined {
  if (running.size === 0) return undefined;
  const names = [...running].sort();
  const shown = names.slice(0, MAX_LISTED_RUNNING).join(", ");
  const overflow = names.length - MAX_LISTED_RUNNING;
  const suffix = overflow > 0 ? ` +${overflow} more` : "";
  return `${LSP_ICON} ${shown}${suffix} running`;
}

/** Minimal structural theme shape this file needs (matches OMP's real Theme.fg). */
interface StatusTheme {
  fg(color: string, text: string): string;
}
/** Minimal structural shape of the OMP/Pi extension hook API this file uses. */
interface StatusUI {
  setStatus(key: string, text: string | undefined): void;
  readonly theme: StatusTheme;
}
interface HookContext {
  ui: StatusUI;
}
interface ExtensionApi {
  on(event: "session_start" | "turn_end", handler: (event: unknown, ctx: HookContext) => void | Promise<void>): void;
}

/**
 * Follow the user's OMP theme (e.g. dark-gruvbox) instead of a hardcoded
 * color. Falls back to plain, unstyled `text` if `theme` is missing or
 * theming throws for any reason (older host, unexpected color-name
 * mismatch) -- never throws itself.
 */
export function applyThemeColor(theme: StatusTheme | undefined, text: string): string {
  if (!theme) return text;
  try {
    return theme.fg("success", text);
  } catch {
    return text;
  }
}

export function registerStatusHooks(
  pi: ExtensionApi | undefined,
  masonBin: string,
  deps: {
    listServers?: (masonBin: string) => string[];
    getRunning?: (names: string[]) => Promise<Set<string>>;
  } = {},
): void {
  const { listServers = listMasonServers, getRunning = currentlyRunningMasonServers } = deps;
  const mode = resolveStatusMode(process.env.PI_MASON_BRIDGE_STATUS);
  if (mode === "off" || typeof pi?.on !== "function") return;

  const refresh = async (_event: unknown, ctx: HookContext): Promise<void> => {
    try {
      const names = listServers(masonBin);
      const running = await getRunning(names);
      const text = formatMasonStatus(running);
      ctx.ui.setStatus("mason-bridge", text === undefined ? undefined : applyThemeColor(ctx.ui.theme, text));
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
