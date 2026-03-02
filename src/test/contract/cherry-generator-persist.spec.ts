import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { ChatboxParser } from '../../adapters/chatbox/parser.ts'
import { CherryGenerator } from '../../adapters/cherry/generator.ts'
import { createTempDir, removeDir } from '../../io/fs.ts'
import { readZipTextEntry } from '../../io/zip.ts'

const chatboxFixture = path.resolve('src/test/fixtures/chatbox/minimal-backup.json')

test('CherryGenerator emits a safe persist payload for non-Cherry sources', async () => {
  const tempDir = await createTempDir('chatbridge-test-cherry-persist-')

  try {
    const sourceParser = new ChatboxParser()
    const targetGenerator = new CherryGenerator()

    const bundle = await sourceParser.parse({ path: chatboxFixture }, { includeSecrets: false })
    const outPath = path.join(tempDir, 'cherry-output.zip')

    await targetGenerator.generate(bundle, { path: outPath }, { includeSecrets: false })

    const backupDataText = await readZipTextEntry(outPath, 'data.json')
    const backupData = JSON.parse(backupDataText) as Record<string, unknown>
    const localStorage =
      backupData.localStorage && typeof backupData.localStorage === 'object'
        ? (backupData.localStorage as Record<string, unknown>)
        : {}
    const rawPersist = localStorage['persist:cherry-studio']
    assert.equal(typeof rawPersist, 'string')

    const persist = JSON.parse(String(rawPersist)) as Record<string, unknown>
    assert.equal(typeof persist.assistants, 'string')
    assert.equal(typeof persist.llm, 'string')
    assert.equal(typeof persist._persist, 'string')
    assert.equal('settings' in persist, false)
  } finally {
    await removeDir(tempDir)
  }
})
