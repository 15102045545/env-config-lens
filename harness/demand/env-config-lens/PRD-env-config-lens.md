# PRD: Env Config Lens

## Metadata

- Status: Ready for M1 implementation planning; M2 requires SSH and Keychain technical spike closure
- Date: 2026-07-01
- Scope: staged local GUI env source settings, M1 local file env reading, M1 multi-environment env comparison, M1 single-source env health governance, local-only settings persistence, M2 SSH remote env reading, open-source project bootstrap
- Requirement owner: Env Config Lens maintainers
- Canonical document: `harness/demand/env-config-lens/PRD-env-config-lens.md`
- Milestone PRDs:
  - M1 local foundation: `harness/demand/env-config-lens/PRD-env-config-lens-M1-local-foundation.md`
  - M2 SSH remote sources: `harness/demand/env-config-lens/PRD-env-config-lens-M2-ssh-remote.md`
- Target repository name: `env-config-lens`
- Target local repository path: a sibling directory outside any consuming application repository

## Background

Engineering teams often have local env files, test server env files, production server env files, and other locally available env files that need to be compared together. Manual SSH, file copy, spreadsheet comparison, and one-off HTML viewers are not sufficient as a reusable workflow.

The target solution is an independent open-source tool named `env-config-lens`. It lets a developer configure multiple env sources, read those sources on demand, normalize them into one in-memory model, and inspect key/value differences through a local GUI. Env file contents and values are never persisted by the tool, while user source settings are persisted locally.

## Current State

- A reference engineering workflow has local env files and SSH-readable remote env files for multiple environments.
- Remote application containers may share one active env file while injecting process identity separately at runtime.
- Existing manual investigation artifacts are not reusable product mechanisms and must not become part of the new tool's runtime.
- The new solution must be a standalone repository, not a package inside any consuming application monorepo.
- The standalone repository has been initialized as an open-source-safe scaffold with README, license, `.gitignore`, and this PRD.
- The phase-one application implementation is not present yet: there is no package manifest, local service, frontend app, database schema, source reader, parser, or automated test suite in the scaffold.

## Core Problem

Engineers need a repeatable, safe, local, visual way to compare multiple env configurations without copying sensitive env values into docs, databases, logs, screenshots, or ad hoc files. The tool must show complete key/value facts in the GUI so engineers can make configuration decisions, but it must not persist env contents or create hidden state.

The problem has two distinct surfaces:

- Multi-environment comparison: compare the final effective `key -> value` maps from selected env sources.
- Single-source health governance: inspect one env source for internal problems such as duplicate keys, invalid keys, parse failures, empty values, or whitespace-only values.

These two surfaces share env source settings and source reading, but their data models and UI responsibilities are separate.

## Requirement Level

This is a new standalone open-source engineering tool. The first phase is a local-only macOS-compatible GUI backed by a local service. It does not modify any consuming application repository, does not become part of another application's runtime, and does not introduce a hosted service.

The requirement is security-sensitive because complete env values, including secrets, are intentionally displayed in the browser UI.

Phase one is delivered through two implementation milestones:

- M1 local foundation: local file sources, local SQLite settings, parser and health rules, multi-environment comparison, GUI shell, local-only service security, and release-blocking no-leak tests.
- M2 SSH remote sources: SSH remote file sources, SSH config alias support, private key path selection, macOS Keychain passphrase references, connection tests, and remote read security gates.

M1 must be independently usable without SSH support. M2 must not begin until M1's security and persistence gates pass.

## Target Audience And Stakeholders

- Developers and technical leads who understand env files, SSH, private keys, remote paths, key/value configuration, and deployment environments.
- Engineers responsible for checking whether test, production, local, or teammate-provided env files are complete and aligned.
- Future open-source users who want to run the same tool locally on their own Mac.
- Maintainers responsible for keeping the tool stateless with respect to env contents.

Non-technical operators are not the primary audience.

## Goals

- Provide a high-fidelity GUI for comparing multiple env sources.
- Support env sources configured through settings only.
- Support local file env sources and SSH remote file env sources in phase one.
- Read env contents on demand and keep env contents only in memory.
- Persist user source settings in a local SQLite database.
- Use macOS Keychain for sensitive passphrase storage or references.
- Display complete env values in comparison and health views.
- Never persist env file contents, env values, remote read results, comparison results, or historical snapshots.
- Support local development startup with one command that starts the local service and opens the browser UI.
- Make the project open-source safe from the first commit.
- Keep the architecture extensible for future Windows support and future source providers.

