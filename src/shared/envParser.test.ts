import { describe, expect, it } from "vitest";
import { parseEnvContent } from "./envParser";

describe("parseEnvContent", () => {
  it("uses last assignment wins while reporting duplicates", () => {
    const result = parseEnvContent("DUP=first\nOTHER=value\nDUP=second\nDUP=third\n");

    expect(result.values).toEqual({ DUP: "third", OTHER: "value" });
    expect(result.issues).toContainEqual({
      type: "duplicate_key",
      severity: "warning",
      key: "DUP",
      duplicateCount: 3,
      finalEffectiveValue: "third",
      message: "Duplicate key DUP appears 3 times. Last assignment wins."
    });
  });

  it("reports empty and whitespace-only values after unquoting", () => {
    const result = parseEnvContent("EMPTY=\nSPACE=\"   \"\nTAB='\\t'\n");

    expect(result.values).toEqual({ EMPTY: "", SPACE: "   ", TAB: "\\t" });
    expect(result.issues.map((issue) => [issue.type, issue.key])).toEqual([
      ["empty_value", "EMPTY"],
      ["whitespace_only_value", "SPACE"]
    ]);
  });

  it("reports empty keys and illegal key names without adding them to values", () => {
    const result = parseEnvContent("=missing\n1INVALID=value\nVALID_NAME=value\n");

    expect(result.values).toEqual({ VALID_NAME: "value" });
    expect(result.issues.map((issue) => issue.type)).toEqual(["empty_key", "illegal_key_name"]);
  });

  it("parses quoted and escaped values without variable expansion", () => {
    const result = parseEnvContent([
      "BASE=sample",
      "QUOTED=\"hello world\"",
      "ESCAPED=\"line\\nnext\"",
      "SINGLE='literal # hash'",
      "REFERENCE=${BASE}",
      "INLINE=value # comment"
    ].join("\n"));

    expect(result.values).toEqual({
      BASE: "sample",
      QUOTED: "hello world",
      ESCAPED: "line\nnext",
      SINGLE: "literal # hash",
      REFERENCE: "${BASE}",
      INLINE: "value"
    });
  });

  it("records parse failures without echoing full content", () => {
    const result = parseEnvContent("GOOD=value\nBROKEN=\"unterminated\nANOTHER=value\n");

    expect(result.values).toEqual({ GOOD: "value", ANOTHER: "value" });
    expect(result.parseFailures).toHaveLength(1);
    expect(result.issues).toContainEqual({
      type: "parse_failure",
      severity: "error",
      key: "BROKEN",
      message: "Line 2 has an unterminated quoted value."
    });
    expect(JSON.stringify(result.issues)).not.toContain("unterminated\nANOTHER");
  });
});
