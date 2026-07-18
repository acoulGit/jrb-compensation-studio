import Database from "@tauri-apps/plugin-sql";
import { DATABASE_URL, type SqlDatabase } from "./types";

let connectionPromise: Promise<SqlDatabase> | null = null;

export function getDatabaseUrl(): string {
  return DATABASE_URL;
}

export async function getDatabase(): Promise<SqlDatabase> {
  if (!connectionPromise) {
    connectionPromise = Database.load(DATABASE_URL) as Promise<SqlDatabase>;
  }

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

export function resetDatabaseConnectionForTests(): void {
  connectionPromise = null;
}

export function utcNowIso(): string {
  return new Date().toISOString();
}
