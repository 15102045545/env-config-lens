import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { buildComparison } from "../shared/comparison";
import { apiErrorMessages } from "../shared/displayText";
import type { EnvSource, SshRemoteFileConfig } from "../shared/types";
import { getDefaultDbPath } from "./paths";
import { SettingsStore } from "./settingsStore";
import { pickEnvFilePath, pickPrivateKeyPath } from "./fileDialog";
import { readSourceForComparison, readSourceHealth, readSourceRawContent, testSourceReadability, type SourceReadContext } from "./sourceReader";
import { UploadedSourceStore } from "./uploadedSourceStore";

const tokenHeader = "x-env-config-lens-token";
const defaultBindHost = "0.0.0.0";
const localBrowserHost = "127.0.0.1";
const uploadFileSizeLimitBytes = 1024 * 1024;

export interface BuildAppOptions {
  store: SettingsStore;
  uploadedSources?: UploadedSourceStore;
  sessionToken: string;
  bindHost?: string;
  networkUrls?: string[];
}

export interface StartServerOptions {
  port?: number;
  host?: string;
  openBrowser?: boolean;
  sessionToken?: string;
  store?: SettingsStore;
}

export async function buildApp({
  store,
  uploadedSources = new UploadedSourceStore(),
  sessionToken,
  bindHost = defaultBindHost,
  networkUrls = []
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = fastify({ logger: false });
  const sourceReadContext: SourceReadContext = {
    readUploadedSourceContent: (sourceId) => uploadedSources.getContent(sourceId)
  };

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: uploadFileSizeLimitBytes
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }

    applyCorsHeaders(reply, request.headers.origin);

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }

    if (request.headers[tokenHeader] !== sessionToken) {
      await sendApiError(reply, 401, "session_token_required");
      return reply;
    }
  });

  app.options("/api/*", async (_request, reply) => {
    return reply.code(204).send();
  });

  app.setErrorHandler((error, _request, reply) => {
    reply.code(500).send({
      error: "internal_error",
      message: sanitizeErrorMessage(error)
    });
  });

  app.get("/api/runtime-boundary", async () => ({
    bindHost,
    accessScope: isLocalOnlyHost(bindHost) ? "local" : "lan",
    tokenRequired: true,
    apiAccessPolicy: "token",
    persistedState: "settings-only",
    networkUrls,
    storage: "SQLite"
  }));

  app.get("/api/sources", async () => ({ sources: listSources(store, uploadedSources) }));

  app.post("/api/sources", async (request, reply) => {
    const payload = request.body as Partial<{
      type: string;
      name: string;
      filePath: string;
      enabled: boolean;
      note: string;
      sshRemoteFile: unknown;
    }>;

    if (payload.type === "local-file") {
      const previousSourceIds = listSources(store, uploadedSources).map((source) => source.id);
      const created = store.createLocalFileSource({
        name: requiredString(payload.name, "name"),
        filePath: requiredString(payload.filePath, "filePath"),
        enabled: payload.enabled ?? true,
        note: payload.note ?? ""
      });
      reorderSources(store, uploadedSources, [...previousSourceIds, created.id]);
      const source = findSource(store, uploadedSources, created.id) ?? created;

      return reply.code(201).send({ source });
    }

    if (payload.type === "ssh-remote-file") {
      const sshRemoteFile = parseSshRemoteFilePayload(payload.sshRemoteFile);
      if (!sshRemoteFile) {
        return sendApiError(reply, 422, "invalid_ssh_source");
      }

      const previousSourceIds = listSources(store, uploadedSources).map((source) => source.id);
      const created = store.createSshRemoteFileSource({
        name: requiredString(payload.name, "name"),
        enabled: payload.enabled ?? true,
        note: payload.note ?? "",
        sshRemoteFile
      });
      reorderSources(store, uploadedSources, [...previousSourceIds, created.id]);
      const source = findSource(store, uploadedSources, created.id) ?? created;

      return reply.code(201).send({ source });
    }

      return sendApiError(reply, 422, "unsupported_source_type");
  });

  app.post("/api/sources/upload", async (request, reply) => {
    if (!request.isMultipart()) {
      return sendApiError(reply, 400, "multipart_required");
    }

    try {
      const file = await request.file({
        limits: {
          files: 1,
          fileSize: uploadFileSizeLimitBytes
        }
      });

      if (!file) {
        return sendApiError(reply, 422, "upload_file_required");
      }

      const contentBuffer = await file.toBuffer();
      const fileName = sanitizeUploadedFileName(file.filename);
      const name = getMultipartStringField(file.fields.name) ?? fileName;
      const note = getMultipartStringField(file.fields.note) ?? "";
      const enabled = getMultipartStringField(file.fields.enabled) !== "false";
      const previousSourceIds = listSources(store, uploadedSources).map((source) => source.id);
      const created = uploadedSources.createSource({
        name: requiredString(name, "name"),
        fileName,
        content: contentBuffer.toString("utf8"),
        sizeBytes: contentBuffer.byteLength,
        enabled,
        note,
        displayOrder: previousSourceIds.length + 1
      });
      reorderSources(store, uploadedSources, [...previousSourceIds, created.id]);
      const source = findSource(store, uploadedSources, created.id) ?? created;

      return reply.code(201).send({ source });
    } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
        return sendApiError(reply, 413, "upload_file_too_large");
      }
      throw error;
    }
  });

  app.patch("/api/sources/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as Partial<{
      name: string;
      filePath: string;
      enabled: boolean;
      note: string;
      sshRemoteFile: unknown;
    }>;

    const current = findSource(store, uploadedSources, id);
    if (!current) {
      return sendApiError(reply, 404, "source_not_found");
    }

    if (current.type === "uploaded-file") {
      const source = uploadedSources.updateSource(id, {
        name: payload.name,
        enabled: payload.enabled,
        note: payload.note
      });
      return reply.send({ source });
    }

    if (current.type === "ssh-remote-file") {
      const sshRemoteFile = payload.sshRemoteFile === undefined ? undefined : parseSshRemoteFilePayload(payload.sshRemoteFile);
      if (payload.sshRemoteFile !== undefined && !sshRemoteFile) {
        return sendApiError(reply, 422, "invalid_ssh_source");
      }
      const source = store.updateSshRemoteFileSource(id, {
        name: payload.name,
        enabled: payload.enabled,
        note: payload.note,
        sshRemoteFile
      });
      return reply.send({ source });
    }

    const source = store.updateLocalFileSource(id, payload);
    return reply.send({ source });
  });

  app.delete("/api/sources/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!uploadedSources.deleteSource(id)) {
      store.deleteSource(id);
    }
    return reply.code(204).send();
  });

  app.post("/api/sources/reorder", async (request) => {
    const payload = request.body as { sourceIds?: string[] };
    reorderSources(store, uploadedSources, Array.isArray(payload.sourceIds) ? payload.sourceIds : []);
    return { sources: listSources(store, uploadedSources) };
  });

  app.post("/api/file-dialog/env-path", async () => pickEnvFilePath());

  app.post("/api/file-dialog/private-key-path", async () => pickPrivateKeyPath());

  app.post("/api/sources/:id/test", async (request, reply) => {
    const source = findSource(store, uploadedSources, (request.params as { id: string }).id);
    if (!source) {
      return sendApiError(reply, 404, "source_not_found");
    }
    return testSourceReadability(source, sourceReadContext);
  });

  app.post("/api/sources/:id/content", async (request, reply) => {
    const source = findSource(store, uploadedSources, (request.params as { id: string }).id);
    if (!source) {
      return sendApiError(reply, 404, "source_not_found");
    }
    return readSourceRawContent(source, sourceReadContext);
  });

  app.post("/api/compare", async (request) => {
    const payload = request.body as { sourceIds?: string[] };
    const sourceIds = Array.isArray(payload.sourceIds) ? payload.sourceIds : [];
    const sources = sourceIds.map((id) => findSource(store, uploadedSources, id)).filter((source): source is EnvSource => Boolean(source));
    const readResults = await Promise.all(sources.map((source) => readSourceForComparison(source, sourceReadContext)));
    return buildComparison(sourceIds, readResults);
  });

  app.post("/api/health", async (request, reply) => {
    const payload = request.body as { sourceId?: string };
    const source = payload.sourceId ? findSource(store, uploadedSources, payload.sourceId) : undefined;
    if (!source) {
      return sendApiError(reply, 404, "source_not_found");
    }
    return readSourceHealth(source, sourceReadContext);
  });

  const clientRoot = join(process.cwd(), "dist", "client");
  if (existsSync(join(clientRoot, "index.html"))) {
    await app.register(staticPlugin, {
      root: clientRoot,
      prefix: "/"
    });
  }

  return app;
}

