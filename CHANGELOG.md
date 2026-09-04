# Changelog

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
