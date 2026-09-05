# Changelog

## [0.2.1] - 2026-09-05

### Changed

- Status line output (`$PI_MASON_BRIDGE_STATUS`) redesigned: replaced the `mason:` text prefix with a plug icon, and dropped the "N available" count entirely. Now a pure presence indicator — silent whenever nothing is running, never an inventory of what Mason has installed. Text is colored using the active OMP theme's `success` color, falling back to plain text if theming is unavailable.

### Fixed

- Running-server detection matched only each process's own short name (`ps -o comm=`), silently missing interpreter-launched servers (Node/Python-based language servers report as `node`/`python3`, not their script name) and symlinked binaries whose resolved target self-reports under a different name (observed: Mason's `marksman` resolves to a binary named `marksman-macos`). Now matches against the full command line instead.

## [0.2.0] - 2026-09-05

### Added

- Optional status line reporting via `$PI_MASON_BRIDGE_STATUS` (`static` | `full`), off by default: shows a count of available Mason binaries, and in `full` mode additionally names (capped, best-effort process check) which are currently running. Deliberately never dumps every binary by name — a real Mason install can have 50+ entries.

## [0.1.3] - 2026-09-04

### Fixed

- README: corrected Pi section heading; added `pi install` command to Install.

## [0.1.2] - 2026-09-04

### Changed

- Clarified Pi compatibility in README: installs and loads cleanly on Pi, but the LSP-bridge feature is OMP-only (Pi 0.84.4 has no LSP subsystem).
- Aligned `pi` package manifest metadata with `omp`.

## [0.1.1] - 2026-09-04

### Fixed

- Re-publish via tokenless OIDC trusted publisher (initial 0.1.0 was manual).

## [0.1.0] - 2026-09-04

### Added

- Initial release: idempotent Mason PATH bridge extension for OMP/Pi.
- Pure `prependMasonToPath` helper with unit tests.
- CI (typecheck, bun test, npm pack verify) and tokenless-OIDC npm release workflow.
