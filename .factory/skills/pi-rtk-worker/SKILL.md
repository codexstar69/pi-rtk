---
name: pi-rtk-worker
description: Implements pi-rtk features using TDD
---

# pi-rtk Worker

## Work Procedure

1. Read your feature description - it contains everything you need
2. Write tests first, then implement to make them pass
3. Run `bun run test` and `bunx tsc --noEmit` to verify
4. Do NOT read IMPLEMENTATION.md - all needed info is in the feature description and AGENTS.md

## When to Return to Orchestrator

- Cannot resolve import errors
- Test infrastructure fails to run
- A precondition is not met
