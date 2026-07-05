// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvComparisonResult, EnvHealthResult, EnvSource, EnvSourceContentResult, SshRemoteFileConfig } from "../shared/types";
import { App } from "./App";

const token = "ui-test-token";
let mockSources: EnvSource[] = [];
let mockComparison: EnvComparisonResult;
let mockHealth: EnvHealthResult;
let mockSourceContentById: Record<string, EnvSourceContentResult>;

beforeEach(() => {
  window.history.pushState({}, "", `/?token=${token}`);
  mockSources = [
    source("local-dev", "Local dev", "/tmp/local-dev.env"),
    source("local-prod", "Local prod", "/tmp/local-prod.env")
  ];
  mockComparison = compareFixture();
  mockHealth = healthFixture();
  mockSourceContentById = {
    "local-dev": {
      sourceId: "local-dev",
      sourceName: "Local dev",
      status: "success",
      content: "# kept comment\nDUP=one\n\nDUP=two\nBROKEN=\"unterminated\n"
    },
    "local-prod": {
      sourceId: "local-prod",
      sourceName: "Local prod",
      status: "failed",
      errorType: "path_not_found",
      errorMessage: "本地文件路径不存在。"
    }
  };
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    if (headers.get("x-env-config-lens-token") !== token) {
      return jsonResponse({ error: "session_token_required" }, 401);
    }

    if (url.endsWith("/api/runtime-boundary")) {
      return jsonResponse({ bindHost: "127.0.0.1", tokenRequired: true, persistedState: "settings-only" });
    }
    if (url.endsWith("/api/sources") && method === "GET") {
      return jsonResponse({ sources: mockSources });
    }
    if (url.endsWith("/api/sources") && method === "POST") {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const created =
        body.type === "ssh-remote-file"
          ? sshSource(`ssh-${mockSources.length + 1}`, body.name, body.sshRemoteFile as SshRemoteFileConfig)
          : source(`local-${mockSources.length + 1}`, body.name, body.filePath);
      mockSources = [...mockSources, created];
      return jsonResponse({ source: created }, 201);
    }
    if (url.endsWith("/api/file-dialog/private-key-path") && method === "POST") {
      return jsonResponse({ canceled: false, filePath: "/Users/example/.ssh/id_ed25519" });
    }
    if (url.includes("/api/sources/") && method === "DELETE") {
      if (headers.get("content-type") && init?.body == null) {
        return jsonResponse({ error: "empty_json_body" }, 500);
      }
      const id = url.split("/api/sources/")[1];
      mockSources = mockSources.filter((item) => item.id !== id);
      return jsonResponse(undefined, 204);
    }
    if (url.includes("/api/sources/") && url.endsWith("/content") && method === "POST") {
      const id = url.split("/api/sources/")[1].split("/content")[0];
      return jsonResponse(mockSourceContentById[id] ?? { error: "source_not_found" }, mockSourceContentById[id] ? 200 : 404);
    }
    if (url.endsWith("/api/compare")) {
      return jsonResponse(mockComparison);
    }
    if (url.endsWith("/api/health")) {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (body.sourceId && !mockSources.some((item) => item.id === body.sourceId)) {
        return jsonResponse({ error: "source_not_found" }, 404);
      }
      return jsonResponse(mockHealth);
    }
    return jsonResponse({}, 404);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("defaults the comparison table to problem rows while keeping same rows available", async () => {
    render(<App />);

    expect(await screen.findByText("DATABASE_URL")).toBeInTheDocument();
    expect(screen.queryByText("NODE_ENV")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "一致" }));

    expect(await screen.findByText("NODE_ENV")).toBeInTheDocument();
    expect(screen.queryByText("DATABASE_URL")).not.toBeInTheDocument();
  });

  it("expands and collapses long values without replacing the copied value", async () => {
    render(<App />);

    const longValue = await screen.findByTestId("value-JWT_PUBLIC_KEY-local-dev");
    expect(longValue).toHaveClass("line-clamp-2");

    await userEvent.click(screen.getByRole("button", { name: "展开 Local dev 的 JWT_PUBLIC_KEY" }));
    expect(longValue).not.toHaveClass("line-clamp-2");

    await userEvent.click(screen.getByRole("button", { name: "复制 Local dev 的 JWT_PUBLIC_KEY" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("BEGIN PUBLIC KEY"));
    });
  });

  it("deletes the currently selected source without making stale follow-up requests", async () => {
    mockSources = [source("local-dev", "Local dev", "/tmp/local-dev.env")];
    render(<App />);

    await screen.findByRole("button", { name: "Local dev" });
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(await screen.findByRole("button", { name: "删除 Local dev" }));

    await waitFor(() => {
      expect(screen.queryByText("Local dev")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("source_not_found")).not.toBeInTheDocument();
  });

  it("creates an SSH alias source from Settings without sending passphrases", async () => {
    render(<App />);

    await screen.findByText("DATABASE_URL");
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "SSH 别名" }));
    await userEvent.type(screen.getByLabelText("来源名称"), "Prod SSH");
    await userEvent.type(screen.getByLabelText("SSH 别名"), "prod-api");
    await userEvent.type(screen.getByLabelText("远程 .env 路径"), "/srv/app/.env");
    await userEvent.type(screen.getByLabelText("Keychain 服务"), "Env Config Lens");
    await userEvent.type(screen.getByLabelText("Keychain 账户"), "prod-api key");
    await userEvent.click(screen.getByRole("button", { name: "添加 SSH 来源" }));

    await screen.findByText("Prod SSH");
    expect(screen.getByText("SSH 远程文件")).toBeInTheDocument();
    const createCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]).endsWith("/api/sources") && call[1]?.method === "POST");
    expect(createCall).toBeTruthy();
    const sentBody = JSON.parse(String(createCall?.[1]?.body));
    expect(sentBody).toMatchObject({
      type: "ssh-remote-file",
      name: "Prod SSH",
      sshRemoteFile: {
        mode: "alias",
        sshAlias: "prod-api",
        remoteEnvPath: "/srv/app/.env",
        keychainService: "Env Config Lens",
        keychainAccount: "prod-api key"
      }
    });
    expect(JSON.stringify(sentBody)).not.toContain("passphrase");
  });

  it("uses the backend private key picker for SSH standard sources", async () => {
    render(<App />);

    await screen.findByText("DATABASE_URL");
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "SSH 标准" }));
    await userEvent.click(screen.getByRole("button", { name: "选择密钥" }));

    expect(screen.getByLabelText("私钥路径")).toHaveValue("/Users/example/.ssh/id_ed25519");
  });

  it("shows source-level SSH failures in comparison and health views", async () => {
    mockSources = [
      source("local-dev", "Local dev", "/tmp/local-dev.env"),
      sshSource("ssh-prod", "Prod SSH", {
        mode: "alias",
        sshAlias: "prod-api",
        remoteEnvPath: "/srv/app/.env"
      })
    ];
    mockComparison = compareWithFailedSshFixture();
    mockHealth = failedSshHealthFixture();

    render(<App />);

    expect((await screen.findAllByText("Prod SSH")).length).toBeGreaterThan(0);
    expect(screen.getByText("认证失败")).toBeInTheDocument();
    expect(screen.queryByText("auth_failed")).not.toBeInTheDocument();
    expect(screen.getByText("SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "健康" }));
    await userEvent.selectOptions(screen.getByLabelText("来源"), "ssh-prod");

    expect(await screen.findByText("来源读取失败")).toBeInTheDocument();
    expect(screen.getByText("SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。")).toBeInTheDocument();
  });

  it("opens a read-only raw env viewer from Settings", async () => {
    render(<App />);

    await screen.findByText("DATABASE_URL");
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "查看 Local dev 的 .env 内容" }));

    const content = await screen.findByTestId("env-source-content");
    expect(content.textContent).toBe("# kept comment\nDUP=one\n\nDUP=two\nBROKEN=\"unterminated\n");
    expect(screen.queryByRole("button", { name: /下载/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /复制完整 .env/ })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/sources/local-dev/content",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows raw env read failures without keeping stale content", async () => {
    render(<App />);

    await screen.findByText("DATABASE_URL");
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "查看 Local dev 的 .env 内容" }));
    expect(await screen.findByTestId("env-source-content")).toHaveTextContent("DUP=one");

    await userEvent.click(screen.getByRole("button", { name: "关闭 .env 内容查看器" }));
    await userEvent.click(screen.getByRole("button", { name: "查看 Local prod 的 .env 内容" }));

    expect(await screen.findByText("来源读取失败")).toBeInTheDocument();
    expect(screen.getByText("本地文件路径不存在。")).toBeInTheDocument();
    expect(screen.queryByText("DUP=one")).not.toBeInTheDocument();
  });
});

