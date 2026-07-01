import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FileDialogResult {
  canceled: boolean;
  filePath?: string;
}

export async function pickEnvFilePath(): Promise<FileDialogResult> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose file with prompt "Select an env file")'
    ]);
    const filePath = stdout.trim();
    return filePath ? { canceled: false, filePath } : { canceled: true };
  } catch {
    return { canceled: true };
  }
}

export async function pickPrivateKeyPath(): Promise<FileDialogResult> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'POSIX path of (choose file with prompt "Select an SSH private key")'
    ]);
    const filePath = stdout.trim();
    return filePath ? { canceled: false, filePath } : { canceled: true };
  } catch {
    return { canceled: true };
  }
}
