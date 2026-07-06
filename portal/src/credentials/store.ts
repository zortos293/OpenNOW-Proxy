import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";

export interface CredentialRecord {
  id: string;
  username: string;
  password: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CredentialDatabase {
  credentials: CredentialRecord[];
}

const dbPath = config.databasePath.endsWith(".json")
  ? config.databasePath
  : `${config.databasePath}.json`;

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

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

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    return "Username must be 3-32 characters (letters, numbers, _ or -).";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) {
    return "Password must be at least 4 characters.";
  }
  if (password.length > 128) {
    return "Password must be at most 128 characters.";
  }
  return null;
}

export function createCredential(username: string, password: string): CredentialRecord {
  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);

  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const database = readDatabase();
  const normalizedUsername = username.trim();
  const exists = database.credentials.some(
    (record) => record.active && record.username.toLowerCase() === normalizedUsername.toLowerCase(),
  );
  if (exists) {
    throw new Error("An active user with this username already exists.");
  }

  const timestamp = nowIso();
  const record: CredentialRecord = {
    id: crypto.randomUUID(),
    username: normalizedUsername,
    password,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  database.credentials.push(record);
  writeDatabase(database);
  return record;
}

export function listAllCredentials(): CredentialRecord[] {
  return readDatabase()
    .credentials.filter((record) => record.active)
    .sort((left, right) => left.username.localeCompare(right.username));
}

export function listActiveCredentials(): CredentialRecord[] {
  return listAllCredentials();
}

export function deleteCredential(id: string): boolean {
  const database = readDatabase();
  const index = database.credentials.findIndex((record) => record.id === id && record.active);
  if (index === -1) return false;

  database.credentials[index] = {
    ...database.credentials[index],
    active: false,
    updatedAt: nowIso(),
  };
  writeDatabase(database);
  return true;
}

export function countActiveCredentials(): number {
  return listActiveCredentials().length;
}
