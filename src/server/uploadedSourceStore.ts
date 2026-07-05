import { randomUUID } from "node:crypto";
import type { EnvSource } from "../shared/types";

export interface CreateUploadedFileSourceInput {
  name: string;
  fileName: string;
  content: string;
  sizeBytes: number;
  enabled: boolean;
  note: string;
  displayOrder: number;
}

export type UpdateUploadedFileSourceInput = Partial<Pick<EnvSource, "name" | "enabled" | "note">>;

interface UploadedSourceRecord {
  source: EnvSource;
  content: string;
}

export class UploadedSourceStore {
  private readonly records = new Map<string, UploadedSourceRecord>();

  createSource(input: CreateUploadedFileSourceInput): EnvSource {
    const now = new Date().toISOString();
    const source: EnvSource = {
      id: randomUUID(),
      type: "uploaded-file",
      name: input.name,
      enabled: input.enabled,
      displayOrder: input.displayOrder,
      note: input.note,
      createdAt: now,
      updatedAt: now,
      uploadedFile: {
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        uploadedAt: now
      }
    };

    this.records.set(source.id, { source, content: input.content });
    return cloneSource(source);
  }

  listSources(): EnvSource[] {
    return Array.from(this.records.values())
      .map((record) => cloneSource(record.source))
      .sort(compareSources);
  }

  getSource(id: string): EnvSource | undefined {
    const record = this.records.get(id);
    return record ? cloneSource(record.source) : undefined;
  }

  getContent(id: string): string | undefined {
    return this.records.get(id)?.content;
  }

  updateSource(id: string, input: UpdateUploadedFileSourceInput): EnvSource {
    const record = this.records.get(id);
    if (!record) {
      throw new Error("未找到上传来源。");
    }

    const source: EnvSource = {
      ...record.source,
      name: input.name ?? record.source.name,
      enabled: input.enabled ?? record.source.enabled,
      note: input.note ?? record.source.note,
      updatedAt: new Date().toISOString(),
      uploadedFile: record.source.uploadedFile ? { ...record.source.uploadedFile } : undefined
    };
    this.records.set(id, { source, content: record.content });
    return cloneSource(source);
  }

  deleteSource(id: string) {
    return this.records.delete(id);
  }

  reorderSources(sourceIds: string[]) {
    const now = new Date().toISOString();
    sourceIds.forEach((id, index) => {
      const record = this.records.get(id);
      if (!record) {
        return;
      }
      this.records.set(id, {
        ...record,
        source: {
          ...record.source,
          displayOrder: index + 1,
          updatedAt: now,
          uploadedFile: record.source.uploadedFile ? { ...record.source.uploadedFile } : undefined
        }
      });
    });
  }
}

function cloneSource(source: EnvSource): EnvSource {
  return {
    ...source,
    uploadedFile: source.uploadedFile ? { ...source.uploadedFile } : undefined
  };
}

function compareSources(left: EnvSource, right: EnvSource) {
  return left.displayOrder - right.displayOrder || left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name);
}
