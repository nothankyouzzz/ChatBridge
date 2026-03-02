import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { RikkahubParser } from '../../adapters/rikkahub/parser.ts'
import { CoreBundleSchema } from '../../core/schema/core.zod.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { createZipFromDirectory } from '../../io/zip.ts'

function createTestDb(dbPath: string): void {
  const db = new DatabaseSync(dbPath)

  try {
    db.exec(`
      PRAGMA user_version = 16;
      CREATE TABLE ConversationEntity (
        id TEXT PRIMARY KEY NOT NULL,
        assistant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        nodes TEXT NOT NULL,
        create_at INTEGER NOT NULL,
        update_at INTEGER NOT NULL,
        truncate_index INTEGER NOT NULL,
        suggestions TEXT NOT NULL,
        is_pinned INTEGER NOT NULL
      );

      CREATE TABLE message_node (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        node_index INTEGER NOT NULL,
        messages TEXT NOT NULL,
        select_index INTEGER NOT NULL
      );
    `)

    db.prepare(
      `INSERT INTO ConversationEntity (id, assistant_id, title, nodes, create_at, update_at, truncate_index, suggestions, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('conv-1', 'assistant-1', 'Rikkahub Topic', '[]', 1709251200000, 1709251500000, -1, '[]', 1)

    const nodeMessages = [
      {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi' }],
        annotations: [],
        createdAt: '2026-03-01T00:00:00.000Z',
        modelId: 'gpt-4o-mini',
      },
      {
        id: 'msg-1-alt',
        role: 'user',
        parts: [{ type: 'text', text: 'Alt' }],
        annotations: [],
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]

    db.prepare(
      `INSERT INTO message_node (id, conversation_id, node_index, messages, select_index)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('node-1', 'conv-1', 0, JSON.stringify(nodeMessages), 0)

    const assistantMessages = [
      {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          { type: 'reasoning', reasoning: 'thinking' },
          { type: 'text', text: 'Hello' },
        ],
        annotations: [],
        createdAt: '2026-03-01T00:01:00.000Z',
        finishedAt: '2026-03-01T00:01:02.000Z',
        modelId: 'gpt-4o-mini',
        usage: {
          promptTokens: 11,
          completionTokens: 22,
          cachedTokens: 0,
          totalTokens: 33,
        },
      },
    ]

    db.prepare(
      `INSERT INTO message_node (id, conversation_id, node_index, messages, select_index)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('node-2', 'conv-1', 1, JSON.stringify(assistantMessages), 0)
  } finally {
    db.close()
  }
}

test('RikkahubParser parses backup zip with sqlite and settings', async () => {
  const tempDir = await createTempDir('chatbridge-test-rikkahub-')

  try {
    const payloadDir = path.join(tempDir, 'payload')
    await fs.mkdir(payloadDir, { recursive: true })

    const dbPath = path.join(payloadDir, 'rikka_hub.db')
    createTestDb(dbPath)

    const settings = {
      providers: [
        {
          id: 'provider-1',
          type: 'openai',
          enabled: true,
          name: 'OpenAI',
          apiKey: 'sk-rikka',
          baseUrl: 'https://api.openai.com/v1',
          models: [
            {
              id: 'gpt-4o-mini',
              modelId: 'gpt-4o-mini',
              displayName: 'GPT-4o mini',
              type: 'CHAT',
            },
          ],
        },
      ],
    }

    await fs.writeFile(path.join(payloadDir, 'settings.json'), JSON.stringify(settings), 'utf8')

    const zipPath = path.join(tempDir, 'backup.zip')
    await createZipFromDirectory(payloadDir, zipPath)

    const parser = new RikkahubParser()
    const detected = await parser.detect({ path: zipPath })
    assert.equal(detected, true)

    const bundle = await parser.parse({ path: zipPath })
    CoreBundleSchema.parse(bundle)

    assert.equal(bundle.conversations.length, 1)
    assert.equal(bundle.conversations[0].title, 'Rikkahub Topic')
    assert.equal(bundle.conversations[0].messages.length, 2)
    assert.equal(bundle.conversations[0].branches?.length, 1)
    assert.equal((bundle.conversations[0].branchPoints?.length ?? 0) >= 2, true)
    assert.equal(bundle.providers.length, 1)
    assert.equal(bundle.providers[0].apiKey, undefined)

    const withSecrets = await parser.parse({ path: zipPath }, { includeSecrets: true })
    assert.equal(withSecrets.providers[0].apiKey, 'sk-rikka')
  } finally {
    await removeDir(tempDir)
  }
})
