import type { EnvComparisonResult, EnvHealthResult, EnvSource, EnvSourceContentResult, SshRemoteFileConfig } from "../shared/types";

export interface RuntimeBoundary {
  bindHost: string;
  tokenRequired: boolean;
  persistedState: string;
  corsOrigin?: string;
  storage?: string;
}

export class ApiClient {
  constructor(private readonly token: string) {}

  getRuntimeBoundary() {
    return this.request<RuntimeBoundary>("/api/runtime-boundary");
  }

  async listSources() {
    const response = await this.request<{ sources: EnvSource[] }>("/api/sources");
    return response.sources;
  }

  async createLocalSource(input: { name: string; filePath: string; enabled: boolean; note: string }) {
    const response = await this.request<{ source: EnvSource }>("/api/sources", {
      method: "POST",
      body: JSON.stringify({ type: "local-file", ...input })
    });
    return response.source;
  }

  async createSshSource(input: { name: string; enabled: boolean; note: string; sshRemoteFile: SshRemoteFileConfig }) {
    const response = await this.request<{ source: EnvSource }>("/api/sources", {
      method: "POST",
      body: JSON.stringify({ type: "ssh-remote-file", ...input })
    });
    return response.source;
  }

  async updateSource(
    sourceId: string,
    input: Partial<{ name: string; filePath: string; enabled: boolean; note: string; sshRemoteFile: SshRemoteFileConfig }>
  ) {
    const response = await this.request<{ source: EnvSource }>(`/api/sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
    return response.source;
  }

  deleteSource(sourceId: string) {
    return this.request<void>(`/api/sources/${sourceId}`, { method: "DELETE" });
  }

  async reorderSources(sourceIds: string[]) {
    const response = await this.request<{ sources: EnvSource[] }>("/api/sources/reorder", {
      method: "POST",
      body: JSON.stringify({ sourceIds })
    });
    return response.sources;
  }

  testSource(sourceId: string) {
    return this.request<{ sourceId: string; status: "success" | "failed"; keyCount: number; errorType?: string }>(
      `/api/sources/${sourceId}/test`,
      { method: "POST" }
    );
  }

  readSourceContent(sourceId: string) {
    return this.request<EnvSourceContentResult>(`/api/sources/${sourceId}/content`, { method: "POST" });
  }

  pickEnvPath() {
    return this.request<{ canceled: boolean; filePath?: string }>("/api/file-dialog/env-path", {
      method: "POST"
    });
  }

  pickPrivateKeyPath() {
    return this.request<{ canceled: boolean; filePath?: string }>("/api/file-dialog/private-key-path", {
      method: "POST"
    });
  }

  compare(sourceIds: string[]) {
    return this.request<EnvComparisonResult>("/api/compare", {
      method: "POST",
      body: JSON.stringify({ sourceIds })
    });
  }

  health(sourceId: string) {
    return this.request<EnvHealthResult>("/api/health", {
      method: "POST",
      body: JSON.stringify({ sourceId })
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("x-env-config-lens-token", this.token);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(path, {
      ...init,
      headers
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed with ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export function readStartupToken() {
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get("token");
  if (tokenFromUrl) {
    window.sessionStorage.setItem("env-config-lens-token", tokenFromUrl);
    return tokenFromUrl;
  }
  return window.sessionStorage.getItem("env-config-lens-token") ?? "";
}
