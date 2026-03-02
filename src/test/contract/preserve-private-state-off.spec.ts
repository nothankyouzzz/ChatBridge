import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { ChatboxGenerator } from '../../adapters/chatbox/generator.ts'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { CherryGenerator } from '../../adapters/cherry/generator.ts'
import { RikkahubGenerator } from '../../adapters/rikkahub/generator.ts'
import { readRikkahubConversations, readRikkahubMessageNodes } from '../../adapters/rikkahub/sqlite.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { extractZipEntryToFile, readZipTextEntry } from '../../io/zip.ts'

const chatboxFixture = path.resolve('src/test/fixtures/chatbox/minimal-backup.json')
const TRANSPORT_KEY = '__chatbridge_extensions'

test('preservePrivateState=false does not emit transport extensions in generated artifacts', async () => {
  const tempDir = await createTempDir('chatbridge-test-preserve-private-state-off-')

  try {
    const parser = new ChatboxParser()
    const bundle = await parser.parse({ path: chatboxFixture }, { includeSecrets: true })

    const chatboxPath = path.join(tempDir, 'chatbox.json')
    const cherryPath = path.join(tempDir, 'cherry.zip')
    const rikkahubPath = path.join(tempDir, 'rikkahub.zip')

    await new ChatboxGenerator().generate(
      bundle,
      { path: chatboxPath },
      { includeSecrets: true, preservePrivateState: false }
    )
    await new CherryGenerator().generate(
      bundle,
      { path: cherryPath },
      { includeSecrets: true, preservePrivateState: false }
    )
    await new RikkahubGenerator().generate(
      bundle,
      { path: rikkahubPath },
      { includeSecrets: true, preservePrivateState: false }
    )

    const chatboxText = await fs.readFile(chatboxPath, 'utf8')
    assert.equal(chatboxText.includes(TRANSPORT_KEY), false)

    const cherryDataText = await readZipTextEntry(cherryPath, 'data.json')
    assert.equal(cherryDataText.includes(TRANSPORT_KEY), false)

    const settingsText = await readZipTextEntry(rikkahubPath, 'settings.json')
    assert.equal(settingsText.includes(TRANSPORT_KEY), false)

    const dbPath = path.join(tempDir, 'rikkahub.db')
    await extractZipEntryToFile(rikkahubPath, 'rikka_hub.db', dbPath)

    const rows = readRikkahubConversations(dbPath)
    const nodes = readRikkahubMessageNodes(dbPath)
    assert.equal(rows.some((row) => row.nodes.includes(TRANSPORT_KEY) || row.suggestions.includes(TRANSPORT_KEY)), false)
    assert.equal(nodes.some((row) => row.messages.includes(TRANSPORT_KEY)), false)
  } finally {
    await removeDir(tempDir)
  }
})
