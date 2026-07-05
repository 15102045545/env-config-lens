import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EnvSource, SshRemoteFileConfig } from "../shared/types";

export interface CreateLocalFileSourceInput {
  name: string;
  filePath: string;
  enabled: boolean;
  note: string;
}

export type UpdateLocalFileSourceInput = Partial<CreateLocalFileSourceInput>;

export interface CreateSshRemoteFileSourceInput {
  name: string;
  enabled: boolean;
  note: string;
  sshRemoteFile: SshRemoteFileConfig;
}

export type UpdateSshRemoteFileSourceInput = Partial<Omit<CreateSshRemoteFileSourceInput, "sshRemoteFile">> & {
  sshRemoteFile?: SshRemoteFileConfig;
};

interface SourceRow {
  id: string;
  type: EnvSource["type"];
  name: string;
  enabled: 0 | 1;
  display_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  file_path: string | null;
  ssh_mode: SshRemoteFileConfig["mode"] | null;
  ssh_host: string | null;
  ssh_port: number | null;
  ssh_username: string | null;
  ssh_private_key_path: string | null;
  ssh_alias: string | null;
  ssh_remote_env_path: string | null;
  ssh_keychain_service: string | null;
  ssh_keychain_account: string | null;
}

export class SettingsStore {
  private readonly db: DatabaseSync;

