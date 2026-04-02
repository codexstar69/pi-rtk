# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.6] - 2026-04-03

### Fixed
- **Pi API compatibility: session events** — `session_start` now uses per-event
  `event.reason` detection for new Pi API (reason-based routing for `startup`,
  `reload`, `new`, `resume`, `fork`). Legacy `session_switch`/`session_fork`
  handlers preserved for backward compatibility with older Pi versions.
- No auth API changes needed — pi-rtk does not make direct LLM calls.

## [0.1.0] - 2026-03-17

### Added

- Extension entry point with `tool_call`/`tool_result` pipeline, session lifecycle, and status footer
- Command matching system with 20+ command patterns
- Filter registry with 22 filter modules (first-match dispatch)
- **Git filters**: git-status (emoji-grouped compact output), git-diff (stat + compact hunks), git-log (oneline format), git-action (push/pull/fetch/add/commit summary), git-branch (compact list)
- **Tool filters**: ls/find/fd/tree (directory grouping, noise hiding, extension summary), grep/rg (file grouping, match capping, dedup)
- **Test runner filters**: JS/TS (bun/vitest/jest), pytest, cargo test, go test -- pass/fail summary with failure details
- **Lint filters**: tsc (grouped by error code), eslint/biome (grouped by rule), ruff (grouped by rule code), cargo clippy/build (grouped by lint name)
- **Data filters**: JSON schema extraction (type replacement, collapse, max depth 3), docker ps/images (compact table), docker logs (dedup), npm/pip install (summary line), HTTP (status + summary), read-filter (comment stripping per language), log-dedup (consecutive line collapsing)
- SQLite analytics tracker with `command_runs` and `unfiltered_commands` tables
- `/rtk gain` analytics dashboard with per-command table, bar charts, time periods, totals, and session savings
- `/rtk discover` command for finding unfiltered commands with savings estimates
- `/rtk settings` TUI overlay panel with filter toggles, tee config, project/global scope
- Tee recovery system with file rotation, truncation, and output hints
- Config resolution: env vars > settings.json > defaults
- Settings persistence with atomic writes and project/global scope

### Fixed

- Read-filter: cross-line string state, YAML single-quote escape, TOML triple-quotes
- Gain separator width, utils redirect detection with quotes
- Grep: skip rg context lines, correct overflow count with dedup
- Go test counting, clippy window, ls tree detection, json grammar, excludeCommands
- Read-filter doc comments and YAML, grep false positives
- OOM in tracker token estimation, phantom matcher entries
- Settings panel http toggle, config group fallback, bun test counting
- Git-diff keeps 1 context line, git-action handles forced push
- Config test isolation with homedir mocking

[0.1.0]: https://github.com/codexstar69/pi-rtk/releases/tag/v0.1.0