## Non-Goals

- Do not build a macOS `.app`, menu bar app, installer, auto-updater, code signing, or notarization in phase one.
- Do not build a hosted service, team workspace, account system, login, multi-user permissions, or audit backend.
- Do not support Windows in phase one.
- Do not support cross-machine sync, peer-to-peer access, or reading a teammate's computer directly.
- Do not connect to Aliyun, Tencent Cloud, Cloud Assistant, bastion hosts, remote agents, Vault, Kubernetes, Docker inspect, S3, OSS, GitHub Secrets, databases, or HTTP URLs as env sources in phase one.
- Do not support encrypted env formats, SOPS, age, KMS, `.env.vault`, or decryption.
- Do not provide a CLI comparison mode in phase one.
- Do not provide one-click export of complete env values.
- Do not add value masking, secret hiding, or temporary hide/show toggles in phase one.
- Do not introduce ignore rules, allow-different rules, expected-difference policies, key groups, or strategy governance.
- Do not validate env file names. A source file may be named anything as long as its content can be parsed as env content.
- Do not rely on comments, grouping, file order, or original line numbers for comparison semantics.

## Core Requirement

`env-config-lens` is a local Web UI plus local service. A user starts the project with a single command. The service listens only on `127.0.0.1`, generates a startup session token, serves or coordinates the browser UI, and accepts requests only from the local UI origin with the valid token.

Every env source is represented by a saved setting. A source setting is a readable env origin, not an env snapshot. On each comparison or health request, the service reads the selected source or sources in real time, parses the current content, converts it into a unified in-memory data model, builds the response, and returns it to the UI. The service does not cache env content, schedule background refreshes, or store parsed results.

The UI has three primary entries:

- Multi-environment comparison.
- Single-source health governance.
- Settings.

The default page is Multi-environment comparison.

## Source Types

### Local File Source

Local file sources are in M1. A local file source setting contains:

- Source name.
- File path.
- Enabled state.
- Display order.
- Optional note.

The file picker is executed by the local service, not by a browser-only file input. The Web UI asks the local service to open a macOS file selection dialog. The service receives the real path and persists only the setting metadata. Manual path entry is also supported for advanced users.

The tool must not validate file names such as `.env`; it validates parseability and content shape instead.

### SSH Remote File Source

SSH remote file sources are in M2. M1 must not show SSH source creation as an available action. An SSH remote file source setting supports two explicit modes.

Standard field mode:

- Source name.
- Host.
- Port.
- Username.
- Private key path.
- Remote env file path.
- Enabled state.
- Display order.
- Optional note.
- Optional Keychain passphrase reference.

SSH config alias mode:

- Source name.
- SSH alias.
- Remote env file path.
- Enabled state.
- Display order.
- Optional note.
- Optional Keychain passphrase reference if needed by the local SSH flow.

SSH behavior requirements:

- Read only the configured `remoteEnvPath`.
- Do not expose a free-form remote command input in the UI.
- Do not use `sudo` by default.
- The configured login user must already have read permission for the target file.
- Preserve `known_hosts` verification to avoid connecting to the wrong server.
- Support connection testing without returning env contents.
- Return connection, permission, path, or parse error categories without leaking env values.
- Prefer mature Node SSH libraries or system `ssh` wrapping, as long as known-host verification and private key path behavior remain explicit and testable.

## Runtime And State Model

The product meaning of "stateless" is:

- Env file content is not persisted.
- Env values are not persisted.
- Remote read output is not persisted.
- Parsed env maps are not persisted.
- Comparison results are not persisted.
- Historical snapshots are not persisted.

Persisted state is limited to user settings and non-sensitive metadata:

- Env source settings.
- Source display order.
- Enabled state.
- Local file paths.
- SSH host/port/username or SSH alias.
- SSH remote env path.
- Private key path.
- Optional notes.
- Keychain item references.
- UI preferences that do not contain env values.

