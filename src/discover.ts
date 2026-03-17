/**
 * /rtk discover — identify unfiltered commands that could save tokens.
 *
 * Analyzes the unfiltered_commands table, matches each command to a filter
 * via the matcher, estimates savings using typical filter ratios, groups
 * by command pattern, and shows total estimated savings.
 */

import type Database from "better-sqlite3";
import { matchCommand } from "./matcher.js";

/** Typical savings ratio per filter, based on real-world RTK data. */
const TYPICAL_SAVINGS: Record<string, number> = {
  "git-status": 0.87,
  "git-diff": 0.80,
  "git-log": 0.92,
  "git-action": 0.95,
  "git-branch": 0.75,
  "git-stash": 0.80,
  ls: 0.80,
  find: 0.75,
  tree: 0.75,
  grep: 0.84,
  "test-js": 0.95,
  "test-py": 0.90,
  "test-rs": 0.85,
  "test-go": 0.85,
  "lint-tsc": 0.87,
  "lint-js": 0.70,
  "lint-py": 0.75,
  "lint-rs": 0.80,
  "json-schema": 0.93,
  "docker-list": 0.80,
  "docker-logs": 0.90,
  "docker-compose": 0.90,
  kubectl: 0.80,
  "npm-install": 0.90,
  "pip-install": 0.90,
  "read-filter": 0.60,
  "log-dedup": 0.70,
  http: 0.80,
};

/** Default savings ratio when no specific ratio is configured. */
const DEFAULT_SAVINGS_RATIO = 0.75;

/** Row returned from the unfiltered_commands aggregation query. */
interface UnfilteredRow {
  command: string;
  runs: number;
  total_chars: number;
  avg_chars: number;
}

/** A discovered opportunity after matching and estimating. */
interface Opportunity {
  command: string;
  filterName: string;
  runs: number;
  totalChars: number;
  avgChars: number;
  savingsRatio: number;
  estimatedSavedChars: number;
  estimatedSavedTokens: number;
}

/**
 * Format a token count as a human-readable string (e.g., 1.2K, 3.5M).
 */
function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return `${count}`;
}

/**
 * Format the /rtk discover output.
 *
 * Queries unfiltered_commands, matches each to a filter, estimates savings,
 * and produces human-readable output with per-command details and total.
 */
export function formatDiscoverOutput(db: Database.Database): string {
  // Query unfiltered commands grouped by command pattern
  const rows = db
    .prepare(
      `SELECT
         command,
         COUNT(*)                      AS runs,
         COALESCE(SUM(char_count), 0)  AS total_chars,
         COALESCE(AVG(char_count), 0)  AS avg_chars
       FROM unfiltered_commands
       GROUP BY command
       ORDER BY total_chars DESC`,
    )
    .all() as UnfilteredRow[];

  if (rows.length === 0) {
    return [
      "RTK Discover — Missed Optimization Opportunities",
      "",
      "No unfiltered commands found. All recent commands are being filtered!",
    ].join("\n");
  }

  // Match each command to a filter and compute estimates
  const opportunities: Opportunity[] = [];

  for (const row of rows) {
    const match = matchCommand(row.command);
    if (!match) continue; // No applicable filter — skip

    const savingsRatio = TYPICAL_SAVINGS[match.filter] ?? DEFAULT_SAVINGS_RATIO;
    const estimatedSavedChars = Math.round(row.total_chars * savingsRatio);
    const estimatedSavedTokens = Math.ceil(estimatedSavedChars / 4);

    opportunities.push({
      command: row.command,
      filterName: match.filter,
      runs: row.runs,
      totalChars: row.total_chars,
      avgChars: Math.round(row.avg_chars),
      savingsRatio,
      estimatedSavedChars,
      estimatedSavedTokens,
    });
  }

  if (opportunities.length === 0) {
    return [
      "RTK Discover — Missed Optimization Opportunities",
      "",
      "No opportunities found. Unfiltered commands don't match any known filter.",
    ].join("\n");
  }

  // Sort by estimated saved tokens descending
  opportunities.sort((a, b) => b.estimatedSavedTokens - a.estimatedSavedTokens);

  // Build output
  const lines: string[] = [];

  lines.push("RTK Discover — Missed Optimization Opportunities");
  lines.push("");
  lines.push("These commands ran without filtering and could save tokens:");
  lines.push("");

  for (const opp of opportunities) {
    const pct = Math.round(opp.savingsRatio * 100);
    const avgTokens = formatTokens(Math.ceil(opp.avgChars / 4));
    const savedTokens = formatTokens(opp.estimatedSavedTokens);

    lines.push(
      `  ${opp.command} (ran ${opp.runs}x, ~${avgTokens} tokens each) → ${opp.filterName} filter would save ~${pct}%`,
    );
  }

  // Total estimated savings
  const totalSavedTokens = opportunities.reduce(
    (sum, opp) => sum + opp.estimatedSavedTokens,
    0,
  );

  lines.push("");
  lines.push(`Estimated additional savings: ~${formatTokens(totalSavedTokens)} tokens/session`);

  return lines.join("\n");
}
