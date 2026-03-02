# 🌉 ChatBridge

**The universal data converter and migration tool for AI Chatboxes.**

Currently, the AI client ecosystem is fragmented. Excellent tools like Chatbox, Rikkahub, and Cherry Studio each use their own proprietary data structures (JSON/SQLite), creating information silos that make it difficult to transfer your chat history and model provider configurations.

**ChatBridge** is designed to solve this exact problem. Built with the KISS principle and a clean architecture, it serves as a lightweight middleware to parse, map, and transform data between these different formats. It ensures your conversations—the true containers of your ideas and wisdom—can flow freely across your favorite AI platforms without vendor lock-in.

---

## ✨ Key Features

- 🔄 **Two-way Migration:** Seamlessly import and export between Chatbox, Rikkahub, and Cherry Studio
- ⚙️ **Provider Sync:** Unified mapping for model provider configurations (API keys, endpoints, parameters)
- 🧩 **Extensible Design:** Clean, interface-driven architecture making it easy to support new AI clients
- 🌲 **Branch Preservation:** Maintains conversation branches and variant paths across platforms
- 🔒 **Security First:** Optional secret inclusion with explicit flags
- 📦 **Large Backup Guardrails:** Threshold-based read path for large JSON backups

---

## 📋 Prerequisites

- **Node.js** >= 25
- Native TypeScript support via `--experimental-strip-types` flag

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/nothankyouzzz/ChatBridge.git
cd ChatBridge

# Install dependencies
npm install
```

### Basic Usage

**Inspect a backup file:**

```bash
npm run inspect -- /path/to/backup.json
```

**Convert between platforms:**

```bash
npm run convert -- /path/to/chatbox-backup.json --to cherry --out ./output
```

---

## 📖 Usage Examples

### Example 1: Migrating from Chatbox to Cherry Studio

```bash
# Convert Chatbox export to Cherry Studio format
npm run convert -- chatbox-exported-data.json \
  --to cherry \
  --out ./cherry-backup \
  --include-secrets
```

This will generate:

- `cherry-backup/data.json` - Cherry Studio data file
- `cherry-backup/cherry-studio.backup.zip` - Complete backup archive

### Example 2: Analyzing Your Data

```bash
# Inspect a backup without including secrets
npm run inspect -- rikkahub-backup.zip \
  --source rikkahub
```

Output includes:

- Conversation and message counts
- Provider statistics
- Memory usage
- Preview of conversations and providers

### Example 3: Converting Rikkahub to Chatbox

```bash
npm run convert -- rikkahub-backup.zip \
  --from rikkahub \
  --to chatbox \
  --out ./chatbox-import.json \
  --preserve-private-state false
```

### Example 4: Large File Handling

```bash
# Switch to threshold-based read path for files over 100MB
npm run convert -- large-backup.json \
  --to cherry \
  --out ./output \
  --stream-threshold-mb 100
```

> Note: This improves large-file read behavior, but JSON is still fully materialized before `JSON.parse` in the current implementation.

---

## 🏗️ Architecture Overview

ChatBridge follows a clean, layered architecture:

```
┌─────────────────────────────────────────────┐
│              CLI Interface                  │
│         (inspect/convert commands)          │
└─────────────┬───────────────────────────────┘
              │
┌─────────────┴───────────────────────────────┐
│            Adapter Layer                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Chatbox  │  │  Cherry  │  │ Rikkahub │   │
│  │  Parser  │  │  Parser  │  │  Parser  │   │
│  └──────────┘  └──────────┘  └──────────┘   │
└─────────────┬───────────────────────────────┘
              │
┌─────────────┴───────────────────────────────┐
│          Core Bundle Schema                 │
│      (Universal Data Format)                │
│   • Conversations & Messages                │
│   • Providers & Models                      │
│   • Branch Points & Variants                │
└─────────────┬───────────────────────────────┘
              │
┌─────────────┴───────────────────────────────┐
│           Generator Layer                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Chatbox  │  │  Cherry  │  │ Rikkahub │   │
│  │Generator │  │Generator │  │Generator │   │
│  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────┘
```

### Design Principles

1. **Separation of Concerns:** Each platform adapter is independent
2. **Universal Core:** A platform-agnostic schema preserves all essential data
3. **Extensibility:** Platform-specific features stored in `extensions` fields
4. **Data Integrity:** Conversation branches and metadata preserved across conversions

---

## 🗂️ Project Structure

```
ChatBridge/
├── src/
│   ├── cli/              # Command-line interface
│   │   ├── commands/     # inspect & convert commands
│   │   └── args.ts       # Argument parser
│   ├── adapters/         # Platform adapters
│   │   ├── chatbox/      # Chatbox parser/generator
│   │   ├── cherry/       # Cherry Studio parser/generator
│   │   └── rikkahub/     # Rikkahub parser/generator
│   ├── core/             # Core schema and utilities
│   │   ├── schema/       # CoreBundle type definitions
│   │   ├── normalize/    # Data normalization
│   │   ├── mapping/      # Provider/model mappings
│   │   └── extensions/   # Extension utilities
│   ├── io/               # I/O utilities
│   │   ├── json.ts       # Threshold-based JSON read path
│   │   ├── sqlite.ts     # SQLite operations
│   │   └── zip.ts        # ZIP operations
│   └── test/             # Test suites
├── docs/                 # Documentation
│   └── CLI.md            # CLI reference guide
└── references/           # Reference implementations
```

---

## 🛠️ Development

### Running Tests

```bash
npm test
```

Tests use Node's native test runner and cover contract validation for all supported platforms.

### Adding a New Platform

1. Create adapter in `src/adapters/your-platform/`
2. Implement `SourceParser` interface
3. Implement `TargetGenerator` interface
4. Register in `src/adapters/index.ts`
5. Add tests in `src/test/contract/`

---

## 📚 Documentation

- [CLI Reference](docs/CLI.md) - Detailed command-line documentation
- [Core Types](src/core/schema/core.types.ts) - Universal schema definitions

---

## 🤝 Contributing

Contributions are welcome! Whether it's:

- 🐛 Bug reports and fixes
- ✨ New platform adapters
- 📖 Documentation improvements
- 💡 Feature suggestions

Please feel free to open an issue or submit a pull request.

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

ChatBridge draws inspiration from the excellent work of:

- [Chatbox](https://github.com/chatboxai/chatbox) by Bin Hua
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) by CherryHQ
- [Rikkahub](https://github.com/rikkahub/rikkahub) by Rikkahub team

Special thanks to the open-source community for making tools like these possible.

---

<p align="center">
  Made with ❤️ for the AI community
</p>
