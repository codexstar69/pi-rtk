/**
 * Docker filter — handles `docker ps`, `docker images` (compact table with
 * short IDs, no full SHA), and `docker logs` (delegates to log dedup logic
 * to collapse repeated lines).
 *
 * Output format (docker ps):
 *   CONTAINER ID  IMAGE         STATUS       PORTS        NAMES
 *   abc123def     nginx:latest  Up 2 hours   80/tcp       web
 *   ...
 *
 * Output format (docker logs):
 *   Repeated lines collapsed with (xN) suffix.
 */

import type { Filter, FilterResult } from "./index.js";

// ── Helpers ────────────────────────────────────────────────────────

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
}

/** Truncate a SHA to 12 chars. */
function shortId(id: string): string {
  if (/^[a-f0-9]{12,}$/i.test(id)) return id.slice(0, 12);
  return id;
}

/** Truncate a SHA-like image ID (sha256:...). */
function shortImageId(id: string): string {
  const sha = id.match(/^sha256:([a-f0-9]+)$/i);
  if (sha) return sha[1].slice(0, 12);
  return shortId(id);
}

// ── Docker ps / images table compaction ───────────────────────────

/**
 * Parse a docker ps/images table and compact it:
 * - Shorten container/image IDs to 12 chars
 * - Strip full SHA256 hashes
 * - Remove excess whitespace but keep alignment
 */
function compactTable(raw: string): string {
  const lines = strip(raw).split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "";

  // First line is the header
  const header = lines[0];
  const rows = lines.slice(1);

  // Detect columns by finding header boundaries
  // Docker uses fixed-width columns — we'll parse naively by splitting on 2+ spaces
  const compactedRows = rows.map((row) => {
    // Shorten any hex IDs that look like container/image IDs
    return row.replace(/\b[a-f0-9]{12,64}\b/gi, (match) => shortId(match));
  });

  const result = [header, ...compactedRows].join("\n");
  return result;
}

// ── Docker logs dedup ─────────────────────────────────────────────

/**
 * Simple log line deduplication: collapse 3+ consecutive identical lines
 * into a single line with (xN) suffix. Lines with different timestamps
 * but same message are also collapsed.
 *
 * This is an inline implementation; when the full log-dedup filter is
 * available, docker logs can delegate to it.
 */
function dedupLogs(raw: string): string {
  const lines = strip(raw).split("\n");
  if (lines.length === 0) return "";

  /** Strip common timestamp prefixes for comparison. */
  function normalizeForComparison(line: string): string {
    // Docker log timestamps: 2024-01-15T10:30:00.000Z or similar ISO
    return line
      .replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?\s*/g, "")
      // Common syslog-style: Jan 15 10:30:00
      .replace(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s*/g, "")
      // Bracketed timestamps: [2024-01-15 10:30:00]
      .replace(/^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?\]\s*/g, "")
      .trim();
  }

  const result: string[] = [];
  let prevNorm = "";
  let prevLine = "";
  let count = 0;

  for (const line of lines) {
    const norm = normalizeForComparison(line);

    if (norm === prevNorm && norm !== "") {
      count++;
    } else {
      // Flush previous run
      if (count >= 3) {
        result.push(`${prevLine} (x${count})`);
      } else {
        for (let i = 0; i < count; i++) {
          result.push(prevLine);
        }
      }
      prevNorm = norm;
      prevLine = line;
      count = 1;
    }
  }

  // Flush last run
  if (count >= 3) {
    result.push(`${prevLine} (x${count})`);
  } else {
    for (let i = 0; i < count; i++) {
      result.push(prevLine);
    }
  }

  return result.join("\n");
}

// ── Filter exports ────────────────────────────────────────────────

export function createDockerListFilter(): Filter {
  return {
    name: "docker-list",

    matches(command: string): boolean {
      return /^docker\s+(ps|images)\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const filtered = compactTable(raw);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}

export function createDockerLogsFilter(): Filter {
  return {
    name: "docker-logs",

    matches(command: string): boolean {
      return /^docker\s+logs\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const filtered = dedupLogs(raw);
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
