/**
 * SQLite Database Utilities
 *
 * Simple wrappers for Node.js native SQLite operations.
 * Used for reading/writing Rikkahub's SQLite-based backups.
 */

import { DatabaseSync } from 'node:sqlite'

/**
 * Execute a SELECT query and return all rows.
 *
 * Automatically opens and closes the database connection.
 *
 * @param dbPath - Path to SQLite database file
 * @param sql - SQL query string
 * @param params - Query parameters (optional)
 * @returns Array of result rows
 *
 * @example
 * const users = queryAll<{ id: number, name: string }>(
 *   'data.db',
 *   'SELECT * FROM users WHERE age > ?',
 *   [18]
 * )
 */
export function queryAll<T extends Record<string, unknown>>(dbPath: string, sql: string, params?: unknown[]): T[] {
  const db = new DatabaseSync(dbPath)

  try {
    const stmt = db.prepare(sql)
    const rows = params ? stmt.all(...params) : stmt.all()
    return rows as T[]
  } finally {
    db.close()
  }
}

/**
 * Execute SQL statements (CREATE, INSERT, UPDATE, etc.).
 *
 * Automatically opens and closes the database connection.
 * Can execute multiple statements separated by semicolons.
 *
 * @param dbPath - Path to SQLite database file
 * @param sql - SQL statements to execute
 *
 * @example
 * runStatements('data.db', `
 *   CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
 *   INSERT INTO users (name) VALUES ('Alice');
 * `)
 */
export function runStatements(dbPath: string, sql: string): void {
  const db = new DatabaseSync(dbPath)

  try {
    db.exec(sql)
  } finally {
    db.close()
  }
}
