import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { SettingsStore } from "./settingsStore";

const token = "test-session-token";
const requestOrigin = "http://127.0.0.1:4173";
const authHeaders = {
  "x-env-config-lens-token": token,
  origin: requestOrigin
};

let tempDir: string;
let store: SettingsStore;
let app: FastifyInstance;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "ecl-api-"));
  store = new SettingsStore(join(tempDir, "settings.sqlite"));
  app = await buildApp({ store, sessionToken: token });
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("local API security", () => {
  it("rejects API requests without the startup token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/sources", headers: { origin: requestOrigin } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "session_token_required",
      message: "需要有效的启动会话令牌。"
    });
  });

  it("allows API requests from any origin when the startup token is valid", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/sources",
      headers: {
        "x-env-config-lens-token": token,
        origin: "https://example.invalid"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sources: [] });
    expect(response.headers["access-control-allow-origin"]).toBe("https://example.invalid");
  });

  it("allows API CORS preflight without the startup token", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/sources",
      headers: {
        origin: "https://example.invalid",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-env-config-lens-token"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://example.invalid");
    expect(response.headers["access-control-allow-headers"]).toContain("x-env-config-lens-token");
    expect(response.headers["access-control-allow-headers"]).toContain("content-type");
  });

  it("reports the LAN runtime boundary", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runtime-boundary",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bindHost: "0.0.0.0",
      accessScope: "lan",
      tokenRequired: true,
      apiAccessPolicy: "token",
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
    expect(response.json()).toEqual({
      error: "source_not_found",
      message: "未找到来源。"
    });
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
      errorMessage: "本地文件路径不存在。"
    });
    expect(response.body).not.toContain("TOKEN=");
  });
});

