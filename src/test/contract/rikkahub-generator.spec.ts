import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { CoreBundle } from '../../core/schema/core.types.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { extractZipEntryToFile, listZipEntries, readZipTextEntry } from '../../io/zip.ts'
import { RikkahubGenerator } from '../../adapters/rikkahub/generator.ts'
import { RikkahubParser } from '../../adapters/rikkahub/parser.ts'
import {
  readRikkahubConversations,
  readRikkahubMessageNodes,
  readSchemaVersion,
} from '../../adapters/rikkahub/sqlite.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function buildCoreBundle(): CoreBundle {
  return {
    specVersion: '1.0',
    exportedAt: '2026-03-02T10:00:00.000Z',
    conversations: [
      {
        id: 'chatbox-session-1',
        title: 'Rikkahub Export Topic',
        assistantId: 'assistant-alpha',
        pinned: true,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:02:00.000Z',
        messages: [
          {
            id: 'msg-user-1',
            role: 'user',
            createdAt: '2026-03-02T10:00:01.000Z',
            parts: [{ type: 'text', text: 'Hello from Core' }],
            model: {
              providerId: 'openai-main',
              modelId: 'gpt-4o-mini',
              displayName: 'GPT-4o mini',
            },
          },
          {
            id: 'msg-assistant-1',
            role: 'assistant',
            createdAt: '2026-03-02T10:00:02.000Z',
            finishedAt: '2026-03-02T10:00:04.000Z',
            parts: [
              { type: 'reasoning', text: 'thinking' },
              { type: 'text', text: 'Hi there' },
              { type: 'tool_call', toolName: 'web_search', args: { q: 'chatbridge' }, callId: 'tool-1' },
              {
                type: 'tool_result',
                toolName: 'web_search',
                result: [{ type: 'text', text: 'search result text' }],
                callId: 'tool-1',
              },
            ],
            usage: {
              promptTokens: 12,
              completionTokens: 34,
              totalTokens: 46,
            },
            model: {
              providerId: 'openai-main',
              modelId: 'gpt-4o-mini',
              displayName: 'GPT-4o mini',
            },
          },
        ],
        extensions: {
          truncateIndex: -1,
          suggestions: ['keep going'],
        },
      },
    ],
    providers: [
      {
        id: 'openai-main',
        type: 'openai',
        name: 'OpenAI Main',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-phase2-test',
        models: [{ id: 'gpt-4o-mini', name: 'GPT-4o mini', type: 'chat' }],
      },
    ],
    source: {
      platform: 'chatbox',
      version: 'test',
    },
  }
}

test('RikkahubGenerator exports valid backup zip and parser can read it', async () => {
  const tempDir = await createTempDir('chatbridge-test-rikkahub-generator-')

  try {
    const bundle = buildCoreBundle()
    const generator = new RikkahubGenerator()
    const parser = new RikkahubParser()

    const zipPath = path.join(tempDir, 'rikka-backup.zip')
    const artifacts = await generator.generate(bundle, { path: zipPath }, { includeSecrets: false })

    assert.equal(artifacts.length, 1)
    assert.equal(artifacts[0].path, zipPath)

    const entries = await listZipEntries(zipPath)
    assert.equal(entries.includes('settings.json'), true)
    assert.equal(entries.includes('rikka_hub.db'), true)

    const settingsJson = await readZipTextEntry(zipPath, 'settings.json')
    const settings = JSON.parse(settingsJson) as Record<string, unknown>
    const searchServices = settings.searchServices

    assert.equal(Array.isArray(searchServices), true)
    assert.equal((searchServices as unknown[]).length > 0, true)

    const providers = settings.providers as Array<Record<string, unknown>>
    assert.equal(Array.isArray(providers), true)
    assert.equal(providers.length, 1)
    assert.equal(providers[0].apiKey, '')

    const extractedDbPath = path.join(tempDir, 'extracted.db')
    await extractZipEntryToFile(zipPath, 'rikka_hub.db', extractedDbPath)

    const schemaVersion = readSchemaVersion(extractedDbPath)
    assert.equal(schemaVersion, 16)

    const rows = readRikkahubConversations(extractedDbPath)
    const nodes = readRikkahubMessageNodes(extractedDbPath)

    assert.equal(rows.length, 1)
    assert.equal(nodes.length, 2)
    assert.equal(UUID_RE.test(rows[0].id), true)
    assert.equal(UUID_RE.test(rows[0].assistant_id), true)
    assert.equal(rows[0].title, 'Rikkahub Export Topic')

    const parsed = await parser.parse({ path: zipPath })
    assert.equal(parsed.conversations.length, 1)
    assert.equal(parsed.conversations[0].title, 'Rikkahub Export Topic')
    assert.equal(parsed.providers.length, 1)
    assert.equal(parsed.providers[0].apiKey, undefined)

    const zipPathWithSecrets = path.join(tempDir, 'rikka-backup-with-secrets.zip')
    await generator.generate(bundle, { path: zipPathWithSecrets }, { includeSecrets: true })

    const parsedWithSecrets = await parser.parse({ path: zipPathWithSecrets }, { includeSecrets: true })
    assert.equal(parsedWithSecrets.providers.length, 1)
    assert.equal(parsedWithSecrets.providers[0].apiKey, 'sk-phase2-test')
  } finally {
    await removeDir(tempDir)
  }
})
