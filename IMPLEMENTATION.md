# pi-rtk: Token Killer for Pi

> A Pi extension that reduces LLM token consumption by 60-90% on common dev
> commands. Pure TypeScript, no binary dependency. Filters tool output
> in-process using Pi's `tool_call` and `tool_result` event hooks.

## What This Is

RTK (Rust Token Killer) is an existing tool for Claude Code that proxies shell
commands through a Rust binary to strip noise from output before the LLM sees
it. It saves 60-90% of tokens on common dev commands (git, ls, test runners,
linters).

This document specifies **pi-rtk** — a Pi extension that achieves the same
result using Pi's native extension API, with no external binary dependency.

## How RTK (Claude Code) Works

### Architecture

```
Claude Code Session
│
├── User asks to run "git status"
├── Claude Code calls Bash tool with command "git status"
│
├── PreToolUse hook fires (hooks/rtk-rewrite.sh)
│   ├── Receives JSON: { tool: "bash", input: { command: "git status" } }
│   ├── Calls: rtk rewrite "git status"
│   ├── RTK outputs: "rtk git status"
│   └── Returns JSON: { permissionDecision: "allow", updatedInput: { command: "rtk git status" } }
│
├── Claude Code runs "rtk git status"
│   ├── RTK binary executes real "git status"
│   ├── Parses output (porcelain format)
│   ├── Compacts: emoji-annotated, grouped, noise removed
│   ├── Tracks: raw_tokens=2400, filtered_tokens=320 → SQLite
│   └── Returns compact output to Claude Code
│
└── LLM sees 320 tokens instead of 2400 (87% saved)
```

### Key Components in RTK

| Component | File | Purpose |
|-----------|------|---------|
| Entry point | `src/main.rs` | Clap CLI with 40+ subcommands, fallback passthrough |
| Runner | `src/runner.rs` | Generic command execution, error/test output parsing |
| Filter core | `src/filter.rs` | `FilterStrategy` trait, comment stripping, smart truncation |
| Git | `src/git.rs` | 2000 lines, handles status/diff/log/push/pull/branch/stash |
| Ls | `src/ls.rs` | Directory listing compaction, noise dir hiding |
| Grep | `src/grep_cmd.rs` | Result dedup, file grouping, limit |
| Test runners | `src/pytest_cmd.rs`, `src/vitest_cmd.rs`, `src/cargo_cmd.rs` | Pass/fail extraction |
| Linters | `src/tsc_cmd.rs`, `src/lint_cmd.rs`, `src/ruff_cmd.rs` | Error grouping by rule |
| JSON | `src/json_cmd.rs` | Schema extraction (keys + types, not values) |
| Docker | `src/container.rs` | Compact ps/images/logs |
| Tee | `src/tee.rs` | Raw output recovery on failure |
| Tracking | `src/tracking.rs` | SQLite token savings per command |
| Gain | `src/gain.rs` | Analytics dashboard with charts |
| Config | `src/config.rs` | TOML at `~/.config/rtk/config.toml` |
| Init/hooks | `src/init.rs`, `hooks/` | Claude Code hook installation |
| Rewrite | `src/rewrite_cmd.rs` | `rtk rewrite "cmd"` → rewritten command string |
| Log dedup | `src/log_cmd.rs` | Collapse repeated log lines with count |

### RTK's Filtering Strategies

1. **Smart Filtering** — strip comments, whitespace, boilerplate
2. **Grouping** — aggregate similar items (files by dir, errors by rule)
3. **Truncation** — keep important lines (signatures, imports), cut rest
4. **Deduplication** — collapse repeated log/error lines with occurrence count
5. **Schema extraction** — JSON → just keys and types, not values
6. **Summary extraction** — test/build output → just pass/fail counts

### RTK's Exact Output Formats

**git status (before: ~2400 tokens → after: ~320):**
```
# Before (raw git status)
On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        modified:   src/foo.ts
        modified:   src/bar.ts
        new file:   src/baz.ts
...

# After (rtk git status)
ok ✓ 37 files changed, 5009 insertions(+)
📌 main (up to date)
✅ Staged: 3 files
   src/foo.ts  src/bar.ts  src/baz.ts
❓ Untracked: 1 files
   new-file.txt
```

**git diff (before: ~8000 tokens → after: ~1600):**
```
# After (rtk git diff)
 src/foo.ts | 12 +++---
 src/bar.ts | 45 ++++++++++++----
 2 files changed, 38 insertions(+), 19 deletions(-)

@@ src/foo.ts:42 @@
-  const old = getValue();
+  const new = getUpdatedValue();

@@ src/bar.ts:108 @@
+  // New function added
+  export function process(data: Input): Output {
...
```

**git log (before: ~5000 tokens → after: ~400):**
```
a1b2c3d fix: status widget crash on narrow terminals
d4e5f6g ship: pi-lcm v0.1.0
g7h8i9j feat: add settings TUI panel
j0k1l2m refactor: atomic seq via INSERT...SELECT
```

**ls (before: ~2000 tokens → after: ~400):**
```
src/ (14 files)
test/ (4 files)
.github/ (5 files)
index.ts  11.6K
package.json  1.4K
README.md  6.8K
tsconfig.json  375B

📊 12 files, 4 dirs (5 .md, 2 .json, 1 .ts, +4 more)
```

**bun test (before: ~6000 tokens → after: ~300):**
```
✓ 4 suites, 46 tests passed (324ms)
```

**tsc (before: ~4000 tokens → after: ~500):**
```
TS2345 (3 errors)
  src/foo.ts:42 — Argument of type 'string' is not assignable
  src/foo.ts:67 — Argument of type 'number' is not assignable
  src/bar.ts:12 — Argument of type 'null' is not assignable

TS2304 (1 error)
  src/baz.ts:5 — Cannot find name 'MyType'

4 errors in 3 files
```

**JSON file read (before: ~10000 tokens → after: ~200):**
```
{
  "name": string,
  "version": string,
  "dependencies": { 14 keys },
  "scripts": { 4 keys },
  "devDependencies": { 3 keys }
}
```

### RTK Token Savings by Command

| Command | Raw Tokens | Filtered | Savings |
|---------|-----------|----------|---------|
| `git status` | 2,400 | 320 | 87% |
| `git diff` | 8,000 | 1,600 | 80% |
| `git log` | 5,000 | 400 | 92% |
| `git push/pull` | 800 | 40 | 95% |
| `ls -la` | 2,000 | 400 | 80% |
| `bun test` (46 tests) | 6,000 | 300 | 95% |
| `tsc` (errors) | 4,000 | 500 | 87% |
| `rg "pattern"` (50 hits) | 5,000 | 800 | 84% |
| `cat package.json` | 3,000 | 200 | 93% |
| `docker ps` | 1,500 | 300 | 80% |

