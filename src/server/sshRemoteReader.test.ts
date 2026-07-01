import { describe, expect, it } from "vitest";
import type { EnvSource } from "../shared/types";
import {
  buildSshReadCommand,
  classifySshFailure,
  quoteRemoteShellArg,
  readSshRemoteEnvFile
} from "./sshRemoteReader";

describe("sshRemoteReader", () => {
  it("builds standard OpenSSH args with host verification enabled and no local shell", () => {
    const command = buildSshReadCommand(sshStandardSource());

    expect(command.executable).toBe("ssh");
    expect(command.usesShell).toBe(false);
    expect(command.args).toEqual(
      expect.arrayContaining([
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "PasswordAuthentication=no",
        "-o",
        "KbdInteractiveAuthentication=no",
        "-o",
        "PreferredAuthentications=publickey",
        "-i",
        "/Users/example/.ssh/id_ed25519",
        "-p",
        "2222",
        "deploy@example.com",
        "cat -- '/srv/app/.env'"
      ])
    );
    expect(command.args).not.toContain("StrictHostKeyChecking=no");
  });

  it("builds alias OpenSSH args with Keychain askpass references only", () => {
    const command = buildSshReadCommand({
      ...sshAliasSource(),
      sshRemoteFile: {
        mode: "alias",
        sshAlias: "prod-api",
        remoteEnvPath: "~/app/.env",
        keychainService: "Env Config Lens",
        keychainAccount: "prod-api key"
      }
    });

    expect(command.args).toEqual(expect.arrayContaining(["prod-api", "cat -- '~/app/.env'"]));
    expect(command.args).not.toContain("-i");
    expect(command.env).toMatchObject({
      SSH_ASKPASS_REQUIRE: "force",
      ECL_KEYCHAIN_SERVICE: "Env Config Lens",
      ECL_KEYCHAIN_ACCOUNT: "prod-api key"
    });
    expect(JSON.stringify(command.env)).not.toContain("passphrase");
  });

  it("quotes remote paths so path text cannot become another remote command", () => {
    expect(quoteRemoteShellArg("/srv/app/a'; rm -rf / #.env")).toBe("'/srv/app/a'\\''; rm -rf / #.env'");
    expect(() => quoteRemoteShellArg("/srv/app/.env\nTOKEN=value")).toThrow("remoteEnvPath cannot contain newline");
  });

  it("classifies SSH failures without returning stderr content", () => {
    const sentinel = "TOKEN=ECL_SENTINEL_REMOTE_ENV_VALUE_93F7";

    expect(classifySshFailure("ssh: Could not resolve hostname prod: nodename nor servname provided", sentinel)).toEqual({
      errorType: "connection_failed",
      errorMessage: "SSH connection failed. Check the host, port, network, and SSH config."
    });
    expect(classifySshFailure("Permission denied (publickey).", sentinel)).toEqual({
      errorType: "auth_failed",
      errorMessage: "SSH authentication failed. Check the username, key, agent, and Keychain reference."
    });
    expect(classifySshFailure("cat: /srv/app/.env: Permission denied", sentinel)).toEqual({
      errorType: "permission_denied",
      errorMessage: "Remote env file is not readable by the configured SSH user."
    });
    expect(classifySshFailure(`cat: /srv/app/.env: No such file or directory\n${sentinel}`, sentinel)).toEqual({
      errorType: "path_not_found",
      errorMessage: "Remote env file path was not found."
    });
  });

  it("reads remote stdout in memory and sanitizes failed reads", async () => {
    const success = await readSshRemoteEnvFile(sshStandardSource(), async () => ({
      exitCode: 0,
      stdout: "TOKEN=ECL_SENTINEL_REMOTE_ENV_VALUE_93F7\n",
      stderr: ""
    }));
    expect(success).toEqual({ ok: true, content: "TOKEN=ECL_SENTINEL_REMOTE_ENV_VALUE_93F7\n" });

    const failure = await readSshRemoteEnvFile(sshStandardSource(), async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "cat: /srv/app/.env: No such file or directory\nTOKEN=ECL_SENTINEL_REMOTE_ENV_VALUE_93F7"
    }));
    expect(failure).toEqual({
      ok: false,
      errorType: "path_not_found",
      errorMessage: "Remote env file path was not found."
    });
    expect(JSON.stringify(failure)).not.toContain("ECL_SENTINEL_REMOTE_ENV_VALUE_93F7");
  });
});

function sshStandardSource(): EnvSource {
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
      host: "example.com",
      port: 2222,
      username: "deploy",
      privateKeyPath: "/Users/example/.ssh/id_ed25519",
      remoteEnvPath: "/srv/app/.env"
    }
  };
}

function sshAliasSource(): EnvSource {
  return {
    id: "ssh-alias",
    type: "ssh-remote-file",
    name: "SSH alias",
    enabled: true,
    displayOrder: 2,
    note: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    sshRemoteFile: {
      mode: "alias",
      sshAlias: "prod-api",
      remoteEnvPath: "~/app/.env"
    }
  };
}
