import { createRequire } from 'node:module'
import type { RikkahubConversationRow, RikkahubMessageNodeRow } from './mapper.ts'

const require = createRequire(import.meta.url)

/**
 * Dynamically require `node:sqlite` through a CommonJS shim.
 *
 * `DatabaseSync` is only available in Node.js >= 22.5, and `node:sqlite` is an
 * optional built-in. Using `createRequire` lets ESM code reach it without a
 * static import that would break older runtimes at module-load time.
 */
function getDatabaseSync() {
  const sqliteModule = require('node:sqlite') as { DatabaseSync: new (path: string) => any }
  return sqliteModule.DatabaseSync
}

/**
 * Read `ConversationEntity` rows from a Rikkahub Room database.
 */
export function readRikkahubConversations(dbPath: string): RikkahubConversationRow[] {
  const DatabaseSync = getDatabaseSync()
  const db = new DatabaseSync(dbPath)
  try {
    return db
      .prepare(
        `SELECT id, assistant_id, title, nodes, create_at, update_at, truncate_index, suggestions, is_pinned
         FROM ConversationEntity`
      )
      .all() as RikkahubConversationRow[]
  } finally {
    db.close()
  }
}

/**
 * Read `message_node` rows from a Rikkahub Room database.
 */
export function readRikkahubMessageNodes(dbPath: string): RikkahubMessageNodeRow[] {
  const DatabaseSync = getDatabaseSync()
  const db = new DatabaseSync(dbPath)
  try {
    return db
      .prepare(
        `SELECT id, conversation_id, node_index, messages, select_index
         FROM message_node`
      )
      .all() as RikkahubMessageNodeRow[]
  } finally {
    db.close()
  }
}

/**
 * Extract Room `user_version` to record source schema version metadata.
 */
export function readSchemaVersion(dbPath: string): number | undefined {
  const DatabaseSync = getDatabaseSync()
  const db = new DatabaseSync(dbPath)
  try {
    const row = db.prepare('PRAGMA user_version').get() as Record<string, unknown> | undefined
    const value = row ? (row.user_version as number | undefined) : undefined
    return typeof value === 'number' ? value : undefined
  } finally {
    db.close()
  }
}
