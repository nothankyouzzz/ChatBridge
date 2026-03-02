import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { createTempDir, removeDir, writeText } from '../../io/fs.ts'

test('ChatboxParser handles large backup when stream threshold is enabled', async () => {
  const tempDir = await createTempDir('chatbridge-test-large-stream-')

  try {
    const inputPath = path.join(tempDir, 'large-chatbox.json')
    const hugeText = 'A'.repeat(2 * 1024 * 1024)

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
      'chat-sessions-list': [{ id: 'session-1', name: 'Large Topic', starred: false }],
      'session:session-1': {
        id: 'session-1',
        name: 'Large Topic',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            timestamp: 1709251200000,
            contentParts: [{ type: 'text', text: hugeText }],
          },
        ],
      },
      __exported_items: ['setting', 'conversations'],
      __exported_at: '2026-03-02T10:00:00.000Z',
    }

    await writeText(inputPath, `${JSON.stringify(payload)}\n`)

    const parser = new ChatboxParser()
    const bundle = await parser.parse({ path: inputPath }, { streamThresholdMb: 1 })

    assert.equal(bundle.conversations.length, 1)
    assert.equal(bundle.conversations[0].messages.length, 1)
    const textPart = bundle.conversations[0].messages[0].parts[0]
    assert.equal(textPart.type, 'text')
    assert.equal((textPart as { text: string }).text.length, hugeText.length)
  } finally {
    await removeDir(tempDir)
  }
})
