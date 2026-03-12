# TEST

Contract tests using Node's native test runner. No test framework — just `node:test` + `node:assert/strict`.

## STRUCTURE

```
test/
├── contract/          # One spec per platform/feature — *.spec.ts
└── fixtures/
    ├── chatbox/       # Minimal JSON backup fixtures
    ├── cherry/        # ZIP backup fixtures
    └── rikkahub/      # SQLite backup fixtures
```

## CONTRACT TEST PATTERN

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { XxxParser } from '../../adapters/xxx/parser.ts'
import { CoreBundleSchema } from '../../core/schema/core.zod.ts'

test('XxxParser parses to valid CoreBundle', async () => {
  const bundle = await new XxxParser().parse({ path: fixturePath })
  CoreBundleSchema.parse(bundle) // MANDATORY — validates every field
  assert.equal(bundle.specVersion, '1.0')
  // ...
})
```

## MANDATORY RULES

- **Every parse test MUST call `CoreBundleSchema.parse(bundle)`** — this is the contract; skipping it defeats validation
- Fixtures are **minimal** — just enough fields to cover all code paths; avoid large real-world backups
- Run with `--test-concurrency=1` — SQLite tests need sequential execution (file locking)
- Test file naming: `{platform}-{feature}.spec.ts` (e.g., `chatbox-branches-roundtrip.spec.ts`)

## ANTI-PATTERNS

- Never mock `CoreBundleSchema` — it must validate real output
- Never add test helpers that bypass schema validation
- Never use `any` in test assertions — be explicit about expected types
- Fixture paths are relative to cwd (`path.resolve('src/test/fixtures/...')`) — tests must run from project root
