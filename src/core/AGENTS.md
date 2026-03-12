# CORE

Platform-agnostic schema, normalization, and extension utilities. **No platform-specific logic here.**

## STRUCTURE

```
core/
├── schema/
│   ├── core.types.ts     # TypeScript interfaces — CoreBundle, CoreConversation, CoreMessage, CorePart, etc.
│   └── core.zod.ts       # Zod runtime validators — CoreBundleSchema.parse() / safeParse()
├── normalize/
│   ├── role.ts           # normalizeRole(value) → CoreRole ('model' alias → 'assistant', unknown → 'unknown')
│   └── time.ts           # Timestamp normalization utilities
├── mapping/
│   └── provider-map.ts   # normalizeProviderType(value) → CoreProviderType (multi-strategy: lookup → substring → keyword → 'compatible')
├── extensions/
│   └── passthrough.ts    # Platform passthrough, lineage tracking, transport field, secret redaction
└── util.ts               # isRecord(), asRecord(), compactObject(), safeParseJson()
```

## KEY TYPES

| Type               | Purpose                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `CoreBundle`       | Top-level container: `specVersion`, `exportedAt`, `conversations[]`, `providers[]`                         |
| `CoreConversation` | `messages[]` (active path) + `branchPoints[]` (Phase 3) + `branches[]` (legacy)                            |
| `CoreBranchPoint`  | `mode: 'tail'` (Chatbox fork) or `'slot'` (Rikkahub per-node candidate)                                    |
| `CoreMessage`      | `id, role, parts[]` + optional usage/model/annotations                                                     |
| `CorePart`         | Discriminated union: text, reasoning, image, file, tool_call, tool_result, citation, audio, video, unknown |
| `CoreProvider`     | `id, type, apiKey?` — secrets stripped by default                                                          |
| `CoreProviderType` | `'openai' \| 'anthropic' \| 'gemini' \| 'azure-openai' \| 'compatible' \| 'unknown'`                       |

## PASSTHROUGH SYSTEM

`passthrough.ts` exports:

- `capturePlatformPassthrough()` — store raw platform data in `extensions.__chatbridge.passthrough[platform]`
- `readPlatformPassthrough()` — retrieve stored payload
- `mergeWithPlatformPassthrough()` — overlay passthrough onto generated base (passthrough loses on conflicts)
- `attachTransportExtensions()` / `readTransportExtensions()` — side-channel via `__chatbridge_extensions` field
- `appendLineage()` — record conversion hops for provenance
- `stripChatbridgeMeta()` — remove `__chatbridge` before final output

## ANTI-PATTERNS

- Never add platform-specific logic — any `if platform === 'chatbox'` block belongs in adapters
- **`core.types.ts` and `core.zod.ts` must stay in sync** — every TypeScript field must have a Zod counterpart
- Never coerce `normalizeProviderType()` result; let it fall to `'compatible'` or `'unknown'`
- Never mutate passthrough payloads — always `deepClone` via `rfdc` before storing
- `CoreValidationError` (from `core.zod.ts`) is the only validation error type — do not invent alternatives
