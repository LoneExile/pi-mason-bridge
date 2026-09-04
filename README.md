# omp-mason-bridge

Expose [Neovim Mason](https://github.com/mason-org/mason.nvim)'s language-server
binaries to [Oh My Pi (OMP)](https://pi.dev) / Pi at startup.

OMP ships built-in LSP definitions (gopls, pyright, rust-analyzer, yaml-language-server,
marksman, …) but only activates a server when its executable is discoverable. If you
already install language servers through Neovim Mason, this extension makes OMP find
them — no duplicate installs, no parallel catalog.

## Install

```bash
# npm (after publishing)
omp plugin install omp-mason-bridge

# or from source (pre-publish)
omp plugin install github:LoneExile/omp-mason-bridge
```

Then start a **new** OMP session (extensions do not hot-reload).

## What it does

At session load (before OMP resolves its LSP config), the extension:

1. Detects Mason's bin dir (`~/.local/share/nvim/mason/bin`, or `$MASON/bin` if set).
2. Prepends it to `process.env.PATH` **once** (idempotent — no duplicates).
3. Fails open: Mason absent → no-op.

OMP's own built-in definitions then discover Mason's servers per project root
markers and file types. Servers still start lazily (`lsp.lazy`). Nothing is
installed; Mason/Neovim are untouched; no server is spawned or managed here.

Only Mason commands whose names match an OMP built-in are covered. Mason-only
servers (e.g. vtsls, taplo, harper-ls-as-file-LSP) need explicit `lsp.json`
definitions — out of scope for now.

## Python note: pyright vs basedpyright

If a project pins its own Python checker (e.g. `basedpyright` in `.venv`), and Mason
also provides `pyright`, OMP can discover both. To keep the project's own checker
authoritative, add a project-local override (this file is outside the plugin):

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

## Develop

```bash
npm install
bun test
npm run typecheck
```

## License

MIT
