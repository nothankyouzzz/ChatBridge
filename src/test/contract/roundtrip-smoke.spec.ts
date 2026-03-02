import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { ChatboxGenerator } from '../../adapters/chatbox/generator.ts'
import { CherryGenerator } from '../../adapters/cherry/generator.ts'
import { CherryParser } from '../../adapters/cherry/parser.ts'
import { RikkahubGenerator } from '../../adapters/rikkahub/generator.ts'
import { RikkahubParser } from '../../adapters/rikkahub/parser.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'

const chatboxFixture = path.resolve('src/test/fixtures/chatbox/minimal-backup.json')

test('roundtrip smoke: chatbox -> core -> chatbox', async () => {
  const tempDir = await createTempDir('chatbridge-test-roundtrip-chatbox-')

  try {
    const parser = new ChatboxParser()
    const generator = new ChatboxGenerator()

    const bundle = await parser.parse({ path: chatboxFixture }, { includeSecrets: true })
    const outPath = path.join(tempDir, 'chatbox-output.json')
    await generator.generate(bundle, { path: outPath }, { includeSecrets: true })

    const reparsed = await parser.parse({ path: outPath }, { includeSecrets: true })
    assert.equal(reparsed.conversations.length, bundle.conversations.length)
    assert.equal(reparsed.providers.length, bundle.providers.length)
    assert.equal(typeof reparsed.extensions, 'object')
  } finally {
    await removeDir(tempDir)
  }
})

test('roundtrip smoke: chatbox -> core -> cherry zip -> core', async () => {
  const tempDir = await createTempDir('chatbridge-test-roundtrip-cherry-')

  try {
    const sourceParser = new ChatboxParser()
    const targetGenerator = new CherryGenerator()
    const targetParser = new CherryParser()

    const bundle = await sourceParser.parse({ path: chatboxFixture }, { includeSecrets: false })
    const outPath = path.join(tempDir, 'cherry-output.zip')

    await targetGenerator.generate(bundle, { path: outPath }, { includeSecrets: false })
    const parsed = await targetParser.parse({ path: outPath })

    assert.equal(parsed.conversations.length, bundle.conversations.length)
    assert.equal(parsed.providers.length, bundle.providers.length)
    assert.equal(typeof parsed.extensions, 'object')
  } finally {
    await removeDir(tempDir)
  }
})

test('roundtrip smoke: chatbox -> core -> rikkahub zip -> core', async () => {
  const tempDir = await createTempDir('chatbridge-test-roundtrip-rikkahub-')

  try {
    const sourceParser = new ChatboxParser()
    const targetGenerator = new RikkahubGenerator()
    const targetParser = new RikkahubParser()

    const bundle = await sourceParser.parse({ path: chatboxFixture }, { includeSecrets: false })
    const outPath = path.join(tempDir, 'rikkahub-output.zip')

    await targetGenerator.generate(bundle, { path: outPath }, { includeSecrets: false })
    const parsed = await targetParser.parse({ path: outPath })

    assert.equal(parsed.conversations.length, bundle.conversations.length)
    assert.equal(parsed.providers.length, bundle.providers.length)
    assert.equal((parsed.conversations[0].branchPoints?.length ?? 0) > 0, true)
  } finally {
    await removeDir(tempDir)
  }
})
