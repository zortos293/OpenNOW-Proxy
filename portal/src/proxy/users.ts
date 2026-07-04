import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";
import { listActiveCredentials } from "../credentials/store.js";

export function renderPasswdFile(): string {
  const lines = listActiveCredentials().map(
    (record) => `${record.proxyUsername}:CL:${record.proxyPassword}`,
  );
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

export function writePasswdFile(): void {
  const content = renderPasswdFile();
  fs.mkdirSync(path.dirname(config.proxyPasswdPath), { recursive: true });
  fs.writeFileSync(config.proxyPasswdPath, content, { mode: 0o600 });
}

export function syncPasswdFile(): void {
  writePasswdFile();
}
