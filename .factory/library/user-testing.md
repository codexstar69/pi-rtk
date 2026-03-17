# User Testing

Testing surface, validation approach, and resource cost classification.

---

## Validation Surface

This is a pure TypeScript library/extension — **no web UI, no browser, no servers**.

**Primary surface:** Unit tests via Vitest (`bun run test` → `vitest run --dir test`)
**Secondary surface:** TypeScript typecheck (`bunx tsc --noEmit`)

There is no interactive user surface to test via browser or TUI automation. The extension runs inside Pi's process and its behavior is fully testable via unit tests with fixture data.

## Validation Approach

1. Run `bun run test` — all tests must pass
2. Run `bunx tsc --noEmit` — no type errors
3. Code review for pattern compliance with pi-lcm

## Validation Concurrency

**Surface: vitest**
- Each test process uses ~200MB RAM
- Machine: 36GB RAM, 14 cores
- Max concurrent validators: **5** (well within budget)
- Tests are CPU-bound (string processing), not I/O-bound

## Flow Validator Guidance: vitest

**Surface type:** Unit test execution via `bun run test` / `vitest run --dir test`

**Isolation:** Each flow validator group can run specific test files via `bun run test -- <pattern>`. Test files are isolated by Vitest — no shared mutable state between test files. In-memory SQLite (`:memory:`) is used in all DB tests.

**Boundaries:**
- Do NOT modify source files or test files
- Do NOT install/uninstall packages
- Read test output to verify assertion evidence
- Each assertion maps to one or more specific `it()` / `describe()` blocks
- Match assertion descriptions to test names to verify evidence exists

**Concurrency:** Multiple test file patterns can be run in parallel since Vitest isolates test files. However, since the full suite runs in <500ms, running the full suite once and mapping output is more efficient than running individual files.

**Evidence collection:** Save test output to the evidence directory. Map each assertion ID to the specific test(s) that verify it.
