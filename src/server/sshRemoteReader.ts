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
    throw new Error("SSH 来源配置不能为空。");
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
    throw new Error("remoteEnvPath 不能包含 NUL 字节。");
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("remoteEnvPath 不能包含换行符。");
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function classifySshFailure(stderr: string, stdout = ""): { errorType: SourceErrorType; errorMessage: string } {
  const text = `${stderr}\n${stdout}`.toLowerCase();

  if (/permission denied \(publickey|authentication failed|too many authentication failures|no mutual signature|bad passphrase/.test(text)) {
    return {
      errorType: "auth_failed",
      errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
    };
  }

  if (
    /could not resolve hostname|no route to host|connection timed out|operation timed out|connection refused|network is unreachable|host key verification failed|remote host identification has changed|kex_exchange_identification|connection closed/.test(
      text
    )
  ) {
    return {
      errorType: "connection_failed",
      errorMessage: "SSH 连接失败。请检查主机、端口、网络和 SSH 配置。"
    };
  }

  if (/no such file or directory|not found/.test(text)) {
    return { errorType: "path_not_found", errorMessage: "远程 .env 文件路径不存在。" };
  }

  if (/permission denied/.test(text)) {
    return {
      errorType: "permission_denied",
      errorMessage: "远程 .env 文件当前 SSH 用户无读取权限。"
    };
  }

  return { errorType: "unknown_error", errorMessage: "SSH 读取失败。请检查来源设置。" };
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
      throw new Error("端口必须介于 1 到 65535 之间。");
    }
    return input;
  }

  validatePlainToken(input.sshAlias ?? "", "sshAlias");
  return input;
}

function validateRemotePath(value: string) {
  if (!value || !value.trim()) {
    throw new Error("remoteEnvPath 不能为空。");
  }
  quoteRemoteShellArg(value);
}

function validatePlainToken(value: string, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} 不能为空。`);
  }
  if (value.startsWith("-")) {
    throw new Error(`${field} 不能以短横线开头。`);
  }
  if (/[\0\r\n]/.test(value)) {
    throw new Error(`${field} 不能包含控制字符。`);
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
