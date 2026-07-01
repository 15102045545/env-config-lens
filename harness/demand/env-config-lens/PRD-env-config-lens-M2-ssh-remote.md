# PRD: Env Config Lens M2 SSH Remote Sources

## Metadata

- Status: Blocked until M1 is complete and SSH/Keychain technical spikes are recorded
- Date: 2026-07-01
- Parent PRD: `harness/demand/env-config-lens/PRD-env-config-lens.md`
- Milestone: M2 SSH remote sources
- Scope: SSH remote file source settings, SSH config alias mode, private key path selection, Keychain passphrase references, SSH source test, remote env read, comparison and health integration, SSH no-leak release gates

## Objective

M2 adds SSH-readable remote env files to the M1 local foundation. A developer can configure a remote env source, test connectivity without returning env contents, read one configured remote file on demand, and use SSH sources in the same comparison and health workflows as local file sources.

## Entry Criteria

M2 must not start until:

- M1 local file comparison, health, settings, startup, and no-leak gates are complete.
- The SSH implementation approach is selected and documented.
- The chosen SSH approach preserves `known_hosts` verification.
- The Keychain adapter approach is selected and documented.
- Argument-safety rules are documented for any system `ssh` wrapper.
- Sanitized SSH failure categories are documented.

## Scope

M2 includes:

- SSH remote file source creation, editing, deletion, enable/disable, and ordering.
- Standard field mode: host, port, username, private key path, remote env file path, enabled state, display order, optional note, optional Keychain passphrase reference.
- SSH config alias mode: SSH alias, remote env file path, enabled state, display order, optional note, optional Keychain passphrase reference.
- Backend-driven private key path picker.
- SSH source readability tests that return success or sanitized failure only.
- Remote env file reads for one configured `remoteEnvPath`.
- Comparison and health support for SSH sources using the M1 parser, comparison, and health contracts.
- Partial failure behavior where failed SSH sources do not block successful sources.
- macOS Keychain passphrase references when passphrases are needed.
- SSH-specific no-leak tests.

M2 excludes:

- Arbitrary remote command input.
- `sudo` by default.
- Bastion/cloud provider integrations beyond user-managed SSH config behavior.
- Remote agents.
- Vault, Kubernetes, Docker inspect, S3, OSS, GitHub Secrets, databases, HTTP URLs, encrypted env formats, and decryption.
- Windows support.
- Full-env export.

## Functional Requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| M2-FR-1 | Add SSH source settings in Settings. | Users can create SSH sources in standard field mode and SSH config alias mode. |
| M2-FR-2 | Persist SSH source metadata only. | SQLite stores source metadata, private key path, remote env path, and optional Keychain reference; it never stores private key contents, passphrases, env contents, or env values. |
| M2-FR-3 | Select private key paths through the backend. | The UI requests a macOS file picker from the local service and persists only the selected path. |
| M2-FR-4 | Test SSH source readability without returning env contents. | Source test returns success or a sanitized failure category and message. |
| M2-FR-5 | Read only the configured remote env file. | Remote reads are constrained to `remoteEnvPath` and do not expose arbitrary command entry in the UI. |
| M2-FR-6 | Preserve SSH host verification. | `known_hosts` verification remains enabled and is covered by tests or documented adapter verification. |
| M2-FR-7 | Integrate SSH sources into comparison. | Successful SSH reads participate in the matrix with local sources; failed SSH reads are reported at source level. |
| M2-FR-8 | Integrate SSH sources into health governance. | A selected SSH source can be read and inspected with the same health issue types as local files. |
| M2-FR-9 | Use Keychain for passphrase references. | Passphrases are not persisted in SQLite and are accessed through the macOS Keychain adapter when needed. |

## SSH Behavior Contract

- Read only the configured `remoteEnvPath`.
- Do not expose a free-form remote command input in the UI.
- Do not use `sudo` by default.
- The configured login user must already have read permission for the target file.
- Preserve `known_hosts` verification to avoid connecting to the wrong server.
- Support connection testing without returning env contents.
- Return connection, authentication, permission, path, parse, or unknown failure categories without leaking env values.
- If system `ssh` is wrapped, command construction must be argument-safe and must not include arbitrary user commands.
- Remote file contents must stream or be captured directly into memory and must not be written to a normal local file path.

## Failure Categories

M2 must normalize SSH and remote read failures to:

- `connection_failed`
- `auth_failed`
- `permission_denied`
- `path_not_found`
- `parse_failed`
- `unknown_error`

Error messages must help users fix settings without echoing env file contents, command output containing env values, or private key material.

## Security And Privacy Gates

M2 release is blocked unless all M1 gates still pass and these M2 gates pass:

- SSH env values are not written to SQLite.
- SSH env values are not written to backend logs.
- SSH env values are not written to frontend logs.
- SSH env values are not written to seed import output.
- SSH env values are not included in sanitized error responses.
- Private key contents are never copied into SQLite.
- Passphrases are never copied into SQLite.
- Remote read output is not written to temp files or normal local files.
- `known_hosts` verification remains enabled.
- Failed SSH source tests do not return env contents.

The no-leak tests must use committed generic sentinel values that are not real secrets.

## Test Requirements

M2 must include:

- Adapter tests or documented verification for `known_hosts` behavior.
- Tests for standard field mode validation.
- Tests for SSH config alias mode validation.
- Tests for private key path persistence without private key content persistence.
- Tests for Keychain reference persistence without passphrase persistence.
- Tests for source readability success and sanitized failure.
- Tests for each failure category.
- Integration tests for SSH partial failure in comparison.
- Health tests for SSH parse and issue reporting.
- Sentinel no-leak tests covering SQLite, backend logs, frontend logs, seed import output, and error responses.

## Acceptance Criteria

- Creating an SSH source persists metadata and private key path, but not private key content or passphrase.
- SSH passphrase references use macOS Keychain and do not store passphrases in SQLite.
- Testing an SSH source reports success or sanitized failure without returning env content.
- SSH remote file reads do not download env content to a normal local file path.
- SSH sources can participate in comparison with local file sources.
- SSH sources can be inspected in the health view.
- SSH comparison with one failed source and at least one successful source returns partial results plus failed source status.
- SSH source failures are categorized as `connection_failed`, `auth_failed`, `permission_denied`, `path_not_found`, `parse_failed`, or `unknown_error`.
- M2 no-leak tests prove SSH env values are absent from SQLite, seed import output, backend logs, frontend logs, and error responses.

## Exit Criteria

M2 is complete when SSH sources work through Settings, source tests, comparison, and health views; all M1 gates still pass; all M2 SSH and Keychain gates pass; and no SSH implementation detail weakens the local-only, no-persistence, or open-source safety boundaries.