function source(id: string, name: string, filePath: string): EnvSource {
  return {
    id,
    type: "local-file",
    name,
    enabled: true,
    displayOrder: id === "local-dev" ? 1 : 2,
    note: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    localFile: { filePath }
  };
}

function sshSource(id: string, name: string, sshRemoteFile: SshRemoteFileConfig): EnvSource {
  return {
    id,
    type: "ssh-remote-file",
    name,
    enabled: true,
    displayOrder: mockSources.length + 1,
    note: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    sshRemoteFile
  };
}

function compareFixture(): EnvComparisonResult {
  return {
    selectedSourceIds: ["local-dev", "local-prod"],
    sourceResults: [
      { sourceId: "local-dev", sourceName: "Local dev", status: "success", keyCount: 4 },
      { sourceId: "local-prod", sourceName: "Local prod", status: "success", keyCount: 3 }
    ],
    summary: {
      sourceCount: 2,
      successfulSourceCount: 2,
      failedSourceCount: 0,
      unionKeyCount: 4,
      sameCount: 1,
      differentCount: 2,
      missingCount: 0,
      emptyCount: 0,
      sourceOnlyCount: 1
    },
    rows: [
      {
        key: "DATABASE_URL",
        status: "different",
        valuesBySourceId: { "local-dev": "postgres://local", "local-prod": "postgres://prod" },
        presenceBySourceId: { "local-dev": true, "local-prod": true }
      },
      {
        key: "JWT_PUBLIC_KEY",
        status: "different",
        valuesBySourceId: {
          "local-dev": "-----BEGIN PUBLIC KEY-----\\nSAMPLE_LONG_DEV_PUBLIC_KEY\\n-----END PUBLIC KEY-----",
          "local-prod": "-----BEGIN PUBLIC KEY-----\\nSAMPLE_LONG_PROD_PUBLIC_KEY\\n-----END PUBLIC KEY-----"
        },
        presenceBySourceId: { "local-dev": true, "local-prod": true }
      },
      {
        key: "NODE_ENV",
        status: "same",
        valuesBySourceId: { "local-dev": "production", "local-prod": "production" },
        presenceBySourceId: { "local-dev": true, "local-prod": true }
      },
      {
        key: "ONLY_LOCAL",
        status: "source-only",
        valuesBySourceId: { "local-dev": "local-only" },
        presenceBySourceId: { "local-dev": true, "local-prod": false }
      }
    ]
  };
}

