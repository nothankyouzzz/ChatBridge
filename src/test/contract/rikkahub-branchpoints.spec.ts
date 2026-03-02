import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { CoreBundle } from '../../core/schema/core.types.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { extractZipEntryToFile } from '../../io/zip.ts'
import { RikkahubGenerator } from '../../adapters/rikkahub/generator.ts'
import { RikkahubParser } from '../../adapters/rikkahub/parser.ts'
import { readRikkahubMessageNodes } from '../../adapters/rikkahub/sqlite.ts'

function buildBundle(): CoreBundle {
  return {
    specVersion: '1.0',
    exportedAt: '2026-03-02T10:00:00.000Z',
    conversations: [
      {
        id: 'conv-branch-slot',
        title: 'Slot Branch Topic',
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:02:00.000Z',
        messages: [
          {
            id: 'msg-user-1',
            role: 'user',
            createdAt: '2026-03-02T10:00:01.000Z',
            parts: [{ type: 'text', text: 'question' }],
          },
          {
            id: 'msg-assistant-b',
            role: 'assistant',
            createdAt: '2026-03-02T10:00:05.000Z',
            parts: [{ type: 'text', text: 'answer-b' }],
          },
        ],
        branchPoints: [
          {
            id: 'node-2',
            mode: 'slot',
            anchorMessageId: 'msg-user-1',
            selectedVariantIndex: 1,
            variants: [
              {
                id: 'variant-a',
                messages: [
                  {
                    id: 'msg-assistant-a',
                    role: 'assistant',
                    createdAt: '2026-03-02T10:00:03.000Z',
                    parts: [{ type: 'text', text: 'answer-a' }],
                  },
                ],
              },
              {
                id: 'variant-b',
                messages: [
                  {
                    id: 'msg-assistant-b',
                    role: 'assistant',
                    createdAt: '2026-03-02T10:00:05.000Z',
                    parts: [{ type: 'text', text: 'answer-b' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    providers: [
      {
        id: 'openai-main',
        type: 'openai',
        name: 'OpenAI',
        models: [{ id: 'gpt-4o-mini', name: 'GPT-4o mini', type: 'chat' }],
      },
    ],
  }
}

test('RikkahubGenerator consumes branchPoints(slot) and parser restores them', async () => {
  const tempDir = await createTempDir('chatbridge-test-rikkahub-branchpoints-')

  try {
    const generator = new RikkahubGenerator()
    const parser = new RikkahubParser()
    const bundle = buildBundle()

    const zipPath = path.join(tempDir, 'backup.zip')
    await generator.generate(bundle, { path: zipPath }, { includeSecrets: false })

    const extractedDb = path.join(tempDir, 'rikka_hub.db')
    await extractZipEntryToFile(zipPath, 'rikka_hub.db', extractedDb)

    const nodes = readRikkahubMessageNodes(extractedDb)
    assert.equal(nodes.length, 2)

    const assistantNode = nodes.find((node) => node.node_index === 1)
    assert.ok(assistantNode)
    const variants = JSON.parse(assistantNode.messages) as unknown[]
    assert.equal(Array.isArray(variants), true)
    assert.equal(variants.length, 2)
    assert.equal(assistantNode.select_index, 1)

    const parsed = await parser.parse({ path: zipPath })
    const conversation = parsed.conversations[0]
    const points = conversation.branchPoints ?? []

    assert.equal(points.length >= 2, true)
    const slotPoint = points.find((point) => point.mode === 'slot' && point.variants.length > 1)
    assert.ok(slotPoint)
    assert.equal(slotPoint.selectedVariantIndex, 1)
    assert.equal(slotPoint.variants.length, 2)
    const selected = conversation.messages[1]
    assert.equal(selected.role, 'assistant')
    assert.equal(selected.parts[0].type, 'text')
    assert.equal((selected.parts[0] as { text: string }).text, 'answer-b')
  } finally {
    await removeDir(tempDir)
  }
})