export async function startServer(options: StartServerOptions = {}) {
  const requestedPort = options.port ?? Number(process.env.PORT ?? 4173);
  const bindHost = options.host ?? process.env.ENV_CONFIG_LENS_HOST ?? process.env.HOST ?? defaultBindHost;
  const sessionToken = options.sessionToken ?? process.env.ENV_CONFIG_LENS_SESSION_TOKEN ?? randomBytes(24).toString("hex");
  const networkUrls: string[] = [];
  const store = options.store ?? new SettingsStore(getDefaultDbPath());
  const app = await buildApp({ store, sessionToken, bindHost, networkUrls });
  await app.listen({ host: bindHost, port: requestedPort });

  const port = getListeningPort(app.server.address(), requestedPort);
  networkUrls.push(...buildNetworkUrls(bindHost, port, sessionToken));
  const url = buildTokenUrl(browserHostForBindHost(bindHost), port, sessionToken);
  console.log(`Env Config Lens 正在监听 ${buildBaseUrl(bindHost, port)}`);
  console.log(`本机打开 ${url}`);
  if (networkUrls.length > 0) {
    console.log("局域网访问：");
    for (const networkUrl of networkUrls) {
      console.log(`- ${networkUrl}`);
    }
  } else if (!isLocalOnlyHost(bindHost)) {
    console.log("未发现可用的局域网 IPv4 地址。");
  }
  console.log("局域网访问和 API 调用均需要启动会话令牌。");

  if (options.openBrowser) {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  }

  return { app, store, url, networkUrls, sessionToken };
}

