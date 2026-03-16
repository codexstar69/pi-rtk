---
name: pi-rtk-worker
description: Implements pi-rtk extension features - filters, infrastructure, analytics, TUI
---

# pi-rtk Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

All pi-rtk implementation features: core infrastructure, filter modules, analytics commands, settings panel, and integration wiring.

## Work Procedure

### 1. Understand Context

- Read the feature description and preconditions carefully
- Read `IMPLEMENTATION.md` for the full specification — it contains exact output formats, filter rules, edge cases, and code examples
- Read `AGENTS.md` for API constraints (especially: tool_call CANNOT modify input, all filtering in tool_result)
- Check `.factory/library/architecture.md` for established patterns

### 2. Study Reference Patterns

Before writing ANY code, read the relevant reference files:

- **For extension entry point / hooks:** Read pi-lcm's `index.ts` at `/Users/codex/Downloads/Code Files/pi-lcm/index.ts` and the `tool-override.ts` example at `/Users/codex/.local/share/mise/installs/node/22.22.0/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/tool-override.ts`
- **For SQLite:** Read pi-lcm's `src/db/connection.ts`, `src/db/schema.ts`, `src/db/store.ts`
- **For settings:** Read pi-lcm's `src/config.ts`, `src/settings.ts` and pi-voice's config at `/Users/codex/Downloads/Code Files/pi-voice/extensions/voice/config.ts`
- **For TUI panel:** Read pi-voice's settings panel at `/Users/codex/Downloads/Code Files/pi-voice/extensions/voice/settings-panel.ts`
- **For filter logic:** Read `IMPLEMENTATION.md` Appendix B (Filter Interface & Registry) and filter specifications

### 3. Write Tests First (TDD)

For every component you implement:
1. Create the test file first (e.g., `test/git-status.test.ts`)
2. Write tests covering: happy path, empty/edge case, large output, error preservation
3. Use fixture data — real command output from IMPLEMENTATION.md examples
4. Verify tests FAIL before implementing (red)
5. Implement to make tests pass (green)

Test patterns:
```typescript
import { describe, it, expect } from "vitest";

describe("filter-name", () => {
  it("compacts typical output with >X% savings", () => { ... });
  it("handles empty output gracefully", () => { ... });
  it("preserves error messages", () => { ... });
});
```

For SQLite tests, use in-memory database:
```typescript
import Database from "better-sqlite3";
let db: Database.Database;
beforeEach(() => { db = new Database(":memory:"); ... });
afterEach(() => { db.close(); });
```

### 4. Implement

- Follow the file structure from IMPLEMENTATION.md
- Use ESM imports with `.js` extensions
- Filters must be synchronous — no async/await in filter code
- Pre-compile regex patterns at module level (const)
- Follow pi-lcm patterns for SQLite, config, settings
- Keep filter implementations focused: one file per filter
- Every filter module exports a `createXxxFilter(): Filter` factory function

### 5. Verify

After implementation:
1. Run `bun run test` — all tests must pass
2. Run `bunx tsc --noEmit` — no type errors
3. Check compression ratios in tests match spec targets (>50%, >80%, etc.)
4. Verify edge cases are covered

### 6. Run Manual Checks

For each filter, verify the output format matches IMPLEMENTATION.md exactly:
- Compare your filter's output against the spec's "After" examples
- Check emoji usage matches (📌, ✅, 📝, ❓, ✓, ✗)
- Verify summary lines are present

## Example Handoff

```json
{
  "salientSummary": "Implemented git-status and git-diff filters with TDD. git-status compresses typical output by 85% (2400→320 chars). git-diff compresses by 80% with 20-line hunk truncation. All 14 tests pass, typecheck clean.",
  "whatWasImplemented": "src/filters/git-status.ts — parses git status output, groups by staged/modified/untracked with emoji annotations, inline file listing. src/filters/git-diff.ts — stat summary + compact hunks with 20-line truncation, binary skip. Updated src/filters/index.ts registry.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "bun run test", "exitCode": 0, "observation": "14 tests pass in 2 files (git-status.test.ts, git-diff.test.ts)" },
      { "command": "bunx tsc --noEmit", "exitCode": 0, "observation": "No type errors" }
    ],
    "interactiveChecks": [
      { "action": "Compared git-status output to IMPLEMENTATION.md spec", "observed": "Format matches: 📌 branch line, ✅ Staged section, inline file listing" },
      { "action": "Verified compression ratio on 2400-char fixture", "observed": "Filtered to 310 chars = 87% savings, exceeds >50% target" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "test/git-status.test.ts",
        "cases": [
          { "name": "compacts typical status with >50% savings", "verifies": "VAL-GIT-001" },
          { "name": "clean repo produces branch-only line", "verifies": "VAL-GIT-002" },
          { "name": "50+ files inline with >60% savings", "verifies": "VAL-GIT-003" },
          { "name": "fatal error preserved", "verifies": "VAL-GIT-004" },
          { "name": "ahead/behind info in branch line", "verifies": "VAL-GIT-005" },
          { "name": "detached HEAD shows hash", "verifies": "VAL-GIT-006" },
          { "name": "unicode filenames in output", "verifies": "VAL-GIT-007" }
        ]
      },
      {
        "file": "test/git-diff.test.ts",
        "cases": [
          { "name": "typical diff compacted with >50% savings", "verifies": "VAL-GIT-008" },
          { "name": "empty diff no crash", "verifies": "VAL-GIT-009" },
          { "name": "large hunks truncated", "verifies": "VAL-GIT-010" },
          { "name": "binary diffs skipped", "verifies": "VAL-GIT-011" },
          { "name": "hunk headers contain file:line", "verifies": "VAL-GIT-012" },
          { "name": "diff stat summary present", "verifies": "VAL-GIT-013" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Pi extension API behaves differently than documented in IMPLEMENTATION.md (beyond the known tool_call limitation)
- Cannot resolve import errors for peer dependencies
- Test infrastructure (vitest) fails to run
- A precondition from a previous feature is not met (e.g., filter registry doesn't exist yet)
