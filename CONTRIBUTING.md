# Contributing to pi-rtk

Thanks for your interest in contributing! This guide covers development setup, testing, and PR guidelines.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) (package manager and test runner)
- [Node.js](https://nodejs.org/) 20 or later
- [Pi](https://github.com/badlogic/pi-mono) (for testing the extension in context)

### Clone and Install

```bash
git clone https://github.com/codexstar69/pi-rtk.git
cd pi-rtk
bun install
```

### Run Tests

```bash
# Run all tests
bun test

# Watch mode
bun run test:watch

# Run a specific test file
bun test test/git-status.test.ts
```

### Typecheck

```bash
bunx tsc --noEmit
```

## Project Structure

```
index.ts              # Extension entry point
src/
  pipeline.ts         # tool_call/tool_result handler logic
  filters/            # 22 filter modules
    index.ts          # Registry (first-match dispatch)
    git-status.ts     # One file per filter
    ...
  config.ts           # Config resolution
  settings.ts         # Settings persistence
  tracker.ts          # SQLite analytics
  tee.ts              # Raw output recovery
  gain.ts             # /rtk gain formatting
  discover.ts         # /rtk discover formatting
  utils.ts            # Helpers
  db/                 # SQLite connection + migrations
test/                 # Test files (one per module)
```

## Writing a New Filter

1. Create `src/filters/my-filter.ts` implementing the `Filter` interface:

```typescript
import type { Filter, FilterResult } from "./index.js";

export function createMyFilter(): Filter {
  return {
    name: "my-filter",
    matches(command: string): boolean {
      return /^my-command\b/.test(command);
    },
    apply(command: string, rawOutput: string): FilterResult {
      // Your compression logic here
      const filtered = "...";
      return { filtered, rawChars: rawOutput.length, filteredChars: filtered.length };
    },
  };
}
```

2. Register it in `src/filters/index.ts` -- add the import and append to `ALL_FILTERS`
3. Map the filter name to a config group in `src/config.ts` (`getFilterGroup`)
4. Write tests in `test/my-filter.test.ts` covering: happy path, empty output, large output, error output, edge cases
5. All filters must be synchronous (no async). Keep execution under 5ms.

## Pull Request Guidelines

- One filter or feature per PR
- All tests must pass (`bun test`)
- Typecheck must pass (`bunx tsc --noEmit`)
- Include tests for any new or changed behavior
- Keep filter output deterministic (no randomness, no timestamps in output)
- Write commit messages that explain *why*, not just *what*

## Reporting Bugs

Use [GitHub Issues](https://github.com/codexstar69/pi-rtk/issues) with the bug report template. Include:
- The command that produced unexpected output
- Raw output (before filtering)
- Filtered output (what RTK produced)
- Expected output (what you think it should be)

## Code Style

- TypeScript strict mode
- ESM imports with `.js` extensions
- Functions, not classes (except where Pi API requires it)
- Pre-compile regex patterns at module level
- No external dependencies beyond better-sqlite3
