# 📘 ChatBridge CLI Reference

Complete command-line interface documentation for ChatBridge.

---

## 🎯 Command Structure

```bash
chatbridge <command> [arguments] [flags]
```

To expose `chatbridge` as a local shell command in this repository:

```bash
pnpm link --global
chatbridge --help
```

If you prefer not to link globally, you can still use pnpm scripts:

```bash
pnpm run inspect -- <arguments> [flags]
pnpm run convert -- <arguments> [flags]
```

> **Note:** Use `--` so pnpm forwards arguments to ChatBridge scripts.

---

## 🔍 inspect

**Purpose:** Parse a backup artifact and print a schema-validated summary JSON.

### Synopsis

```bash
chatbridge inspect <input> [--source chatbox|cherry|rikkahub] [--include-secrets] [--stream-threshold-mb <n>]
```

### Arguments

| Name      | Required | Description                              |
| --------- | -------- | ---------------------------------------- |
| `<input>` | ✅ Yes   | Backup artifact path (`.json` or `.zip`) |

### Options

| Flag                    | Type    | Default     | Description                                                                                                |
| ----------------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `--source`              | enum    | auto-detect | Force parser source: `chatbox`, `cherry`, `rikkahub`                                                       |
| `--include-secrets`     | boolean | `false`     | Allow parser to retain secret fields in Core passthrough. Summary output still does not print raw secrets. |
| `--stream-threshold-mb` | number  | disabled    | Switch large JSON reads to threshold-based token-stream parse path                                         |

### Examples

```bash
chatbridge inspect ./backups/chatbox-export.json
chatbridge inspect ./backup.zip --source rikkahub
chatbridge inspect ./large-backup.json --stream-threshold-mb 50
```

### Output

`inspect` writes JSON to stdout with fields such as:

- `detectedSource`
- `specVersion`
- `conversations`, `messages`, `parts`, `branchPoints`
- `providers`, `assets`
- `roles`
- `potentialLargeDataUris`
- `heapUsedMb`
- `conversationsPreview`, `providersPreview`

---

## 🔄 convert

**Purpose:** Parse source artifact to Core, then generate target artifact(s).

### Synopsis

```bash
chatbridge convert <input> --to chatbox|cherry|rikkahub --out <output> [--from chatbox|cherry|rikkahub] [--include-secrets] [--preserve-private-state <true|false>] [--stream-threshold-mb <n>]
```

### Arguments

| Name      | Required | Description                 |
| --------- | -------- | --------------------------- |
| `<input>` | ✅ Yes   | Source backup artifact path |

### Options

| Flag                       | Type    | Default     | Description                                                                           |
| -------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------- |
| `--to`                     | enum    | ✅ required | Target platform generator                                                             |
| `--out`                    | path    | ✅ required | Output file or output directory                                                       |
| `--from`                   | enum    | auto-detect | Force source parser                                                                   |
| `--include-secrets`        | boolean | `false`     | Include secret provider fields in generated artifacts                                 |
| `--preserve-private-state` | boolean | `true`      | Preserve platform-private state via passthrough merge and transport extension channel |
| `--stream-threshold-mb`    | number  | disabled    | Switch large JSON reads to threshold-based token-stream parse path                    |

### Examples

```bash
chatbridge convert ./chatbox-export.json --to cherry --out ./cherry-backup
chatbridge convert ./source.json --to rikkahub --out ./output.zip --include-secrets
chatbridge convert ./source.json --to chatbox --out ./output.json --preserve-private-state false
chatbridge convert ./huge-backup.json --to cherry --out ./output --stream-threshold-mb 100
```

### Output

`convert` writes JSON to stdout:

- `source`, `target`
- `conversations`, `providers`
- `artifacts[]` (`path`, `description`)
- `options` (`includeSecrets`, `preservePrivateState`, `streamThresholdMb`)

---

## 📁 Output Path Rules

### Chatbox target

- If `--out` ends with `.json`, write that file.
- Otherwise write `<out>/chatbox-exported-data-YYYY-MM-DD.json`.

### Cherry target

- If `--out` ends with `.json`, write JSON only.
- If `--out` ends with `.zip`, write ZIP only.
- Otherwise write both:
  - `<out>/data.json`
  - `<out>/cherry-studio.backup.zip`

### Rikkahub target

- If `--out` ends with `.zip`, write that file.
- Otherwise write `<out>/rikka_hub.backup.zip`.

---

## 🔐 Security Notes

- Secrets are excluded by default.
- `--include-secrets` enables secret mapping for parse/generate paths.
- When secrets are excluded, passthrough secret-like keys are redacted.
- `--preserve-private-state=false` disables passthrough merge and transport extension emission (`__chatbridge_extensions`).

---

## ⚡ Performance Notes

- `--stream-threshold-mb` switches to a token-stream parse path for large JSON inputs.
- Parsed JSON objects are still materialized in memory before adapter mapping.
- Use `inspect` output (`potentialLargeDataUris`, `heapUsedMb`) to monitor heavy payloads.

---

## 🐛 Troubleshooting

### Auto-detection failed

```bash
chatbridge convert input.json --from chatbox --to cherry --out output
```

### Large backup memory pressure

```bash
chatbridge inspect input.json --stream-threshold-mb 50
```

### Provider credentials missing

```bash
chatbridge convert input.json --to cherry --out output --include-secrets
```

---

## ✅ Exit Behavior

- Exit code `0`: success
- Exit code `1`: invalid args, parse/generate failure, or I/O/runtime error

Errors are printed to stderr.

---

## 📚 Related Documentation

- [Main README](../README.md) - Overview and architecture
- [Core Types](../src/core/schema/core.types.ts) - Universal schema reference
