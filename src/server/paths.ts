import { homedir } from "node:os";
import { join } from "node:path";

export function getDefaultDataDir() {
  return (
    process.env.ENV_CONFIG_LENS_DATA_DIR ??
    join(homedir(), "Library", "Application Support", "env-config-lens")
  );
}

export function getDefaultDbPath() {
  return join(getDefaultDataDir(), "settings.sqlite");
}

export function getDefaultSeedPath() {
  return ".local/env-sources.local.json";
}
