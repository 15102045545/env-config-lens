# Env Config Lens

Env Config Lens is a local-first GUI for comparing multiple `.env`-style configuration sources.

The tool is designed for developers and technical leads who need to inspect configuration drift across local files and SSH-readable server env files without persisting env contents, env values, remote read results, comparison results, or historical snapshots.

## Status

This repository now contains the M1 local foundation and M2 SSH remote source implementation:

- Fastify service bound to `0.0.0.0` by default for same-LAN access.
- Startup session token required for `/api/*`.
- React/Vite/Tailwind local GUI with Comparison, Health, and Settings.
- SQLite source settings persistence through Node built-in SQLite.
- Local file source management and backend-driven macOS file picker.
- SSH remote file source management in standard field mode and SSH config alias mode.
- Backend-driven private key path picker.
- System OpenSSH remote reads with `known_hosts` verification kept enabled.
- Optional macOS Keychain passphrase references; passphrases are not stored in SQLite.
- On-demand local env reads for comparison and health.
- On-demand SSH env reads for comparison and health.
- Parser, comparison, persistence, API security, binding, SSH adapter, no-leak, and UI tests.

The canonical product requirement document is:

[`harness/demand/env-config-lens/PRD-env-config-lens.md`](harness/demand/env-config-lens/PRD-env-config-lens.md)

Implementation is split into milestone PRDs:

- M1 local foundation: [`harness/demand/env-config-lens/PRD-env-config-lens-M1-local-foundation.md`](harness/demand/env-config-lens/PRD-env-config-lens-M1-local-foundation.md)
- M2 SSH remote sources: [`harness/demand/env-config-lens/PRD-env-config-lens-M2-ssh-remote.md`](harness/demand/env-config-lens/PRD-env-config-lens-M2-ssh-remote.md)

## Product Shape

- Web UI plus local service.
- macOS first.
- M1 ships the local-file-only foundation implemented in this repository.
- M2 adds SSH remote file sources through system OpenSSH and macOS Keychain references.
- Local service listens on the LAN by default and can be forced back to `127.0.0.1` with `ENV_CONFIG_LENS_HOST`.
- Startup session token required for frontend API calls and API access.
- API access is token-gated; CORS preflight is allowed for browser clients.
- Local file env sources.
- SSH remote file env sources are planned for M2.
- Settings persisted locally in SQLite.
- Private key contents are never imported or stored in M2.
- Passphrases are stored through macOS Keychain when needed in M2.
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

An SSH source reads one configured remote env file through either explicit SSH fields or a local `~/.ssh/config` alias. It does not expose arbitrary remote command input and does not use `sudo` by default.

The backend launches system OpenSSH without a local shell, keeps `StrictHostKeyChecking=yes`, disables password fallback, and captures remote stdout in memory for the current request only. SSH source tests return success or sanitized failure metadata without returning env contents.

## Local Startup

Requirements:

- Node.js `>=24.14.0`.
- pnpm `>=11.0.0`.

Install and start:

```bash
pnpm install
pnpm start
```

`pnpm start` builds the Web UI, starts the service on `0.0.0.0:4173` by default, generates a startup token, prints both the local URL and available LAN URLs, and opens the local browser URL automatically.

Useful environment variables:

```bash
PORT=4180 pnpm start
ENV_CONFIG_LENS_HOST=127.0.0.1 pnpm start
ENV_CONFIG_LENS_DATA_DIR=.local/dev-data pnpm start
```

## Scripts

```bash
pnpm test
pnpm build
pnpm verify:binding
pnpm seed:local
```

- `pnpm test` runs parser, comparison, SQLite, seed, API security, SSH, binding, and UI tests.
- `pnpm build` builds the frontend and runs TypeScript checks.
- `pnpm verify:binding` starts a temporary service and confirms it listens on `0.0.0.0`.
- `pnpm seed:local` imports local source settings from `.local/env-sources.local.json`.

## UI

The application has three main entries:

- Multi-environment comparison.
- Single-source health governance.
- Settings.

The comparison view is a matrix:

- Rows are env keys.
- Columns are selected env sources.
- Cells show complete values.
- Row statuses include `missing`, `same`, `different`, `empty`, and `source-only`.
- Same rows are available through filters; the default focus is problem rows.
- Long values can be expanded and copied one value at a time.
- One key's multi-source comparison can be copied.
- No full env export action is provided.

## Local Development Seeds

Development may use a Git-ignored local seed file:

```text
.local/env-sources.local.json
```

This file is for developer-owned source settings only. It must never contain env contents or env values, and it must never be committed.

Example shape:

```json
{
  "sources": [
    {
      "name": "Local dev",
      "filePath": "/path/to/local.env",
      "enabled": true,
      "note": "Developer-owned local source"
    }
  ]
}
```

The seed import writes only source settings to SQLite and logs only the number of imported source settings.

## Stack

- TypeScript.
- Node.js.
- Fastify.
- React.
- Vite.
- Tailwind CSS.
- SQLite through Node built-in SQLite.
- SSH adapter based on system OpenSSH.
- macOS file picker adapter.
- macOS Keychain reference adapter.

## Repository Hygiene

The `.gitignore` excludes local seeds, local databases, logs, dependencies, and build outputs.

Before publishing or accepting contributions, verify that no env contents, env values, private keys, local database files, or machine-specific seed files are tracked.

Recommended checks before release:

```bash
git status --short
pnpm test
pnpm verify:binding
pnpm build
```

## License

MIT
