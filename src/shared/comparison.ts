import type { EnvComparisonResult, EnvComparisonRow, EnvSourceReadResult } from "./types";

const statusOrder = ["empty", "source-only", "missing", "same", "different"] as const;

export function buildComparison(
  selectedSourceIds: string[],
  sourceResults: EnvSourceReadResult[]
): EnvComparisonResult {
  const resultsById = new Map(sourceResults.map((result) => [result.sourceId, result]));
  const orderedResults = selectedSourceIds
    .map((sourceId) => resultsById.get(sourceId))
    .filter((result): result is EnvSourceReadResult => Boolean(result));
  const successfulResults = orderedResults.filter(
    (result) => result.status === "success" && result.values
  );
  const keys = Array.from(
    new Set(successfulResults.flatMap((result) => Object.keys(result.values ?? {})))
  ).sort((left, right) => left.localeCompare(right));

  const rows = keys.map((key) => buildRow(key, selectedSourceIds, successfulResults));
  const counts = Object.fromEntries(statusOrder.map((status) => [status, 0])) as Record<
    (typeof statusOrder)[number],
    number
  >;

  rows.forEach((row) => {
    counts[row.status] += 1;
  });

  return {
    selectedSourceIds,
    sourceResults: orderedResults,
    summary: {
      sourceCount: selectedSourceIds.length,
      successfulSourceCount: successfulResults.length,
      failedSourceCount: orderedResults.filter((result) => result.status === "failed").length,
      unionKeyCount: rows.length,
      sameCount: counts.same,
      differentCount: counts.different,
      missingCount: counts.missing,
      emptyCount: counts.empty,
      sourceOnlyCount: counts["source-only"]
    },
    rows
  };
}

function buildRow(
  key: string,
  selectedSourceIds: string[],
  successfulResults: EnvSourceReadResult[]
): EnvComparisonRow {
  const valuesBySourceId: Record<string, string> = {};
  const presenceBySourceId: Record<string, boolean> = {};
  const successfulSourceIds = new Set(successfulResults.map((result) => result.sourceId));

  selectedSourceIds.forEach((sourceId) => {
    const source = successfulResults.find((result) => result.sourceId === sourceId);
    const hasValue = Boolean(source?.values && Object.hasOwn(source.values, key));
    presenceBySourceId[sourceId] = successfulSourceIds.has(sourceId) && hasValue;
    if (source?.values && hasValue) {
      valuesBySourceId[sourceId] = source.values[key];
    }
  });

  const presentValues = successfulResults
    .filter((result) => result.values && Object.hasOwn(result.values, key))
    .map((result) => result.values?.[key] ?? "");
  const presentCount = presentValues.length;
  const hasEmpty = presentValues.some((value) => value === "" || value.trim() === "");

  if (hasEmpty) {
    return { key, status: "empty", valuesBySourceId, presenceBySourceId };
  }

  if (presentCount === 1) {
    return { key, status: "source-only", valuesBySourceId, presenceBySourceId };
  }

  if (presentCount > 0 && presentCount < successfulResults.length) {
    return { key, status: "missing", valuesBySourceId, presenceBySourceId };
  }

  const uniqueValues = new Set(presentValues);
  return {
    key,
    status: uniqueValues.size <= 1 ? "same" : "different",
    valuesBySourceId,
    presenceBySourceId
  };
}
