import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { ChatboxGenerator } from '../../adapters/chatbox/generator.ts'
import { createTempDir, removeDir, writeText } from '../../io/fs.ts'
import { readJsonFile } from '../../io/json.ts'

test('chatbox branchPoints roundtrip keeps messageForksHash', async () => {
  const tempDir = await createTempDir('chatbridge-test-chatbox-branches-')

  try {
    const inputPath = path.join(tempDir, 'input.json')
    const outputPath = path.join(tempDir, 'output.json')

    const payload = {
      settings: {
        providers: {
          openai: {
            apiKey: 'sk-test',
            apiHost: 'https://api.openai.com/v1',
            models: [{ modelId: 'gpt-4o-mini', nickname: 'GPT-4o mini', type: 'chat' }],
          },
        },
      },
      'chat-sessions-list': [{ id: 'session-1', name: 'Fork Topic', starred: false }],
      'session:session-1': {
        id: 'session-1',
        name: 'Fork Topic',
        messages: [
          {
            id: 'msg-user-1',
            role: 'user',
            contentParts: [{ type: 'text', text: 'question' }],
            timestamp: 1709251200000,
          },
          {
            id: 'msg-assistant-b',
            role: 'assistant',
            contentParts: [{ type: 'text', text: 'answer-b' }],
            timestamp: 1709251205000,
          },
          {
            id: 'msg-user-b2',
            role: 'user',
            contentParts: [{ type: 'text', text: 'follow-b' }],
            timestamp: 1709251210000,
          },
        ],
        messageForksHash: {
          'msg-user-1': {
            position: 1,
            createdAt: 1709251202000,
            lists: [
              {
                id: 'fork-a',
                messages: [
                  {
                    id: 'msg-assistant-a',
                    role: 'assistant',
                    contentParts: [{ type: 'text', text: 'answer-a' }],
                    timestamp: 1709251203000,
                  },
                  {
                    id: 'msg-user-a2',
                    role: 'user',
                    contentParts: [{ type: 'text', text: 'follow-a' }],
                    timestamp: 1709251203500,
                  },
                ],
              },
              {
                id: 'fork-b',
                messages: [
                  {
                    id: 'msg-assistant-b',
                    role: 'assistant',
                    contentParts: [{ type: 'text', text: 'answer-b' }],
                    timestamp: 1709251205000,
                  },
                  {
                    id: 'msg-user-b2',
                    role: 'user',
                    contentParts: [{ type: 'text', text: 'follow-b' }],
                    timestamp: 1709251210000,
                  },
                ],
              },
            ],
          },
        },
      },
      __exported_items: ['setting', 'conversations'],
      __exported_at: '2026-03-02T10:00:00.000Z',
    }

    await writeText(inputPath, `${JSON.stringify(payload, null, 2)}\n`)

    const parser = new ChatboxParser()
    const generator = new ChatboxGenerator()

    const bundle = await parser.parse({ path: inputPath }, { includeSecrets: true })
    assert.equal(bundle.conversations.length, 1)

    const branchPoints = bundle.conversations[0].branchPoints ?? []
    assert.equal(branchPoints.length, 1)
    assert.equal(branchPoints[0].mode, 'tail')
    assert.equal(branchPoints[0].selectedVariantIndex, 1)
    assert.equal(branchPoints[0].variants.length, 2)
    assert.equal(branchPoints[0].variants[0].messages.length, 2)

    await generator.generate(bundle, { path: outputPath }, { includeSecrets: true })

    const generated = await readJsonFile<Record<string, unknown>>(outputPath)
    const generatedSession = generated['session:session-1'] as Record<string, unknown>
    const generatedForks = generatedSession.messageForksHash as Record<string, unknown>
    const forkEntry = generatedForks['msg-user-1'] as Record<string, unknown>
    const lists = forkEntry.lists as unknown[]

    assert.equal(Array.isArray(lists), true)
    assert.equal(lists.length, 2)
    assert.equal(forkEntry.position, 1)

    const reparsed = await parser.parse({ path: outputPath }, { includeSecrets: true })
    const reparsedPoints = reparsed.conversations[0].branchPoints ?? []
    assert.equal(reparsedPoints.length, 1)
    assert.equal(reparsedPoints[0].variants.length, 2)
    assert.equal(reparsedPoints[0].selectedVariantIndex, 1)
  } finally {
    await removeDir(tempDir)
  }
})
