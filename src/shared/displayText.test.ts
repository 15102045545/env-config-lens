import { describe, expect, it } from "vitest";
import {
  apiErrorMessages,
  comparisonStatusLabels,
  healthIssueLabels,
  sourceErrorLabels,
  sourceTypeLabels
} from "./displayText";

describe("display text labels", () => {
  it("maps stable comparison status codes to Simplified Chinese labels", () => {
    expect(comparisonStatusLabels).toMatchObject({
      same: "一致",
      different: "不一致",
      missing: "缺失",
      empty: "空值",
      "source-only": "仅此来源"
    });
  });

  it("maps health issue and source type codes without changing the stable codes", () => {
    expect(healthIssueLabels).toMatchObject({
      duplicate_key: "重复键",
      parse_failure: "解析失败",
      empty_value: "空值",
      whitespace_only_value: "仅空白",
      empty_key: "空键",
      illegal_key_name: "非法键名"
    });
    expect(sourceTypeLabels).toMatchObject({
      "local-file": "本地文件",
      "ssh-remote-file": "SSH 远程文件"
    });
  });

  it("provides Chinese fallback messages for API and source errors", () => {
    expect(sourceErrorLabels.auth_failed).toBe("认证失败");
    expect(sourceErrorLabels.path_not_found).toBe("路径不存在");
    expect(apiErrorMessages.session_token_required).toBe("需要有效的启动会话令牌。");
    expect(apiErrorMessages.source_not_found).toBe("未找到来源。");
  });
});
