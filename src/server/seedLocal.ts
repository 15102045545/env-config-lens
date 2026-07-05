import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getDefaultDbPath, getDefaultSeedPath } from "./paths";
import { SettingsStore } from "./settingsStore";

interface SeedSource {
  name?: unknown;
  filePath?: unknown;
  enabled?: unknown;
  note?: unknown;
}

export interface ImportLocalSeedOptions {
  seedPath: string;
  store: SettingsStore;
  log?: (message: string) => void;
}

export async function importLocalSeed({ seedPath, store, log = console.log }: ImportLocalSeedOptions) {
  const raw = await readFile(seedPath, "utf8");
  const parsed = JSON.parse(raw) as { sources?: SeedSource[] } | SeedSource[];
  const sources = Array.isArray(parsed) ? parsed : parsed.sources ?? [];
  let imported = 0;

  for (const source of sources) {
    if (typeof source.name !== "string" || typeof source.filePath !== "string") {
      continue;
    }

    store.createLocalFileSource({
      name: source.name,
      filePath: source.filePath,
      enabled: typeof source.enabled === "boolean" ? source.enabled : true,
      note: typeof source.note === "string" ? source.note : ""
    });
    imported += 1;
  }

  log(`已导入 ${imported} 个本地来源设置。`);
  return imported;
}

async function runCli() {
  const store = new SettingsStore(getDefaultDbPath());
  try {
    await importLocalSeed({
      seedPath: process.env.ENV_CONFIG_LENS_SEED_PATH ?? getDefaultSeedPath(),
      store
    });
  } finally {
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
