# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Runtime
- Node.js 22.22.0 (via mise)
- Bun 1.3.10
- Vitest 4.x (available globally)
- macOS (Apple Silicon / arm64)

## Dependencies
- `better-sqlite3` — native SQLite binding, requires Node headers for compilation
- Peer deps: `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@sinclair/typebox` — provided by Pi at runtime
- Pi packages installed globally at: `/Users/codex/.local/share/mise/installs/node/22.22.0/lib/node_modules/`

## SQLite
- Tests use in-memory `:memory:` database
- Runtime DB stored at `~/.pi/agent/rtk/{hashCwd}.db`
- WAL mode, busy_timeout 5000, foreign_keys ON
