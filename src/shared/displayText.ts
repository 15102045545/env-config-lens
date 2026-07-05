import type { ComparisonStatus, HealthIssueType, SourceErrorType, SourceType } from "./types";

export const comparisonStatusLabels = {
  same: "一致",
  different: "不一致",
  missing: "缺失",
  empty: "空值",
  "source-only": "仅此来源"
} satisfies Record<ComparisonStatus, string>;

export const healthIssueLabels = {
  duplicate_key: "重复键",
  parse_failure: "解析失败",
  empty_value: "空值",
  whitespace_only_value: "仅空白",
  empty_key: "空键",
  illegal_key_name: "非法键名"
} satisfies Record<HealthIssueType, string>;

export const sourceTypeLabels = {
  "local-file": "本地文件",
  "ssh-remote-file": "SSH 远程文件"
} satisfies Record<SourceType, string>;

export const sourceErrorLabels = {
  connection_failed: "连接失败",
  auth_failed: "认证失败",
  read_failed: "读取失败",
  path_not_found: "路径不存在",
  permission_denied: "权限不足",
  parse_failed: "解析失败",
  unsupported_source: "来源不支持",
  unknown_error: "未知错误"
} satisfies Record<SourceErrorType, string>;

export const apiErrorMessages = {
  local_origin_required: "只允许本地 UI 来源访问。",
  session_token_required: "需要有效的启动会话令牌。",
  internal_error: "请求未能完成。",
  source_not_found: "未找到来源。",
  invalid_ssh_source: "SSH 来源配置无效。",
  unsupported_source_type: "不支持的来源类型。",
  empty_json_body: "请求体不能为空。"
} satisfies Record<string, string>;
