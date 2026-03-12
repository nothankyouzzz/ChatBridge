# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-04  
**Commit:** 8c8905d  
**Branch:** main

## OVERVIEW

ChatBridge is a Node.js CLI tool that converts AI chatbox backup files between three platforms: **Chatbox**, **Cherry Studio**, and **Rikkahub**. Stack: TypeScript executed natively via `--experimental-strip-types` (no build step), `commander` for CLI, `zod` for schema validation.

## STRUCTURE

```
ChatBridge/
├── bin/chatbridge.js      # Thin launcher: spawns node --experimental-strip-types src/cli/index.ts
├── src/
│   ├── cli/               # Commander-based CLI (inspect/convert commands)
│   ├── adapters/          # Platform parsers + generators + registry
│   ├── core/              # CoreBundle schema, normalization, extensions
│   ├── io/                # File I/O: JSON (streaming), SQLite, ZIP, fs
│   └── test/              # Node native test runner; contract tests + fixtures
├── references/            # READ-ONLY source snapshots of upstream apps (Chatbox, Cherry, Rikkahub)
└── docs/CLI.md            # CLI flag reference
```

## WHERE TO LOOK

| Task                        | Location                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| Add new platform support    | `src/adapters/{platform}/` + register in `src/adapters/index.ts` |
| CoreBundle schema change    | `src/core/schema/core.types.ts` + `src/core/schema/core.zod.ts`  |
| CLI flag changes            | `src/cli/index.ts` + `src/cli/commands/`                         |
| Provider type mapping       | `src/core/mapping/provider-map.ts`                               |
| Role normalization          | `src/core/normalize/role.ts`                                     |
| Passthrough / extensions    | `src/core/extensions/passthrough.ts`                             |
| I/O utilities               | `src/io/`                                                        |
| Contract tests              | `src/test/contract/*.spec.ts`                                    |
| Reference platform behavior | `references/{platform}/` (read-only)                             |

## CORE DATA FLOW

```
Input file (.json/.zip)
  → SourceParser.detect() — auto-detect platform (chatbox → cherry → rikkahub order)
  → SourceParser.parse()  — platform data → CoreBundle
  → TargetGenerator.generate() — CoreBundle → platform-specific artifacts
  → output file(s)
```

**CoreBundle** (universal format):

- `specVersion: '1.0'`, `exportedAt`, `conversations[]`, `providers[]`
- `CoreConversation`: has `messages[]` (active path) + `branchPoints[]` (tree, Phase 3) + `branches[]` (legacy)
- `CoreBranchPoint`: `mode: 'tail' | 'slot'` — tail=Chatbox-style fork, slot=Rikkahub per-node candidate
- `CoreMessage`: `id, role, parts[]` — parts are discriminated union (text, image, tool_call, etc.)
- `CoreProvider`: `id, type, apiKey?` — secrets opt-in via `ParseOptions.includeSecrets`
- `extensions?: Record<string, unknown>` on every entity — platform-specific passthrough

## ADAPTER REGISTRY

Adapters are manually registered as arrays in `src/adapters/index.ts`:

```ts
const sourceParsers: SourceParser[] = [new ChatboxParser(), new CherryParser(), new RikkahubParser()]
const targetGenerators: TargetGenerator[] = [new ChatboxGenerator(), new CherryGenerator(), new RikkahubGenerator()]
```

Auto-detection runs in **deterministic order**: chatbox → cherry → rikkahub.

## CONVENTIONS

- **No build step** — all imports use `.ts` extensions (`import ... from './foo.ts'`)
- **Type-only imports** — use `import type` for pure type imports
- **Prettier**: no semi, singleQuote, trailingComma all, printWidth 120, tabWidth 2
- **`.prettierignore`** excludes JSON files (fixtures + npm-managed) — do not format JSON manually
- **Unused vars** must be prefixed with `_` (ESLint warning, not error)
- **Zod parallel types** — `core.types.ts` (TypeScript interfaces) + `core.zod.ts` (runtime validators); keep in sync
- **`extensions` fields** — every CoreBundle entity has `extensions?: Record<string, unknown>` for lossless passthrough
- **Secrets opt-in** — API keys stripped by default; `ParseOptions.includeSecrets = true` to include
- `stream-json` has no type declarations → `@ts-expect-error` is acceptable on its imports (only place)
- **Tests run with `--test-concurrency=1`** — required to avoid SQLite file-locking conflicts between test cases

## ANTI-PATTERNS (THIS PROJECT)

- **Never add `.js` extensions** to src imports — use `.ts` always (NodeNext + strip-types)
- **Never bypass CoreBundleSchema.parse()** in contract tests — must validate on every parse roundtrip
- **Never use `as any`** — use type guards (`isRecord()` from `src/core/util.ts`)
- **Never mutate passthrough data** — always deep clone via `rfdc` before storing (`deepClone` in passthrough.ts)
- **Never force-coerce provider types** — fall through to `'compatible'` or `'unknown'`
- **Never add platform-specific logic to `src/core/`** — core is platform-agnostic
- **Do not read `references/` as authoritative** — they are snapshots for format reference only

## COMMANDS

```bash
pnpm install          # install deps (node >=25 required)
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # eslint src/
pnpm run format       # prettier --write
pnpm run check        # typecheck + lint + format:check
pnpm test             # node --test contract tests

# CLI usage (dev)
pnpm run inspect -- /path/to/backup.json
pnpm run convert -- /path/to/backup.json --to cherry --out ./output

# CLI usage (linked global)
chatbridge inspect /path/to/backup.json
chatbridge convert /path/to/backup.json --to cherry --out ./output --include-secrets
```

## COMMIT CONVENTIONS

Format: `<type>(<scope>): <description>` — lowercase, imperative, no trailing period.

**Scopes:** `core` · `chatbox` · `cherry` · `rikka` · `io` · `cli` · `test` · `docs` · `chore`

**Types:**

| Type       | When                                      |
| ---------- | ----------------------------------------- |
| `feat`     | new user-facing capability                |
| `fix`      | bug, crash, or data-corruption fix        |
| `refactor` | structural change with no behavior change |
| `perf`     | performance or memory optimization        |
| `test`     | test-only changes                         |
| `docs`     | documentation-only changes                |
| `chore`    | tooling, build, or dependency maintenance |

**Body is mandatory** for `fix`, `feat`, `refactor`, `perf`. Sections:

- `fix`: Bug Description → Root Cause → Resolution
- `feat`: Feature Description → Motivation & Use Case → Implementation Details
- `refactor`: Current Flaw → Architectural Goal → Structural Changes
- `perf`: Performance Issue → Optimization Strategy

**Breaking changes** add footer: `BREAKING CHANGE: <what changed and how to migrate>`

**Atomic commits for large changes** — split by architecture boundary, not by file count:

1. `core` and domain model changes
2. adapter changes (`chatbox`, `cherry`, `rikka`)
3. `io`, `cli`, and pipeline changes
4. tests
5. docs/chore (if needed)

## NOTES

- `bin/chatbridge.js` is a thin launcher that `spawnSync` node with `--experimental-strip-types` — it does NOT execute TS itself, the child process does
- Rikkahub uses **SQLite** for its backup format; `src/io/sqlite.ts` wraps `node:sqlite` (Node 25+ built-in)
- Cherry Studio backup is a **ZIP** containing `data.json`; output is also a ZIP (`cherry-studio.backup.zip`)
- Large JSON files use `stream-json` token streaming when `--stream-threshold-mb` is set; parsed objects are still fully materialized in memory
- `__chatbridge_extensions` transport field carries CoreBundle extensions across hops that don't support arbitrary metadata natively