function listSources(store: SettingsStore, uploadedSources: UploadedSourceStore) {
  return [...store.listSources(), ...uploadedSources.listSources()].sort(compareSources);
}

function findSource(store: SettingsStore, uploadedSources: UploadedSourceStore, sourceId: string) {
  return store.getSource(sourceId) ?? uploadedSources.getSource(sourceId);
}

function reorderSources(store: SettingsStore, uploadedSources: UploadedSourceStore, sourceIds: string[]) {
  store.reorderSources(sourceIds);
  uploadedSources.reorderSources(sourceIds);
}

function compareSources(left: EnvSource, right: EnvSource) {
  return left.displayOrder - right.displayOrder || left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name);
}

function applyCorsHeaders(reply: FastifyReply, origin: string | undefined) {
  reply.header("access-control-allow-origin", origin ?? "*");
  reply.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  reply.header("access-control-allow-headers", `${tokenHeader},content-type`);
  reply.header("access-control-max-age", "600");
  reply.header("vary", "Origin");
}

function buildNetworkUrls(bindHost: string, port: number, sessionToken: string) {
  if (isLocalOnlyHost(bindHost)) {
    return [];
  }

  const hosts = isWildcardHost(bindHost) ? listLanIPv4Addresses() : [bindHost];
  return dedupe(hosts)
    .filter((host) => !isLocalOnlyHost(host) && !isWildcardHost(host))
    .map((host) => buildTokenUrl(host, port, sessionToken));
}

function listLanIPv4Addresses() {
  return Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((networkInterface) => networkInterface.family === "IPv4" && !networkInterface.internal)
    .map((networkInterface) => networkInterface.address)
    .filter(isUsableLanIPv4Address);
}