Settings are stored in local SQLite at a macOS application data location such as `~/Library/Application Support/env-config-lens/settings.sqlite`. Private key contents are never imported, copied, or saved. Passphrases are never saved in SQLite and must use macOS Keychain when supported.

## Env Parsing Semantics

Env parsing is not locked to one library. The implementation may combine mature parser and lint libraries or implement a lightweight parser where needed, as long as it satisfies the product behavior and the fixture-based acceptance tests.

Multi-environment comparison uses the final effective parsed `key -> value` map for each source. It does not use comments, grouping, source order, or line numbers. Values are compared after env parsing, so quoted and escaped syntax follows parser semantics. Variable expansion is not performed; a value such as `${B}` remains a string value for comparison.

Single-source health governance may use a richer parse or lint path to identify file-internal issues such as duplicate keys. This health model is separate from the multi-environment comparison model.

M1 parser contract:

- Variable expansion is not performed.
- Duplicate keys use last assignment wins for the final effective `key -> value` map.
- Duplicate keys are still reported by single-source health governance.
- Empty value means the parsed value is an empty string.
- Whitespace-only value means the parsed value contains only whitespace characters after parser unquoting semantics.
- Illegal key name uses the fixed rule `[A-Za-z_][A-Za-z0-9_]*`.
- Empty key means a line attempts a key/value assignment without a key before `=`.
- Parser behavior must be covered by committed generic fixtures that contain no real env values.

## Multi-Environment Comparison

The comparison request accepts selected source IDs. The service reads each selected source in real time, parses successful sources, builds a union of all keys, and returns a matrix model.

Required comparison statuses:

- `missing`: a key exists in at least one selected source and is absent in at least one other selected source.
- `same`: all successfully read selected sources have the key and all values are exactly equal.
- `different`: the key exists in multiple sources and values are not all equal.
- `empty`: one or more sources have an empty or whitespace-only value for the key.
- `source-only`: a key exists in exactly one successfully read selected source.

Status precedence for a row is deterministic:

1. Failed or parse-failed sources are excluded from row classification and reported at source level.
2. `empty` if one or more successful participating sources contain the key with an empty or whitespace-only value.
3. `source-only` if the key exists in exactly one successful participating source.
4. `missing` if the key exists in at least one successful participating source and is absent in at least one other successful participating source.
5. `same` if all successful participating sources have the key and all values are exactly equal.
6. `different` if all successful participating sources have the key and values are not all equal.

Value comparison is strict string comparison after parsing. The tool must not normalize URLs, JSON, casing, whitespace beyond the explicit empty/whitespace-only status, secret formats, or provider-specific value formats in phase one.

Partial failure is allowed. If some selected sources fail to read or parse, successful sources still participate in comparison. Failed sources are returned with status and error category. Parse-failed sources do not participate in the comparison matrix.

## Single-Source Health Governance

The health view reads one source in real time and displays the source's current key/value facts plus internal issues.

Required issue types:

- Duplicate key.
- Parse failure.
- Empty value.
- Whitespace-only value.
- Empty key.
- Illegal key name.

Duplicate key reporting must show the key, duplicate count, and final effective value. It does not need to show line numbers. Parse failure reporting should include error type and minimal necessary context, but must not dump the entire env file or write env values to logs.

The health view displays complete values where key/value rows are shown, supports key/value search, issue-type filtering, and copying a single value.

## UI Requirements

The GUI uses three main navigation entries:

- Multi-environment comparison.
- Single-source health governance.
- Settings.

### Multi-Environment Comparison UI

The main comparison view is a matrix table:

- Rows are env keys.
- Columns are selected env sources.
- Each cell displays the complete value for that source and key.
- Row status displays `same`, `different`, `missing`, `empty`, or `source-only`.
- Top summary displays source count, union key count, same count, different count, missing count, empty count, source-only count, and failed source count.
- Filters support status, key search, source selection, and problem-only view.
- Long values can be expanded or collapsed within the table.
- Users can copy a single value.
- Users can copy one key's multi-source comparison result, without providing a full-env export.
- Large key sets must use virtual scrolling or pagination.

The UI defaults to focusing on `missing`, `different`, `empty`, and `source-only`. `same` rows are available through filters and may be visually de-emphasized.

### Single-Source Health UI

The health view:

