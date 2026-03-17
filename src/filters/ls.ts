/**
 * Ls/find/fd/tree filter — compresses directory listing output into a compact
 * format with directory grouping, noise directory hiding, human-readable sizes,
 * and an extension breakdown summary.
 *
 * Output format (ls):
 *   src/ (14 files)
 *   test/ (4 files)
 *   index.ts  11.3K
 *   package.json  1.4K
 *   📊 12 files, 4 dirs (5 .ts, 3 .json, 2 .md, +4 more)
 *
 * Output format (find/fd):
 *   src/ (4 files)
 *      index.ts  matcher.ts  config.ts  utils.ts
 *   src/filters/ (3 files)
 *      index.ts  git-status.ts  git-diff.ts
 *   test/ (3 files)
 *      matcher.test.ts  config.test.ts  utils.test.ts
 *   📊 13 files in 5 dirs (7 .ts, 2 .json, 1 .md, +2 more)
 */

import type { Filter, FilterResult } from "./index.js";

/** Directories to hide from output (noise). */
const NOISE_DIRS = new Set([
  "node_modules",
  ".git",
  "target",
  "__pycache__",
  ".venv",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".cache",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "venv",
  "env",
  ".parcel-cache",
  ".turbo",
]);

/** Max extensions to show in summary before "+N more". */
const MAX_EXTENSIONS = 4;

// ── Helpers ───────────────────────────────────────────────────────

/** Format a byte count into human-readable B/K/M/G. */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

/** Extract file extension (e.g., ".ts") or empty string. */
function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot);
}

/** Check if a path segment or full path contains a noise directory. */
function isNoisePath(path: string): boolean {
  const segments = path.split("/");
  return segments.some((seg) => NOISE_DIRS.has(seg));
}

/** Build the extension breakdown summary. */
function extensionSummary(extensions: Map<string, number>): string {
  if (extensions.size === 0) return "";
  const sorted = [...extensions.entries()].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, MAX_EXTENSIONS);
  const parts = shown.map(([ext, count]) => `${count} ${ext}`);
  const remaining = sorted.length - shown.length;
  if (remaining > 0) {
    parts.push(`+${remaining} more`);
  }
  return `(${parts.join(", ")})`;
}

// ── ls -la parser ─────────────────────────────────────────────────

