import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { EnvSource, SourceErrorType, SshRemoteFileConfig } from "../shared/types";
import { hasCompleteKeychainReference } from "./keychain";

export interface SshReadCommand {
  executable: "ssh";
  args: string[];
  env?: Record<string, string>;
  timeoutMs: number;
  usesShell: false;
}

export interface SshProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  signal?: NodeJS.Signals | null;
}

export type SshProcessRunner = (command: SshReadCommand) => Promise<SshProcessResult>;

const askpassPath = fileURLToPath(new URL("./sshAskpass.mjs", import.meta.url));
const defaultTimeoutMs = 15_000;

export function buildSshReadCommand(source: EnvSource): SshReadCommand {
  if (source.type !== "ssh-remote-file" || !source.sshRemoteFile) {
    throw new Error("SSH source configuration is required.");
  }

  const ssh = validateSshConfig(source.sshRemoteFile);
  const args = [
    "-T",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "PasswordAuthentication=no",
    "-o",
    "KbdInteractiveAuthentication=no",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "NumberOfPasswordPrompts=1"
  ];
  const env: Record<string, string> = {};

  if (hasCompleteKeychainReference(ssh)) {
    args.push("-o", "BatchMode=no");
    env.SSH_ASKPASS = askpassPath;
    env.SSH_ASKPASS_REQUIRE = "force";
    env.ECL_KEYCHAIN_SERVICE = ssh.keychainService;
    env.ECL_KEYCHAIN_ACCOUNT = ssh.keychainAccount;
    env.DISPLAY = process.env.DISPLAY || "env-config-lens";
  } else {
    args.push("-o", "BatchMode=yes");
  }

  if (ssh.mode === "standard") {
    args.push("-i", ssh.privateKeyPath as string, "-o", "IdentitiesOnly=yes", "-p", String(ssh.port), `${ssh.username}@${ssh.host}`);
  } else {
    args.push(ssh.sshAlias as string);
  }

  args.push(`cat -- ${quoteRemoteShellArg(ssh.remoteEnvPath)}`);

  return {
    executable: "ssh",
    args,
    env: Object.keys(env).length > 0 ? env : undefined,
    timeoutMs: defaultTimeoutMs,
    usesShell: false
  };
}

export function quoteRemoteShellArg(value: string) {
  if (value.includes("\0")) {
    throw new Error("remoteEnvPath cannot contain NUL bytes.");
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("remoteEnvPath cannot contain newline characters.");
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function classifySshFailure(stderr: string, stdout = ""): { errorType: SourceErrorType; errorMessage: string } {
  const text = `${stderr}\n${stdout}`.toLowerCase();

  if (/permission denied \(publickey|authentication failed|too many authentication failures|no mutual signature|bad passphrase/.test(text)) {
    return {
      errorType: "auth_failed",
      errorMessage: "SSH authentication failed. Check the username, key, agent, and Keychain reference."
    };
  }

  if (
    /could not resolve hostname|no route to host|connection timed out|operation timed out|connection refused|network is unreachable|host key verification failed|remote host identification has changed|kex_exchange_identification|connection closed/.test(
      text
    )
  ) {
    return {
      errorType: "connection_failed",
      errorMessage: "SSH connection failed. Check the host, port, network, and SSH config."
    };
  }

  if (/no such file or directory|not found/.test(text)) {
    return { errorType: "path_not_found", errorMessage: "Remote env file path was not found." };
  }

  if (/permission denied/.test(text)) {
    return {
      errorType: "permission_denied",
      errorMessage: "Remote env file is not readable by the configured SSH user."
    };
  }

  return { errorType: "unknown_error", errorMessage: "SSH read failed. Check the source settings." };
}

export async function readSshRemoteEnvFile(
  source: EnvSource,
  runner: SshProcessRunner = runSshCommand
): Promise<{ ok: true; content: string } | { ok: false; errorType: SourceErrorType; errorMessage: string }> {
  try {
    const command = buildSshReadCommand(source);
    const result = await runner(command);
    if (result.exitCode === 0) {
      return { ok: true, content: result.stdout };
    }
    return { ok: false, ...classifySshFailure(result.stderr, result.stdout) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, ...classifySshFailure(message) };
  }
}

function validateSshConfig(input: SshRemoteFileConfig): SshRemoteFileConfig {
  validateRemotePath(input.remoteEnvPath);
  if (input.keychainService || input.keychainAccount) {
    validatePlainToken(input.keychainService ?? "", "keychainService");
    validatePlainToken(input.keychainAccount ?? "", "keychainAccount");
  }

  if (input.mode === "standard") {
    validatePlainToken(input.host ?? "", "host");
    validatePlainToken(input.username ?? "", "username");
    validatePlainToken(input.privateKeyPath ?? "", "privateKeyPath");
    if (!Number.isInteger(input.port) || (input.port as number) < 1 || (input.port as number) > 65535) {
      throw new Error("port must be between 1 and 65535.");
    }
    return input;
  }

  validatePlainToken(input.sshAlias ?? "", "sshAlias");
  return input;
}

function validateRemotePath(value: string) {
  if (!value || !value.trim()) {
    throw new Error("remoteEnvPath is required.");
  }
  quoteRemoteShellArg(value);
}

function validatePlainToken(value: string, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  if (value.startsWith("-")) {
    throw new Error(`${field} cannot start with a dash.`);
  }
  if (/[\0\r\n]/.test(value)) {
    throw new Error(`${field} cannot contain control characters.`);
  }
}

function runSshCommand(command: SshReadCommand): Promise<SshProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      shell: false,
      env: { ...process.env, ...command.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGTERM"), command.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout: "", stderr: error.message });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}
