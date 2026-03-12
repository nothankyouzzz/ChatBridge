# CLI

Commander-based CLI with two commands: `inspect` and `convert`.

## STRUCTURE

```
cli/
├── index.ts          # Entry point — defines inspect + convert commands, parses argv
└── commands/
    ├── convert.ts    # runConvertCommand() — parse → CoreBundle → generate → print JSON summary
    └── inspect.ts    # runInspectCommand() — parse → print bundle stats to stdout
```

## COMMANDS

| Command           | Required flags  | Optional flags                                                                     |
| ----------------- | --------------- | ---------------------------------------------------------------------------------- |
| `inspect <input>` | —               | `--source`, `--include-secrets`, `--stream-threshold-mb`                           |
| `convert <input>` | `--to`, `--out` | `--from`, `--include-secrets`, `--preserve-private-state`, `--stream-threshold-mb` |

## CONVENTIONS

- Flag parsing helpers in `index.ts`: `parsePlatform()`, `parseNonNegativeNumber()`, `parseBooleanish()`
- `--preserve-private-state` defaults to `true` in convert; `parseBooleanish()` handles `1/true/yes` vs `0/false/no`
- Output is **always JSON to stdout** — `process.stdout.write(JSON.stringify(result, null, 2))`
- Errors write to **stderr**, exit code 1 — `process.stderr.write(error.message)`
- `main()` is `async`, errors caught at top level — never let unhandled rejections escape

## ANTI-PATTERNS

- Never `console.log()` — always `process.stdout.write()` / `process.stderr.write()`
- Never add business logic to `index.ts` — parse flags only, delegate to `commands/`
- Never add platform-specific code — route through adapters layer