- Lets users select one configured source.
- Reads the source in real time.
- Shows key/value rows with complete values.
- Shows issue summaries and issue filters.
- Supports key/value search.
- Supports copying a single value.
- Does not depend on line numbers, comments, grouping, or original file order.

### Settings UI

The settings view:

- Lists all configured env sources.
- Supports adding, editing, deleting, enabling, and disabling sources.
- Supports local file source creation through a backend-driven macOS file picker and manual path entry.
- Supports SSH source creation in standard field mode and SSH config alias mode in M2.
- Supports private key path selection through a backend-driven macOS file picker in M2.
- Supports connection/readability tests that do not return env content.
- Supports manual ordering of sources, stored as `displayOrder`.
- Does not support grouping in phase one.

M1 Settings must expose local file source management only. M2 adds SSH source forms after the SSH and Keychain gates are implemented and verified.

## API Expectations

API names are implementation guidance, not a fixed contract, but phase one should expose equivalent capabilities.

- `GET /api/sources`: list source settings without env values.
- `POST /api/sources`: create a source setting.
- `PATCH /api/sources/:id`: update a source setting.
- `DELETE /api/sources/:id`: delete a source setting.
- `POST /api/sources/reorder`: persist source display order.
- `POST /api/file-dialog/env-path`: open a macOS file picker for env source selection.
- `POST /api/file-dialog/private-key-path`: open a macOS file picker for SSH private key path selection.
- `POST /api/sources/:id/test`: test source readability without returning env content.
- `POST /api/compare`: read selected sources and return comparison matrix.
- `POST /api/health`: read one source and return key/value facts plus health issues.

Every API request from the UI must include the startup session token. CORS must allow only the local UI origin. The server must listen only on `127.0.0.1` and must not bind `0.0.0.0`.

M1 API coverage includes local file sources, local file picker, source readability test for local files, comparison, health, token enforcement, CORS enforcement, and local-only binding. M2 adds SSH-specific source fields, private key path picker, SSH source readability test, remote read, and Keychain reference handling.

## Data Model Expectations

### Persisted SQLite Entities

`EnvSource`:

- `id`
- `type`: `local-file` or `ssh-remote-file`
- `name`
- `enabled`
- `displayOrder`
- `note`
- `createdAt`
- `updatedAt`

`LocalFileSourceConfig`:

- `sourceId`
- `filePath`

`SshRemoteFileSourceConfig`:

- `sourceId`
- `mode`: `standard` or `ssh-config-alias`
- `host`
- `port`
- `username`
- `privateKeyPath`
- `sshAlias`
- `remoteEnvPath`
- `keychainPassphraseRef`

`SshRemoteFileSourceConfig` is introduced in M2. The exact schema may differ, but it must preserve the same facts and must not persist env content or env values.

### In-Memory Source Read Model

`EnvSourceReadResult`:

- `sourceId`
- `sourceName`
- `status`: `success` or `failed`
- `values`: parsed `Record<string, string>` for success only
- `keyCount`
- `errorType` for failure only
- `errorMessage` for failure only, without env values

### In-Memory Comparison Model

`EnvComparisonResult`:

- `selectedSourceIds`
- `sourceResults`
- `summary`
- `rows`

Each row contains:

- `key`
- `status`
- `valuesBySourceId`
- `presenceBySourceId`

### In-Memory Health Model

`EnvHealthResult`:

- `sourceId`
- `sourceName`
- `status`
- `values`
- `issues`
- `summary`

Each issue contains:

- `type`
- `severity`
- `key`
- `message`
- optional `finalEffectiveValue`
- optional `duplicateCount`

## Security And Privacy Requirements

- Complete env values are intentionally displayed in the browser UI.
- Env values must not be logged by backend logs, frontend logs, error reports, settings storage, or development seed import output.
- No env content or value may be written to SQLite.
- No env content or value may be written to temp files as part of normal remote reading.
- No one-click full env export is provided in phase one.
- Single-value copy is allowed.
- Single-key multi-source comparison copy is allowed.
- Private key contents are never copied into the app database.
- Private key path may be stored.
- Passphrase storage must use macOS Keychain or an equivalent local secure store adapter.
- SSH connection failures must not print command output that includes env contents.
- Read failures should use categories such as `connection_failed`, `auth_failed`, `permission_denied`, `path_not_found`, `parse_failed`, and `unknown_error`.

