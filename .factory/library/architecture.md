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

## Filter Test Fixture Design
- Compression savings thresholds (>50%, >60%, >80%) require realistic fixture proportions
- For git-diff: use 5+ files × 2+ hunks × (3 context lines + 1 change line) to achieve >50% savings — the context stripping drives compression
- For git-action: use verbose multi-line output (20+ lines) to achieve >80% savings from single-line summaries
- Small/minimal fixtures often fail savings assertions because the filter output isn't proportionally smaller
- Worker iteration on fixture design is normal TDD workflow, not a skill gap

## TUI Pattern (from pi-voice)
- Component: `render(width) → string[]`, `handleInput(data)`, `invalidate()`
- Opened via `ctx.ui.custom()` with overlay options
- Arrow key navigation, Enter toggles, Escape closes
- Render caching for performance

## Data Retention
- `unfiltered_commands` table (used by /rtk discover) has no time-based pruning or size limit
- Over long usage this table grows unbounded — may need cleanup strategy (e.g., prune records older than 30d on session_start)
- `command_runs` table also has no auto-pruning but is queried with time period filters in /rtk gain

## Test Isolation: Settings/Config
- Tests that use `loadSettings()` or `resolveConfig()` must mock `os.homedir()` to prevent the user's real global `~/.pi/agent/settings.json` from leaking into tests
- Pattern: `vi.mock("node:os")` with `importOriginal`, wrap `homedir` as `vi.fn`, set `mockReturnValue(tmpDir)` in beforeEach, `mockRestore()` in afterEach
- This redirects `getGlobalSettingsPath()` to a non-existent path, causing loadSettings to fall back to defaults
- `os.tmpdir()` is NOT affected by the mock (uses importOriginal), so `makeTmpDir()` works correctly
