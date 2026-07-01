# Env Config Lens M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M1 local-file Env Config Lens application as a one-command local web UI plus Fastify service.

**Architecture:** A TypeScript workspace contains shared domain logic, a Fastify local service, and a React/Vite/Tailwind frontend. Env source settings persist to SQLite; env contents are read on demand and kept only in request memory.

**Tech Stack:** pnpm, TypeScript, Fastify, React, Vite, Tailwind CSS, Vitest, Playwright, Node built-in SQLite.

---

### Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/client/main.tsx`
- Create: `src/client/styles.css`
- Create: `src/server/main.ts`
- Create: `src/shared/types.ts`

- [ ] Create the package scripts for `pnpm start`, `pnpm dev`, `pnpm build`, `pnpm test`, and `pnpm seed:local`.
- [ ] Configure TypeScript for React and Node ESM.
- [ ] Configure Vite to build the frontend into `dist/client`.
- [ ] Configure Vitest to run server/domain tests in Node and component tests in jsdom.

### Task 2: Parser And Comparison Domain

**Files:**
- Test: `src/shared/envParser.test.ts`
- Test: `src/shared/comparison.test.ts`
- Create: `src/shared/envParser.ts`
- Create: `src/shared/comparison.ts`

- [ ] Write failing parser tests for duplicate last-wins, empty values, whitespace-only values, empty keys, illegal keys, quoted values, escaped values, and no variable expansion.
- [ ] Run parser tests and verify they fail because implementation is missing.
- [ ] Implement the minimal parser contract.
- [ ] Run parser tests and verify they pass.
- [ ] Write failing comparison tests for status precedence and partial source failure.
- [ ] Run comparison tests and verify they fail because implementation is missing.
- [ ] Implement matrix classification, summary counts, and failed-source exclusion.
- [ ] Run comparison tests and verify they pass.

### Task 3: Settings Persistence And Seed Import

**Files:**
- Test: `src/server/settingsStore.test.ts`
- Test: `src/server/seed.test.ts`
- Create: `src/server/settingsStore.ts`
- Create: `src/server/paths.ts`
- Create: `src/server/seedLocal.ts`

- [ ] Write failing tests proving SQLite stores source metadata and paths but not sentinel env values.
- [ ] Write failing tests proving seed import writes settings only and does not print env values.
- [ ] Implement the SQLite schema and CRUD operations.
- [ ] Implement seed import from `.local/env-sources.local.json`.
- [ ] Run persistence and seed tests until they pass.

### Task 4: Source Reading And API Security

**Files:**
- Test: `src/server/api.test.ts`
- Create: `src/server/sourceReader.ts`
- Create: `src/server/fileDialog.ts`
- Create: `src/server/app.ts`

- [ ] Write failing API tests for token rejection, CORS rejection, local source CRUD, local readability test, comparison, health, and local-only binding metadata.
- [ ] Implement token and origin guards for `/api/*`.
- [ ] Implement local file reading, sanitized errors, comparison API, health API, and macOS file picker adapter.
- [ ] Run API tests until they pass.

### Task 5: React UI

**Files:**
- Test: `src/client/App.test.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/api.ts`
- Create: `src/client/components/*`

- [ ] Write failing component tests for default problem-row filtering and long-value expansion.
- [ ] Implement the app shell with Comparison, Health, and Settings entries.
- [ ] Implement local source management, comparison matrix, health issue filters, single-value copy, and one-key row copy.
- [ ] Show SSH as a documented M2 gated section rather than an enabled M1 action.
- [ ] Run component tests until they pass.

### Task 6: Startup, Build, Docs, And Verification

**Files:**
- Modify: `README.md`
- Create: `scripts/start.ts`
- Create: `scripts/verifyBinding.ts`

- [ ] Implement `pnpm start` as a one-command build-and-serve path that binds Fastify to `127.0.0.1`, generates a startup token, and opens the browser URL.
- [ ] Add README instructions for install, start, local source setup, seed import, and security boundaries.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Start the app and validate the UI in a browser at desktop and mobile widths.
- [ ] Confirm no `.local`, SQLite, logs, env contents, or env values are tracked.
