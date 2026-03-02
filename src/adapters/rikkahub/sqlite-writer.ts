import fs from 'node:fs'
import { createRequire } from 'node:module'
import type { RikkahubConversationInsert, RikkahubMessageNodeInsert } from './generator-mapper.ts'

const require = createRequire(import.meta.url)

type DatabaseSyncInstance = {
  exec(sql: string): void
  prepare(sql: string): {
    run(...args: unknown[]): void
  }
  close(): void
}

type DatabaseSyncCtor = new (path: string) => DatabaseSyncInstance

function getDatabaseSync(): DatabaseSyncCtor {
  const sqliteModule = require('node:sqlite') as { DatabaseSync: DatabaseSyncCtor }
  return sqliteModule.DatabaseSync
}

/**
 * Room v16 schema aligned with `references/rikkahub`:
 * - `ConversationEntity`
 * - `message_node`
 * - ancillary tables required by Room identity hash checks
 */
const RIKKAHUB_SCHEMA_V16_SQL = `
PRAGMA foreign_keys = OFF;
PRAGMA journal_mode = DELETE;

CREATE TABLE IF NOT EXISTS \`ConversationEntity\` (
  \`id\` TEXT NOT NULL,
  \`assistant_id\` TEXT NOT NULL DEFAULT '0950e2dc-9bd5-4801-afa3-aa887aa36b4e',
  \`title\` TEXT NOT NULL,
  \`nodes\` TEXT NOT NULL,
  \`create_at\` INTEGER NOT NULL,
  \`update_at\` INTEGER NOT NULL,
  \`truncate_index\` INTEGER NOT NULL DEFAULT -1,
  \`suggestions\` TEXT NOT NULL DEFAULT '[]',
  \`is_pinned\` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(\`id\`)
);

CREATE TABLE IF NOT EXISTS \`MemoryEntity\` (
  \`id\` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`assistant_id\` TEXT NOT NULL,
  \`content\` TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS \`GenMediaEntity\` (
  \`id\` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`path\` TEXT NOT NULL,
  \`model_id\` TEXT NOT NULL,
  \`prompt\` TEXT NOT NULL,
  \`create_at\` INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS \`message_node\` (
  \`id\` TEXT NOT NULL,
  \`conversation_id\` TEXT NOT NULL,
  \`node_index\` INTEGER NOT NULL,
  \`messages\` TEXT NOT NULL,
  \`select_index\` INTEGER NOT NULL,
  PRIMARY KEY(\`id\`),
  FOREIGN KEY(\`conversation_id\`) REFERENCES \`ConversationEntity\`(\`id\`) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS \`managed_files\` (
  \`id\` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`folder\` TEXT NOT NULL,
  \`relative_path\` TEXT NOT NULL,
  \`display_name\` TEXT NOT NULL,
  \`mime_type\` TEXT NOT NULL,
  \`size_bytes\` INTEGER NOT NULL,
  \`created_at\` INTEGER NOT NULL,
  \`updated_at\` INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS \`favorites\` (
  \`id\` TEXT NOT NULL,
  \`type\` TEXT NOT NULL,
  \`ref_key\` TEXT NOT NULL,
  \`ref_json\` TEXT NOT NULL,
  \`snapshot_json\` TEXT NOT NULL,
  \`meta_json\` TEXT,
  \`created_at\` INTEGER NOT NULL,
  \`updated_at\` INTEGER NOT NULL,
  PRIMARY KEY(\`id\`)
);

CREATE INDEX IF NOT EXISTS \`index_message_node_conversation_id\` ON \`message_node\` (\`conversation_id\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`index_managed_files_relative_path\` ON \`managed_files\` (\`relative_path\`);
CREATE INDEX IF NOT EXISTS \`index_managed_files_folder\` ON \`managed_files\` (\`folder\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`index_favorites_ref_key\` ON \`favorites\` (\`ref_key\`);
CREATE INDEX IF NOT EXISTS \`index_favorites_type\` ON \`favorites\` (\`type\`);
CREATE INDEX IF NOT EXISTS \`index_favorites_created_at\` ON \`favorites\` (\`created_at\`);

CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY, identity_hash TEXT);
INSERT OR REPLACE INTO room_master_table (id, identity_hash) VALUES (42, '66238dfed2adafe45f72db785aeafc05');
PRAGMA user_version = 16;
`

/**
 * Materialize a fresh `rikka_hub.db` snapshot from mapped rows.
 */
export function writeRikkahubSqliteSnapshot(params: {
  dbPath: string
  conversations: RikkahubConversationInsert[]
  nodes: RikkahubMessageNodeInsert[]
}): void {
  const { dbPath, conversations, nodes } = params

  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true })
  }

  const DatabaseSync = getDatabaseSync()
  const db = new DatabaseSync(dbPath)

  try {
    db.exec(RIKKAHUB_SCHEMA_V16_SQL)

    const insertConversation = db.prepare(
      `INSERT INTO ConversationEntity
        (id, assistant_id, title, nodes, create_at, update_at, truncate_index, suggestions, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    const insertNode = db.prepare(
      `INSERT INTO message_node
        (id, conversation_id, node_index, messages, select_index)
       VALUES (?, ?, ?, ?, ?)`
    )

    db.exec('BEGIN IMMEDIATE TRANSACTION')

    try {
      for (const row of conversations) {
        insertConversation.run(
          row.id,
          row.assistantId,
          row.title,
          row.nodes,
          row.createAt,
          row.updateAt,
          row.truncateIndex,
          row.suggestions,
          row.isPinned
        )
      }

      for (const row of nodes) {
        insertNode.run(row.id, row.conversationId, row.nodeIndex, row.messages, row.selectIndex)
      }

      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } finally {
    db.close()
  }
}
