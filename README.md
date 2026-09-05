# pi-mason-bridge

Lets OMP use the language servers you already installed via Neovim Mason.

OMP only starts a language server when it can find the server's executable.
This plugin adds Mason's bin folder to the search path, so OMP finds what's
already there — no duplicate installs.

## Install

```bash
omp plugin install pi-mason-bridge
```

Restart OMP (new session) after installing.

## How it works

On startup, the plugin adds `~/.local/share/nvim/mason/bin` to `PATH` (once,
idempotently; `$MASON/bin` if you set `$MASON`). If Mason isn't installed, it
does nothing.

That's it. OMP's built-in server discovery does the rest — you get code
intelligence in projects whose servers live in Mason. Servers still start
lazily, only when needed.

## Status line (optional, off by default)

Set `$PI_MASON_BRIDGE_STATUS` to have the bridge report in OMP's status line
what it makes available — not what OMP has actually activated, since OMP
exposes no API for that. A real Mason install commonly has 50+ entries
(linters, formatters, debuggers — not only language servers), so entries are
never listed by name unless they're actually running; everything else is
summarized as a count, so the status line stays short and readable.

- `static` — check once per session, no process scan: `mason: 73 available`
- `full` — same check, re-run after every turn, plus a lightweight process
  scan (heuristic, not proof OMP started them — it misses non-Mason servers
  like a project's own `.venv` `basedpyright`, and a same-named process
  could be running for an unrelated reason) that names whichever are
  currently running (capped at 6, then summarized): `mason: gopls,
  pyright-langserver running · 73 available`
- unset, or any other value — no status line entry at all (default; upgrading
  this plugin never changes existing behavior unless you set this)

## Python: pick one checker

If a project has its own Python checker (e.g. `basedpyright` in `.venv`) and
Mason also has `pyright`, OMP sees both. To keep the project's own checker,
add this to the project:

`.gitignore`:

```
.omp/
```

`.omp/lsp.json`:

```json
{
  "servers": {
    "pyright": {
      "disabled": true
    }
  }
}
```

## Pi

Installs and loads cleanly (`pi install npm:pi-mason-bridge`), but does nothing
useful there — Pi has no LSP tool, so there's nothing for it to feed. OMP-only.

## Develop

```bash
npm install
bun test
npm run typecheck
```

## License

MIT
