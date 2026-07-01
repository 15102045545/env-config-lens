#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const service = process.env.ECL_KEYCHAIN_SERVICE;
const account = process.env.ECL_KEYCHAIN_ACCOUNT;

if (!service || !account) {
  process.exit(1);
}

const result = spawnSync("security", ["find-generic-password", "-w", "-s", service, "-a", account], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"]
});

if (result.status !== 0 || typeof result.stdout !== "string") {
  process.exit(1);
}

process.stdout.write(result.stdout.replace(/\n$/, ""));
