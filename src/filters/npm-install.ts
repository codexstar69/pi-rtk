/**
 * Package-manager install filter — compresses bun/npm/pnpm/yarn/pip install
 * output to a single "ok ✓ N packages installed (duration)" line.
 *
 * Vulnerability warnings and audit summaries are preserved verbatim since
 * they contain actionable security information the LLM should see.
 *
 * Output format (success, no vulnerabilities):
 *   ok ✓ 42 packages installed (3.2s)
 *
 * Output format (success, with vulnerabilities):
 *   ok ✓ 42 packages installed (3.2s)
 *   ⚠ 3 vulnerabilities (1 moderate, 2 high)
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
}

/** Patterns that indicate vulnerability / audit warnings to preserve. */
const VULN_PATTERNS = [
  /vulnerabilit/i,
  /\d+\s+(low|moderate|high|critical)/i,
  /npm\s+audit/i,
  /security\s+audit/i,
  /run\s+.*audit/i,
  /deprecated/i,
];

/**
 * Extract package count from various installer outputs.
 */
function extractPackageCount(raw: string): number | null {
  // bun: "42 packages installed"
  const bunMatch = raw.match(/(\d+)\s+packages?\s+installed/i);
  if (bunMatch) return parseInt(bunMatch[1], 10);

  // npm: "added 42 packages"
  const npmMatch = raw.match(/added\s+(\d+)\s+packages?/i);
  if (npmMatch) return parseInt(npmMatch[1], 10);

  // pnpm: "Packages: +42"
  const pnpmMatch = raw.match(/Packages:\s*\+(\d+)/);
  if (pnpmMatch) return parseInt(pnpmMatch[1], 10);

  // yarn: "Added 42 packages"
  const yarnMatch = raw.match(/(?:added|✨)\s+(\d+)\s+packages?/i);
  if (yarnMatch) return parseInt(yarnMatch[1], 10);

  // pip: "Successfully installed package1 package2 ..."
  const pipMatch = raw.match(/Successfully installed\s+(.+)/i);
  if (pipMatch) {
    const pkgs = pipMatch[1].trim().split(/\s+/);
    return pkgs.length;
  }

  // Fallback: look for any "N packages" mention
  const generic = raw.match(/(\d+)\s+packages?/i);
  if (generic) return parseInt(generic[1], 10);

  return null;
}

/**
 * Extract install duration from various installer outputs.
 */
function extractDuration(raw: string): string | null {
  // bun: "[42.00ms]" or "[1.23s]"
  const bunDur = raw.match(/\[(\d+(?:\.\d+)?(?:ms|s))\]/);
  if (bunDur) return bunDur[1];

  // npm: "in 3s" or "in 3.2s"
  const npmDur = raw.match(/in\s+(\d+(?:\.\d+)?s)/);
  if (npmDur) return npmDur[1];

  // pnpm: "Done in 1.2s"
  const pnpmDur = raw.match(/Done in\s+(\d+(?:\.\d+)?s)/i);
  if (pnpmDur) return pnpmDur[1];

  // Generic seconds/ms pattern
  const generic = raw.match(/(\d+(?:\.\d+)?)\s*(ms|s|seconds?|minutes?)/i);
  if (generic) {
    const val = generic[1];
    const unit = generic[2].toLowerCase();
    if (unit.startsWith("minute")) return `${val}m`;
    if (unit === "seconds" || unit === "second") return `${val}s`;
    return `${val}${unit}`;
  }

  return null;
}

/**
 * Extract vulnerability/audit warning lines.
 */
function extractVulnerabilities(raw: string): string[] {
  const lines = raw.split("\n");
  const vulnLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (VULN_PATTERNS.some((re) => re.test(trimmed))) {
      vulnLines.push(trimmed);
    }
  }

  return vulnLines;
}

// ── npm-install filter ────────────────────────────────────────────

export function createNpmInstallFilter(): Filter {
  return {
    name: "npm-install",

    matches(command: string): boolean {
      return /^(bun|npm|pnpm|yarn)\s+(install|add|i)\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const cleaned = strip(raw);

      const count = extractPackageCount(cleaned);
      const duration = extractDuration(cleaned);
      const vulns = extractVulnerabilities(cleaned);

      // Build summary line
      const parts: string[] = [];

      if (count !== null) {
        let summary = `ok ✓ ${count} packages installed`;
        if (duration) summary += ` (${duration})`;
        parts.push(summary);
      } else {
        // No package count found — still summarize
        let summary = "ok ✓ install completed";
        if (duration) summary += ` (${duration})`;
        parts.push(summary);
      }

      // Append vulnerability warnings
      if (vulns.length > 0) {
        parts.push("");
        for (const v of vulns) {
          parts.push(`⚠ ${v}`);
        }
      }

      const filtered = parts.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}

// ── pip-install filter ────────────────────────────────────────────

export function createPipInstallFilter(): Filter {
  return {
    name: "pip-install",

    matches(command: string): boolean {
      return /^pip3?\s+install\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const cleaned = strip(raw);

      const count = extractPackageCount(cleaned);
      const duration = extractDuration(cleaned);
      const vulns = extractVulnerabilities(cleaned);

      // Build summary line
      const parts: string[] = [];

      if (count !== null) {
        let summary = `ok ✓ ${count} packages installed`;
        if (duration) summary += ` (${duration})`;
        parts.push(summary);
      } else {
        let summary = "ok ✓ install completed";
        if (duration) summary += ` (${duration})`;
        parts.push(summary);
      }

      // Append vulnerability warnings
      if (vulns.length > 0) {
        parts.push("");
        for (const v of vulns) {
          parts.push(`⚠ ${v}`);
        }
      }

      const filtered = parts.join("\n");
      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
