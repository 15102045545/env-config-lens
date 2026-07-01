import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importLocalSeed } from "./seedLocal";
import { SettingsStore } from "./settingsStore";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "ecl-seed-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("importLocalSeed", () => {
  it("imports source settings only and does not log or persist env values", async () => {
    const dataDir = makeTempDir();
    const dbPath = join(dataDir, "settings.sqlite");
    const seedPath = join(dataDir, "env-sources.local.json");
    const sentinel = "ECL_SENTINEL_DO_NOT_PERSIST_93F7";
    const logs: string[] = [];
    writeFileSync(
      seedPath,
      JSON.stringify(
        {
          sources: [
            {
              name: "local-dev",
              filePath: "/tmp/local-dev.env",
              enabled: true,
              note: "safe metadata",
              envContent: `TOKEN=${sentinel}`
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const store = new SettingsStore(dbPath);
    const imported = await importLocalSeed({
      seedPath,
      store,
      log: (message) => logs.push(message)
    });

    expect(imported).toBe(1);
    expect(store.listSources()).toMatchObject([
      {
        name: "local-dev",
        localFile: { filePath: "/tmp/local-dev.env" }
      }
    ]);
    expect(logs.join("\n")).toContain("Imported 1 local source setting");
    expect(logs.join("\n")).not.toContain(sentinel);
    expect(readFileSync(dbPath, "utf8")).not.toContain(sentinel);
  });
});
