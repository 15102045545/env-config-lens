import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { SettingsStore } from "./settingsStore";

const token = "test-session-token";
const uiOrigin = "http://127.0.0.1:4173";
const authHeaders = {
  "x-env-config-lens-token": token,
  origin: uiOrigin
};

let tempDir: string;
let store: SettingsStore;
let app: FastifyInstance;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "ecl-api-"));
  store = new SettingsStore(join(tempDir, "settings.sqlite"));
  app = await buildApp({ store, sessionToken: token, uiOrigin });
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("local API security", () => {
  it("rejects API requests without the startup token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sources", headers: { origin: uiOrigin } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "session_token_required" });
  });

  it("rejects API requests from a non-local UI origin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/sources",
      headers: {
        "x-env-config-lens-token": token,
        origin: "https://example.invalid"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "local_origin_required" });
  });

  it("reports the local runtime boundary", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runtime-boundary",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bindHost: "127.0.0.1",
      tokenRequired: true,
      persistedState: "settings-only"
    });
  });
});

describe("local source workflow", () => {
  it("creates, lists, updates, reorders, and deletes local file source settings", async () => {
    const first = await createSource("first", "/tmp/first.env");
    const second = await createSource("second", "/tmp/second.env");

    const update = await app.inject({
      method: "PATCH",
      url: `/api/sources/${first.id}`,
      headers: authHeaders,
      payload: {
        name: "first-updated",
        filePath: "/tmp/first-updated.env",
        enabled: false,
        note: "disabled"
      }
    });
    expect(update.statusCode).toBe(200);

    const reorder = await app.inject({
      method: "POST",
      url: "/api/sources/reorder",
      headers: authHeaders,
      payload: { sourceIds: [second.id, first.id] }
    });
    expect(reorder.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/sources", headers: authHeaders });
    expect(list.json().sources.map((source: { name: string; displayOrder: number; enabled: boolean }) => [
      source.name,
      source.displayOrder,
      source.enabled
    ])).toEqual([
      ["second", 1, true],
      ["first-updated", 2, false]
    ]);

    const deletion = await app.inject({
      method: "DELETE",
      url: `/api/sources/${second.id}`,
      headers: authHeaders
    });
    expect(deletion.statusCode).toBe(204);
  });

  it("tests readability without returning env contents", async () => {
    const sentinel = "ECL_SENTINEL_DO_NOT_PERSIST_93F7";
    const envPath = join(tempDir, "readable.env");
    writeFileSync(envPath, `TOKEN=${sentinel}\n`, "utf8");
    const source = await createSource("readable", envPath);

    const response = await app.inject({
      method: "POST",
      url: `/api/sources/${source.id}/test`,
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sourceId: source.id,
      status: "success",
      keyCount: 1
    });
    expect(response.body).not.toContain(sentinel);
  });

  it("compares selected local sources with full values and status counts", async () => {
    const leftPath = join(tempDir, "left.env");
    const rightPath = join(tempDir, "right.env");
    writeFileSync(leftPath, "SAME=value\nDIFF=left\nEMPTY=\nONLY_LEFT=one\n", "utf8");
    writeFileSync(rightPath, "SAME=value\nDIFF=right\n", "utf8");
    const left = await createSource("left", leftPath);
    const right = await createSource("right", rightPath);

    const response = await app.inject({
      method: "POST",
      url: "/api/compare",
      headers: authHeaders,
      payload: { sourceIds: [left.id, right.id] }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary).toMatchObject({
      unionKeyCount: 4,
      sameCount: 1,
      differentCount: 1,
      emptyCount: 1,
      sourceOnlyCount: 1
    });
    expect(body.rows.find((row: { key: string }) => row.key === "DIFF")).toMatchObject({
      status: "different",
      valuesBySourceId: {
        [left.id]: "left",
        [right.id]: "right"
      }
    });
  });

  it("returns single-source health facts and issues", async () => {
    const envPath = join(tempDir, "health.env");
    writeFileSync(envPath, "DUP=one\nDUP=two\nEMPTY=\nSPACE=\"   \"\n1BAD=value\nBROKEN=\"unterminated\n", "utf8");
    const source = await createSource("health", envPath);

    const response = await app.inject({
      method: "POST",
      url: "/api/health",
      headers: authHeaders,
      payload: { sourceId: source.id }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.values).toMatchObject({ DUP: "two", EMPTY: "", SPACE: "   " });
    expect(body.summary).toMatchObject({
      duplicate_key: 1,
      empty_value: 1,
      whitespace_only_value: 1,
      illegal_key_name: 1,
      parse_failure: 1
    });
    expect(response.body).not.toContain("unterminated\n");
  });

  it("returns raw local source content without parsing or reordering it", async () => {
    const rawContent = "# kept comment\nDUP=one\n\nDUP=two\nBROKEN=\"unterminated\n";
    const envPath = join(tempDir, "raw.env");
    writeFileSync(envPath, rawContent, "utf8");
    const source = await createSource("raw", envPath);

    const response = await app.inject({
      method: "POST",
      url: `/api/sources/${source.id}/content`,
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sourceId: source.id,
      sourceName: "raw",
      status: "success",
      content: rawContent
    });
  });

  it("returns source_not_found for unknown raw content requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sources/missing-source/content",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "source_not_found" });
  });

  it("returns sanitized local raw content read failures without env contents", async () => {
    const source = await createSource("missing", join(tempDir, "does-not-exist.env"));

    const response = await app.inject({
      method: "POST",
      url: `/api/sources/${source.id}/content`,
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sourceId: source.id,
      sourceName: "missing",
      status: "failed",
      errorType: "path_not_found",
      errorMessage: "Local file path was not found."
    });
    expect(response.body).not.toContain("TOKEN=");
  });
});

async function createSource(name: string, filePath: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/sources",
    headers: authHeaders,
    payload: {
      type: "local-file",
      name,
      filePath,
      enabled: true,
      note: ""
    }
  });
  expect(response.statusCode).toBe(201);
  return response.json().source as { id: string };
}
