export type SourceType = "local-file" | "ssh-remote-file";

export type ComparisonStatus = "missing" | "same" | "different" | "empty" | "source-only";

export type SourceReadStatus = "success" | "failed";

export type SourceErrorType =
  | "connection_failed"
  | "auth_failed"
  | "read_failed"
  | "path_not_found"
  | "permission_denied"
  | "parse_failed"
  | "unsupported_source"
  | "unknown_error";

export type SshRemoteFileMode = "standard" | "alias";

export interface SshRemoteFileConfig {
  mode: SshRemoteFileMode;
  remoteEnvPath: string;
  host?: string;
  port?: number;
  username?: string;
  privateKeyPath?: string;
  sshAlias?: string;
  keychainService?: string;
  keychainAccount?: string;
}

export interface EnvSource {
  id: string;
  type: SourceType;
  name: string;
  enabled: boolean;
  displayOrder: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  localFile?: {
    filePath: string;
  };
  sshRemoteFile?: SshRemoteFileConfig;
}

export interface EnvSourceReadResult {
  sourceId: string;
  sourceName: string;
  status: SourceReadStatus;
  keyCount: number;
  values?: Record<string, string>;
  errorType?: SourceErrorType;
  errorMessage?: string;
}

export interface EnvComparisonRow {
  key: string;
  status: ComparisonStatus;
  valuesBySourceId: Record<string, string>;
  presenceBySourceId: Record<string, boolean>;
}

export interface EnvComparisonSummary {
  sourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  unionKeyCount: number;
  sameCount: number;
  differentCount: number;
  missingCount: number;
  emptyCount: number;
  sourceOnlyCount: number;
}

export interface EnvComparisonResult {
  selectedSourceIds: string[];
  sourceResults: EnvSourceReadResult[];
  summary: EnvComparisonSummary;
  rows: EnvComparisonRow[];
}

export type HealthIssueType =
  | "duplicate_key"
  | "parse_failure"
  | "empty_value"
  | "whitespace_only_value"
  | "empty_key"
  | "illegal_key_name";

export interface EnvHealthIssue {
  type: HealthIssueType;
  severity: "error" | "warning";
  key?: string;
  message: string;
  finalEffectiveValue?: string;
  duplicateCount?: number;
}

export interface EnvHealthResult {
  sourceId: string;
  sourceName: string;
  status: SourceReadStatus;
  keyCount: number;
  values: Record<string, string>;
  issues: EnvHealthIssue[];
  summary: Record<HealthIssueType, number>;
  errorType?: SourceErrorType;
  errorMessage?: string;
}
