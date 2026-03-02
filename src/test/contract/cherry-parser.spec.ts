import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { CherryParser } from '../../adapters/cherry/parser.ts'
import { CoreBundleSchema } from '../../core/schema/core.zod.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { createZipFromDirectory } from '../../io/zip.ts'

function buildPersistState(): string {
  const persist = {
    assistants: JSON.stringify({
      defaultAssistant: {
        id: 'assistant-1',
        name: 'Default',
        prompt: '',
        type: 'assistant',
        topics: [],
      },
      assistants: [
        {
          id: 'assistant-1',
          name: 'Default',
          prompt: '',
          type: 'assistant',
          topics: [
            {
              id: 'topic-1',
              name: 'Cherry Topic',
              assistantId: 'assistant-1',
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:05:00.000Z',
              pinned: true,
            },
          ],
        },
      ],
      tagsOrder: [],
      collapsedTags: {},
      presets: [],
      unifiedListOrder: [],
    }),
    llm: JSON.stringify({
      providers: [
        {
          id: 'openai',
          type: 'openai',
          name: 'OpenAI',
          apiKey: 'sk-test',
          apiHost: 'https://api.openai.com/v1',
          enabled: true,
          models: [
            {
              id: 'gpt-4o-mini',
              provider: 'openai',
              name: 'GPT-4o mini',
              group: 'chat',
            },
          ],
        },
      ],
      defaultModel: {
        id: 'gpt-4o-mini',
        provider: 'openai',
        name: 'GPT-4o mini',
        group: 'chat',
      },
      topicNamingModel: {
        id: 'gpt-4o-mini',
        provider: 'openai',
        name: 'GPT-4o mini',
        group: 'chat',
      },
      quickModel: {
        id: 'gpt-4o-mini',
        provider: 'openai',
        name: 'GPT-4o mini',
        group: 'chat',
      },
      translateModel: {
        id: 'gpt-4o-mini',
        provider: 'openai',
        name: 'GPT-4o mini',
        group: 'chat',
      },
      quickAssistantId: '',
      settings: {},
    }),
    settings: JSON.stringify({}),
    _persist: JSON.stringify({ version: 199, rehydrated: true }),
  }

  return JSON.stringify(persist)
}

test('CherryParser parses backup zip to CoreBundle', async () => {
  const tempDir = await createTempDir('chatbridge-test-cherry-')

  try {
    const payloadDir = path.join(tempDir, 'payload')
    await fs.mkdir(payloadDir, { recursive: true })

    const backupData = {
      time: Date.parse('2026-03-01T00:10:00.000Z'),
      version: 5,
      localStorage: {
        'persist:cherry-studio': buildPersistState(),
      },
      indexedDB: {
        topics: [
          {
            id: 'topic-1',
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                assistantId: 'assistant-1',
                topicId: 'topic-1',
                createdAt: '2026-03-01T00:01:00.000Z',
                status: 'success',
                blocks: ['block-1'],
              },
              {
                id: 'msg-2',
                role: 'assistant',
                assistantId: 'assistant-1',
                topicId: 'topic-1',
                modelId: 'gpt-4o-mini',
                createdAt: '2026-03-01T00:02:00.000Z',
                status: 'success',
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 20,
                  total_tokens: 30,
                },
                blocks: ['block-2'],
              },
            ],
          },
        ],
        message_blocks: [
          {
            id: 'block-1',
            messageId: 'msg-1',
            type: 'main_text',
            content: 'Hi',
            createdAt: '2026-03-01T00:01:00.000Z',
            status: 'success',
          },
          {
            id: 'block-2',
            messageId: 'msg-2',
            type: 'main_text',
            content: 'Hello back',
            createdAt: '2026-03-01T00:02:00.000Z',
            status: 'success',
          },
        ],
      },
    }

    await fs.writeFile(path.join(payloadDir, 'data.json'), JSON.stringify(backupData), 'utf8')
    await fs.mkdir(path.join(payloadDir, 'Data'), { recursive: true })

    const zipPath = path.join(tempDir, 'backup.zip')
    await createZipFromDirectory(payloadDir, zipPath)

    const parser = new CherryParser()
    const detected = await parser.detect({ path: zipPath })
    assert.equal(detected, true)

    const bundle = await parser.parse({ path: zipPath })
    CoreBundleSchema.parse(bundle)

    assert.equal(bundle.conversations.length, 1)
    assert.equal(bundle.conversations[0].title, 'Cherry Topic')
    assert.equal(bundle.conversations[0].messages.length, 2)
    assert.equal(bundle.providers.length, 1)
    assert.equal(bundle.providers[0].apiKey, undefined)

    const bundleWithSecrets = await parser.parse({ path: zipPath }, { includeSecrets: true })
    assert.equal(bundleWithSecrets.providers[0].apiKey, 'sk-test')
  } finally {
    await removeDir(tempDir)
  }
})
