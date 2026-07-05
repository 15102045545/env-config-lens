import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "./app";
import { SettingsStore } from "./settingsStore";

let tempDir = "";

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("LAN binding gate", () => {
  it("listens on 0.0.0.0 by default", async () => {
    const previousEnvConfigHost = process.env.ENV_CONFIG_LENS_HOST;
    const previousHost = process.env.HOST;
    delete process.env.ENV_CONFIG_LENS_HOST;
    delete process.env.HOST;
    tempDir = mkdtempSync(join(tmpdir(), "ecl-binding-"));
    const store = new SettingsStore(join(tempDir, "settings.sqlite"));
    let server: Awaited<ReturnType<typeof startServer>> | undefined;

    try {
      server = await startServer({
        store,
        sessionToken: "binding-token",
        port: 0
      });
      const address = server.app.server.address();
      expect(typeof address).toBe("object");
      expect(address && typeof address === "object" ? address.address : "").toBe("0.0.0.0");
      expect(server.url).toContain("http://127.0.0.1:");
    } finally {
      await server?.app.close();
      store.close();
      restoreEnvValue("ENV_CONFIG_LENS_HOST", previousEnvConfigHost);
      restoreEnvValue("HOST", previousHost);
    }
  });

  it("allows ENV_CONFIG_LENS_HOST to force local-only binding", async () => {
    const previousHost = process.env.ENV_CONFIG_LENS_HOST;
    process.env.ENV_CONFIG_LENS_HOST = "127.0.0.1";
    tempDir = mkdtempSync(join(tmpdir(), "ecl-binding-"));
    const store = new SettingsStore(join(tempDir, "settings.sqlite"));
    let server: Awaited<ReturnType<typeof startServer>> | undefined;

    try {
      server = await startServer({
        store,
        sessionToken: "binding-token",
        port: 0
      });
      const address = server.app.server.address();
      expect(typeof address).toBe("object");
      expect(address && typeof address === "object" ? address.address : "").toBe("127.0.0.1");
      expect(server.networkUrls).toEqual([]);
    } finally {
      await server?.app.close();
      store.close();
      restoreEnvValue("ENV_CONFIG_LENS_HOST", previousHost);
    }
  });
});

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
