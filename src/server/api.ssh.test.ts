import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvSource } from "../shared/types";
import { buildApp } from "./app";
import { SettingsStore } from "./settingsStore";

vi.mock("./sourceReader", () => ({
  testSourceReadability: vi.fn(async (source: EnvSource) => ({
    sourceId: source.id,
    status: "failed",
    keyCount: 0,
    errorType: "auth_failed",
    errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
  })),
  readSourceForComparison: vi.fn(async (source: EnvSource) => {
    if (source.type === "ssh-remote-file") {
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "failed",
        keyCount: 0,
        errorType: "auth_failed",
        errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
      };
    }
    return {
      sourceId: source.id,
      sourceName: source.name,
      status: "success",
      keyCount: 1,
      values: { LOCAL_ONLY: "safe-local-value" }
    };
  }),
  readSourceHealth: vi.fn(async (source: EnvSource) => ({
    sourceId: source.id,
    sourceName: source.name,
    status: "failed",
    keyCount: 0,
    values: {},
    issues: [],
    summary: {
      duplicate_key: 0,
      parse_failure: 0,
      empty_value: 0,
      whitespace_only_value: 0,
      empty_key: 0,
      illegal_key_name: 0
    },
    errorType: "auth_failed",
    errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
  })),
  readSourceRawContent: vi.fn(async (source: EnvSource) => {
    if (source.name === "prod-api-readable") {
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "success",
        content: "# remote comment\nDUP=one\n\nDUP=two\nBROKEN=\"unterminated\n"
      };
    }
    return {
      sourceId: source.id,
      sourceName: source.name,
      status: "failed",
      errorType: "auth_failed",
      errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
    };
  })
}));

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
  tempDir = mkdtempSync(join(tmpdir(), "ecl-api-ssh-"));
  store = new SettingsStore(join(tempDir, "settings.sqlite"));
  app = await buildApp({ store, sessionToken: token, uiOrigin });
});

afterEach(async () => {
  await app.close();
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("SSH source API workflow", () => {
  it("creates and lists SSH standard source settings without echoing secrets", async () => {
    const keyPath = join(tempDir, "id_ed25519");
    const privateKeyContent = "-----BEGIN OPENSSH PRIVATE KEY-----\nECL_SENTINEL_PRIVATE_KEY_93F7\n-----END OPENSSH PRIVATE KEY-----";
    const passphrase = "ECL_SENTINEL_PASSPHRASE_93F7";
    const envValue = "ECL_SENTINEL_REMOTE_ENV_VALUE_93F7";
    writeFileSync(keyPath, privateKeyContent, "utf8");

    const create = await app.inject({
      method: "POST",
      url: "/api/sources",
      headers: authHeaders,
      payload: {
        type: "ssh-remote-file",
        name: "prod ssh",
        enabled: true,
        note: "remote",
        sshRemoteFile: {
          mode: "standard",
          host: "prod.example.com",
          port: 2222,
          username: "deploy",
          privateKeyPath: keyPath,
          remoteEnvPath: "/srv/app/.env",
          keychainService: "Env Config Lens",
          keychainAccount: "prod deploy key",
          passphrase,
          envContent: `TOKEN=${envValue}`
        }
      }
    });

    expect(create.statusCode).toBe(201);
    expect(create.json().source).toMatchObject({
      type: "ssh-remote-file",
      name: "prod ssh",
      sshRemoteFile: {
        mode: "standard",
        host: "prod.example.com",
        port: 2222,
        username: "deploy",
        privateKeyPath: keyPath,
        remoteEnvPath: "/srv/app/.env",
        keychainService: "Env Config Lens",
        keychainAccount: "prod deploy key"
      }
    });
    expect(create.body).not.toContain(privateKeyContent);
    expect(create.body).not.toContain(passphrase);
    expect(create.body).not.toContain(envValue);
    expect(readFileSync(store.dbPath, "utf8")).not.toContain(passphrase);
    expect(readFileSync(store.dbPath, "utf8")).not.toContain(envValue);
  });

  it("rejects invalid SSH alias settings before they reach the reader", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sources",
      headers: authHeaders,
      payload: {
        type: "ssh-remote-file",
        name: "bad alias",
        enabled: true,
        note: "",
        sshRemoteFile: {
          mode: "alias",
          sshAlias: "-oProxyCommand=bad",
          remoteEnvPath: "/srv/app/.env"
        }
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "invalid_ssh_source",
      message: "SSH 来源配置无效。"
    });
  });

  it("tests SSH readability through the API without returning env contents", async () => {
    const source = await createSshAliasSource("prod-api");

    const response = await app.inject({
      method: "POST",
      url: `/api/sources/${source.id}/test`,
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sourceId: source.id,
      status: "failed",
      keyCount: 0,
      errorType: "auth_failed",
      errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
    });
    expect(response.body).not.toContain("ECL_SENTINEL_REMOTE_ENV_VALUE_93F7");
  });

  it("keeps successful sources in comparison when an SSH source fails", async () => {
    const local = store.createLocalFileSource({
      name: "local",
      filePath: "/tmp/local.env",
      enabled: true,
      note: ""
    });
    const ssh = await createSshAliasSource("prod-api");

    const response = await app.inject({
      method: "POST",
      url: "/api/compare",
      headers: authHeaders,
      payload: { sourceIds: [local.id, ssh.id] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().summary).toMatchObject({
      sourceCount: 2,
      successfulSourceCount: 1,
      failedSourceCount: 1,
      unionKeyCount: 1
    });
    expect(response.json().rows).toEqual([
      expect.objectContaining({
        key: "LOCAL_ONLY",
        status: "source-only",
        valuesBySourceId: { [local.id]: "safe-local-value" }
      })
    ]);
  });

  it("returns SSH raw content through the dedicated content route", async () => {
    const source = await createSshAliasSource("prod-api-readable");

    const response = await app.inject({
      method: "POST",
      url: `/api/sources/${source.id}/content`,
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sourceId: source.id,
      sourceName: "prod-api-readable",
      status: "success",
      content: "# remote comment\nDUP=one\n\nDUP=two\nBROKEN=\"unterminated\n"
    });
  });

  it("returns sanitized SSH raw content failures", async () => {
    const source = await createSshAliasSource("prod-api");

    const response = await app.inject({
      method: "POST",
      url: `/api/sources/${source.id}/content`,
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sourceId: source.id,
      sourceName: "prod-api",
      status: "failed",
      errorType: "auth_failed",
      errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
    });
    expect(response.body).not.toContain("ECL_SENTINEL_REMOTE_ENV_VALUE_93F7");
  });
});

async function createSshAliasSource(alias: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/sources",
    headers: authHeaders,
    payload: {
      type: "ssh-remote-file",
      name: alias,
      enabled: true,
      note: "",
      sshRemoteFile: {
        mode: "alias",
        sshAlias: alias,
        remoteEnvPath: "/srv/app/.env"
      }
    }
  });
  expect(response.statusCode).toBe(201);
  return response.json().source as { id: string };
}
