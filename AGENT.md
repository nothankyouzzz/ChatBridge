# ChatBridge AGENT Guide

## 1. Mission

You are the architect-level coding agent for ChatBridge.
Your goal is to deliver correct, maintainable changes while preserving conversion fidelity.

### Engineering Principles

- KISS: solve real problems with the simplest robust design. Avoid abstraction without clear payoff.
- Data integrity first: conversation data is the core asset. Preserve semantics across Chatbox, Cherry, and Rikkahub conversions.
- Respect ecosystem differences: do not force different upstream formats into one model when fidelity would be lost.

## 2. Tech Stack

- **Runtime**: Node.js ≥ 25, ESM (`"type": "module"`).
- **Language**: TypeScript, executed directly via `node --experimental-strip-types` (no build step).
- **Type checking**: `tsc --noEmit` (standalone check, not used for transpilation).
- **Testing**: Node.js built-in test runner (`node --test`).

## 3. Toolchain

### 3.1 Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run typecheck` | `tsc --noEmit` | TypeScript type checking |
| `npm run lint` | `eslint src/` | ESLint code quality check |
| `npm run format` | `prettier --write 'src/**/*.ts'` | Auto-format source files |
| `npm run format:check` | `prettier --check 'src/**/*.ts'` | Verify formatting (CI-safe) |
| `npm run check` | typecheck → lint → format:check | **One-shot quality gate** |
| `npm run test` | `node --test ...` | Run all contract tests |
| `npm run inspect` | CLI inspect command | Analyze a backup file |
| `npm run convert` | CLI convert command | Convert between platforms |

### 3.2 Quality Gate Workflow

Before committing, run the quality gate:

```bash
npm run check
```

This runs three checks sequentially — type checking, linting, and format verification. All three must pass before committing.

If formatting fails, auto-fix first:

```bash
npm run format
```

### 3.3 Testing Workflow

```bash
npm test
```

Tests live in `src/test/contract/*.spec.ts`. They use `node:test` and `node:assert/strict`. Run with `--test-concurrency=1` to avoid file system conflicts between test cases.

### 3.4 Tool Configuration

| Tool | Config File | Notes |
|------|-------------|-------|
| TypeScript | `tsconfig.json` | `strict: true`, `noEmit: true`, target ES2022/NodeNext |
| ESLint | `eslint.config.js` | Flat config, `@eslint/js` + `typescript-eslint` recommended, Prettier compat |
| Prettier | `.prettierrc.json` | No semicolons, single quotes, trailing commas, 120 char width, 2-space indent |
| Prettier ignore | `.prettierignore` | Excludes JSON files (fixtures + npm-managed files) |
| EditorConfig | `.editorconfig` | 2-space indent, LF, UTF-8, trim trailing whitespace |

### 3.5 Coding Style Rules

These are enforced by the toolchain. Do not override them manually:

- No semicolons.
- Single quotes for strings.
- Trailing commas everywhere.
- 120-character line width.
- 2-space indentation.
- Unused variables must be prefixed with `_` (ESLint warning, not error).

## 4. Commit Contract (Conventional Commits)

### 4.1 Message Format

Every commit must follow:

```text
<type>(<scope>): <description>

[Optional Body]

[Optional Footer]
```

Rules:

- `description` is lowercase, imperative, and has no trailing period.
- `scope` is the impacted module, such as `core`, `chatbox`, `cherry`, `rikka`, `io`, `cli`, `test`.
- One commit should represent one concern.

### 4.2 Allowed Types

- `feat`: new user-facing capability.
- `fix`: bug, crash, or data-corruption fix.
- `refactor`: structural change without feature or bug-fix behavior change.
- `perf`: performance or memory optimization.
- `test`: test-only changes.
- `docs`: documentation-only changes.
- `chore`: tooling, build, or dependency maintenance.

## 5. Required Body Templates

For `fix`, `feat`, `refactor`, and `perf`, the commit body is mandatory.

### `fix`

```text
[Bug Description]
...

[Root Cause]
...

[Resolution]
...
```

### `feat`

```text
[Feature Description]
...

[Motivation & Use Case]
...

[Implementation Details]
...
```

### `refactor`

```text
[Current Flaw]
...

[Architectural Goal]
...

[Structural Changes]
...
```

### `perf`

```text
[Performance Issue]
...

[Optimization Strategy]
...
```

## 6. Breaking Change Policy

If backward compatibility is broken, add this footer:

```text
BREAKING CHANGE: <what changed and how to migrate>
```

## 7. Atomic Commit Strategy for Large Changes

When many files are changed or untracked, do not create a single "initial commit".
Split work into 4-5 atomic commits by architecture boundary:

1. `core` and domain model changes.
2. adapter changes (`chatbox`, `cherry`, `rikka`).
3. `io`, `cli`, and pipeline changes.
4. tests.
5. docs/chore (if needed).

For each atomic commit:

1. Stage only related files.
2. Use a valid Conventional Commit header.
3. Add the required body template when applicable.

## 8. Pre-Commit Checklist

1. `npm run check` passes (typecheck + lint + format).
2. `npm test` passes with no failures.
3. `git diff --staged` shows only one concern per commit.
4. Header matches Conventional Commit format.
5. Required body sections exist for `fix`, `feat`, `refactor`, and `perf`.
6. Breaking changes include a `BREAKING CHANGE` footer.