Security release gates:

- A committed generic sentinel value must be used in tests to prove env values are absent from SQLite, seed import output, backend logs, frontend logs, and error responses.
- A local-only network binding check must prove the service listens on `127.0.0.1` and not `0.0.0.0`.
- API calls without the startup session token must be rejected.
- API calls from a non-local UI origin must be rejected by CORS.
- Full-env export must not exist in the UI or API.
- Failure of any security release gate blocks release of the milestone.

## Development Seed

The open-source repository must not include real server hosts, usernames, paths, private key paths, or env values.

During local development, a Git-ignored seed file may be used, for example:

`.local/env-sources.local.json`

The seed may contain a developer's real source settings for validating milestone-supported source flows. In M1, the seed may contain local file source settings only. In M2, it may also contain SSH source settings. The seed is imported into SQLite by a development command such as `pnpm seed:local`. Runtime source reading must still use the same settings path as normal product behavior. Business logic must not bypass settings to read the seed directly.

`.local/` and the local SQLite database must be ignored by Git.

## Startup And Packaging

Phase one startup:

- User clones the open-source repository.
- User installs dependencies.
- User runs one command.
- The command starts the local service, prepares or serves the Web UI, binds only to `127.0.0.1`, generates a session token, and opens the browser page automatically.

Frontend and backend are separated in code but not separated in developer/user operation. The user should not have to manually start two independent processes for normal local usage.

No `.app` package, native installer, menu bar app, auto-update flow, signing, or notarization is required in phase one.

## Technical Stack

The default stack is TypeScript full stack:

- Package manager: pnpm.
- Local service: Node.js + Fastify.
- Frontend: React + Vite + Tailwind CSS.
- Settings database: SQLite.
- SSH: mature Node SSH library or system `ssh` wrapper, with explicit known-host behavior.
- macOS file picker: local service invokes system capability such as AppleScript/JXA through an adapter.
- Keychain: thin adapter around macOS Keychain CLI/API.

The architecture should isolate OS-specific adapters for future Windows support.

## Open-Source Repository Requirements

The repository must be independently usable and must not depend on any consuming application repository.

Repository rules:

- Do not commit real server configuration.
- Do not commit env values.
- Do not commit private keys.
- Do not commit local SQLite databases.
- Do not commit `.local/` seed files.
- Provide clear README instructions for install, start, adding local file sources, adding milestone-supported source types, and security boundaries.
- Include a `.gitignore` that excludes local seeds, databases, logs, and generated artifacts that may contain sensitive local information.
- Keep sample configuration generic and non-sensitive if examples are needed.

The repository has an initialized default branch and remote. Before each release or public contribution milestone, maintainers must verify that no env contents, env values, private keys, local database files, or machine-specific seed files are tracked.

## User Scenarios

### Scenario 1: Developer compares local test, local prod, test ECS, and production ECS env

Milestone: M2, after SSH remote sources are implemented.

1. Developer starts `env-config-lens`.
2. Developer configures local file sources for local env files.
3. Developer configures SSH remote file sources for test and production servers.
4. Developer opens Multi-environment comparison.
5. Developer selects the four sources.
6. Service reads all selected sources in real time.
7. UI displays a matrix of keys and full values.
8. Developer filters to `missing`, `different`, `empty`, and `source-only`.
9. Developer copies individual values or key comparison rows when needed.

### Scenario 2: Developer checks one env source for internal health

Milestone: M1 for local file sources; M2 for SSH remote sources.

1. Developer opens Single-source health governance.
2. Developer selects one source.
3. Service reads and parses the source in real time.
4. UI displays key/value facts and issue summaries.
5. Developer filters duplicate keys or empty values.
6. Developer uses the displayed full value to decide the correction outside this tool.

### Scenario 3: SSH source fails while other sources succeed

Milestone: M2.

1. Developer selects three sources.
2. One SSH source fails because the private key or permission is invalid.
3. Service returns successful source data and one failed source result.
4. UI shows failed source count and the source-level error category.
5. The failed source does not participate in the comparison matrix.
6. Developer can go to Settings and run a source test.

### Scenario 4: New user configures sources from scratch

