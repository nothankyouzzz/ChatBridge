import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { readPlatformPassthrough } from '../../core/extensions/passthrough.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { createZipFromDirectory } from '../../io/zip.ts'
import { CherryParser } from '../../adapters/cherry/parser.ts'
import { CherryGenerator } from '../../adapters/cherry/generator.ts'
import { ChatboxGenerator } from '../../adapters/chatbox/generator.ts'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'

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
              uiColorTag: 'amber',
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
          customProviderFlag: 'keep-me',
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

test('extensions passthrough survives cherry -> chatbox -> cherry', async () => {
  const tempDir = await createTempDir('chatbridge-test-extensions-cross-')

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
                uiState: {
                  folded: true,
                },
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
        ],
      },
    }

    await fs.writeFile(path.join(payloadDir, 'data.json'), JSON.stringify(backupData), 'utf8')
    await fs.mkdir(path.join(payloadDir, 'Data'), { recursive: true })

    const sourceZip = path.join(tempDir, 'source.zip')
    await createZipFromDirectory(payloadDir, sourceZip)

    const cherryParser = new CherryParser()
    const cherryGenerator = new CherryGenerator()
    const chatboxGenerator = new ChatboxGenerator()
    const chatboxParser = new ChatboxParser()

    const bundle = await cherryParser.parse({ path: sourceZip }, { includeSecrets: true })

    const chatboxPath = path.join(tempDir, 'mid-chatbox.json')
    await chatboxGenerator.generate(bundle, { path: chatboxPath }, { includeSecrets: true, preservePrivateState: true })

    const midBundle = await chatboxParser.parse({ path: chatboxPath }, { includeSecrets: true })

    const finalZip = path.join(tempDir, 'final-cherry.zip')
    await cherryGenerator.generate(midBundle, { path: finalZip }, { includeSecrets: true, preservePrivateState: true })

    const finalBundle = await cherryParser.parse({ path: finalZip }, { includeSecrets: true })

    const finalConversation = finalBundle.conversations[0]
    const finalMessage = finalConversation.messages[0]
    const finalProvider = finalBundle.providers[0]

    const conversationPassthrough = readPlatformPassthrough(finalConversation.extensions, 'cherry') as Record<string, unknown>
    const messagePassthrough = readPlatformPassthrough(finalMessage.extensions, 'cherry') as Record<string, unknown>
    const providerPassthrough = readPlatformPassthrough(finalProvider.extensions, 'cherry') as Record<string, unknown>

    assert.equal(JSON.stringify(conversationPassthrough).includes('uiColorTag'), true)
    assert.equal(JSON.stringify(conversationPassthrough).includes('amber'), true)
    assert.equal((messagePassthrough.uiState as Record<string, unknown>).folded, true)
    assert.equal(providerPassthrough.customProviderFlag, 'keep-me')
  } finally {
    await removeDir(tempDir)
  }
})
