import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/server/app";
import { SettingsStore } from "../src/server/settingsStore";

const tempDir = mkdtempSync(join(tmpdir(), "env-config-lens-binding-"));
const store = new SettingsStore(join(tempDir, "settings.sqlite"));
const app = await buildApp({
  store,
  sessionToken: "binding-check",
  uiOrigin: "http://127.0.0.1:0"
});

try {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address !== "object" || address.address !== "127.0.0.1") {
    throw new Error(`Expected 127.0.0.1 binding, got ${JSON.stringify(address)}`);
  }
  console.log("Binding check passed: service listens on 127.0.0.1.");
} finally {
  await app.close();
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
}
