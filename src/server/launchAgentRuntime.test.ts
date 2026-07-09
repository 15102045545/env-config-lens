import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("LaunchAgent runtime script", () => {
  const scriptPath = resolve(process.cwd(), "scripts/runLaunchAgentService.sh");

  it("exists as the project-owned LaunchAgent entrypoint", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("overwrites runtime logs before starting the service", () => {
    const script = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";

    expect(script).toContain(": > \"$OUT_LOG\"");
    expect(script).toContain(": > \"$ERR_LOG\"");
    expect(script).toContain("exec > >(tee \"$OUT_LOG\")");
    expect(script).toContain("exec 2> >(tee \"$ERR_LOG\" >&2)");
    expect(script).toContain("exec pnpm exec tsx src/server/main.ts");
    expect(script.indexOf(": > \"$OUT_LOG\"")).toBeLessThan(script.indexOf("exec > >(tee \"$OUT_LOG\")"));
  });
});