  constructor(readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  close() {
    this.db.close();
  }

  createLocalFileSource(input: CreateLocalFileSourceInput): EnvSource {
    const now = new Date().toISOString();
    const id = randomUUID();
    const displayOrder = this.nextDisplayOrder();

    this.db.prepare(`
      INSERT INTO env_sources (id, type, name, enabled, display_order, note, created_at, updated_at)
      VALUES (?, 'local-file', ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.enabled ? 1 : 0, displayOrder, input.note ?? "", now, now);
    this.db.prepare(`
      INSERT INTO local_file_source_configs (source_id, file_path)
      VALUES (?, ?)
    `).run(id, input.filePath);

    return this.getSource(id) as EnvSource;
  }

  createSshRemoteFileSource(input: CreateSshRemoteFileSourceInput): EnvSource {
    const now = new Date().toISOString();
    const id = randomUUID();
    const displayOrder = this.nextDisplayOrder();
    const ssh = sanitizeSshRemoteFileConfig(input.sshRemoteFile);

    this.db.prepare(`
      INSERT INTO env_sources (id, type, name, enabled, display_order, note, created_at, updated_at)
      VALUES (?, 'ssh-remote-file', ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.enabled ? 1 : 0, displayOrder, input.note ?? "", now, now);
    this.db.prepare(`
      INSERT INTO ssh_remote_file_source_configs (
        source_id,
        mode,
        host,
        port,
        username,
        private_key_path,
        ssh_alias,
        remote_env_path,
        keychain_service,
        keychain_account
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      ssh.mode,
      ssh.host ?? null,
      ssh.port ?? null,
      ssh.username ?? null,
      ssh.privateKeyPath ?? null,
      ssh.sshAlias ?? null,
      ssh.remoteEnvPath,
      ssh.keychainService ?? null,
      ssh.keychainAccount ?? null
    );

    return this.getSource(id) as EnvSource;
  }

  listSources(): EnvSource[] {
    return this.db.prepare(`
      SELECT source.id,
        source.type,
        source.name,
        source.enabled,
        source.display_order,
        source.note,
        source.created_at,
        source.updated_at,
        local.file_path,
        ssh.mode AS ssh_mode,
        ssh.host AS ssh_host,
        ssh.port AS ssh_port,
        ssh.username AS ssh_username,
        ssh.private_key_path AS ssh_private_key_path,
        ssh.ssh_alias AS ssh_alias,
        ssh.remote_env_path AS ssh_remote_env_path,
        ssh.keychain_service AS ssh_keychain_service,
        ssh.keychain_account AS ssh_keychain_account
      FROM env_sources source
      LEFT JOIN local_file_source_configs local ON local.source_id = source.id
      LEFT JOIN ssh_remote_file_source_configs ssh ON ssh.source_id = source.id
      ORDER BY source.display_order ASC, source.created_at ASC
    `).all().map((row) => mapSourceRow(row as unknown as SourceRow));
  }

  getSource(id: string): EnvSource | undefined {
    const row = this.db.prepare(`
      SELECT source.id,
        source.type,
        source.name,
        source.enabled,
        source.display_order,
        source.note,
        source.created_at,
        source.updated_at,
        local.file_path,
        ssh.mode AS ssh_mode,
        ssh.host AS ssh_host,
        ssh.port AS ssh_port,
        ssh.username AS ssh_username,
        ssh.private_key_path AS ssh_private_key_path,
        ssh.ssh_alias AS ssh_alias,
        ssh.remote_env_path AS ssh_remote_env_path,
        ssh.keychain_service AS ssh_keychain_service,
        ssh.keychain_account AS ssh_keychain_account
      FROM env_sources source
      LEFT JOIN local_file_source_configs local ON local.source_id = source.id
      LEFT JOIN ssh_remote_file_source_configs ssh ON ssh.source_id = source.id
      WHERE source.id = ?
    `).get(id) as SourceRow | undefined;

    return row ? mapSourceRow(row) : undefined;
  }

  updateLocalFileSource(id: string, input: UpdateLocalFileSourceInput): EnvSource {
    const current = this.getSource(id);
    if (!current || current.type !== "local-file") {
      throw new Error("未找到本地文件来源。");
    }

    const updated = {
      name: input.name ?? current.name,
      filePath: input.filePath ?? current.localFile?.filePath ?? "",
      enabled: input.enabled ?? current.enabled,
      note: input.note ?? current.note
    };
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE env_sources
      SET name = ?, enabled = ?, note = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.enabled ? 1 : 0, updated.note, now, id);
    this.db.prepare(`
      UPDATE local_file_source_configs
      SET file_path = ?
      WHERE source_id = ?
    `).run(updated.filePath, id);

    return this.getSource(id) as EnvSource;
  }

  updateSshRemoteFileSource(id: string, input: UpdateSshRemoteFileSourceInput): EnvSource {
    const current = this.getSource(id);
    if (!current || current.type !== "ssh-remote-file" || !current.sshRemoteFile) {
      throw new Error("未找到 SSH 来源。");
    }

    const updated = {
      name: input.name ?? current.name,
      enabled: input.enabled ?? current.enabled,
      note: input.note ?? current.note,
      sshRemoteFile: sanitizeSshRemoteFileConfig(input.sshRemoteFile ?? current.sshRemoteFile)
    };
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE env_sources
      SET name = ?, enabled = ?, note = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.enabled ? 1 : 0, updated.note, now, id);
    this.db.prepare(`
      UPDATE ssh_remote_file_source_configs
      SET mode = ?,
        host = ?,
        port = ?,
        username = ?,
        private_key_path = ?,
        ssh_alias = ?,
        remote_env_path = ?,
        keychain_service = ?,
        keychain_account = ?
      WHERE source_id = ?
    `).run(
      updated.sshRemoteFile.mode,
      updated.sshRemoteFile.host ?? null,
      updated.sshRemoteFile.port ?? null,
      updated.sshRemoteFile.username ?? null,
      updated.sshRemoteFile.privateKeyPath ?? null,
      updated.sshRemoteFile.sshAlias ?? null,
      updated.sshRemoteFile.remoteEnvPath,
      updated.sshRemoteFile.keychainService ?? null,
      updated.sshRemoteFile.keychainAccount ?? null,
      id
    );

    return this.getSource(id) as EnvSource;
  }

  deleteSource(id: string) {
    this.db.prepare("DELETE FROM env_sources WHERE id = ?").run(id);
    this.normalizeDisplayOrder();
  }

  reorderSources(sourceIds: string[]) {
    const update = this.db.prepare("UPDATE env_sources SET display_order = ?, updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      sourceIds.forEach((id, index) => update.run(index + 1, now, id));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private migrate() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS env_sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('local-file', 'ssh-remote-file')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        display_order INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_file_source_configs (
        source_id TEXT PRIMARY KEY REFERENCES env_sources(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ssh_remote_file_source_configs (
        source_id TEXT PRIMARY KEY REFERENCES env_sources(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('standard', 'alias')),
        host TEXT,
        port INTEGER,
        username TEXT,
        private_key_path TEXT,
        ssh_alias TEXT,
        remote_env_path TEXT NOT NULL,
        keychain_service TEXT,
        keychain_account TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_env_sources_display_order
        ON env_sources(display_order);
    `);
  }

  private nextDisplayOrder() {
    const row = this.db.prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM env_sources").get() as {
      next_order: number;
    };
    return row.next_order;
  }

  private normalizeDisplayOrder() {
    const ids = this.listSources().map((source) => source.id);
    this.reorderSources(ids);
  }
}

function mapSourceRow(row: SourceRow): EnvSource {
  const sshRemoteFile = row.ssh_mode && row.ssh_remote_env_path
    ? {
        mode: row.ssh_mode,
        remoteEnvPath: row.ssh_remote_env_path,
        host: row.ssh_host ?? undefined,
        port: row.ssh_port ?? undefined,
        username: row.ssh_username ?? undefined,
        privateKeyPath: row.ssh_private_key_path ?? undefined,
        sshAlias: row.ssh_alias ?? undefined,
        keychainService: row.ssh_keychain_service ?? undefined,
        keychainAccount: row.ssh_keychain_account ?? undefined
      }
    : undefined;

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled === 1,
    displayOrder: row.display_order,
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    localFile: row.file_path ? { filePath: row.file_path } : undefined,
    sshRemoteFile
  };
}

function sanitizeSshRemoteFileConfig(input: SshRemoteFileConfig): SshRemoteFileConfig {
  const mode = input.mode;
  const common = {
    remoteEnvPath: input.remoteEnvPath,
    keychainService: input.keychainService || undefined,
    keychainAccount: input.keychainAccount || undefined
  };

  if (mode === "standard") {
    return {
      mode,
      ...common,
      host: input.host,
      port: input.port,
      username: input.username,
      privateKeyPath: input.privateKeyPath
    };
  }

  return {
    mode: "alias",
    ...common,
    sshAlias: input.sshAlias
  };
}
