import { readFile } from "node:fs/promises";
import type { EnvHealthResult, EnvSource, EnvSourceContentResult, EnvSourceReadResult, HealthIssueType, SourceErrorType } from "../shared/types";
import { parseEnvContent } from "../shared/envParser";
import { readSshRemoteEnvFile } from "./sshRemoteReader";

export interface SourceTestResult {
  sourceId: string;
  status: "success" | "failed";
  keyCount: number;
  errorType?: SourceErrorType;
  errorMessage?: string;
}

export interface SourceReadContext {
  readUploadedSourceContent?: (sourceId: string) => string | undefined;
}

const emptyHealthSummary: Record<HealthIssueType, number> = {
  duplicate_key: 0,
  parse_failure: 0,
  empty_value: 0,
  whitespace_only_value: 0,
  empty_key: 0,
  illegal_key_name: 0
};

export async function readSourceForComparison(source: EnvSource, context: SourceReadContext = {}): Promise<EnvSourceReadResult> {
  if (!canReadSource(source)) {
    return failedRead(source, "unsupported_source", "暂不支持此来源类型。");
  }

  const content = await readSourceContent(source, context);
  if (!content.ok) {
    return failedRead(source, content.errorType, content.errorMessage);
  }

  const parsed = parseEnvContent(content.content);
  if (parsed.parseFailures.length > 0) {
    return failedRead(source, "parse_failed", `来源存在 ${parsed.parseFailures.length} 个解析失败。`);
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "success",
    values: parsed.values,
    keyCount: Object.keys(parsed.values).length
  };
}

export async function testSourceReadability(source: EnvSource, context: SourceReadContext = {}): Promise<SourceTestResult> {
  const result = await readSourceForComparison(source, context);
  if (result.status === "success") {
    return {
      sourceId: source.id,
      status: "success",
      keyCount: result.keyCount
    };
  }

  return {
    sourceId: source.id,
    status: "failed",
    keyCount: 0,
    errorType: result.errorType,
    errorMessage: result.errorMessage
  };
}

export async function readSourceRawContent(source: EnvSource, context: SourceReadContext = {}): Promise<EnvSourceContentResult> {
  if (!canReadSource(source)) {
    return failedRawContent(source, "unsupported_source", "暂不支持此来源类型。");
  }

  const content = await readSourceContent(source, context);
  if (!content.ok) {
    return failedRawContent(source, content.errorType, content.errorMessage);
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "success",
    content: content.content
  };
}

export async function readSourceHealth(source: EnvSource, context: SourceReadContext = {}): Promise<EnvHealthResult> {
  if (!canReadSource(source)) {
    return failedHealth(source, "unsupported_source", "暂不支持此来源类型。");
  }

  const content = await readSourceContent(source, context);
  if (!content.ok) {
    return failedHealth(source, content.errorType, content.errorMessage);
  }

  const parsed = parseEnvContent(content.content);
  const summary = { ...emptyHealthSummary };
  parsed.issues.forEach((issue) => {
    summary[issue.type] += 1;
  });

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: parsed.parseFailures.length > 0 ? "failed" : "success",
    keyCount: Object.keys(parsed.values).length,
    values: parsed.values,
    issues: parsed.issues,
    summary,
    errorType: parsed.parseFailures.length > 0 ? "parse_failed" : undefined,
    errorMessage:
      parsed.parseFailures.length > 0
        ? `来源存在 ${parsed.parseFailures.length} 个解析失败。`
        : undefined
  };
}

async function readSourceContent(
  source: EnvSource,
  context: SourceReadContext
): Promise<{ ok: true; content: string } | { ok: false; errorType: SourceErrorType; errorMessage: string }> {
  if (source.type === "ssh-remote-file") {
    return readSshRemoteEnvFile(source);
  }

  if (source.type === "uploaded-file") {
    const content = context.readUploadedSourceContent?.(source.id);
    if (content === undefined) {
      return { ok: false, errorType: "read_failed", errorMessage: "上传来源只保存在本次服务进程内，请重新上传。" };
    }
    return { ok: true, content };
  }

  try {
    return { ok: true, content: await readFile(source.localFile?.filePath ?? "", "utf8") };
  } catch (error) {
    const { errorType, errorMessage } = mapFileReadError(error);
    return { ok: false, errorType, errorMessage };
  }
}

function canReadSource(source: EnvSource) {
  return (
    (source.type === "local-file" && source.localFile) ||
    (source.type === "ssh-remote-file" && source.sshRemoteFile) ||
    (source.type === "uploaded-file" && source.uploadedFile)
  );
}

function failedRead(source: EnvSource, errorType: SourceErrorType, errorMessage: string): EnvSourceReadResult {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "failed",
    keyCount: 0,
    errorType,
    errorMessage
  };
}

function failedRawContent(source: EnvSource, errorType: SourceErrorType, errorMessage: string): EnvSourceContentResult {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "failed",
    errorType,
    errorMessage
  };
}

function failedHealth(source: EnvSource, errorType: SourceErrorType, errorMessage: string): EnvHealthResult {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "failed",
    keyCount: 0,
    values: {},
    issues: [],
    summary: { ...emptyHealthSummary },
    errorType,
    errorMessage
  };
}

function mapFileReadError(error: unknown): { errorType: SourceErrorType; errorMessage: string } {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "ENOENT") {
    return { errorType: "path_not_found", errorMessage: "本地文件路径不存在。" };
  }
  if (code === "EACCES" || code === "EPERM") {
    return { errorType: "permission_denied", errorMessage: "本地文件当前用户无读取权限。" };
  }
  return { errorType: "read_failed", errorMessage: "本地文件读取失败。" };
}