### RTK Performance Constraints

- Startup: < 10ms
- Memory: < 5MB
- Binary: < 5MB
- No async runtime
- Lazy static regex compilation

---

## How pi-rtk Will Work (Pi Extension)

### The Key Difference: Post-Execution Filtering

RTK rewrites commands **before** execution (via shell hook). Pi can filter
**after** execution (via `tool_result` event). This is simpler and more
powerful:

- No command rewriting needed for most filters
- Access to actual output, not predicted output format
- Can filter `read` tool output too (file contents), not just bash
- No external binary dependency

### Pi Extension API Hooks Used

| Event | Purpose |
|-------|---------|
| `tool_call` | Pre-execution: rewrite commands when needed (e.g., add `--oneline` to `git log`) |
| `tool_result` | Post-execution: filter output, track savings |
| `session_start` | Initialize SQLite tracker |
| `session_shutdown` | Flush tracker, close DB |
| `pi.registerCommand()` | `/rtk gain`, `/rtk settings`, `/rtk discover` |
| `ctx.ui.setStatus()` | Footer: savings counter |

### Hook Implementation

#### tool_call (pre-execution)

Only used when the command itself needs changing to reduce output at source:

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName !== "bash") return;
  const cmd = event.input.command;

  // git log without --oneline → add it
  if (/^git\s+log\b/.test(cmd) && !cmd.includes("--oneline") && !cmd.includes("--format")) {
    return { input: { command: cmd + " --oneline -20" } };
  }

  // git diff without --stat → add stat first
  if (/^git\s+diff\b/.test(cmd) && !cmd.includes("--stat")) {
    // Tag for post-filter to know we want compact diff
    taggedCommands.set(event.toolCallId, { original: cmd, filter: "git-diff" });
  }

  // No rewrite needed for most commands — filter output post-execution
});
```

#### tool_result (post-execution) — THE MAIN HOOK

```typescript
pi.on("tool_result", async (event, ctx) => {
  if (!event.result?.content) return;

  const text = extractText(event.result.content);
  if (!text || text.length < 100) return; // Skip tiny outputs

  // Detect command from tool_call tracking
  const command = getCommandForToolCall(event.toolCallId);
  if (!command) return;

  // Find matching filter
  const filter = matchFilter(command);
  if (!filter) return;

  // Apply filter
  const filtered = filter.apply(command, text);

  // Track savings
  const rawTokens = estimateTokens(text);
  const filteredTokens = estimateTokens(filtered);
  tracker.record(command, rawTokens, filteredTokens);

  // Tee: save raw output on failure for recovery
  if (event.isError) {
    const teePath = saveTee(command, text);
    return {
      result: {
        content: [{ type: "text", text: filtered + `\n[full output: ${teePath}]` }],
      },
    };
  }

  return {
    result: {
      content: [{ type: "text", text: filtered }],
    },
  };
});
```

#### Also filter read tool output

```typescript
pi.on("tool_result", async (event, ctx) => {
  if (event.toolName === "read") {
    const text = extractText(event.result.content);
    const path = getReadPath(event.toolCallId);

    // JSON files → schema extraction
    if (path?.endsWith(".json") && text.length > 2000) {
      const schema = extractJsonSchema(text);
      trackSavings("read:" + path, text, schema);
      return { result: { content: [{ type: "text", text: schema }] } };
    }

    // Large source files → strip comments, collapse whitespace
    if (text.length > 5000) {
      const stripped = stripComments(text, detectLanguage(path));
      trackSavings("read:" + path, text, stripped);
      return { result: { content: [{ type: "text", text: stripped }] } };
    }
  }
});
```

### Filter Modules — Detailed Specifications

#### 1. Git Status Filter (`src/filters/git.ts`)

**Input detection:** command matches `/^git\s+status/`

**Parsing:** Use `git status --porcelain=v2` output format (or parse standard output)

**Output format:**
```
📌 {branch} ({ahead/behind or "up to date"})
✅ Staged: {count} files
   {file1}  {file2}  {file3}
📝 Modified: {count} files
   {file1}  {file2}
❓ Untracked: {count} files
   {file1}

📊 {total} files, {dirs count} dirs ({extension breakdown})
```

**Rules:**
- Group files by status (staged, modified, untracked, deleted)
- List files inline (space-separated) not one-per-line
- Include branch + tracking info
- Include file/dir count summary line

#### 2. Git Diff Filter (`src/filters/git.ts`)

**Input detection:** command matches `/^git\s+diff/`

**Output format:**
```
{stat line — file | changes +++ ---}

@@ {file}:{line} @@
{3 lines of context max}
{actual changes}
...

{N} files changed, {ins} insertions(+), {del} deletions(-)
```

**Rules:**
- Always include stat summary at top
- Reduce context lines from default 3 to 1
- Truncate hunks longer than 20 lines (show first 10 + "... N more lines")
- Skip binary file diffs entirely (just show "Binary file changed")
- Keep hunk headers with file:line info

#### 3. Git Log Filter (`src/filters/git.ts`)

**Pre-execution rewrite:** If no `--format` or `--oneline`, add `--oneline -20`

**Output format (if we get full log):**
```
{sha7} {subject line, truncated to 80 chars}
```

One commit per line, max 20 commits.

**Rules:**
- Strip author, date, body, trailers
- Truncate subject at 80 chars
- Max 20 entries (add "... and N more" if truncated)

#### 4. Git Push/Pull/Fetch/Add/Commit Filter

**Output format:**
```
ok ✓ {brief summary}
```

E.g., `ok ✓ main → origin/main`, `ok ✓ 3 files staged`, `ok ✓ [abc1234] commit message`

**Rules:**
- Strip all progress output, remote enumeration, object counting
- Extract the essential result (branch, commit hash, file count)
- Single line when possible

#### 5. Ls / Find / Fd / Tree Filter (`src/filters/ls.ts`)

**Input detection:** command matches `/^(ls|find|fd|tree)\b/`

**Output format:**
```
{dir}/ ({N} files)
{dir}/ ({N} files)
{file}  {size}
{file}  {size}

📊 {total} files, {total} dirs ({extension breakdown})
```

**Rules:**
- Group files by directory for `find`/`fd` output
- Hide noise directories: node_modules, .git, target, __pycache__, .venv,
  dist, build, coverage, .next, .nuxt, .svelte-kit, .cache
- Show individual files with human-readable sizes
- Extension breakdown: "(5 .ts, 3 .json, 2 .md, +4 more)"
- For `tree`: collapse deep empty paths (a/b/c/ → a/b/c/)

#### 6. Test Runner Filter (`src/filters/test.ts`)

**Input detection:** command matches test runner patterns:
- `bun test`, `bun run test`, `vitest`, `jest`
- `pytest`, `python -m pytest`
- `cargo test`
- `go test`
- `npm test`, `pnpm test`

**Output format:**
```
✓ {N} suites, {N} tests passed ({duration})
```
or on failure:
```
✗ {N} passed, {N} failed, {N} skipped ({duration})