Milestone: M1 for local file source setup; M2 adds SSH source setup.

1. User clones the open-source repository and starts the app.
2. Settings database is empty.
3. User opens Settings.
4. User adds local file sources through the file picker.
5. User adds an SSH source through standard field mode or SSH alias mode.
6. User tests source readability without revealing env contents in the test response.
7. User opens comparison or health views.

### Scenario 5: Maintainer validates with real local sources during development

Milestone: M1 for local file seed settings; M2 for SSH seed settings.

1. Maintainer creates `.local/env-sources.local.json` with real local harness source settings.
2. Maintainer runs the seed import command.
3. The command writes only settings into SQLite.
4. Maintainer starts the app and uses the normal Settings-backed source flow.
5. Seed file and SQLite database remain untracked by Git.

## Confirmed Requirement Alignment Points

- The tool is a Web page plus local service, not a pure desktop app.
- Phase one supports macOS only.
- Phase one is delivered in M1 local foundation and M2 SSH remote source milestones.
- Future Windows support should be possible through OS adapter boundaries.
- Local service must bind only to `127.0.0.1`.
- Local service must not bind to `0.0.0.0`.
- Startup generates a session token required by frontend API requests.
- CORS allows only the local UI origin.
- Env contents are stateless; settings are persistent.
- Settings use local SQLite.
- Sensitive passphrases use macOS Keychain in M2.
- Private keys are referenced by path only in M2.
- Env sources must be configured through Settings.
- Every setting item is a readable env source.
- Local file selection is performed by the backend service through a macOS file picker.
- Manual local path entry is supported.
- SSH remote source reads one configured remote env file in M2.
- SSH source supports standard fields and `~/.ssh/config` alias mode in M2.
- SSH source does not accept arbitrary remote commands in M2.
- SSH source does not use `sudo` by default in M2.
- SSH source preserves `known_hosts` verification in M2.
- Multi-source compare is real-time per request.
- Single-source health is real-time per request.
- No env content cache.
- No scheduled refresh.
- No background polling.
- Multi-environment comparison uses final effective parsed `key -> value`.
- Single-source health governance is separate from multi-source comparison.
- Complete values are shown in both comparison and health views.
- No default masking or hide/show value switch.
- No full env export in phase one.
- Single-value copy is allowed.
- Single-key multi-source comparison copy is allowed.
- File names are not validated.
- Comments, groups, original order, and line numbers are not meaningful for comparison.
- Duplicate key detection belongs to single-source health governance.
- Multi-environment comparison supports `missing`, `same`, `different`, `empty`, and `source-only`.
- Comparison uses strict string comparison after parsing.
- Variable expansion is not performed.
- Partial source failure is allowed.
- Failed sources do not block successful sources.
- Phase one has three UI entries: Multi-environment comparison, Single-source health governance, Settings.
- Default entry is Multi-environment comparison.
- Settings supports source ordering but not grouping.
- Development seed import is a command, not a normal UI feature.
- CLI comparison mode is out of scope.
- Remote env reading must not download to a normal local file path as product behavior.
- The open-source repository must not contain real server configuration or credentials.
- Development may use a Git-ignored local seed copied from the current harness.

## Decisions

- Repository name: `env-config-lens`.
- Repository path: a standalone checkout outside any consuming application repository.
- Implementation stack: TypeScript, pnpm, Node.js, Fastify, React, Vite, Tailwind CSS, SQLite.
- Milestone order: M1 local foundation first, M2 SSH remote sources second.
- Phase one source providers: local file and SSH remote file.
- UI information architecture: Multi-environment comparison, Single-source health governance, Settings.
- Runtime state boundary: env contents live only in memory for the current request/response path.
- Persisted state boundary: source settings only.
- Security boundary: local service is only reachable from the local machine and protected by startup token plus local-origin CORS.
- Comparison boundary: exact parsed value comparison only.
- Health boundary: file-internal problems are shown in a separate view.
- Packaging boundary: command-based local startup, no native app packaging in phase one.
- Open-source boundary: no real project secrets, server entries, or local paths committed.

## Assumptions

