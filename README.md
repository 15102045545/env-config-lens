# Env Config Lens

Env Config Lens is a local-first GUI for comparing multiple `.env`-style configuration sources.

The tool is designed for developers and technical leads who need to inspect configuration drift across local files and SSH-readable server env files without persisting env contents, env values, remote read results, comparison results, or historical snapshots.

## Status

This repository is currently a PRD-first public scaffold. The phase-one implementation is not present yet.

The canonical product requirement document is:

[`harness/demand/env-config-lens/PRD-env-config-lens.md`](harness/demand/env-config-lens/PRD-env-config-lens.md)

Implementation is split into milestone PRDs:

- M1 local foundation: [`harness/demand/env-config-lens/PRD-env-config-lens-M1-local-foundation.md`](harness/demand/env-config-lens/PRD-env-config-lens-M1-local-foundation.md)
- M2 SSH remote sources: [`harness/demand/env-config-lens/PRD-env-config-lens-M2-ssh-remote.md`](harness/demand/env-config-lens/PRD-env-config-lens-M2-ssh-remote.md)

## Phase-One Product Shape

- Web UI plus local service.
- macOS first.
- M1 ships a local-file-only foundation.
- M2 adds SSH remote file sources after the SSH and Keychain gates are closed.
- Local service binds only to `127.0.0.1`.
- Startup session token required for frontend API calls.
- CORS restricted to the local UI origin.
- Local file env sources.
- SSH remote file env sources.
- Settings persisted locally in SQLite.
- Private key contents never imported or stored.
- Passphrases stored through macOS Keychain when needed.
- Env contents and values kept in memory only for each request.
- Multi-environment key/value comparison.
- Single-source env health governance.

## Core Safety Boundary

Env values are intentionally displayed in the GUI because the product is meant to support real configuration management decisions.

The tool must not write env values to:

- SQLite.
- Logs.
- Error reports.
- Export files.
- Development seed files.
- Documentation.
- Committed fixtures.

The repository must not contain real server hosts, usernames, private key paths, remote env paths, env file contents, or env values.

## Planned Source Types

### Local File Source

A local file source stores only source metadata such as name, file path, enabled state, display order, and notes. The local service opens the macOS file picker and reads the selected file on demand.

### SSH Remote File Source

An SSH source is planned for M2. It reads one configured remote env file through either explicit SSH fields or a local `~/.ssh/config` alias. It does not expose arbitrary remote command input and does not use `sudo` by default.

## Planned UI

The application has three main entries:

- Multi-environment comparison.
- Single-source health governance.
- Settings.

The comparison view is a matrix:

- Rows are env keys.
- Columns are selected env sources.
- Cells show complete values.
- Row statuses include `missing`, `same`, `different`, `empty`, and `source-only`.

## Local Development Seeds

Implementation work may use a Git-ignored local seed file:

```text
.local/env-sources.local.json
```

This file is for developer-owned source settings only. It must never contain env contents or env values, and it must never be committed.

## Planned Stack

- TypeScript.
- Node.js.
- Fastify.
- React.
- Vite.
- Tailwind CSS.
- SQLite.
- SSH adapter based on a mature Node library or system `ssh`.
- macOS file picker adapter.
- macOS Keychain adapter.

## Planned Startup

The implementation target is one-command local startup:

```bash
pnpm install
pnpm start
```

The command should start the local service, prepare or serve the Web UI, bind to `127.0.0.1`, generate the session token, and open the browser automatically.

## Repository Hygiene

The `.gitignore` excludes local seeds, local databases, logs, dependencies, and build outputs.

Before publishing or accepting contributions, verify that no env contents, env values, private keys, local database files, or machine-specific seed files are tracked.

## License

MIT