FAILED:
  {test name} — {error summary, 1 line}
  {test name} — {error summary, 1 line}
```

**Rules:**
- Strip all passing test names (just count)
- Keep failing test names + first line of error
- Strip stack traces (keep only the "at" line with file:line)
- Strip test runner banners, progress output
- Detect framework from command and parse accordingly

#### 7. Lint/Typecheck Filter (`src/filters/lint.ts`)

**Input detection:** `tsc`, `eslint`, `biome`, `ruff`, `clippy`, `golangci-lint`, `prettier --check`

**Output format:**
```
{RULE_CODE} ({N} errors)
  {file}:{line} — {message}
  {file}:{line} — {message}

{RULE_CODE} ({N} errors)
  {file}:{line} — {message}

{total} errors in {total} files
```

**Rules:**
- Group errors by rule/code (TS2345, E0001, no-unused-vars)
- Max 5 instances per rule (add "... and N more")
- Strip "Did you mean" suggestions
- Strip color codes / ANSI
- Include total count summary

#### 8. Grep / Ripgrep Filter (`src/filters/grep.ts`)

**Input detection:** `rg`, `grep`

**Output format:**
```
{file}:
  {line}: {match line}
  {line}: {match line}

{file}:
  {line}: {match line}

{N} matches in {N} files
```

**Rules:**
- Group results by file
- Max 5 matches per file (add "... N more matches")
- Max 20 files (add "... N more files")
- Strip ANSI color codes
- Deduplicate identical match lines across files

#### 9. JSON Schema Extractor (`src/filters/json.ts`)

**Input detection:** output starts with `{` or `[`, valid JSON, > 2000 chars

**Output format:**
```json
{
  "name": "string",
  "version": "string",
  "dependencies": "{ 14 keys }",
  "scripts": "{ 4 keys }",
  "nested": {
    "key": "string",
    "arr": "[ 3 items ]"
  }
}
```

**Rules:**
- Replace string values with `"string"`
- Replace number values with `number`
- Replace boolean values with `boolean`
- Replace arrays with `"[ N items ]"` (unless < 3 items, show inline)
- Replace deep objects with `"{ N keys }"` (unless < 3 keys, expand)
- Max depth of 3 levels
- Preserve key names exactly

#### 10. Log Deduplication (`src/filters/log-dedup.ts`)

**Input detection:** output has > 50 lines with duplicates detected

**Output format:**
```
{unique line 1}
{unique line 2}
{repeated line} (x47)
{unique line 3}

{N} unique lines ({N} total, {N} duplicates collapsed)
```

**Rules:**
- Collapse consecutive identical lines into one + count
- Also collapse lines matching same pattern (timestamps differ but message same)
- Keep first occurrence, add "(xN)" suffix
- Threshold: only dedup if 3+ consecutive identical lines

#### 11. Docker Filter (`src/filters/docker.ts`)

**Input detection:** `docker ps`, `docker images`, `docker compose`, `kubectl`

**Output format (docker ps):**
```
CONTAINER   IMAGE            STATUS    PORTS
abc123      nginx:latest     Up 2h     80→8080
def456      postgres:16      Up 2h     5432
```

**Rules:**
- Compact table format (short container IDs, no full image SHA)
- Strip docker progress bars on pull/build
- `docker logs`: apply log dedup filter
- `kubectl get pods`: compact table with status emoji

#### 12. Package Manager Filter (`src/filters/npm.ts`)

**Input detection:** `bun install`, `npm install`, `pnpm install`, `pip install`

**Output format:**
```
ok ✓ {N} packages installed ({duration})
```

**Rules:**
- Strip all progress bars, download counts, resolution details
- Extract final summary line
- Keep warnings (deduplicated)
- Keep vulnerability count if present

#### 13. Comment Stripping for Read Tool (`src/filters/read-filter.ts`)

**Language detection:** from file extension

| Extension | Comment patterns |
|-----------|-----------------|
| .ts, .js, .tsx, .jsx | `//`, `/* */` |
| .py | `#`, `""" """` |
| .rs | `//`, `/* */` |
| .go | `//`, `/* */` |
| .rb | `#` |
| .sh, .bash, .zsh | `#` |
| .yaml, .yml | `#` |
| .toml | `#` |
| .css, .scss | `/* */` |
| .html, .vue, .svelte | `<!-- -->` |
| .sql | `--`, `/* */` |

**Rules:**
- Strip single-line comments
- Strip multi-line comment blocks
- PRESERVE doc comments (`///`, `/**`, `#[doc`, `"""docstring"""`)
- Normalize multiple blank lines to single
- Never strip comments from `.json`, `.jsonc`, `.env` (data formats)
- Only apply to files > 5000 chars (small files pass through)

### Command Matching

```typescript
interface FilterMatch {
  filter: string;       // Filter module name
  command: string;      // Matched command pattern
  confidence: number;   // 0-1 match confidence
}

function matchCommand(cmd: string): FilterMatch | null {
  // Exact prefix matches (highest priority)
  if (/^git\s+status/.test(cmd)) return { filter: "git-status", ... };
  if (/^git\s+diff/.test(cmd)) return { filter: "git-diff", ... };
  if (/^git\s+log/.test(cmd)) return { filter: "git-log", ... };
  if (/^git\s+(push|pull|fetch)/.test(cmd)) return { filter: "git-action", ... };
  if (/^git\s+(add|commit)/.test(cmd)) return { filter: "git-action", ... };
  if (/^git\s+branch/.test(cmd)) return { filter: "git-branch", ... };
  if (/^git\s+stash/.test(cmd)) return { filter: "git-stash", ... };

  if (/^(ls|exa|eza)\b/.test(cmd)) return { filter: "ls", ... };
  if (/^(find|fd)\b/.test(cmd)) return { filter: "find", ... };
  if (/^tree\b/.test(cmd)) return { filter: "tree", ... };

  if (/^(rg|grep)\b/.test(cmd)) return { filter: "grep", ... };

  if (/^(bun|npm|pnpm|yarn)\s+(test|run\s+test)/.test(cmd)) return { filter: "test-js", ... };
  if (/^(pytest|python\s+-m\s+pytest)/.test(cmd)) return { filter: "test-py", ... };
  if (/^cargo\s+test/.test(cmd)) return { filter: "test-rs", ... };
  if (/^go\s+test/.test(cmd)) return { filter: "test-go", ... };
  if (/^vitest/.test(cmd)) return { filter: "test-js", ... };

  if (/^tsc\b/.test(cmd)) return { filter: "lint-tsc", ... };
  if (/^(eslint|biome)\b/.test(cmd)) return { filter: "lint-js", ... };
  if (/^ruff\b/.test(cmd)) return { filter: "lint-py", ... };
  if (/^cargo\s+(clippy|build)/.test(cmd)) return { filter: "lint-rs", ... };

  if (/^docker\s+(ps|images)/.test(cmd)) return { filter: "docker-list", ... };
  if (/^docker\s+logs/.test(cmd)) return { filter: "docker-logs", ... };
  if (/^docker\s+compose/.test(cmd)) return { filter: "docker-compose", ... };
  if (/^kubectl/.test(cmd)) return { filter: "kubectl", ... };

  if (/^(bun|npm|pnpm|yarn)\s+install/.test(cmd)) return { filter: "npm-install", ... };
  if (/^pip\s+install/.test(cmd)) return { filter: "pip-install", ... };

  if (/^(curl|wget|xh|http)\b/.test(cmd)) return { filter: "http", ... };

  return null; // No filter — passthrough
}
```

### Analytics / Tracking

#### SQLite Schema

```sql
CREATE TABLE command_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  command     TEXT NOT NULL,
  filter_name TEXT NOT NULL,
  raw_chars   INTEGER NOT NULL,
  filt_chars  INTEGER NOT NULL,
  raw_tokens  INTEGER NOT NULL,
  filt_tokens INTEGER NOT NULL,
  savings_pct REAL NOT NULL,
  duration_ms INTEGER,
  timestamp   INTEGER NOT NULL,
  session_id  TEXT,
  cwd         TEXT
);

CREATE INDEX idx_runs_timestamp ON command_runs(timestamp);
CREATE INDEX idx_runs_command ON command_runs(command);
```

#### /rtk gain Output

```
RTK Token Savings — Last 24h

Command          Runs  Raw      Filtered  Saved
────────────────────────────────────────────────
git diff           12  45.2K    8.1K      82%  ████████░░
git status         28   8.4K    2.1K      75%  ███████░░░
bun test            6  32.0K    3.2K      90%  █████████░
ls                 15   6.0K    1.2K      80%  ████████░░
tsc                 4  16.0K    2.0K      87%  █████████░
read (json)         8  24.0K    1.6K      93%  █████████░
────────────────────────────────────────────────
Total              73 131.6K   18.2K      86%

Session: ~113K tokens saved
```

#### /rtk discover Output

Analyzes recent session history for commands that WEREN'T filtered:

```
RTK Discover — Missed Optimization Opportunities

These commands ran without filtering and could save tokens:

  cargo build (ran 4x, ~12K tokens each) → lint-rs filter would save ~80%
  docker compose up (ran 2x, ~8K tokens) → docker-compose filter would save ~90%

Estimated additional savings: ~52K tokens/session
```

### Tee Recovery

When a command fails (non-zero exit), save the raw unfiltered output:

```
~/.pi/agent/rtk/tee/
├── 2026-03-17_001234_git-diff.txt
├── 2026-03-17_002156_bun-test.txt
└── ...
```

Config: max 20 files, max 1MB each, auto-rotate.

The filtered output includes a hint:
```
[full output: ~/.pi/agent/rtk/tee/2026-03-17_001234_git-diff.txt]
```

The agent can `read` this file if the filter was too aggressive.

### Configuration

Settings in `~/.pi/agent/settings.json` under `rtk` key:

```json
{
  "rtk": {
    "enabled": true,
    "filters": {
      "git": true,
      "ls": true,
      "test": true,
      "lint": true,
      "grep": true,
      "json": true,
      "docker": true,
      "npm": true,
      "read": true,
      "logDedup": true
    },
    "tee": {
      "enabled": true,
      "mode": "failures",
      "maxFiles": 20,
      "maxFileSize": 1048576
    },
    "minOutputChars": 100,
    "excludeCommands": [],
    "debugMode": false
  }
}
```

### File Structure

```
pi-rtk/
├── package.json
├── index.ts                      # Extension entry point
├── src/
│   ├── matcher.ts                # Command pattern matching
│   ├── tracker.ts                # SQLite analytics
│   ├── tee.ts                    # Raw output recovery
│   ├── config.ts                 # Settings resolution
│   ├── settings.ts               # Load/save from Pi settings.json
│   ├── settings-panel.ts         # TUI overlay (/rtk settings)
│   ├── status.ts                 # Footer widget (savings counter)
│   ├── gain.ts                   # /rtk gain analytics display
│   ├── discover.ts               # /rtk discover missed optimizations
│   ├── utils.ts                  # Token estimation, ANSI stripping, text helpers
│   ├── filters/
│   │   ├── index.ts              # Filter registry + dispatch
│   │   ├── git-status.ts         # git status → compact format
│   │   ├── git-diff.ts           # git diff → stat + compact hunks
│   │   ├── git-log.ts            # git log → oneline
│   │   ├── git-action.ts         # push/pull/fetch/add/commit → "ok ✓"
│   │   ├── git-branch.ts         # branch list → compact
│   │   ├── ls.ts                 # ls/find/fd/tree → grouped
│   │   ├── test-js.ts            # bun/vitest/jest → pass/fail summary
│   │   ├── test-py.ts            # pytest → pass/fail summary
│   │   ├── test-rs.ts            # cargo test → pass/fail summary
│   │   ├── test-go.ts            # go test → pass/fail summary
│   │   ├── lint-tsc.ts           # tsc → grouped by error code
│   │   ├── lint-js.ts            # eslint/biome → grouped by rule
│   │   ├── lint-py.ts            # ruff → grouped by rule
│   │   ├── lint-rs.ts            # cargo clippy/build → grouped
│   │   ├── grep.ts               # rg/grep → grouped by file, limited
│   │   ├── json-schema.ts        # JSON → schema extraction
│   │   ├── log-dedup.ts          # Repeated line collapsing
│   │   ├── docker.ts             # docker ps/images/logs/compose
│   │   ├── npm-install.ts        # package install → summary
│   │   ├── read-filter.ts        # Comment stripping for read tool
│   │   └── http.ts               # curl/wget → status + summary
│   └── db/
│       ├── connection.ts         # SQLite connection (reuse pi-lcm pattern)
│       └── schema.ts             # Tracking table migrations
├── test/
│   ├── git-status.test.ts
│   ├── git-diff.test.ts
│   ├── git-log.test.ts
│   ├── ls.test.ts
│   ├── test-runners.test.ts
│   ├── lint.test.ts
│   ├── grep.test.ts
│   ├── json-schema.test.ts
│   ├── log-dedup.test.ts
│   ├── matcher.test.ts
│   └── tracker.test.ts
└── docs/
    └── filters.md                # Filter reference
```

### Implementation Phases

#### Phase 1: Core Hooks + Git Filters (L)
- index.ts with tool_call + tool_result hooks
- matcher.ts for command detection
- tracker.ts + SQLite schema
- git-status.ts, git-diff.ts, git-log.ts, git-action.ts
- /rtk gain (basic version)
- Status footer
- Tests for all git filters

#### Phase 2: Ls + Test Runners (M)
- ls.ts (ls, find, fd, tree)
- test-js.ts, test-py.ts, test-rs.ts, test-go.ts
- Tests

#### Phase 3: Lint + Grep (M)
- lint-tsc.ts, lint-js.ts, lint-py.ts, lint-rs.ts
- grep.ts
- Tests

#### Phase 4: JSON + Docker + Npm + Read (M)
- json-schema.ts
- docker.ts
- npm-install.ts
- read-filter.ts (comment stripping)
- log-dedup.ts
- http.ts
- Tests

#### Phase 5: Analytics + Settings + Polish (S)
- /rtk gain full dashboard with bars
- /rtk discover
- /rtk settings TUI panel
- tee.ts recovery
- config.ts + settings.ts
- Tests

#### Phase 6: Audit + Ship (M)
- 5-agent audit (same as pi-lcm)
- Fix all findings
- README, llms.txt, CHANGELOG
- npm publish

### Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.9.1"
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
  }
}
```

Same as pi-lcm. Single native dependency (SQLite). Everything else is string parsing in TypeScript.

### Pi-Specific Advantages Over RTK

| Feature | RTK (Claude Code) | pi-rtk (Pi) |
|---------|-------------------|-------------|
| Language | Rust binary (5MB) | TypeScript (30KB) |
| Install | brew/cargo/curl + hook init | `pi install npm:pi-rtk` |
| Hook mechanism | Shell script (PreToolUse) | Native tool_call/tool_result events |
| Filter timing | Pre-execution only (rewrite) | Pre AND post-execution (rewrite + filter) |
| Read tool | Cannot filter | Can filter file reads (comment strip, JSON schema) |
| Analytics | Separate CLI (`rtk gain`) | Built into Pi TUI (`/rtk gain`) |
| Settings | TOML file, manual edit | Interactive TUI panel |
| Recovery | Tee to file | Same + agent can read file directly |
| Works with pi-lcm | N/A | Complementary (rtk reduces input, lcm manages context) |
| Updates | Rebuild binary | `pi update npm:pi-rtk` |

### Interaction with pi-lcm

pi-rtk and pi-lcm are complementary:

- **pi-rtk** reduces the SIZE of each message entering the context (fewer tokens per message)
- **pi-lcm** manages what happens when the context window fills up (hierarchical DAG summarization)

Together, a session that would normally burn through 200K tokens and lose everything after compaction instead uses 40K tokens (pi-rtk) and preserves everything via searchable DAG (pi-lcm).

Install both:
```bash
pi install npm:pi-lcm npm:pi-rtk
```

---

## Appendix 0: Resources & Reference Documentation

### Pi Extension Development — LOCAL Docs (read these first)

All Pi docs are at:
```
/Users/codex/.local/share/mise/installs/node/22.22.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/
```

| File | What It Covers | Read Priority |
|------|---------------|---------------|
| `extensions.md` (67.5K) | **THE PRIMARY REFERENCE.** Full ExtensionAPI, all 29 events, tool registration, commands, UI, state, custom components, overlays. | MUST READ |
| `tui.md` (27.2K) | Component interface, render/handleInput/invalidate, Text/SelectList/Container, overlays, ANSI helpers, `truncateToWidth`, `matchesKey`, `Key` enum. | MUST READ for settings panel |
| `compaction.md` (16K) | How Pi's compaction works, `session_before_compact` event, `CompactionPreparation`, `serializeConversation`, cut points, split turns. | READ for understanding context |
| `session.md` (14K) | Session JSONL format, entry types, `AgentMessage` union, content blocks, `SessionManager` API, tree structure. | READ for message types |
| `settings.md` (7.5K) | Pi settings system, `settings.json` structure, project vs global, setting keys. | READ for config integration |
| `packages.md` (7.4K) | How Pi packages work, `pi install`, `pi remove`, `pi update`, package.json `pi` field, npm publishing. | READ before publishing |
| `custom-provider.md` (18.4K) | `registerProvider`, model definition, cost structure, `complete()` function. | SKIM for model calls |
| `sdk.md` (27.8K) | Pi SDK for headless/RPC mode, `AgentSession`, `SessionManager`. | SKIM |
| `rpc.md` (32.9K) | RPC protocol for headless mode. | SKIP unless needed |

### Pi Extension Examples — LOCAL (read for patterns)

All examples at:
```
/Users/codex/.local/share/mise/installs/node/22.22.0/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/
```

| Example | Why It's Relevant |
|---------|-------------------|
| `custom-compaction.ts` | Uses `session_before_compact`, `serializeConversation`, `complete()` — same patterns as pi-lcm |
| `tools.ts` | Tool registration with TypeBox, `execute()`, `onUpdate`, return format |
| `permission-gate.ts` | `tool_call` event — blocking and modifying tool input |
| `tool-override.ts` | `tool_result` event — **CRITICAL: shows how to modify tool output** |
| `truncated-tool.ts` | `tool_result` event — truncating large tool output |
| `confirm-destructive.ts` | `tool_call` — blocking dangerous commands |
| `todo.ts` | Full stateful extension with tools, commands, persistence |
| `status-line.ts` | `ctx.ui.setStatus()` usage |
| `custom-footer.ts` | `ctx.ui.setFooter()` |
| `overlay-qa-tests.ts` | `ctx.ui.custom()` with overlays — comprehensive examples |
| `snake.ts` | Full TUI component with `render()`/`handleInput()`/`invalidate()` |
| `trigger-compact.ts` | `ctx.compact()` — manual compaction trigger |

### Existing Working Extensions — LOCAL (read for real-world patterns)

| Extension | Path | Why Read It |
|-----------|------|-------------|
| **pi-lcm** (our project) | `/Users/codex/Downloads/Code Files/pi-lcm/` | Full working extension with tools, commands, SQLite, settings panel, session lifecycle. **Copy patterns directly.** |
| **pi-agentic-compaction** | `/Users/codex/.local/share/mise/installs/node/22.22.0/lib/node_modules/pi-agentic-compaction/index.ts` | Simpler compaction extension, good `session_before_compact` reference |
| **pi-voice (settings panel)** | `/Users/codex/Downloads/Code Files/pi-voice/extensions/voice/settings-panel.ts` | **THE reference** for TUI settings panels. Full overlay component with tabs, navigation, render caching. |
| **pi-voice (config)** | `/Users/codex/Downloads/Code Files/pi-voice/extensions/voice/config.ts` | Settings load/save pattern: project > global > defaults, atomic writes, migration |
| **pi-agent-teams** | `/Users/codex/Projects/pi-agent-teams/` | Large extension with tools, commands, widgets, worker management |
| **pi-mission-control** | `/Users/codex/pi-mission-control/index.ts` | Full-featured extension with state machines, model management |

### RTK Source Code — REMOTE (fetch via gh api)

RTK repo: `github.com/rtk-ai/rtk`

| File | What To Learn |
|------|---------------|
| `src/git.rs` (~2000 lines) | The gold standard for git output filtering. Copy the exact output formats. |
| `src/ls.rs` | Directory listing compaction, noise dir list, human_size() |
| `src/filter.rs` | FilterStrategy trait, comment patterns per language, smart_truncate |
| `src/runner.rs` | `filter_errors()` regex patterns, `extract_test_summary()` framework detection |
| `src/gain.rs` | Analytics dashboard formatting, TTY-aware colors, efficiency bars |
| `src/tee.rs` | Tee config, file rotation, hint format |
| `src/config.rs` | TOML config structure, exclude patterns |
| `src/tracking.rs` | SQLite schema for token tracking |
| `src/pytest_cmd.rs` | Python test output parsing |
| `src/vitest_cmd.rs` | JS test output parsing |
| `src/tsc_cmd.rs` | TypeScript error grouping |
| `src/grep_cmd.rs` | Ripgrep output compaction |
| `src/json_cmd.rs` | JSON schema extraction algorithm |
| `src/container.rs` | Docker output compaction |
| `ARCHITECTURE.md` | Full system architecture |
| `CLAUDE.md` | Dev constraints: <10ms startup, <5MB memory, TDD mandatory |

Fetch any file with:
```bash
gh api repos/rtk-ai/rtk/contents/src/git.rs --jq '.content' | base64 -d
```

### Pi TypeScript Types — LOCAL

Type definitions for all Pi APIs:
```
/Users/codex/.local/share/mise/installs/node/22.22.0/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts
```

This 42.9K file contains:
- `ExtensionAPI` interface (all methods)
- All 29 event types with exact field definitions
- `ToolDefinition` type
- `ExtensionContext` and `ExtensionCommandContext`
- `RegisteredCommand` type
- `CompactionPreparation`, `TreePreparation`
- `ReadonlySessionManager`

### Key npm Packages (peer dependencies)

| Package | Import | What You Use |
|---------|--------|-------------|
| `@mariozechner/pi-coding-agent` | `ExtensionAPI`, `isToolCallEventType`, `isBashToolResult`, `convertToLlm`, `serializeConversation` | Extension types, event narrowing |
| `@mariozechner/pi-ai` | `complete`, `StringEnum`, `Model`, `Message` | LLM calls (if needed), enum types for tool params |
| `@mariozechner/pi-tui` | `matchesKey`, `Key`, `truncateToWidth`, `Text`, `Component` | TUI components, keyboard handling |
| `@sinclair/typebox` | `Type.Object`, `Type.String`, `Type.Number`, `Type.Optional`, `Type.Boolean` | Tool parameter schemas |
| `better-sqlite3` | `Database` | SQLite for analytics tracking |

### GitHub Repos

| Repo | URL | Purpose |
|------|-----|---------|
| Pi source | `github.com/badlogic/pi-mono` | Pi monorepo (reference, not dependency) |
| RTK source | `github.com/rtk-ai/rtk` | Original RTK (Rust) — filter logic reference |
| pi-lcm (ours) | `github.com/codexstar69/pi-lcm` | Our working extension — copy patterns from here |
| pi-voice | private / npm | Settings panel reference |

### User's Environment (from CLAUDE.md)

The user's system has specific tool preferences. pi-rtk filters should be
aware of these aliases:

| Standard | User Uses | Filter Implication |
|----------|----------|-------------------|
| `grep` | `rg` (ripgrep) | Match both `rg` and `grep` patterns |
| `find` | `fd` | Match both `fd` and `find` |
| `sed` | `sd` | Not typically filtered |
| `cat` | `bat` / Read tool | `bat` output includes line numbers + syntax highlighting |
| `npm` | `bun` | Match `bun install`, `bun test`, `bun run` |
| `curl` | `xh` (aliased as `http`) | Match `xh`, `http`, `curl` |
| `du` | `dust` / `duf` | Not high priority |
| `ps` | `procs` / `pss` | Not high priority |

The user also has custom git aliases (`git fresh`, `git wip`, `git absorb`,
`git gone`, `git recent`, `git diff-main`, `git files`). These pass through
to git and produce standard git output, so the git filters handle them.

---

## Appendix A: Pi Extension API — Exact Event Shapes

### tool_call Event

Fired after `tool_execution_start`, before the tool executes. Can block or
modify input.

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName  — "bash", "read", "write", "edit", "grep", "find", "ls"
  // event.toolCallId — unique ID linking to tool_result
  // event.input — tool-specific parameters

  // Type narrowing for bash:
  if (isToolCallEventType("bash", event)) {
    // event.input is { command: string; timeout?: number }
    event.input.command; // the shell command
  }

  // Type narrowing for read:
  if (isToolCallEventType("read", event)) {
    // event.input is { path: string; offset?: number; limit?: number }
    event.input.path; // file path
  }

  // Return options:
  // 1. Block execution:
  return { block: true, reason: "Blocked by pi-rtk" };

  // 2. Modify input (rewrite command):
  return { input: { command: "rewritten command" } };

  // 3. Allow unchanged (return nothing):
  return;
});
```

