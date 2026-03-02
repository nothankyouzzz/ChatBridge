# 🌉 ChatBridge

**The universal data converter and migration tool for AI Chatboxes.**

Currently, the AI client ecosystem is fragmented. Excellent tools like Chatbox, Rikkahub, and Cherry Studio each use their own proprietary data structures (JSON/SQLite), creating information silos that make it difficult to transfer your chat history and model provider configurations.

**ChatBridge** is designed to solve this exact problem. Built with the KISS principle and a clean architecture, it serves as a lightweight middleware to parse, map, and transform data between these different formats. It ensures your conversations—the true containers of your ideas and wisdom—can flow freely across your favorite AI platforms without vendor lock-in.

**Key Features:**

- 🔄 **Two-way Migration:** Seamlessly import and export between Chatbox, Rikkahub, and Cherry Studio.
- ⚙️ **Provider Sync:** Unified mapping for model provider configurations (API keys, endpoints, parameters).
- 🧩 **Extensible Design:** A clean, interface-driven architecture making it easy to support new AI clients in the future.
