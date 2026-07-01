import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsStore } from "./settingsStore";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "ecl-store-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("SettingsStore", () => {
  it("persists local file source metadata without env values", () => {
    const dataDir = makeTempDir();
    const dbPath = join(dataDir, "settings.sqlite");
    const envPath = join(dataDir, "sample.env");
    const sentinel = "ECL_SENTINEL_DO_NOT_PERSIST_93F7";
    writeFileSync(envPath, `TOKEN=${sentinel}\n`, "utf8");

    const store = new SettingsStore(dbPath);
    const created = store.createLocalFileSource({
      name: "local-dev",
      filePath: envPath,
      enabled: true,
      note: "Developer file"
    });

    expect(created).toMatchObject({
      type: "local-file",
      name: "local-dev",
      enabled: true,
      displayOrder: 1,
      localFile: { filePath: envPath }
    });
    expect(store.listSources()).toHaveLength(1);
    expect(readFileSync(dbPath, "utf8")).not.toContain(sentinel);
  });

  it("updates, disables, reorders, and deletes sources", () => {
    const dbPath = join(makeTempDir(), "settings.sqlite");
    const store = new SettingsStore(dbPath);
    const first = store.createLocalFileSource({
      name: "first",
      filePath: "/tmp/first.env",
      enabled: true,
      note: ""
    });
    const second = store.createLocalFileSource({
      name: "second",
      filePath: "/tmp/second.env",
      enabled: true,
      note: ""
    });

    store.updateLocalFileSource(first.id, {
      name: "first-updated",
      filePath: "/tmp/first-updated.env",
      enabled: false,
      note: "disabled"
    });
    store.reorderSources([second.id, first.id]);

    expect(store.listSources().map((source) => [source.name, source.displayOrder, source.enabled])).toEqual([
      ["second", 1, true],
      ["first-updated", 2, false]
    ]);

    store.deleteSource(second.id);
    expect(store.listSources().map((source) => source.id)).toEqual([first.id]);
  });

  it("persists SSH source metadata without private key contents, passphrases, or env values", () => {
    const dataDir = makeTempDir();
    const dbPath = join(dataDir, "settings.sqlite");
    const keyPath = join(dataDir, "id_ed25519");
    const privateKeyContent = "-----BEGIN OPENSSH PRIVATE KEY-----\nECL_SENTINEL_PRIVATE_KEY_93F7\n-----END OPENSSH PRIVATE KEY-----";
    const passphrase = "ECL_SENTINEL_PASSPHRASE_93F7";
    const envValue = "ECL_SENTINEL_REMOTE_ENV_VALUE_93F7";
    writeFileSync(keyPath, privateKeyContent, "utf8");

    const store = new SettingsStore(dbPath);
    const created = store.createSshRemoteFileSource({
      name: "prod ssh",
      enabled: true,
      note: "remote production",
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
      } as never
    });

    expect(created).toMatchObject({
      type: "ssh-remote-file",
      name: "prod ssh",
      enabled: true,
      displayOrder: 1,
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

    const persisted = readFileSync(dbPath, "utf8");
    expect(persisted).toContain(keyPath);
    expect(persisted).not.toContain(privateKeyContent);
    expect(persisted).not.toContain("ECL_SENTINEL_PRIVATE_KEY_93F7");
    expect(persisted).not.toContain(passphrase);
    expect(persisted).not.toContain(envValue);
  });

  it("creates and updates SSH config alias sources", () => {
    const dbPath = join(makeTempDir(), "settings.sqlite");
    const store = new SettingsStore(dbPath);
    const source = store.createSshRemoteFileSource({
      name: "alias source",
      enabled: true,
      note: "",
      sshRemoteFile: {
        mode: "alias",
        sshAlias: "prod-api",
        remoteEnvPath: "~/app/.env"
      }
    });

    const updated = store.updateSshRemoteFileSource(source.id, {
      name: "alias source updated",
      enabled: false,
      note: "uses ~/.ssh/config",
      sshRemoteFile: {
        mode: "alias",
        sshAlias: "prod-api-blue",
        remoteEnvPath: "/srv/app/.env",
        keychainService: "Env Config Lens",
        keychainAccount: "prod-api-blue"
      }
    });

    expect(updated).toMatchObject({
      type: "ssh-remote-file",
      name: "alias source updated",
      enabled: false,
      note: "uses ~/.ssh/config",
      sshRemoteFile: {
        mode: "alias",
        sshAlias: "prod-api-blue",
        remoteEnvPath: "/srv/app/.env",
        keychainService: "Env Config Lens",
        keychainAccount: "prod-api-blue"
      }
    });
  });
});
