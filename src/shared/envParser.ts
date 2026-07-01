import type { EnvHealthIssue } from "./types";

export interface ParsedEnvContent {
  values: Record<string, string>;
  issues: EnvHealthIssue[];
  parseFailures: EnvHealthIssue[];
}

const legalKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvContent(content: string): ParsedEnvContent {
  const values: Record<string, string> = {};
  const keyCounts = new Map<string, number>();
  const issues: EnvHealthIssue[] = [];
  const parseFailures: EnvHealthIssue[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const assignment = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : line;
    const equalsIndex = assignment.indexOf("=");
    if (equalsIndex === -1) {
      pushParseFailure(issues, parseFailures, undefined, `Line ${lineNumber} is not a key/value assignment.`);
      return;
    }

    const key = assignment.slice(0, equalsIndex).trim();
    if (!key) {
      issues.push({
        type: "empty_key",
        severity: "error",
        message: `Line ${lineNumber} has an assignment without a key.`
      });
      return;
    }

    if (!legalKeyPattern.test(key)) {
      issues.push({
        type: "illegal_key_name",
        severity: "error",
        key,
        message: `Key ${key} does not match [A-Za-z_][A-Za-z0-9_]*.`
      });
      return;
    }

    const parsedValue = parseValue(assignment.slice(equalsIndex + 1), lineNumber, key);
    if (!parsedValue.ok) {
      pushParseFailure(issues, parseFailures, key, parsedValue.message);
      return;
    }

    values[key] = parsedValue.value;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);

    if (parsedValue.value === "") {
      issues.push({
        type: "empty_value",
        severity: "warning",
        key,
        message: `Key ${key} has an empty value.`
      });
    } else if (parsedValue.value.trim() === "") {
      issues.push({
        type: "whitespace_only_value",
        severity: "warning",
        key,
        message: `Key ${key} has a whitespace-only value.`
      });
    }
  });

  for (const [key, count] of keyCounts) {
    if (count > 1) {
      issues.push({
        type: "duplicate_key",
        severity: "warning",
        key,
        duplicateCount: count,
        finalEffectiveValue: values[key],
        message: `Duplicate key ${key} appears ${count} times. Last assignment wins.`
      });
    }
  }

  return { values, issues, parseFailures };
}

type ParsedValueResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

function parseValue(rawValue: string, lineNumber: number, key: string): ParsedValueResult {
  const valueSource = rawValue.trimStart();
  if (!valueSource) {
    return { ok: true, value: "" };
  }

  const quote = valueSource[0];
  if (quote === "'" || quote === '"') {
    const parsed = readQuotedValue(valueSource, quote);
    if (!parsed) {
      return { ok: false, message: `Line ${lineNumber} has an unterminated quoted value.` };
    }

    const trailing = valueSource.slice(parsed.endIndex + 1).trim();
    if (trailing && !trailing.startsWith("#")) {
      return { ok: false, message: `Line ${lineNumber} has unexpected text after ${key}.` };
    }

    return { ok: true, value: parsed.value };
  }

  return { ok: true, value: stripInlineComment(valueSource).trim() };
}

function readQuotedValue(valueSource: string, quote: string): { value: string; endIndex: number } | null {
  let value = "";
  for (let index = 1; index < valueSource.length; index += 1) {
    const char = valueSource[index];
    if (char === quote) {
      return { value, endIndex: index };
    }

    if (quote === '"' && char === "\\") {
      const next = valueSource[index + 1];
      if (next === undefined) {
        value += char;
        continue;
      }
      value += decodeEscape(next);
      index += 1;
      continue;
    }

    value += char;
  }

  return null;
}

function decodeEscape(char: string) {
  switch (char) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return char;
  }
}

function stripInlineComment(value: string) {
  const commentMatch = value.match(/\s+#/);
  if (!commentMatch || commentMatch.index === undefined) {
    return value;
  }
  return value.slice(0, commentMatch.index);
}

function pushParseFailure(
  issues: EnvHealthIssue[],
  parseFailures: EnvHealthIssue[],
  key: string | undefined,
  message: string
) {
  const issue: EnvHealthIssue = {
    type: "parse_failure",
    severity: "error",
    key,
    message
  };
  issues.push(issue);
  parseFailures.push(issue);
}