### tool_result Event

Fired after tool execution, before the result is sent to the LLM. Can modify
the result content. Handlers chain like middleware (each sees previous
handler's output).

```typescript
import { isBashToolResult } from "@mariozechner/pi-coding-agent";

pi.on("tool_result", async (event, ctx) => {
  // event.toolName — "bash", "read", "write", "edit", etc.
  // event.toolCallId — links back to the tool_call event
  // event.input — original tool input (same as tool_call.input)
  // event.content — TextContent[] — the tool's output
  // event.details — tool-specific metadata (BashToolDetails, etc.)
  // event.isError — boolean

  if (isBashToolResult(event)) {
    // event.details has: { command, exitCode, output, cancelled, truncated }
  }

  // Read content text:
  const text = event.content
    ?.filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n") ?? "";

  // Return modified result (partial patch — omitted fields keep current values):
  return {
    content: [{ type: "text", text: "filtered output" }],
    // details: { ... },  // optional
    // isError: false,     // optional
  };

  // Return nothing to keep result unchanged:
  return;
});
```

### Linking tool_call to tool_result

The `toolCallId` field is the same in both events. Use a Map to track
commands between the two hooks:

```typescript
const commandMap = new Map<string, { command: string; toolName: string }>();

pi.on("tool_call", async (event) => {
  if (event.toolName === "bash") {
    commandMap.set(event.toolCallId, {
      command: event.input.command,
      toolName: event.toolName,
    });
  }
  if (event.toolName === "read") {
    commandMap.set(event.toolCallId, {
      command: `read:${event.input.path}`,
      toolName: event.toolName,
    });
  }
});

pi.on("tool_result", async (event) => {
  const tracked = commandMap.get(event.toolCallId);
  commandMap.delete(event.toolCallId); // Cleanup
  if (!tracked) return;

  // Now we know which command produced this output
  const filter = matchFilter(tracked.command);
  if (!filter) return;

  // Apply filter...
});
```

### Session Events (lifecycle)

Same pattern as pi-lcm. Must handle:

```typescript
pi.on("session_start", async (_event, ctx) => { /* init tracker */ });
pi.on("session_switch", async (_event, ctx) => { /* reset + reinit */ });
pi.on("session_fork", async (_event, ctx) => { /* reset + reinit */ });
pi.on("session_shutdown", async (_event, ctx) => { /* flush + close */ });
```

---

## Appendix B: Filter Interface & Registry

### TypeScript Interface

Every filter module must export a function matching this interface:

```typescript
export interface FilterResult {
  filtered: string;     // The compressed output
  rawChars: number;     // Original character count
  filteredChars: number; // Compressed character count
}

export interface Filter {
  /** Unique filter name for tracking/config. */
  name: string;
  /** Test if this filter handles the given command. */
  matches(command: string): boolean;
  /** Apply the filter to the command's raw output. */
  apply(command: string, rawOutput: string): FilterResult;
}
```

### Filter Registry

```typescript
// src/filters/index.ts
import { createGitStatusFilter } from "./git-status.js";
import { createGitDiffFilter } from "./git-diff.js";
// ... all filters

const ALL_FILTERS: Filter[] = [
  createGitStatusFilter(),
  createGitDiffFilter(),
  createGitLogFilter(),
  createGitActionFilter(),
  createGitBranchFilter(),
  createLsFilter(),
  createTestJsFilter(),
  createTestPyFilter(),
  createTestRsFilter(),
  createTestGoFilter(),
  createLintTscFilter(),
  createLintJsFilter(),
  createLintPyFilter(),
  createLintRsFilter(),
  createGrepFilter(),
  createJsonSchemaFilter(),
  createLogDedupFilter(),
  createDockerFilter(),
  createNpmInstallFilter(),
  createReadFilter(),
  createHttpFilter(),
];

export function findFilter(command: string, config: RtkConfig): Filter | null {
  for (const f of ALL_FILTERS) {
    // Skip disabled filters
    if (!isFilterEnabled(f.name, config)) continue;
    if (f.matches(command)) return f;
  }
  return null;
}

function isFilterEnabled(name: string, config: RtkConfig): boolean {
  // Map filter names to config groups
  const group = getFilterGroup(name); // "git", "ls", "test", etc.
  return config.filters[group] !== false;
}
```

### Example Filter Implementation

```typescript
// src/filters/git-status.ts
import type { Filter, FilterResult } from "./index.js";

export function createGitStatusFilter(): Filter {
  return {
    name: "git-status",

    matches(command: string): boolean {
      return /^git\s+status\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const lines = raw.split("\n");
      const result: string[] = [];

      // Parse branch info
      const branchMatch = raw.match(/On branch (\S+)/);
      const branch = branchMatch?.[1] ?? "unknown";
      const tracking = raw.includes("up to date") ? "up to date"
        : raw.match(/ahead (\d+)/)?.[0] ?? "";
      result.push(`📌 ${branch} (${tracking || "no tracking"})`);

      // Parse file statuses
      const staged: string[] = [];
      const modified: string[] = [];
      const untracked: string[] = [];
      const deleted: string[] = [];

      let section = "";
      for (const line of lines) {
        if (line.includes("Changes to be committed")) section = "staged";
        else if (line.includes("Changes not staged")) section = "modified";
        else if (line.includes("Untracked files")) section = "untracked";

        const fileMatch = line.match(/^\s+(modified|new file|deleted|renamed):\s+(.+)$/);
        if (fileMatch) {
          const file = fileMatch[2].trim();
          if (section === "staged") staged.push(file);
          else if (section === "modified") modified.push(file);
        }

        // Untracked files (no prefix, just indented filenames)
        if (section === "untracked" && line.match(/^\t\S/)) {
          untracked.push(line.trim());
        }
      }

      if (staged.length > 0) {
        result.push(`✅ Staged: ${staged.length} files`);
        result.push(`   ${staged.join("  ")}`);
      }
      if (modified.length > 0) {
        result.push(`📝 Modified: ${modified.length} files`);
        result.push(`   ${modified.join("  ")}`);
      }
      if (untracked.length > 0) {
        result.push(`❓ Untracked: ${untracked.length} files`);
        result.push(`   ${untracked.join("  ")}`);
      }

      const filtered = result.join("\n");
      return { filtered, rawChars: raw.length, filteredChars: filtered.length };
    },
  };
}
```

---

## Appendix C: Edge Cases & Error Handling

### Piped / Chained Commands

Commands with pipes, `&&`, `||`, or `;` are common:

```bash
git status && git diff
cat file.json | jq '.key'
NODE_ENV=prod npm test
cd /tmp && ls -la
```

**Rules:**
- **Env var prefixes** (`NODE_ENV=prod cmd`): strip prefix, match on the
  actual command. Regex: `/^(\w+=\S+\s+)*(.+)$/` → match group 2.
- **Pipes** (`cmd1 | cmd2`): match on `cmd1` only (it produces the output).
  But if `cmd2` is a filter (jq, head, tail, grep), skip filtering (user
  already reduced output).
- **Chained** (`cmd1 && cmd2`): don't filter. The output is interleaved
  and unparseable per-command.
- **Subshells** (`$(cmd)`, `` `cmd` ``): don't filter.
- **Redirects** (`cmd > file`): don't filter (output goes to file, not stdout).

```typescript
function shouldFilter(command: string): boolean {
  // Skip piped commands where the pipe target is a filter
  if (/\|\s*(head|tail|grep|rg|awk|sed|jq|wc|sort|uniq)\b/.test(command)) return false;
  // Skip chained commands
  if (/[;&|]{2}/.test(command)) return false;
  // Skip redirects
  if (/[>|]/.test(command) && !/\|/.test(command)) return false; // > but not |
  // Skip subshells
  if (/\$\(|\`/.test(command)) return false;

  return true;
}

function extractBaseCommand(command: string): string {
  // Strip env var prefixes
  return command.replace(/^(\w+=\S+\s+)+/, "").trim();
}
```

### Filter Crash Recovery

If any filter throws, fall through to raw output. Never crash Pi:

```typescript
pi.on("tool_result", async (event, ctx) => {
  try {
    // ... find filter, apply, track ...
  } catch (e: any) {
    // Log but don't crash
    if (config.debugMode) {
      ctx.ui.notify(`RTK filter error: ${e.message}`, "warning");
    }
    return; // Passthrough — LLM sees raw output
  }
});
```

### ANSI Color Stripping

Many commands output ANSI escape codes. Strip before filtering:

```typescript
/** Strip all ANSI escape sequences (colors, cursor, etc.) */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, ""); // OSC 8 hyperlinks
}
```

### Empty / Tiny Output

Don't filter outputs shorter than `minOutputChars` (default 100). The
overhead of filtering tiny outputs isn't worth it, and some commands
intentionally produce short output that shouldn't be modified.

### Binary / Non-Text Output

If output contains null bytes or unprintable characters (binary data),
skip filtering entirely:

```typescript
function isBinary(text: string): boolean {
  return /\x00/.test(text.slice(0, 1000));
}
```

---

## Appendix D: Testing Strategy

### Fixture-Based Testing

Each filter gets a test file with real command output as fixtures:

```typescript
// test/git-status.test.ts
import { describe, it, expect } from "vitest";
import { createGitStatusFilter } from "../src/filters/git-status.js";

const filter = createGitStatusFilter();

describe("git-status filter", () => {
  it("compacts clean status", () => {
    const raw = `On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);
    expect(filtered).toContain("📌 main");
    expect(filtered).toContain("up to date");
    expect(filtered).not.toContain("nothing to commit");
  });

  it("groups staged and untracked files", () => {
    const raw = `On branch feat-x
Your branch is ahead of 'origin/feat-x' by 2 commits.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	modified:   src/foo.ts
	new file:   src/bar.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	temp.log
	debug.txt`;

    const { filtered, rawChars, filteredChars } = filter.apply("git status", raw);
    expect(filtered).toContain("✅ Staged: 2 files");
    expect(filtered).toContain("❓ Untracked: 2 files");
    expect(filtered).toContain("src/foo.ts");
    expect(filteredChars).toBeLessThan(rawChars * 0.5); // >50% savings
  });

  it("handles detached HEAD", () => {
    const raw = `HEAD detached at abc1234
nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);
    expect(filtered).toContain("abc1234");
  });
});
```

### Test Each Filter With:
1. **Happy path** — typical output, verify compression ratio
2. **Empty output** — no files, clean status, no errors
3. **Large output** — 500+ lines, verify truncation works
4. **Error output** — non-zero exit, verify error info preserved
5. **Edge cases** — special characters, unicode filenames, long lines

### Integration Test Pattern

```typescript
// test/integration.test.ts
describe("tool_result filtering", () => {
  it("filters bash git status output", () => {
    // Simulate: event = { toolName: "bash", toolCallId: "123",
    //   content: [{ type: "text", text: RAW_GIT_STATUS }], isError: false }
    // commandMap has { "123": { command: "git status", toolName: "bash" } }
    // Verify: returned content is filtered
  });

  it("passes through unmatched commands", () => {
    // Command "echo hello" matches no filter → return undefined
  });

  it("passes through tiny output", () => {
    // Output < 100 chars → return undefined
  });
});
```

---

## Appendix E: Performance Requirements

| Metric | Target | Why |
|--------|--------|-----|
| Filter execution | < 5ms per call | Filters run synchronously in the event loop |
| Memory per filter | < 1MB | String manipulation only, no buffering |
| Regex compilation | Once at startup | Use module-level const patterns |
| SQLite write | < 1ms per record | Single INSERT, WAL mode |
| Total overhead | < 10ms per tool call | Imperceptible to the user |

### Performance Rules:
- No async in filters (pure synchronous string → string)
- Pre-compile all regex patterns at module load
- Use `.slice()` and `.indexOf()` over `.split()` + `.join()` when possible
- Never load the full command output into an intermediate array if it can
  be processed line-by-line
- The tracker SQLite write is fire-and-forget (don't await)

---

## Appendix F: package.json

```json
{
  "name": "pi-rtk",
  "version": "0.1.0",
  "description": "Token Killer for Pi — reduce LLM token consumption by 60-90% on common dev commands",
  "type": "module",
  "license": "MIT",
  "keywords": [
    "pi-package",
    "pi-extension",
    "token-optimization",
    "llm",
    "developer-tools",
    "git",
    "cli",
    "compaction",
    "context-window",
    "ai-agent"
  ],
  "files": [
    "index.ts",
    "src/**/*.ts",
    "README.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": ["./index.ts"]
  },
  "scripts": {
    "test": "vitest run --dir test",
    "test:watch": "vitest --dir test",
    "prepublishOnly": "vitest run --dir test"
  },
  "dependencies": {
    "better-sqlite3": "^11.9.1"
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@sinclair/typebox": "*"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

---

## Appendix G: Lessons from pi-lcm (Avoid These Bugs)

Issues discovered during pi-lcm's 5-agent audit that apply to pi-rtk:

1. **Session switch/fork handlers are mandatory** — Pi does NOT re-emit
   `session_start` on `/new` or `/resume`. Register `session_switch` and
   `session_fork` handlers or state goes stale.

2. **`message_end` event has no `entryId` field** — don't try to read it.

3. **`ctx.ui.setStatus()` text must be SHORT** — Pi crashes if any rendered
   line exceeds terminal width. Keep status under 20 chars.

4. **`ctx.ui.custom()` API is `(tui, theme, kb, done) => Component`** — NOT
   a factory returning an object. Wire `panel.onClose = () => done()`.
   Pass `{ overlay: true, overlayOptions: { ... } }` as second argument.

5. **SQLite: use `PRAGMA busy_timeout = 5000`** — concurrent sessions.

6. **SQLite: use `INSERT ... ON CONFLICT DO NOTHING`** — not `INSERT OR IGNORE`
   (which swallows FK violations silently).

7. **SQLite: compute seq atomically** — `INSERT INTO ... SELECT COALESCE(MAX(seq)+1, 0)`,
   not an in-memory counter.

8. **FTS5 external content tables need sync triggers** — INSERT/UPDATE/DELETE
   triggers or the index goes stale.

9. **`promptGuidelines` on tools is snapshotted once** — Pi doesn't re-read
   the getter. Put dynamic content elsewhere.

10. **Prompt caching** — never inject dynamic data into `before_agent_start`
    systemPrompt return. Use a const string only.
