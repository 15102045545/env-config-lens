# Env Config Lens Full-Scope Page Design

## Scope

Create a self-contained HTML + Tailwind high-fidelity prototype for the full phase-one Env Config Lens product surface. The prototype covers both M1 local file sources and M2 SSH remote file sources.

## Product Goal

Give developers a local, visual, no-persistence workflow for comparing env values across local and SSH-readable sources, and for inspecting one source's internal health.

## Pages

The prototype uses one app shell with three primary entries:

- Multi-environment comparison.
- Single-source health governance.
- Settings.

## Visual Direction

The interface should feel like a dense engineering operations tool: restrained, table-first, local-security aware, and built for repeated inspection. It should avoid marketing hero patterns and generic SaaS decoration.

## System

- Color: neutral shell, ink text, blue primary actions, green success, amber warnings, red errors, slate disabled states.
- Typography: compact sans-serif for UI labels and monospace for keys, paths, and values.
- Shape: small radius, thin borders, minimal shadow.
- Layout: desktop left navigation with dense work area; mobile top navigation with horizontally scrollable matrices.

## Required Coverage

- Comparison matrix with local and SSH source columns.
- Row statuses: same, different, missing, empty, source-only.
- Source-level partial failure.
- Status filters, key search, source selection, and problem-only focus.
- Complete values in cells, with long-value expand/collapse.
- Single-value copy and one-key multi-source comparison copy.
- Health view for one selected source with complete key/value facts.
- Health issues: duplicate key, parse failure, empty value, whitespace-only value, empty key, illegal key name.
- Settings for local file sources.
- Settings for SSH standard mode and SSH config alias mode.
- Backend-driven file picker and private-key picker represented as local-service actions.
- Readability/connection tests that return sanitized status only.
- Source enable/disable and ordering controls.
- Security boundary: 127.0.0.1 bind, startup token, local-origin CORS, SQLite settings only, Keychain references, no full-env export.

## Assumptions

- The current repository has no implementation scaffold, so the deliverable is a standalone prototype under `prototypes/`.
- The prototype uses generic sample values and must not include real hosts, usernames, paths, private keys, or env values.
- The prototype demonstrates product behavior and UI states; it does not implement real file reading, SQLite, Keychain, SSH, or API calls.
