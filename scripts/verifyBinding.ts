import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server/app";
import { SettingsStore } from "../src/server/settingsStore";

const tempDir = mkdtempSync(join(tmpdir(), "env-config-lens-binding-"));
const store = new SettingsStore(join(tempDir, "settings.sqlite"));
const server = await startServer({
  store,
  sessionToken: "binding-check",
  host: "0.0.0.0",
  port: 0
});

try {
  const address = server.app.server.address();
  if (!address || typeof address !== "object" || address.address !== "0.0.0.0") {
    throw new Error(`Expected 0.0.0.0 binding, got ${JSON.stringify(address)}`);
  }
  console.log("Binding check passed: service listens on 0.0.0.0 for LAN access.");
} finally {
  await server.app.close();
  store.close();
  rmSync(tempDir, { recursive: true, force: true });
}