- Users can run Node.js-based local tools and install dependencies.
- Users can provide readable local env file paths.
- Users can provide SSH connectivity and private key paths for remote env files.
- Users understand that complete env values are visible in the browser UI.
- Users run the tool on a trusted personal Mac account.
- Browser memory and UI display are acceptable places to temporarily hold env values during active use.
- The local service and browser run on the same machine.
- The first open-source release can be source-run instead of binary-distributed.

## Constraints

- The project must live outside any consuming application repository.
- The project must not reuse a consuming application's packages, scripts, runtime configuration, or monorepo setup.
- Local developer harnesses may supply ignored local development seed configuration only.
- Local investigation artifacts must not be copied into Git.
- No env value may be written to documentation, logs, persisted settings, seed import output, or committed fixtures.
- The new standalone repository may use generic non-secret documentation examples only if they do not imply real values.
- macOS-specific adapters must be isolated so future Windows support does not require rewriting the whole app.

## Dependencies

- Node.js runtime.
- Package manager selected by the new repository maintainers.
- Fastify and related Node HTTP tooling.
- React, Vite, and Tailwind CSS.
- SQLite library or ORM.
- dotenv-compatible parsing and optional linting libraries.
- SSH client library or system SSH wrapper.
- macOS file picker adapter, likely AppleScript/JXA or another local service callable mechanism.
- macOS Keychain adapter.
- Browser capable of running the local Web UI.
- Local SSH configuration and `known_hosts` file when SSH alias mode is used.

## Risks

- Full env value display can leak secrets through screenshots, screen sharing, browser extensions, or shoulder surfing.
- Browser devtools and frontend runtime memory contain values during active use.
- SSH wrapper implementations can accidentally weaken `known_hosts` verification if not tested.
- Parser and linter libraries may disagree on edge syntax; implementation must define one effective value path.
- Duplicate key detection may require a richer parser/linter than the final `key -> value` parser.
- File picker implementation through AppleScript/JXA may require macOS permissions or may behave differently across macOS versions.
- SQLite settings may contain sensitive infrastructure metadata even without values.
- Future Windows support may be harder if macOS adapters are not isolated from domain logic.
- Partial failure behavior must be clear enough that users do not accidentally trust an incomplete matrix.

## Unresolved Questions

No blocking product questions remain for M1 implementation planning. M1 implementation choices remain, but they must preserve the parser contract, security gates, and milestone scope in this PRD:

- Exact SQLite library or ORM.
- Exact env parser/linter library combination.
- Exact macOS file picker adapter implementation.

M2 must not enter implementation until these technical spike outputs are recorded:

- Exact SSH implementation approach, including known-host verification behavior.
- Exact Keychain adapter implementation.
- Argument-safety model for any system `ssh` wrapper.
- Sanitized error taxonomy for SSH connection, authentication, permission, path, parse, and unknown failures.

These are implementation planning decisions and do not change the confirmed product requirements above, but they block M2 implementation start.

## Success Criteria

M1 success criteria:

- A user can clone the repository, install dependencies with pnpm, run one command, and open the local GUI.
- The service listens only on `127.0.0.1`.
- The UI can manage local file sources through Settings.
- Local file source settings persist across restarts.
- Env contents and env values do not persist across requests or restarts.
- The comparison view can compare at least four selected local file sources and show full values.
- The comparison view clearly identifies `missing`, `same`, `different`, `empty`, and `source-only` using the defined status precedence.
- The health view can inspect one local file source and report duplicate keys, parse failures, empty values, whitespace-only values, empty keys, and illegal keys.
- Failed local file sources do not prevent successful sources from being compared.
- Logs, settings, seed import output, and error responses contain no env values.
- The repository can be made public without exposing project-specific secrets or server settings.

M2 success criteria:

- The UI can manage SSH remote file sources through Settings.
- SSH source settings persist across restarts without storing private key contents or passphrases in SQLite.
- SSH connection/readability tests return sanitized success or failure without env contents.
- SSH remote reads participate in comparison and health flows with the same parser, comparison, and no-leak gates as local file sources.
- SSH failures do not prevent successful sources from being compared.
- `known_hosts` verification remains enabled and is covered by adapter-level tests or documented verification.

## Acceptance Criteria

M1 acceptance criteria:

