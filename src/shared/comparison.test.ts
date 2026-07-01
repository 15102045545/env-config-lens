import { describe, expect, it } from "vitest";
import { buildComparison } from "./comparison";
import type { EnvSourceReadResult } from "./types";

const success = (
  sourceId: string,
  sourceName: string,
  values: Record<string, string>
): EnvSourceReadResult => ({
  sourceId,
  sourceName,
  status: "success",
  values,
  keyCount: Object.keys(values).length
});

describe("buildComparison", () => {
  it("classifies rows with deterministic status precedence", () => {
    const result = buildComparison(["local", "prod", "stage"], [
      success("local", "local", {
        EMPTY_WINS: "",
        SOURCE_ONLY: "local-only",
        MISSING: "one",
        SAME: "equal",
        DIFFERENT: "one"
      }),
      success("prod", "prod", {
        EMPTY_WINS: "filled",
        MISSING: "one",
        SAME: "equal",
        DIFFERENT: "two"
      }),
      success("stage", "stage", {
        EMPTY_WINS: "filled",
        SAME: "equal",
        DIFFERENT: "three"
      })
    ]);

    expect(Object.fromEntries(result.rows.map((row) => [row.key, row.status]))).toEqual({
      DIFFERENT: "different",
      EMPTY_WINS: "empty",
      MISSING: "missing",
      SAME: "same",
      SOURCE_ONLY: "source-only"
    });
    expect(result.summary).toMatchObject({
      sourceCount: 3,
      successfulSourceCount: 3,
      failedSourceCount: 0,
      unionKeyCount: 5,
      sameCount: 1,
      differentCount: 1,
      missingCount: 1,
      emptyCount: 1,
      sourceOnlyCount: 1
    });
  });

  it("excludes failed sources from row classification while reporting source failures", () => {
    const result = buildComparison(["ok-a", "failed", "ok-b"], [
      success("ok-a", "ok-a", { ONLY_SUCCESSFUL: "same", SHARED: "left" }),
      {
        sourceId: "failed",
        sourceName: "failed",
        status: "failed",
        keyCount: 0,
        errorType: "parse_failed",
        errorMessage: "Source could not be parsed."
      },
      success("ok-b", "ok-b", { ONLY_SUCCESSFUL: "same", SHARED: "right" })
    ]);

    expect(result.summary.failedSourceCount).toBe(1);
    expect(result.rows.find((row) => row.key === "ONLY_SUCCESSFUL")?.status).toBe("same");
    expect(result.rows.find((row) => row.key === "SHARED")?.status).toBe("different");
    expect(result.rows.every((row) => row.presenceBySourceId.failed === false)).toBe(true);
  });
});
