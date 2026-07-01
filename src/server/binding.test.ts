import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { SettingsStore } from "./settingsStore";

let tempDir = "";

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("local binding gate", () => {
  it("listens on 127.0.0.1 instead of 0.0.0.0", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ecl-binding-"));
    const store = new SettingsStore(join(tempDir, "settings.sqlite"));
    const app = await buildApp({
      store,
      sessionToken: "binding-token",
      uiOrigin: "http://127.0.0.1:0"
    });

    try {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address();
      expect(typeof address).toBe("object");
      expect(address && typeof address === "object" ? address.address : "").toBe("127.0.0.1");
    } finally {
      await app.close();
      store.close();
    }
  });
});
