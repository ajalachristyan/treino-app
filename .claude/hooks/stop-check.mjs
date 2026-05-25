#!/usr/bin/env node
import { spawnSync } from "node:child_process";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let payload = {};
try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch { payload = {}; }

if (payload.stop_hook_active === true) {
  process.exit(0);
}

const isWindows = process.platform === "win32";
const result = spawnSync("npm", ["run", "check"], {
  encoding: "utf8",
  cwd: process.cwd(),
  shell: isWindows
});

if (result.status === 0) {
  process.exit(0);
}

const detail =
  `[stop-check] npm run check falhou (exit ${result.status ?? "null"})\n` +
  (result.error ? `---- spawn error ----\n${result.error.message}\n` : "") +
  `---- stdout ----\n${result.stdout ?? ""}\n` +
  `---- stderr ----\n${result.stderr ?? ""}\n`;
process.stderr.write(detail);
process.exit(2);