- Starting the app with the documented command opens the browser UI and starts the local service.
- Network inspection confirms the service binds to `127.0.0.1` only.
- API calls without the startup token are rejected.
- API calls from non-local UI origins are rejected by CORS.
- Creating a local file source persists its path and metadata in SQLite.
- Running comparison with two or more successful local file sources returns a matrix with full values.
- Running comparison with one failed local file source and at least one successful local file source returns partial results plus failed source status.
- Empty or whitespace-only values are classified visibly according to the defined status precedence.
- Same rows can be viewed, and problem rows can be focused by filters.
- Long values do not break the table layout.
- Copying a single value copies the real value.
- Copying one key's multi-source comparison result is available without a full-env export.
- No one-click full env export exists.
- Single-source health view shows complete key/value rows and issue filters.
- Duplicate, parse failure, empty value, whitespace-only value, empty key, and illegal key fixtures are all reported.
- Source order changes persist and affect comparison column order.
- `.local/`, SQLite database files, logs, and real development seeds are ignored by Git.
- A development seed import writes settings only and does not log env values.
- Sentinel no-leak tests prove the sentinel env value is absent from SQLite, seed import output, backend logs, frontend logs, and error responses.

M2 acceptance criteria:

- Creating an SSH source persists its metadata and private key path, but not private key content or passphrase.
- SSH passphrase references use macOS Keychain and do not store passphrases in SQLite.
- Testing an SSH source reports success or a sanitized failure without returning env content.
- SSH remote file reads do not download env content to a normal local file path.
- SSH comparison with one failed source and at least one successful source returns partial results plus failed source status.
- SSH source failures are categorized as `connection_failed`, `auth_failed`, `permission_denied`, `path_not_found`, `parse_failed`, or `unknown_error`.
- M2 no-leak tests prove SSH env values are absent from SQLite, seed import output, backend logs, frontend logs, and error responses.

## Implementation Constraints

- Use structured APIs and adapters rather than ad hoc shell strings where possible.
- If system `ssh` is wrapped, command construction must be argument-safe and must not include arbitrary user commands.
- Remote file reading must stream or capture content directly into memory, not write a product download file.
- The frontend must not log API responses containing env values.
- Backend errors must be sanitized before returning to UI and before logging.
- UI tables must use stable dimensions and virtual scrolling or pagination for large env sets.
- Tailwind styling should support dense, professional engineering workflows rather than a marketing landing page.
- Testing should include unit tests for comparison classification and source failure behavior.
- Testing should include parser contract fixtures for duplicate keys, empty values, whitespace-only values, empty keys, illegal keys, quoted values, escaped values, and no variable expansion.
- Testing should include integration-level checks that settings persistence excludes env contents.
- Testing should include a local-only network binding check.
- Testing should include release-blocking sentinel no-leak checks for every implemented source type.

## Evidence And Source References

- User-confirmed requirements in the `grill-me-doc` interview for Env Config Lens on 2026-07-01.
- Internal env governance notes reviewed during requirement discovery, including sensitive value boundaries.
- Internal server access notes reviewed during requirement discovery, including the distinction between source settings and env contents.
- Harness rules reviewed during requirement discovery, including the requirement that local investigation artifacts and sensitive env values stay out of docs, logs, and committed files.
- Local manual investigation artifacts demonstrated the workflow this product replaces, but they are not product inputs and must not be committed.
- Local repository feasibility review on 2026-07-01 confirmed that the repository scaffold exists and the phase-one application implementation is not present yet.

## Compatibility Expectations

- Phase one supports macOS only.
- Future Windows support should add Windows file picker and secure credential adapters without changing source, comparison, or health domain models.
- SSH config alias mode should allow advanced users to reuse existing local SSH behavior such as `ProxyJump`, custom ports, and `IdentityFile`.
- The open-source repository must remain generic and must not encode consuming-project server facts.

## Operational Expectations

- The app performs source reads only in response to user requests.
- No cron, timer, polling, background refresh, or remote watcher runs in phase one.
- The app is safe to stop at any time because env contents are not persisted.
- On restart, only source settings remain.
- Developers using real sources during implementation must rely on ignored local seed files and local SQLite, never committed fixtures.

## Future Extensions

Future work may include Windows support, more source providers, CLI comparison, export workflows, expected-difference rules, team-shared encrypted settings, native app packaging, or encrypted env preprocessing. None of these are part of phase one.
