import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { CoreBundleSchema } from '../../core/schema/core.zod.ts'

const fixturePath = path.resolve('src/test/fixtures/chatbox/minimal-backup.json')

test('ChatboxParser detects fixture file', async () => {
  const parser = new ChatboxParser()
  const detected = await parser.detect({ path: fixturePath })
  assert.equal(detected, true)
})

test('ChatboxParser parses to valid CoreBundle and strips secrets by default', async () => {
  const parser = new ChatboxParser()
  const bundle = await parser.parse({ path: fixturePath })

  CoreBundleSchema.parse(bundle)

  assert.equal(bundle.specVersion, '1.0')
  assert.equal(bundle.conversations.length, 1)
  assert.equal(bundle.conversations[0].messages.length, 2)
  assert.equal(bundle.providers.length, 1)
  assert.equal(bundle.providers[0].id, 'openai')
  assert.equal(bundle.providers[0].apiKey, undefined)

  const assistantMessage = bundle.conversations[0].messages[1]
  assert.equal(assistantMessage.role, 'assistant')
  assert.equal(assistantMessage.model?.modelId, 'gpt-4o-mini')
  assert.equal(assistantMessage.usage?.totalTokens, 46)
})

test('ChatboxParser includes provider secrets when includeSecrets is true', async () => {
  const parser = new ChatboxParser()
  const bundle = await parser.parse({ path: fixturePath }, { includeSecrets: true })

  assert.equal(bundle.providers[0].apiKey, 'sk-test')
})
