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
