import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import fs from 'node:fs/promises'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { ChatboxGenerator } from '../../adapters/chatbox/generator.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'

const fixturePath = path.resolve('src/test/fixtures/chatbox/minimal-backup.json')

test('determinism: fixed timestamp yields stable chatbox output', async () => {
  const tempDir = await createTempDir('chatbridge-test-determinism-')

  try {
    const parser = new ChatboxParser()
    const generator = new ChatboxGenerator()

    const bundle = await parser.parse({ path: fixturePath }, { includeSecrets: true })

    const now = new Date('2026-03-02T12:00:00.000Z')
    const outA = path.join(tempDir, 'out-a.json')
    const outB = path.join(tempDir, 'out-b.json')

    await generator.generate(bundle, { path: outA }, { includeSecrets: true, now })
    await generator.generate(bundle, { path: outB }, { includeSecrets: true, now })

    const textA = await fs.readFile(outA, 'utf8')
    const textB = await fs.readFile(outB, 'utf8')
    assert.equal(textA, textB)
  } finally {
    await removeDir(tempDir)
  }
})