function isUsableLanIPv4Address(address: string) {
  return address !== "0.0.0.0" && !address.startsWith("127.") && !address.startsWith("169.254.");
}

function buildTokenUrl(host: string, port: number, sessionToken: string) {
  return `${buildBaseUrl(host, port)}/?token=${encodeURIComponent(sessionToken)}`;
}

function buildBaseUrl(host: string, port: number) {
  return `http://${formatHostForUrl(host)}:${port}`;
}

function getListeningPort(address: AddressInfo | string | null, fallback: number) {
  return address && typeof address === "object" ? address.port : fallback;
}

function formatHostForUrl(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function browserHostForBindHost(bindHost: string) {
  return isWildcardHost(bindHost) ? localBrowserHost : bindHost;
}

function isWildcardHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]";
}

function isLocalOnlyHost(host: string) {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "[::1]";
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function sendApiError(reply: FastifyReply, statusCode: number, error: keyof typeof apiErrorMessages) {
  return reply.code(statusCode).send({
    error,
    message: apiErrorMessages[error]
  });
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${labelRequiredField(field)}不能为空。`);
  }
  return value;
}

function sanitizeErrorMessage(error: unknown) {
  if (error instanceof Error && /不能为空|未找到|not found/i.test(error.message)) {
    return error.message;
  }
  return apiErrorMessages.internal_error;
}

function labelRequiredField(field: string) {
  const labels: Record<string, string> = {
    name: "来源名称",
    filePath: "本地 .env 路径"
  };
  return labels[field] ?? field;
}

function sanitizeUploadedFileName(value: string | undefined) {
  const fileName = (value ?? "").split(/[\\/]/).pop()?.trim();
  return fileName || "uploaded.env";
}

function getMultipartStringField(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }
  return typeof value.value === "string" ? value.value : undefined;
}

function parseSshRemoteFilePayload(value: unknown): SshRemoteFileConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const mode = value.mode;
  const remoteEnvPath = getRequiredCleanString(value.remoteEnvPath, "remoteEnvPath");
  if (!remoteEnvPath || !isRemotePath(remoteEnvPath)) {
    return undefined;
  }

  const keychain = parseKeychainReference(value);
  if (keychain === false) {
    return undefined;
  }

  if (mode === "standard") {
    const host = getRequiredCleanString(value.host, "host");
    const username = getRequiredCleanString(value.username, "username");
    const privateKeyPath = getRequiredCleanString(value.privateKeyPath, "privateKeyPath");
    const port = typeof value.port === "number" ? value.port : Number(value.port ?? 22);
    if (!host || !username || !privateKeyPath || !Number.isInteger(port) || port < 1 || port > 65535) {
      return undefined;
    }
    return {
      mode,
      host,
      port,
      username,
      privateKeyPath,
      remoteEnvPath,
      ...keychain
    };
  }

  if (mode === "alias") {
    const sshAlias = getRequiredCleanString(value.sshAlias, "sshAlias");
    if (!sshAlias) {
      return undefined;
    }
    return {
      mode,
      sshAlias,
      remoteEnvPath,
      ...keychain
    };
  }

  return undefined;
}

function parseKeychainReference(value: Record<string, unknown>) {
  const service = getOptionalCleanString(value.keychainService, "keychainService");
  const account = getOptionalCleanString(value.keychainAccount, "keychainAccount");
  if (service === undefined && account === undefined) {
    return {};
  }
  if (!service || !account) {
    return false;
  }
  return {
    keychainService: service,
    keychainAccount: account
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredCleanString(value: unknown, field: string) {
  const clean = getOptionalCleanString(value, field);
  return clean && clean.trim() ? clean : undefined;
}

function getOptionalCleanString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.startsWith("-") || /[\0\r\n]/.test(value)) {
    return undefined;
  }
  if ((field === "host" || field === "username" || field === "sshAlias") && /\s/.test(value)) {
    return undefined;
  }
  return value.trim();
}

function isRemotePath(value: string) {
  return value.startsWith("/") || value.startsWith("~/");
}
