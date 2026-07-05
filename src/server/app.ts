import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import staticPlugin from "@fastify/static";
import { buildComparison } from "../shared/comparison";
import type { EnvSource, SshRemoteFileConfig } from "../shared/types";
import { getDefaultDbPath } from "./paths";
import { SettingsStore } from "./settingsStore";
import { pickEnvFilePath, pickPrivateKeyPath } from "./fileDialog";
import { readSourceForComparison, readSourceHealth, readSourceRawContent, testSourceReadability } from "./sourceReader";

const tokenHeader = "x-env-config-lens-token";
const bindHost = "127.0.0.1";

export interface BuildAppOptions {
  store: SettingsStore;
  sessionToken: string;
  uiOrigin: string;
}

export interface StartServerOptions {
  port?: number;
  openBrowser?: boolean;
  sessionToken?: string;
  store?: SettingsStore;
}

export async function buildApp({ store, sessionToken, uiOrigin }: BuildAppOptions): Promise<FastifyInstance> {
  const app = fastify({ logger: false });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }

    const origin = request.headers.origin;
    if (origin && origin !== uiOrigin) {
      await reply.code(403).send({ error: "local_origin_required" });
      return reply;
    }

    if (request.headers[tokenHeader] !== sessionToken) {
      await reply.code(401).send({ error: "session_token_required" });
      return reply;
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    reply.code(500).send({
      error: "internal_error",
      message: sanitizeErrorMessage(error)
    });
  });

  app.get("/api/runtime-boundary", async () => ({
    bindHost,
    tokenRequired: true,
    persistedState: "settings-only",
    corsOrigin: uiOrigin,
    storage: "SQLite"
  }));

  app.get("/api/sources", async () => ({ sources: store.listSources() }));

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
      const source = store.createLocalFileSource({
        name: requiredString(payload.name, "name"),
        filePath: requiredString(payload.filePath, "filePath"),
        enabled: payload.enabled ?? true,
        note: payload.note ?? ""
      });

      return reply.code(201).send({ source });
    }

    if (payload.type === "ssh-remote-file") {
      const sshRemoteFile = parseSshRemoteFilePayload(payload.sshRemoteFile);
      if (!sshRemoteFile) {
        return reply.code(422).send({ error: "invalid_ssh_source" });
      }

      const source = store.createSshRemoteFileSource({
        name: requiredString(payload.name, "name"),
        enabled: payload.enabled ?? true,
        note: payload.note ?? "",
        sshRemoteFile
      });

      return reply.code(201).send({ source });
    }

      return reply.code(422).send({ error: "unsupported_source_type" });
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

    const current = findSource(store, id);
    if (!current) {
      return reply.code(404).send({ error: "source_not_found" });
    }

    if (current.type === "ssh-remote-file") {
      const sshRemoteFile = payload.sshRemoteFile === undefined ? undefined : parseSshRemoteFilePayload(payload.sshRemoteFile);
      if (payload.sshRemoteFile !== undefined && !sshRemoteFile) {
        return reply.code(422).send({ error: "invalid_ssh_source" });
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
    store.deleteSource(id);
    return reply.code(204).send();
  });

  app.post("/api/sources/reorder", async (request) => {
    const payload = request.body as { sourceIds?: string[] };
    store.reorderSources(Array.isArray(payload.sourceIds) ? payload.sourceIds : []);
    return { sources: store.listSources() };
  });

  app.post("/api/file-dialog/env-path", async () => pickEnvFilePath());

  app.post("/api/file-dialog/private-key-path", async () => pickPrivateKeyPath());

  app.post("/api/sources/:id/test", async (request, reply) => {
    const source = findSource(store, (request.params as { id: string }).id);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    return testSourceReadability(source);
  });

  app.post("/api/sources/:id/content", async (request, reply) => {
    const source = findSource(store, (request.params as { id: string }).id);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    return readSourceRawContent(source);
  });

  app.post("/api/compare", async (request) => {
    const payload = request.body as { sourceIds?: string[] };
    const sourceIds = Array.isArray(payload.sourceIds) ? payload.sourceIds : [];
    const sources = sourceIds.map((id) => findSource(store, id)).filter((source): source is EnvSource => Boolean(source));
    const readResults = await Promise.all(sources.map((source) => readSourceForComparison(source)));
    return buildComparison(sourceIds, readResults);
  });

  app.post("/api/health", async (request, reply) => {
    const payload = request.body as { sourceId?: string };
    const source = payload.sourceId ? findSource(store, payload.sourceId) : undefined;
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    return readSourceHealth(source);
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
  const port = options.port ?? Number(process.env.PORT ?? 4173);
  const sessionToken = options.sessionToken ?? process.env.ENV_CONFIG_LENS_SESSION_TOKEN ?? randomBytes(24).toString("hex");
  const uiOrigin = `http://${bindHost}:${port}`;
  const store = options.store ?? new SettingsStore(getDefaultDbPath());
  const app = await buildApp({ store, sessionToken, uiOrigin });
  await app.listen({ host: bindHost, port });

  const url = `${uiOrigin}/?token=${encodeURIComponent(sessionToken)}`;
  console.log(`Env Config Lens is listening on ${uiOrigin}`);
  console.log(`Open ${url}`);
  console.log("Startup token is required for local UI API calls.");

  if (options.openBrowser) {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  }

  return { app, store, url, sessionToken };
}

function findSource(store: SettingsStore, sourceId: string) {
  return store.getSource(sourceId);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value;
}

function sanitizeErrorMessage(error: unknown) {
  if (error instanceof Error && /required|not found/i.test(error.message)) {
    return error.message;
  }
  return "The request could not be completed.";
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