/** Pre-compiled regex for ls -la file entries. */
const RE_LS_FILE = /^[-l](?:[rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/;
/** Pre-compiled regex for ls -la directory entries. */
const RE_LS_DIR = /^d(?:[rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+\d+\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/;

/** Regex for eza/exa long listing: file line. */
const RE_EZA_FILE = /^\.?[rwxsStT-]+\s+([0-9.]+[kKmMgG]?)\s+\S+\s+\d+\s+\w+\s+[\d:]+\s+(.+)$/;
/** Regex for eza/exa long listing: directory line. */
const RE_EZA_DIR = /^d[rwxsStT-]+\s+[-–]\s+\S+\s+\d+\s+\w+\s+[\d:]+\s+(.+)$/;

interface LsEntry {
  name: string;
  isDir: boolean;
  size: number; // bytes, -1 if unknown
}

function parseLsLong(raw: string): LsEntry[] {
  const entries: LsEntry[] = [];
  const lines = raw.split("\n");

  for (const line of lines) {
    // Skip "total N" line and blank lines
    if (/^total\s+\d+/.test(line) || line.trim() === "") continue;

    // Try standard ls -la file
    const fileMatch = line.match(RE_LS_FILE);
    if (fileMatch) {
      const size = parseInt(fileMatch[1], 10);
      const name = fileMatch[2].trim();
      entries.push({ name, isDir: false, size });
      continue;
    }

    // Try standard ls -la directory
    const dirMatch = line.match(RE_LS_DIR);
    if (dirMatch) {
      const name = dirMatch[1].trim();
      entries.push({ name, isDir: true, size: -1 });
      continue;
    }

    // Try eza/exa directory format
    const ezaDirMatch = line.match(RE_EZA_DIR);
    if (ezaDirMatch) {
      const name = ezaDirMatch[1].trim();
      entries.push({ name, isDir: true, size: -1 });
      continue;
    }

    // Try eza/exa file format
    const ezaFileMatch = line.match(RE_EZA_FILE);
    if (ezaFileMatch) {
      const sizeStr = ezaFileMatch[1];
      const name = ezaFileMatch[2].trim();
      const size = parseEzaSize(sizeStr);
      entries.push({ name, isDir: false, size });
      continue;
    }
  }

  return entries;
}

/** Parse eza size string like "11k", "1.4k", "375" to bytes. */
function parseEzaSize(s: string): number {
  const match = s.match(/^([0-9.]+)\s*([kKmMgG])?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] ?? "").toLowerCase();
  if (suffix === "k") return Math.round(num * 1024);
  if (suffix === "m") return Math.round(num * 1024 * 1024);
  if (suffix === "g") return Math.round(num * 1024 * 1024 * 1024);
  return Math.round(num);
}

// ── Simple ls (no flags) parser ───────────────────────────────────

function parseSimpleLs(raw: string): LsEntry[] {
  const entries: LsEntry[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    const name = line.trim();
    if (!name) continue;
    // Heuristic: entries without extensions and not starting with . are likely dirs
    // But we can't know for sure without -la. Treat all as files for compact output.
    entries.push({ name, isDir: false, size: -1 });
  }
  return entries;
}

// ── find/fd parser ────────────────────────────────────────────────

interface GroupedFiles {
  /** Map from directory path to list of filenames. */
  groups: Map<string, string[]>;
  totalFiles: number;
}

function parseFindOutput(raw: string): GroupedFiles {
  const groups = new Map<string, string[]>();
  let totalFiles = 0;

  const lines = raw.split("\n");
  for (const line of lines) {
    let path = line.trim();
    if (!path) continue;

    // Strip leading "./" from find output
    if (path.startsWith("./")) path = path.slice(2);

    // Skip noise directories
    if (isNoisePath(path)) continue;

    const lastSlash = path.lastIndexOf("/");
    let dir: string;
    let file: string;

    if (lastSlash >= 0) {
      dir = path.slice(0, lastSlash);
      file = path.slice(lastSlash + 1);
    } else {
      dir = ".";
      file = path;
    }

    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(file);
    totalFiles++;
  }

  return { groups, totalFiles };
}

// ── tree parser ───────────────────────────────────────────────────

function parseTreeOutput(raw: string): GroupedFiles {
  const groups = new Map<string, string[]>();
  let totalFiles = 0;

  // Tree output uses unicode box-drawing characters.
  // We extract file paths by tracking indentation for directory context.
  const lines = raw.split("\n");
  const dirStack: string[] = [];

  for (const line of lines) {
    // Skip the summary line (e.g., "3 directories, 12 files")
    if (/^\d+\s+director/.test(line)) continue;
    // Skip the root "." line
    if (line.trim() === ".") continue;
    if (line.trim() === "") continue;

    // Strip tree drawing characters to get indent level and name
    const stripped = line.replace(/[│├└──┬─\s]/g, "").replace(/\|/g, "");
    if (!stripped) continue;

    // Calculate depth from tree indentation
    // Each level is approximately 4 chars: "│   " or "├── " or "└── "
    const depthMatch = line.match(/^([│├└\s|]*)/);
    const prefix = depthMatch ? depthMatch[1] : "";
    // Count depth by looking at "├", "└", or "│" markers
    const depth = Math.floor(prefix.replace(/\s/g, "").length);

    // Extract the actual name
    const nameMatch = line.match(/[├└──]+\s*(.+)$/);
    const name = nameMatch ? nameMatch[1].trim() : stripped;

    if (!name) continue;

    // Determine if this is a directory (ends with / in some tree modes,
    // or has children in the tree). We use the heuristic that entries
    // without an extension and not at the leaf are directories.
    // For simplicity, we just collect all entries and group by their parent.

    // Adjust directory stack
    while (dirStack.length > depth) dirStack.pop();

    const isDir = !name.includes(".");
    if (isDir) {
      dirStack[depth] = name;
      continue;
    }

    // Build parent path
    const parentPath = dirStack.slice(0, depth).join("/") || ".";

    // Skip noise
    if (isNoisePath(parentPath) || isNoisePath(name)) continue;

    if (!groups.has(parentPath)) groups.set(parentPath, []);
    groups.get(parentPath)!.push(name);
    totalFiles++;
  }

  return { groups, totalFiles };
}

// ── Format output ─────────────────────────────────────────────────

function formatLsOutput(entries: LsEntry[]): string {
  // Filter noise
  const filtered = entries.filter((e) => {
    if (e.name === "." || e.name === "..") return false;
    if (e.isDir && NOISE_DIRS.has(e.name)) return false;
    return true;
  });

  if (filtered.length === 0) return "";

  const dirs = filtered.filter((e) => e.isDir);
  const files = filtered.filter((e) => !e.isDir);
  const result: string[] = [];

  // Directories first
  for (const d of dirs) {
    result.push(`${d.name}/`);
  }

  // Files with sizes
  for (const f of files) {
    if (f.size >= 0) {
      result.push(`${f.name}  ${humanSize(f.size)}`);
    } else {
      result.push(f.name);
    }
  }

  // Extension breakdown
  const extensions = new Map<string, number>();
  for (const f of files) {
    const ext = getExt(f.name);
    if (ext) {
      extensions.set(ext, (extensions.get(ext) ?? 0) + 1);
    }
  }

  const dirCount = dirs.length;
  const fileCount = files.length;
  const extSummary = extensionSummary(extensions);

  if (fileCount > 0 || dirCount > 0) {
    const parts: string[] = [];
    if (fileCount > 0) parts.push(`${fileCount} files`);
    if (dirCount > 0) parts.push(`${dirCount} dirs`);
    const summary = parts.join(", ");
    result.push(`\n📊 ${summary}${extSummary ? " " + extSummary : ""}`);
  }

  return result.join("\n");
}

function formatGroupedOutput(grouped: GroupedFiles): string {
  if (grouped.totalFiles === 0) return "";

  const result: string[] = [];
  const allExtensions = new Map<string, number>();
  let totalDirs = 0;

  // Sort directories for consistent output
  const sortedDirs = [...grouped.groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  for (const [dir, files] of sortedDirs) {
    totalDirs++;
    const dirLabel = dir === "." ? "./" : `${dir}/`;
    result.push(`${dirLabel} (${files.length} files)`);
    result.push(`   ${files.join("  ")}`);

    for (const f of files) {
      const ext = getExt(f);
      if (ext) {
        allExtensions.set(ext, (allExtensions.get(ext) ?? 0) + 1);
      }
    }
  }

  const extSummary = extensionSummary(allExtensions);
  result.push(
    `\n📊 ${grouped.totalFiles} files in ${totalDirs} dirs${extSummary ? " " + extSummary : ""}`,
  );

  return result.join("\n");
}

// ── Detect output format ──────────────────────────────────────────

/** Check if output looks like ls -la (long listing). */
function isLongListing(raw: string): boolean {
  // ls -la starts with "total N" or first line has permission chars
  return /^total\s+\d+/m.test(raw) || /^[-dlbcps][rwxsStT-]{9}\s/.test(raw);
}

/** Check if output looks like eza/exa long listing. */
function isEzaLongListing(raw: string): boolean {
  return /^\.?[rwxsStT-]+\s+/.test(raw);
}

/** Check if output looks like tree output (has box-drawing chars). */
function isTreeOutput(raw: string): boolean {
  return /[├└│──]/.test(raw) || /[|`]--/.test(raw);
}

// ── Main filter ───────────────────────────────────────────────────

export function createLsFilter(): Filter {
  return {
    name: "ls",

    matches(command: string): boolean {
      return /^(ls|exa|eza|find|fd|tree)\b/.test(command);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      if (!raw.trim()) {
        return { filtered: "", rawChars, filteredChars: 0 };
      }

      let filtered: string;

      // Detect command type and output format
      const isFind = /^(find|fd)\b/.test(command);
      const isTree = /^tree\b/.test(command);

      if (isFind) {
        // find/fd output: one path per line
        const grouped = parseFindOutput(raw);
        filtered = formatGroupedOutput(grouped);
      } else if (isTree || isTreeOutput(raw)) {
        // tree output: box-drawing formatted
        const grouped = parseTreeOutput(raw);
        filtered = formatGroupedOutput(grouped);
      } else if (isLongListing(raw) || isEzaLongListing(raw)) {
        // ls -la or eza --long output
        const entries = parseLsLong(raw);
        filtered = formatLsOutput(entries);
      } else {
        // Simple ls output (one name per line)
        const entries = parseSimpleLs(raw);
        // Filter noise from simple listing
        const clean = entries.filter(
          (e) => !NOISE_DIRS.has(e.name),
        );
        if (clean.length === 0) {
          return { filtered: "", rawChars, filteredChars: 0 };
        }
        const extensions = new Map<string, number>();
        for (const e of clean) {
          const ext = getExt(e.name);
          if (ext) extensions.set(ext, (extensions.get(ext) ?? 0) + 1);
        }
        const names = clean.map((e) => e.name);
        const extSummary = extensionSummary(extensions);
        const lines = [...names];
        if (names.length > 0) {
          lines.push(`\n📊 ${names.length} entries${extSummary ? " " + extSummary : ""}`);
        }
        filtered = lines.join("\n");
      }

      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