function compareWithFailedSshFixture(): EnvComparisonResult {
  return {
    selectedSourceIds: ["local-dev", "ssh-prod"],
    sourceResults: [
      { sourceId: "local-dev", sourceName: "Local dev", status: "success", keyCount: 1, values: { DATABASE_URL: "postgres://local" } },
      {
        sourceId: "ssh-prod",
        sourceName: "Prod SSH",
        status: "failed",
        keyCount: 0,
        errorType: "auth_failed",
        errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
      }
    ],
    summary: {
      sourceCount: 2,
      successfulSourceCount: 1,
      failedSourceCount: 1,
      unionKeyCount: 1,
      sameCount: 0,
      differentCount: 0,
      missingCount: 0,
      emptyCount: 0,
      sourceOnlyCount: 1
    },
    rows: [
      {
        key: "DATABASE_URL",
        status: "source-only",
        valuesBySourceId: { "local-dev": "postgres://local" },
        presenceBySourceId: { "local-dev": true, "ssh-prod": false }
      }
    ]
  };
}

function healthFixture(): EnvHealthResult {
  return {
    sourceId: "local-dev",
    sourceName: "Local dev",
    status: "success",
    keyCount: 2,
    values: { DATABASE_URL: "postgres://local", EMPTY: "" },
    issues: [{ type: "empty_value", severity: "warning", key: "EMPTY", message: "键 EMPTY 为空值。" }],
    summary: {
      duplicate_key: 0,
      parse_failure: 0,
      empty_value: 1,
      whitespace_only_value: 0,
      empty_key: 0,
      illegal_key_name: 0
    }
  };
}

function failedSshHealthFixture(): EnvHealthResult {
  return {
    sourceId: "ssh-prod",
    sourceName: "Prod SSH",
    status: "failed",
    keyCount: 0,
    values: {},
    issues: [],
    summary: {
      duplicate_key: 0,
      parse_failure: 0,
      empty_value: 0,
      whitespace_only_value: 0,
      empty_key: 0,
      illegal_key_name: 0
    },
    errorType: "auth_failed",
    errorMessage: "SSH 认证失败。请检查用户名、密钥、agent 和 Keychain 引用。"
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
