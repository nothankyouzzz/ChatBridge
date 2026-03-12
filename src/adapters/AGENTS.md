# ADAPTERS

Platform adapters implement `SourceParser` (parse) and `TargetGenerator` (generate), registered manually in `index.ts`.

## STRUCTURE

```
adapters/
├── index.ts              # Registry + orchestration (detectSourceParser, parseWithSource, generateForTarget)
├── types.ts              # SourceParser + TargetGenerator interface definitions
├── chatbox/
│   ├── parser.ts         # Reads Chatbox JSON backup
│   ├── generator.ts      # Writes Chatbox JSON backup
│   └── mapper.ts         # Chatbox ↔ CoreBundle field mapping helpers
├── cherry/
│   ├── parser.ts         # Reads Cherry Studio ZIP (data.json inside)
│   ├── generator.ts      # Writes Cherry Studio ZIP (cherry-studio.backup.zip)
│   └── mapper.ts         # Cherry ↔ CoreBundle field mapping helpers
└── rikkahub/
    ├── parser.ts         # Reads Rikkahub SQLite backup
    ├── generator.ts      # Writes Rikkahub SQLite backup
    ├── mapper.ts         # Rikkahub ↔ CoreBundle field mapping helpers
    ├── sqlite.ts         # Rikkahub-specific SQLite schema queries
    └── sqlite-writer.ts  # Rikkahub-specific SQLite write operations
    └── generator-mapper.ts # Rikkahub generation mapping helpers
```

## ADAPTER INTERFACES

```ts
interface SourceParser {
  readonly source: SourcePlatform
  detect(input: InputArtifact): Promise<boolean>
  parse(input: InputArtifact, options?: ParseOptions): Promise<CoreBundle>
}

interface TargetGenerator {
  readonly target: SourcePlatform
  generate(bundle: CoreBundle, output: OutputTarget, options?: GenerateOptions): Promise<GeneratedArtifact[]>
}
```

## ADDING A NEW PLATFORM

1. Create `src/adapters/{platform}/parser.ts` — implement `SourceParser`
2. Create `src/adapters/{platform}/generator.ts` — implement `TargetGenerator`
3. Create `src/adapters/{platform}/mapper.ts` — field mapping helpers
4. Register in `src/adapters/index.ts` (both arrays)
5. Add `src/test/contract/{platform}-parser.spec.ts` + fixtures

## ANTI-PATTERNS

- `detect()` must be **order-safe** — detection runs chatbox → cherry → rikkahub deterministically; false positives break auto-detect for all later platforms
- Never access `InputArtifact` fields other than `path`
- Never throw from `detect()` — return `false` for non-matches
- Platform mappers belong in `{platform}/mapper.ts`, not in `src/core/`
- Never return empty `GeneratedArtifact[]` silently — throw descriptive errors
