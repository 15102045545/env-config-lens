# Env Config Lens M2 SSH Remote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real SSH remote `.env` sources that can be configured, tested, read for comparison, and inspected in health without persisting env contents or secrets.

**Architecture:** M2 extends the existing local Fastify service and React settings UI. The backend stores only source metadata, uses system OpenSSH for remote reads, keeps `known_hosts` verification enabled, and normalizes all SSH failures before responses reach the UI.

**Tech Stack:** TypeScript, Fastify, React, Node `child_process.spawn`, system OpenSSH, macOS Keychain `security`, Node SQLite, Vitest.

---

### Task 1: Document SSH And Keychain Spikes

**Files:**
- Create: `docs/technical/2026-07-01-m2-ssh-keychain-spike.md`
- Modify: `README.md`

- [ ] Record the selected SSH adapter: system OpenSSH launched with argument arrays and no local shell.
- [ ] Record `known_hosts` behavior: do not pass `StrictHostKeyChecking=no`; explicitly pass `StrictHostKeyChecking=yes`.
- [ ] Record remote read safety: read only `remoteEnvPath` using a generated `cat -- '<quoted path>'` command; do not expose remote command input.
- [ ] Record Keychain behavior: persist only a reference, retrieve passphrase through a helper when the source has a reference, never store passphrases in SQLite.

### Task 2: Add SSH Source Types And Store Contract

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/server/settingsStore.ts`
- Test: `src/server/settingsStore.test.ts`

- [ ] Add SSH source metadata shape for standard mode and SSH config alias mode.
- [ ] Add SQLite table `ssh_remote_file_source_configs`.
- [ ] Add create/update methods for SSH sources.
- [ ] Test that private key path and Keychain reference are persisted, while private key contents, passphrases, and env sentinels are not.

### Task 3: Add SSH Adapter And Source Reader Integration

**Files:**
- Create: `src/server/keychain.ts`
- Create: `src/server/sshAskpass.mjs`
- Create: `src/server/sshRemoteReader.ts`
- Test: `src/server/sshRemoteReader.test.ts`
- Modify: `src/server/sourceReader.ts`
- Test: `src/server/sourceReader.test.ts`

- [ ] Build OpenSSH arguments for standard and alias sources.
- [ ] Preserve host verification and disable password fallback.
- [ ] Use a Keychain askpass helper only when a Keychain reference is configured.
- [ ] Normalize SSH failure categories: `connection_failed`, `auth_failed`, `permission_denied`, `path_not_found`, `parse_failed`, `unknown_error`.
- [ ] Prove comparison and health read SSH sources through the same parser as local files.

### Task 4: Add API Endpoints And Validation

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/fileDialog.ts`
- Test: `src/server/api.test.ts`

- [ ] Allow `POST /api/sources` to create `ssh-remote-file` sources.
- [ ] Allow `PATCH /api/sources/:id` to update local or SSH source fields based on current type.
- [ ] Add backend-driven private key picker endpoint.
- [ ] Test standard mode validation, alias mode validation, source test no-leak, and partial comparison failure behavior.

### Task 5: Add Settings UI SSH Workflow

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Test: `src/client/App.test.tsx`

- [ ] Add source type selector for local, SSH standard, and SSH alias creation.
- [ ] Add SSH fields with clear validation and backend private key picker.
- [ ] Show source type and configured read target in the source table.
- [ ] Keep delete, enable/disable, reorder, test, compare, and health flows working for both local and SSH sources.

### Task 6: Verify Release Gates

**Commands:**
- `pnpm test`
- `pnpm build`
- Browser smoke test against the running local URL.

- [ ] Confirm all M1 tests still pass.
- [ ] Confirm M2 no-leak tests cover SQLite, API responses, source test failures, and frontend request behavior.
- [ ] Confirm UI can create an SSH source, list it, test it, and use it in compare/health flows with sanitized failures when no server is reachable.
