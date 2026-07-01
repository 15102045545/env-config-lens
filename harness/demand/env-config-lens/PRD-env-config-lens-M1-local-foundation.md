# PRD: Env Config Lens M1 Local Foundation

## Metadata

- Status: Ready for implementation planning
- Date: 2026-07-01
- Parent PRD: `harness/demand/env-config-lens/PRD-env-config-lens.md`
- Milestone: M1 local foundation
- Scope: local file env sources, local SQLite source settings, parser contract, multi-environment comparison, single-source health governance, local Web UI, local service security, no-leak release gates

## Objective

M1 delivers the first independently usable version of Env Config Lens without SSH support. A developer can configure local env files, read them on demand, compare multiple sources, inspect one source's internal health, and restart the app without persisting env contents or values.

## Users

- Developers and technical leads who understand local env files and key/value configuration.
- Maintainers who need an open-source-safe implementation baseline before adding SSH and Keychain support.

## Scope

M1 includes:

- One-command local startup using pnpm.
- Local service bound only to `127.0.0.1`.
- Startup session token required for UI API calls.
- CORS restricted to the local UI origin.
- React/Vite/Tailwind local GUI with three entries: Multi-environment comparison, Single-source health governance, Settings.
- SQLite settings persistence in a macOS application data location.
- Local file source settings with source name, file path, enabled state, display order, and optional note.
- Backend-driven macOS file picker for local env file path selection.
- Manual local path entry.
- Local file readability tests that do not return env contents.
- Real-time local file reads for comparison and health requests.
- Env parser contract and fixture coverage.
- Comparison matrix for two or more local file sources.
- Single-source health view for one local file source.
- Development seed import for local file source settings only.
- Release-blocking no-leak tests.

M1 excludes:

- SSH remote file sources.
- Private key path selection.
- Keychain passphrase references.
- SSH config alias mode.
- Hosted service, login, multi-user permissions, audit backend, native app packaging, full-env export, CLI comparison mode, masking toggles, ignore rules, expected-difference policies, encrypted env formats, and non-macOS support.

## Functional Requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| M1-FR-1 | Start the app with one documented pnpm command. | The command starts the service, prepares or serves the UI, generates a session token, binds to `127.0.0.1`, and opens the browser page. |
| M1-FR-2 | Persist local file source settings only. | SQLite stores source metadata and file paths, never env file contents or env values. |
| M1-FR-3 | Manage local file sources in Settings. | Users can add, edit, delete, enable, disable, and reorder local file sources. |
| M1-FR-4 | Select local files through the backend. | The UI requests a macOS file picker from the local service and persists only the selected path and metadata. |
| M1-FR-5 | Read local sources on demand. | Comparison and health requests read current file contents at request time, without caching or scheduled refresh. |
| M1-FR-6 | Compare selected local sources. | The comparison API returns source results, summary, and matrix rows with full values. |
| M1-FR-7 | Inspect one local source's health. | The health API returns current key/value facts, issue summaries, and issue details. |
| M1-FR-8 | Support single-value copy and one-key comparison copy. | Users can copy one value or one key's multi-source row, and cannot export a full env file. |

## Parser And Comparison Contract

M1 uses one effective parser contract for comparison:

- Variable expansion is not performed.
- Duplicate keys use last assignment wins for the final effective map.
- Duplicate keys are reported by health governance.
- Empty value means the parsed value is an empty string.
- Whitespace-only value means the parsed value contains only whitespace characters after parser unquoting semantics.
- Illegal key name uses `[A-Za-z_][A-Za-z0-9_]*`.
- Empty key means a line attempts a key/value assignment without a key before `=`.

Comparison row status precedence:

1. Failed or parse-failed sources are excluded from row classification and reported at source level.
2. `empty` if one or more successful participating sources contain the key with an empty or whitespace-only value.
3. `source-only` if the key exists in exactly one successful participating source.
4. `missing` if the key exists in at least one successful participating source and is absent in at least one other successful participating source.
5. `same` if all successful participating sources have the key and all values are exactly equal.
6. `different` if all successful participating sources have the key and values are not all equal.

## Health Issue Requirements

The health view must report:

- Duplicate key.
- Parse failure.
- Empty value.
- Whitespace-only value.
- Empty key.
- Illegal key name.

Duplicate key reporting must include the key, duplicate count, and final effective value. Line numbers are not required.

## Security And Privacy Gates

M1 release is blocked unless all gates pass:

- Env values are not written to SQLite.
- Env values are not written to backend logs.
- Env values are not written to frontend logs.
- Env values are not written to seed import output.
- Env values are not included in sanitized error responses.
- `.local/`, SQLite databases, logs, and generated artifacts are ignored by Git.
- The local service binds to `127.0.0.1` only.
- API calls without the startup token are rejected.
- API calls from non-local UI origins are rejected by CORS.
- No one-click full env export exists.

The no-leak tests must use committed generic sentinel values that are not real secrets.

## Test Requirements

M1 must include:

- Unit tests for comparison classification and status precedence.
- Parser fixture tests for duplicate keys, empty values, whitespace-only values, empty keys, illegal keys, quoted values, escaped values, and no variable expansion.
- Unit or integration tests for partial source failure.
- Integration tests proving settings persistence excludes env contents and values.
- Seed import tests proving only settings are written and no env values are logged.
- Local-only network binding check.
- Token rejection and CORS rejection checks.
- UI or component tests for long-value layout stability and problem-row filtering.

## Acceptance Criteria

- Starting the app with the documented command opens the browser UI and starts the local service.
- Creating a local file source persists its path and metadata in SQLite.
- Running comparison with two or more successful local file sources returns a matrix with full values.
- Running comparison with one failed local file source and at least one successful local file source returns partial results plus failed source status.
- Empty or whitespace-only values are classified visibly according to status precedence.
- Same rows can be viewed, and problem rows can be focused by filters.
- Long values do not break the table layout.
- Copying a single value copies the real value.
- Copying one key's multi-source comparison result is available.
- No one-click full env export exists.
- Single-source health view shows complete key/value rows and issue filters.
- Duplicate, parse failure, empty value, whitespace-only value, empty key, and illegal key fixtures are all reported.
- Source order changes persist and affect comparison column order.
- The no-leak, token, CORS, and network binding gates pass.

## Exit Criteria

M1 is complete when the local-file workflow is usable end to end, all release-blocking security gates pass, and the implementation can be started and tested from a clean clone without any SSH configuration.
