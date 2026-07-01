import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvSource } from "../shared/types";
import { readSshRemoteEnvFile } from "./sshRemoteReader";
import { readSourceForComparison, readSourceHealth } from "./sourceReader";

vi.mock("./sshRemoteReader", () => ({
  readSshRemoteEnvFile: vi.fn()
}));

const readSshRemoteEnvFileMock = vi.mocked(readSshRemoteEnvFile);

beforeEach(() => {
  readSshRemoteEnvFileMock.mockReset();
});

describe("sourceReader SSH integration", () => {
  it("parses SSH source contents for comparison without changing the comparison contract", async () => {
    readSshRemoteEnvFileMock.mockResolvedValue({
      ok: true,
      content: "DATABASE_URL=postgres://prod\nEMPTY=\n"
    });

    const result = await readSourceForComparison(sshSource());

    expect(result).toEqual({
      sourceId: "ssh-prod",
      sourceName: "SSH prod",
      status: "success",
      keyCount: 2,
      values: {
        DATABASE_URL: "postgres://prod",
        EMPTY: ""
      }
    });
  });

  it("reports SSH source health through the shared parser", async () => {
    readSshRemoteEnvFileMock.mockResolvedValue({
      ok: true,
      content: "DUP=one\nDUP=two\nBROKEN=\"unterminated\n"
    });

    const result = await readSourceHealth(sshSource());

    expect(result.status).toBe("failed");
    expect(result.sourceName).toBe("SSH prod");
    expect(result.values).toMatchObject({ DUP: "two" });
    expect(result.summary).toMatchObject({ duplicate_key: 1, parse_failure: 1 });
    expect(result.errorType).toBe("parse_failed");
    expect(JSON.stringify(result)).not.toContain("unterminated\n");
  });

  it("surfaces sanitized SSH read failures at source level", async () => {
    readSshRemoteEnvFileMock.mockResolvedValue({
      ok: false,
      errorType: "auth_failed",
      errorMessage: "SSH authentication failed. Check the username, key, agent, and Keychain reference."
    });

    const result = await readSourceForComparison(sshSource());

    expect(result).toEqual({
      sourceId: "ssh-prod",
      sourceName: "SSH prod",
      status: "failed",
      keyCount: 0,
      errorType: "auth_failed",
      errorMessage: "SSH authentication failed. Check the username, key, agent, and Keychain reference."
    });
  });
});

function sshSource(): EnvSource {
  return {
    id: "ssh-prod",
    type: "ssh-remote-file",
    name: "SSH prod",
    enabled: true,
    displayOrder: 1,
    note: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    sshRemoteFile: {
      mode: "standard",
      host: "prod.example.com",
      port: 22,
      username: "deploy",
      privateKeyPath: "/Users/example/.ssh/id_ed25519",
      remoteEnvPath: "/srv/app/.env"
    }
  };
}
