# Architecture

Architectural decisions, patterns, and conventions discovered during implementation.

---

## Extension Pattern (from pi-lcm)
- Entry point: `index.ts` with `export default function(pi: ExtensionAPI)`
- State via closure variables (not classes)
- Tools use getter functions for lazy state access
- Session lifecycle: session_start, session_switch, session_fork, session_shutdown
- tool_call can ONLY block (not modify input) — all filtering in tool_result
- tool_call stores command in Map<toolCallId, info> for tool_result to retrieve

## Filter System
- Interface: `{ name, matches(cmd), apply(cmd, raw): FilterResult }`
- Registry: ordered array of filters, first match wins
- Disabled filters skipped in registry iteration
- All filters are synchronous — no async
- Filters receive ANSI-stripped text
- FilterResult: `{ filtered, rawChars, filteredChars }`

## SQLite Pattern (from pi-lcm)
- `better-sqlite3` — synchronous API
- WAL mode, busy_timeout 5000
- Versioned migrations via schema version table
- Idempotent schema creation (IF NOT EXISTS)
- In-memory `:memory:` for tests

## Config Pattern (from pi-lcm)
- 3-layer resolution: env vars > settings.json > defaults
- Settings stored in `~/.pi/agent/settings.json` under `rtk` key
- Atomic writes via temp file + rename
- Global vs project scope (project overrides global)

## TUI Pattern (from pi-voice)
- Component: `render(width) → string[]`, `handleInput(data)`, `invalidate()`
- Opened via `ctx.ui.custom()` with overlay options
- Arrow key navigation, Enter toggles, Escape closes
- Render caching for performance
