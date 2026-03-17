/**
 * Command pattern matching — detects which filter to apply to a bash command.
 * Returns a FilterMatch with the filter name, original command, and confidence.
 */

export interface FilterMatch {
  /** Filter module name (e.g., "git-status", "grep", "test-js"). */
  filter: string;
  /** The original command string that was matched. */
  command: string;
  /** Match confidence from 0 to 1. */
  confidence: number;
}

/**
 * Match rules are checked in order — first match wins.
 * Each rule has a regex pattern, the filter name, and a confidence score.
 */
interface MatchRule {
  pattern: RegExp;
  filter: string;
  confidence: number;
}

/**
 * Pre-compiled match rules. Order matters: more specific patterns come first.
 * Patterns are tested against the trimmed command string.
 */
const RULES: readonly MatchRule[] = [
  // ── Git subcommands (specific before general) ───────────────────
  { pattern: /^git\s+status\b/, filter: "git-status", confidence: 1.0 },
  { pattern: /^git\s+diff\b/, filter: "git-diff", confidence: 1.0 },
  { pattern: /^git\s+log\b/, filter: "git-log", confidence: 1.0 },
  { pattern: /^git\s+(push|pull|fetch)\b/, filter: "git-action", confidence: 1.0 },
  { pattern: /^git\s+(add|commit)\b/, filter: "git-action", confidence: 1.0 },
  { pattern: /^git\s+branch\b/, filter: "git-branch", confidence: 1.0 },
  // TODO: add git-stash filter before re-enabling
  // { pattern: /^git\s+stash\b/, filter: "git-stash", confidence: 1.0 },

  // ── ls / exa / eza ──────────────────────────────────────────────
  { pattern: /^(ls|exa|eza)\b/, filter: "ls", confidence: 1.0 },

  // ── find / fd ───────────────────────────────────────────────────
  { pattern: /^(find|fd)\b/, filter: "find", confidence: 1.0 },

  // ── tree ────────────────────────────────────────────────────────
  { pattern: /^tree\b/, filter: "tree", confidence: 1.0 },

  // ── grep / rg ───────────────────────────────────────────────────
  { pattern: /^(rg|grep)\b/, filter: "grep", confidence: 1.0 },

  // ── Test runners (JS) — must come before generic npm/bun/pnpm ──
  { pattern: /^(bunx|npx)\s+(vitest|jest)\b/, filter: "test-js", confidence: 1.0 },
  { pattern: /^(vitest|jest)\b/, filter: "test-js", confidence: 1.0 },
  { pattern: /^(bun|npm|pnpm|yarn)\s+(test|run\s+test)\b/, filter: "test-js", confidence: 1.0 },

  // ── Test runners (Python) ───────────────────────────────────────
  { pattern: /^pytest\b/, filter: "test-py", confidence: 1.0 },
  { pattern: /^python3?\s+-m\s+pytest\b/, filter: "test-py", confidence: 1.0 },

  // ── Test runners (Rust) ─────────────────────────────────────────
  { pattern: /^cargo\s+test\b/, filter: "test-rs", confidence: 1.0 },

  // ── Test runners (Go) ──────────────────────────────────────────
  { pattern: /^go\s+test\b/, filter: "test-go", confidence: 1.0 },

  // ── Linters / typecheckers ──────────────────────────────────────
  { pattern: /^(bunx|npx)\s+tsc\b/, filter: "lint-tsc", confidence: 1.0 },
  { pattern: /^tsc\b/, filter: "lint-tsc", confidence: 1.0 },
  { pattern: /^(eslint|biome)\b/, filter: "lint-js", confidence: 1.0 },
  { pattern: /^ruff\b/, filter: "lint-py", confidence: 1.0 },
  { pattern: /^cargo\s+(clippy|build)\b/, filter: "lint-rs", confidence: 1.0 },

  // ── Docker ──────────────────────────────────────────────────────
  // TODO: add docker-compose filter before re-enabling
  // { pattern: /^docker\s+compose\b/, filter: "docker-compose", confidence: 1.0 },
  // { pattern: /^docker-compose\b/, filter: "docker-compose", confidence: 1.0 },
  { pattern: /^docker\s+(ps|images)\b/, filter: "docker-list", confidence: 1.0 },
  { pattern: /^docker\s+logs\b/, filter: "docker-logs", confidence: 1.0 },
  // TODO: add kubectl filter before re-enabling
  // { pattern: /^kubectl\b/, filter: "kubectl", confidence: 1.0 },

  // ── Package managers (install) ──────────────────────────────────
  { pattern: /^(bun|npm|pnpm|yarn)\s+(install|add|i)\b/, filter: "npm-install", confidence: 1.0 },
  { pattern: /^pip3?\s+install\b/, filter: "pip-install", confidence: 1.0 },

  // ── HTTP clients ────────────────────────────────────────────────
  { pattern: /^(curl|wget|xh|http)\b/, filter: "http", confidence: 0.9 },
];

/**
 * Match a bash command string to a filter.
 * Returns a FilterMatch on success, or null if no filter matches.
 */
export function matchCommand(cmd: string): FilterMatch | null {
  const trimmed = cmd.trim();
  if (trimmed.length === 0) return null;

  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        filter: rule.filter,
        command: trimmed,
        confidence: rule.confidence,
      };
    }
  }

  return null;
}
