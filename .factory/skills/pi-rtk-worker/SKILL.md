---
name: pi-rtk-worker
description: Implements pi-rtk extension features - filters, infrastructure, analytics, TUI
---

# pi-rtk Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

All pi-rtk implementation features.

## Work Procedure

### 1. Read Feature Context

- Read your assigned feature description, expectedBehavior, and verificationSteps carefully
- Read `AGENTS.md` in the mission directory for coding conventions and API constraints
- Read ONLY the specific sections of `IMPLEMENTATION.md` relevant to your feature (use Grep to find them rather than reading the whole file)
- IMPORTANT: Do NOT read the entire IMPLEMENTATION.md - it is 52KB. Search for specific sections you need.

### 2. Study Patterns (only what you need)

Reference files - read ONLY the ones relevant to your current feature:

- **For project setup:** Read pi-lcm's `package.json` at `/Users/codex/Downloads/Code Files/pi-lcm/package.json` and `tsconfig.json`
- **For SQLite:** Read pi-lcm's `src/db/connection.ts` and `src/db/schema.ts` at `/Users/codex/Downloads/Code Files/pi-lcm/src/db/`
- **For settings/config:** Read pi-lcm's `src/config.ts` and `src/settings.ts`
- **For extension entry point:** Read pi-lcm's `index.ts` (first 100 lines)
- **For TUI panel:** Read pi-voice's settings panel at `/Users/codex/Downloads/Code Files/pi-voice/extensions/voice/settings-panel.ts` (first 100 lines)
- **For filter logic:** Grep IMPLEMENTATION.md for the specific filter section you need

### 3. Write Tests First (TDD)

1. Create the test file first
2. Write tests covering: happy path, empty/edge case, error preservation
3. Use fixture data from IMPLEMENTATION.md examples
4. Implement to make tests pass

### 4. Implement

- ESM with `.js` extensions in imports
- Filters must be synchronous
- Pre-compile regex at module level
- Each filter exports a `createXxxFilter(): Filter` factory function

### 5. Verify

1. Run `bun run test` - all tests must pass
2. Run `bunx tsc --noEmit` - no type errors

## Example Handoff

```json
{
  "salientSummary": "Implemented git-status filter with TDD. Compresses typical output by 85%. All 7 tests pass, typecheck clean.",
  "whatWasImplemented": "src/filters/git-status.ts with test/git-status.test.ts. Registered in filter registry.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "bun run test", "exitCode": 0, "observation": "7 tests pass" },
      { "command": "bunx tsc --noEmit", "exitCode": 0, "observation": "No type errors" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "test/git-status.test.ts",
        "cases": [
          { "name": "compacts typical status with >50% savings", "verifies": "VAL-GIT-001" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Cannot resolve import errors for peer dependencies
- Test infrastructure (vitest) fails to run
- A precondition from a previous feature is not met
