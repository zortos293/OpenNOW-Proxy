import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";

export interface CredentialRecord {
  githubId: number;
  githubLogin: string;
  proxyUsername: string;
  proxyPassword: string;
  sponsorTier: string | null;
  active: number;
  createdAt: string;
  updatedAt: string;
}

interface CredentialDatabase {
  credentials: CredentialRecord[];
}

const dbPath = config.databasePath.endsWith(".json")
  ? config.databasePath
  : `${config.databasePath}.json`;

function readDatabase(): CredentialDatabase {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    return { credentials: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8")) as CredentialDatabase;
    return { credentials: parsed.credentials ?? [] };
  } catch {
    return { credentials: [] };
  }
}

function writeDatabase(database: CredentialDatabase): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function proxyUsernameForGithubId(githubId: number): string {
  return `sponsor_${githubId}`;
}

export function upsertSponsorCredential(input: {
  githubId: number;
  githubLogin: string;
  sponsorTier: string | null;
  rotatePassword?: boolean;
}): CredentialRecord {
  const database = readDatabase();
  const existing = database.credentials.find((record) => record.githubId === input.githubId);
  const timestamp = nowIso();
  const proxyUsername = proxyUsernameForGithubId(input.githubId);
  const proxyPassword =
    existing && !input.rotatePassword ? existing.proxyPassword : randomPassword();

  const nextRecord: CredentialRecord = {
    githubId: input.githubId,
    githubLogin: input.githubLogin,
    proxyUsername,
    proxyPassword,
    sponsorTier: input.sponsorTier,
    active: 1,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
    database.credentials = database.credentials.map((record) =>
      record.githubId === input.githubId ? nextRecord : record,
    );
  } else {
    database.credentials.push(nextRecord);
  }

  writeDatabase(database);
  return nextRecord;
}

export function getCredentialByGithubId(githubId: number): CredentialRecord | null {
  return readDatabase().credentials.find((record) => record.githubId === githubId) ?? null;
}

export function listActiveCredentials(): CredentialRecord[] {
  return readDatabase()
    .credentials.filter((record) => record.active === 1)
    .sort((left, right) => left.githubLogin.localeCompare(right.githubLogin));
}

export function deactivateCredential(githubId: number): void {
  const database = readDatabase();
  database.credentials = database.credentials.map((record) =>
    record.githubId === githubId
      ? { ...record, active: 0, updatedAt: nowIso() }
      : record,
  );
  writeDatabase(database);
}

export function deactivateAllExcept(githubIds: number[]): void {
  const allowed = new Set(githubIds);
  const database = readDatabase();
  const timestamp = nowIso();

  database.credentials = database.credentials.map((record) => {
    if (record.active !== 1) return record;
    if (allowed.size === 0 || !allowed.has(record.githubId)) {
      return { ...record, active: 0, updatedAt: timestamp };
    }
    return record;
  });

  writeDatabase(database);
}

export function countActiveCredentials(): number {
  return listActiveCredentials().length;
}
