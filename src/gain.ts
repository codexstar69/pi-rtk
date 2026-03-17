/**
 * /rtk gain — analytics dashboard displaying token savings per command.
 *
 * Shows a table with: Command, Runs, Raw, Filtered, Saved%, bar chart.
 * Supports time periods: 24h, 7d, 30d, all.
 * Includes a total summary row and session savings line.
 * Handles empty database gracefully.
 */

import type Database from "better-sqlite3";
import type { SavingsPeriod } from "./tracker.js";

/** Options for formatting gain output. */
export interface GainOptions {
  /** Time period to filter by. */
  period: SavingsPeriod;
  /** Cumulative session savings in tokens. */
  sessionSavings: number;
}

/** Row shape returned by the per-command breakdown query. */
interface CommandRow {
  filter_name: string;
  runs: number;
  total_raw_tokens: number;
  total_filt_tokens: number;
  avg_savings_pct: number;
}

/**
 * Convert a SavingsPeriod to a Unix-ms cutoff timestamp.
 */
function periodToCutoff(period: SavingsPeriod): number {
  const now = Date.now();
  switch (period) {
    case "24h":
      return now - 24 * 60 * 60 * 1000;
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all":
      return 0;
  }
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
 * Build a bar chart string of the given width.
 * Filled portion uses █, unfilled uses ░.
 */
function buildBar(pct: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Period label for the header.
 */
function periodLabel(period: SavingsPeriod): string {
  switch (period) {
    case "24h":
      return "Last 24h";
    case "7d":
      return "Last 7d";
    case "30d":
      return "Last 30d";
    case "all":
      return "All time";
  }
}

/**
 * Format session savings for the footer line.
 */
function formatSessionSavings(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `~${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `~${Math.round(tokens / 1000)}K`;
  }
  return `~${tokens}`;
}

/**
 * Format the full /rtk gain analytics dashboard output.
 *
 * Queries the database for per-command breakdown within the given time period,
 * formats a table with bar charts, and appends a total row + session line.
 */
export function formatGainOutput(db: Database.Database, options: GainOptions): string {
  const { period, sessionSavings } = options;
  const cutoff = periodToCutoff(period);

  // Query per-filter breakdown, ordered by total raw tokens descending
  const rows = db
    .prepare(
      `SELECT
         filter_name,
         COUNT(*)                          AS runs,
         COALESCE(SUM(raw_tokens), 0)      AS total_raw_tokens,
         COALESCE(SUM(filt_tokens), 0)     AS total_filt_tokens,
         COALESCE(AVG(savings_pct), 0)     AS avg_savings_pct
       FROM command_runs
       WHERE timestamp >= ?
       GROUP BY filter_name
       ORDER BY total_raw_tokens DESC`,
    )
    .all(cutoff) as CommandRow[];

  // Handle empty database
  if (rows.length === 0) {
    const lines: string[] = [
      `RTK Token Savings — ${periodLabel(period)}`,
      "",
      "No commands filtered yet. Run some commands and RTK will track savings.",
    ];
    if (sessionSavings > 0) {
      lines.push("");
      lines.push(`Session: ${formatSessionSavings(sessionSavings)} tokens saved`);
    } else {
      lines.push("");
      lines.push("Session: no savings yet");
    }
    return lines.join("\n");
  }

  // Compute totals
  let totalRuns = 0;
  let totalRaw = 0;
  let totalFilt = 0;
  for (const row of rows) {
    totalRuns += row.runs;
    totalRaw += row.total_raw_tokens;
    totalFilt += row.total_filt_tokens;
  }
  const totalSavedPct = totalRaw > 0 ? Math.round(((totalRaw - totalFilt) / totalRaw) * 100) : 0;

  // Column widths
  const BAR_WIDTH = 10;
  const colCommand = "Command";
  const colRuns = "Runs";
  const colRaw = "Raw";
  const colFiltered = "Filtered";
  const colSaved = "Saved";

  // Compute max widths
  const commandNames = rows.map((r) => r.filter_name);
  const commandW = Math.max(colCommand.length, ...commandNames.map((n) => n.length), "Total".length);
  const runsW = Math.max(colRuns.length, ...rows.map((r) => String(r.runs).length), String(totalRuns).length);
  const rawW = Math.max(colRaw.length, ...rows.map((r) => formatTokens(r.total_raw_tokens).length), formatTokens(totalRaw).length);
  const filtW = Math.max(colFiltered.length, ...rows.map((r) => formatTokens(r.total_filt_tokens).length), formatTokens(totalFilt).length);
  const savedW = Math.max(colSaved.length, 4); // "100%" = 4 chars

  // Format row
  function fmtRow(
    command: string,
    runs: string,
    raw: string,
    filtered: string,
    saved: string,
    bar: string,
  ): string {
    return [
      command.padEnd(commandW),
      runs.padStart(runsW),
      raw.padStart(rawW),
      filtered.padStart(filtW),
      saved.padStart(savedW),
      bar,
    ].join("  ");
  }

  // Build output
  const lines: string[] = [];

  // Header
  lines.push(`RTK Token Savings — ${periodLabel(period)}`);
  lines.push("");

  // Column headers
  lines.push(fmtRow(colCommand, colRuns, colRaw, colFiltered, colSaved, ""));

  // Separator
  const sepLen = commandW + runsW + rawW + filtW + savedW + BAR_WIDTH + 10; // 5 × 2-char gaps
  lines.push("─".repeat(sepLen));

  // Data rows
  for (const row of rows) {
    const savedPct = row.total_raw_tokens > 0
      ? Math.round(((row.total_raw_tokens - row.total_filt_tokens) / row.total_raw_tokens) * 100)
      : 0;

    lines.push(
      fmtRow(
        row.filter_name,
        String(row.runs),
        formatTokens(row.total_raw_tokens),
        formatTokens(row.total_filt_tokens),
        `${savedPct}%`,
        buildBar(savedPct, BAR_WIDTH),
      ),
    );
  }

  // Separator before total
  lines.push("─".repeat(sepLen));

  // Total row
  lines.push(
    fmtRow(
      "Total",
      String(totalRuns),
      formatTokens(totalRaw),
      formatTokens(totalFilt),
      `${totalSavedPct}%`,
      "",
    ),
  );

  // Session savings line
  lines.push("");
  if (sessionSavings > 0) {
    lines.push(`Session: ${formatSessionSavings(sessionSavings)} tokens saved`);
  } else {
    lines.push("Session: no savings yet");
  }

  return lines.join("\n");
}