describe("uploaded source workflow", () => {
  it("injects uploaded sources into source listing without persisting env contents", async () => {
    const sentinel = "ECL_SENTINEL_UPLOADED_ENV_93F7";

    const upload = await uploadSource({
      name: "uploaded-prod",
      fileName: "prod.env",
      content: `TOKEN=${sentinel}\nEMPTY=\n`,
      note: "memory only"
    });

    expect(upload.statusCode).toBe(201);
    const created = upload.json().source;
    expect(created).toMatchObject({
      type: "uploaded-file",
      name: "uploaded-prod",
      enabled: true,
      note: "memory only",
      uploadedFile: {
        fileName: "prod.env",
        sizeBytes: Buffer.byteLength(`TOKEN=${sentinel}\nEMPTY=\n`, "utf8")
      }
    });
    expect(upload.body).not.toContain(sentinel);

    const list = await app.inject({ method: "GET", url: "/api/sources", headers: authHeaders });
    expect(list.json().sources).toHaveLength(1);
    expect(list.json().sources[0]).toMatchObject({ id: created.id, type: "uploaded-file" });
    expect(list.body).not.toContain(sentinel);
    expect(readFileSync(store.dbPath, "utf8")).not.toContain(sentinel);
  });

  it("uses uploaded source contents for test, comparison, health, and raw viewing", async () => {
    const envContent = "SAME=value\nDIFF=uploaded\nEMPTY=\n";
    const upload = await uploadSource({ name: "uploaded-dev", fileName: ".env.upload", content: envContent });
    const uploaded = upload.json().source as { id: string };
    const localPath = join(tempDir, "local.env");
    writeFileSync(localPath, "SAME=value\nDIFF=local\n", "utf8");
    const local = await createSource("local", localPath);

    const testReadability = await app.inject({
      method: "POST",
      url: `/api/sources/${uploaded.id}/test`,
      headers: authHeaders
    });
    expect(testReadability.json()).toEqual({
      sourceId: uploaded.id,
      status: "success",
      keyCount: 3
    });

    const comparison = await app.inject({
      method: "POST",
      url: "/api/compare",
      headers: authHeaders,
      payload: { sourceIds: [local.id, uploaded.id] }
    });
    expect(comparison.statusCode).toBe(200);
    expect(comparison.json().rows.find((row: { key: string }) => row.key === "DIFF")).toMatchObject({
      status: "different",
      valuesBySourceId: {
        [local.id]: "local",
        [uploaded.id]: "uploaded"
      }
    });

    const health = await app.inject({
      method: "POST",
      url: "/api/health",
      headers: authHeaders,
      payload: { sourceId: uploaded.id }
    });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      sourceId: uploaded.id,
      sourceName: "uploaded-dev",
      status: "success",
      values: { SAME: "value", DIFF: "uploaded", EMPTY: "" },
      summary: { empty_value: 1 }
    });

    const raw = await app.inject({
      method: "POST",
      url: `/api/sources/${uploaded.id}/content`,
      headers: authHeaders
    });
    expect(raw.json()).toEqual({
      sourceId: uploaded.id,
      sourceName: "uploaded-dev",
      status: "success",
      content: envContent
    });
  });

  it("drops uploaded sources when the server app is rebuilt", async () => {
    await uploadSource({ name: "volatile", fileName: "volatile.env", content: "TOKEN=value\n" });
    expect((await app.inject({ method: "GET", url: "/api/sources", headers: authHeaders })).json().sources).toHaveLength(1);

    await app.close();
    app = await buildApp({ store, sessionToken: token });

    const listAfterRestart = await app.inject({ method: "GET", url: "/api/sources", headers: authHeaders });
    expect(listAfterRestart.json()).toEqual({ sources: [] });
  });

  it("rejects missing, non-multipart, and oversized uploaded files", async () => {
    const missingFile = await app.inject({
      method: "POST",
      url: "/api/sources/upload",
      headers: { ...authHeaders, "content-type": "multipart/form-data; boundary=ecl-test-boundary" },
      payload: multipartPayload("ecl-test-boundary", [
        { name: "name", value: "missing file" }
      ])
    });
    expect(missingFile.statusCode).toBe(422);
    expect(missingFile.json()).toMatchObject({ error: "upload_file_required" });

    const nonMultipart = await app.inject({
      method: "POST",
      url: "/api/sources/upload",
      headers: authHeaders,
      payload: { name: "not multipart" }
    });
    expect(nonMultipart.statusCode).toBe(400);
    expect(nonMultipart.json()).toMatchObject({ error: "multipart_required" });

    const tooLarge = await uploadSource({
      name: "too-large",
      fileName: "too-large.env",
      content: `TOKEN=${"x".repeat(1024 * 1024)}`
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toMatchObject({ error: "upload_file_too_large" });
  });

  it("keeps mixed local and uploaded source ordering and enabled state stable", async () => {
    const local = await createSource("local", "/tmp/local.env");
    const upload = await uploadSource({ name: "uploaded", fileName: "uploaded.env", content: "TOKEN=value\n" });
    const uploaded = upload.json().source as { id: string };

    const reorder = await app.inject({
      method: "POST",
      url: "/api/sources/reorder",
      headers: authHeaders,
      payload: { sourceIds: [uploaded.id, local.id] }
    });
    expect(reorder.statusCode).toBe(200);
    expect(reorder.json().sources.map((source: { name: string; displayOrder: number }) => [source.name, source.displayOrder])).toEqual([
      ["uploaded", 1],
      ["local", 2]
    ]);

    const update = await app.inject({
      method: "PATCH",
      url: `/api/sources/${uploaded.id}`,
      headers: authHeaders,
      payload: { enabled: false, name: "uploaded-disabled", note: "temporary memory source", filePath: "/tmp/ignored.env" }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().source).toMatchObject({
      id: uploaded.id,
      type: "uploaded-file",
      name: "uploaded-disabled",
      enabled: false,
      note: "temporary memory source",
      uploadedFile: { fileName: "uploaded.env" }
    });
    expect(update.json().source.localFile).toBeUndefined();
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

function uploadSource(input: { name: string; fileName: string; content: string; enabled?: boolean; note?: string }) {
  const boundary = `ecl-test-${Math.random().toString(16).slice(2)}`;
  return app.inject({
    method: "POST",
    url: "/api/sources/upload",
    headers: { ...authHeaders, "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: multipartPayload(boundary, [
      { name: "name", value: input.name },
      { name: "enabled", value: String(input.enabled ?? true) },
      { name: "note", value: input.note ?? "" },
      { name: "file", fileName: input.fileName, value: input.content }
    ])
  });
}

function multipartPayload(
  boundary: string,
  parts: Array<{ name: string; value: string; fileName?: string }>
) {
  const lines: string[] = [];
  parts.forEach((part) => {
    lines.push(`--${boundary}`);
    if (part.fileName) {
      lines.push(`Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"`);
      lines.push("Content-Type: text/plain");
    } else {
      lines.push(`Content-Disposition: form-data; name="${part.name}"`);
    }
    lines.push("");
    lines.push(part.value);
  });
  lines.push(`--${boundary}--`);
  lines.push("");
  return lines.join("\r\n");
}
