# I/O

File I/O layer. Each file handles one format; no business logic here.

## FILES

| File        | Purpose                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `fs.ts`     | `readText()`, `writeText()` — basic UTF-8 file read/write                                                               |
| `json.ts`   | `readJsonFile()` — switches to stream path above threshold; `writeJsonFile()` — pretty by default                       |
| `sqlite.ts` | `queryAll()`, `runStatements()` — thin wrappers over Node 25 built-in `node:sqlite`; each call opens+closes DB          |
| `zip.ts`    | `listZipEntries()`, `readZipTextEntry()`, `readZipBinaryEntry()`, `extractZipEntryToFile()`, `createZipFromDirectory()` |

## NOTES

- `json.ts` imports `stream-json` with `@ts-expect-error` (no type declarations) — this is the **only** acceptable use of `@ts-expect-error` in the project
- `sqlite.ts` uses `node:sqlite` — Node >= 25 only; not available in earlier Node versions
- ZIP paths are normalized to forward-slash, no-leading-dot form (`normalizeEntryName` in zip.ts)
- `readJsonFile()` takes `streamThresholdBytes` (bytes), but CLI flag is `--stream-threshold-mb` (MB) — conversion happens in adapter/command layer

## ANTI-PATTERNS

- Never put platform-specific parsing in `io/` — adapters own that logic
- Never keep SQLite connections open — `queryAll`/`runStatements` always `db.close()` in `finally`
- Never use `stream-json` outside `json.ts`
