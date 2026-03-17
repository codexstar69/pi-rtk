/**
 * Read-filter — strips comments from source files read via the read tool.
 *
 * Detects language from file extension and removes single-line / multi-line
 * comments while preserving doc comments (/** *​/, ///, triple-quote docstrings).
 * Only applies to files > 5000 chars. Normalizes multiple consecutive blank
 * lines to a single blank line.
 *
 * Never strips from .json, .jsonc, or .env files (handled by json-schema
 * filter or passed through as data formats).
 */

import type { Filter, FilterResult } from "./index.js";

// ── Language definitions ─────────────────────────────────────────

type CommentStyle = "c-style" | "hash" | "css" | "html" | "sql" | "scss" | "python";

interface LanguageDef {
  style: CommentStyle;
}

/** Map file extensions to comment style. */
const LANGUAGE_MAP: Record<string, LanguageDef> = {
  ".ts": { style: "c-style" },
  ".js": { style: "c-style" },
  ".tsx": { style: "c-style" },
  ".jsx": { style: "c-style" },
  ".rs": { style: "c-style" },
  ".go": { style: "c-style" },
  ".py": { style: "python" },
  ".rb": { style: "hash" },
  ".sh": { style: "hash" },
  ".bash": { style: "hash" },
  ".zsh": { style: "hash" },
  ".yaml": { style: "hash" },
  ".yml": { style: "hash" },
  ".toml": { style: "hash" },
  ".css": { style: "css" },
  ".scss": { style: "scss" },
  ".html": { style: "html" },
  ".vue": { style: "html" },
  ".svelte": { style: "html" },
  ".sql": { style: "sql" },
};

/** Extensions that should never have comments stripped. */
const EXCLUDED_EXTENSIONS = new Set([".json", ".jsonc", ".env"]);

/** Minimum file size for comment stripping to apply. */
const MIN_CHARS = 5000;

// ── Supported extension set for matches() ────────────────────────

const SUPPORTED_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

// ── Extension extraction ─────────────────────────────────────────

/**
 * Extract file extension from a read: command path.
 * Handles paths like "read:/project/file.ts" → ".ts"
 * Also handles .env.local → ".env" (dotenv files)
 */
function extractExtension(command: string): string | null {
  // Extract path from "read:<path>"
  const path = command.startsWith("read:") ? command.slice(5) : command;

  // Check for .env files (including .env.local, .env.production, etc.)
  const basename = path.split("/").pop() ?? "";
  if (basename.startsWith(".env")) return ".env";

  // Normal extension extraction
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  return basename.slice(dotIdx).toLowerCase();
}

// ── Comment stripping per style ──────────────────────────────────

/**
 * Strip C-style comments (// and /* *​/) while preserving:
 * - /** *​/ doc comments (JSDoc)
 * - /// triple-slash doc comments
 * - Comments inside string literals
 */
function stripCStyle(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inBlockComment = false;
  let isDocBlock = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (inBlockComment) {
      const endIdx = line.indexOf("*/");
      if (endIdx !== -1) {
        inBlockComment = false;
        if (isDocBlock) {
          result.push(line);
        } else {
          // Keep anything after the closing */
          const after = line.slice(endIdx + 2);
          if (after.trim()) {
            result.push(after);
          }
        }
      } else if (isDocBlock) {
        result.push(line);
      }
      continue;
    }

    // Process the line character by character to respect strings
    let processed = "";
    let j = 0;
    while (j < line.length) {
      const ch = line[j];

      // String literals — skip over them
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        processed += ch;
        j++;
        while (j < line.length) {
          if (line[j] === "\\") {
            processed += line[j] + (line[j + 1] ?? "");
            j += 2;
            continue;
          }
          if (line[j] === quote) {
            processed += line[j];
            j++;
            break;
          }
          processed += line[j];
          j++;
        }
        continue;
      }

      // Check for block comment start: /* or /**
      if (ch === "/" && line[j + 1] === "*") {
        if (line[j + 2] === "*") {
          // Doc comment /** ... — preserve (including /***/)
          const endIdx = line.indexOf("*/", j + 2);
          if (endIdx !== -1) {
            // Single-line doc comment
            processed += line.slice(j, endIdx + 2);
            j = endIdx + 2;
          } else {
            // Multi-line doc comment starts
            processed += line.slice(j);
            j = line.length;
            inBlockComment = true;
            isDocBlock = true;
          }
        } else {
          // Regular block comment /* ... — strip
          const endIdx = line.indexOf("*/", j + 2);
          if (endIdx !== -1) {
            // Single-line block comment
            j = endIdx + 2;
          } else {
            // Multi-line block comment starts — strip rest of line
            inBlockComment = true;
            isDocBlock = false;
            break;
          }
        }
        continue;
      }

      // Check for line comment: // or ///
      if (ch === "/" && line[j + 1] === "/") {
        if (line[j + 2] === "/") {
          // Triple-slash /// doc comment — preserve entire rest of line
          processed += line.slice(j);
          j = line.length;
        } else {
          // Regular // comment — strip rest of line
          break;
        }
        continue;
      }

      processed += ch;
      j++;
    }

    result.push(processed.trimEnd());
  }

  return result.join("\n");
}

/**
 * Strip hash (#) comments while preserving:
 * - Shebangs (#!) on the first line
 * - Strings containing #
 */
function stripHash(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Preserve shebangs on first line
    if (i === 0 && line.startsWith("#!")) {
      result.push(line);
      continue;
    }

    // Process character by character to respect strings
    let processed = "";
    let j = 0;
    while (j < line.length) {
      const ch = line[j];

      // String literals
      if (ch === '"' || ch === "'") {
        const quote = ch;
        processed += ch;
        j++;
        while (j < line.length) {
          if (line[j] === "\\") {
            processed += line[j] + (line[j + 1] ?? "");
            j += 2;
            continue;
          }
          if (line[j] === quote) {
            processed += line[j];
            j++;
            break;
          }
          processed += line[j];
          j++;
        }
        continue;
      }

      // Hash comment — strip rest of line
      if (ch === "#") {
        break;
      }

      processed += ch;
      j++;
    }

    result.push(processed.trimEnd());
  }

  return result.join("\n");
}

/**
 * Strip Python comments (#) while preserving:
 * - Triple-quote docstrings (""" and ''')
 * - Strings containing #
 */
function stripPython(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inTripleQuote: string | null = null; // '"""' or "'''"

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If inside a triple-quote docstring, look for the closing sequence
    if (inTripleQuote !== null) {
      result.push(line);
      if (line.includes(inTripleQuote)) {
        inTripleQuote = null;
      }
      continue;
    }

    // Process character by character
    let processed = "";
    let j = 0;
    while (j < line.length) {
      const ch = line[j];

      // Triple-quote docstrings
      if (
        (ch === '"' && line[j + 1] === '"' && line[j + 2] === '"') ||
        (ch === "'" && line[j + 1] === "'" && line[j + 2] === "'")
      ) {
        const tripleQuote = ch + ch + ch;
        // Check if it closes on the same line (after the opening)
        const closeIdx = line.indexOf(tripleQuote, j + 3);
        if (closeIdx !== -1) {
          // Single-line triple-quote — preserve
          processed += line.slice(j, closeIdx + 3);
          j = closeIdx + 3;
        } else {
          // Multi-line triple-quote starts — preserve
          processed += line.slice(j);
          j = line.length;
          inTripleQuote = tripleQuote;
        }
        continue;
      }

      // Regular string literals
      if (ch === '"' || ch === "'") {
        const quote = ch;
        processed += ch;
        j++;
        while (j < line.length) {
          if (line[j] === "\\") {
            processed += line[j] + (line[j + 1] ?? "");
            j += 2;
            continue;
          }
          if (line[j] === quote) {
            processed += line[j];
            j++;
            break;
          }
          processed += line[j];
          j++;
        }
        continue;
      }

      // Hash comment — strip rest of line
      if (ch === "#") {
        break;
      }

      processed += ch;
      j++;
    }

    result.push(processed.trimEnd());
  }

  return result.join("\n");
}

/**
 * Strip CSS block comments (/* *​/) while preserving doc comments (/** *​/).
 */
function stripCss(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inBlockComment = false;
  let isDocBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inBlockComment) {
      const endIdx = line.indexOf("*/");
      if (endIdx !== -1) {
        inBlockComment = false;
        if (isDocBlock) {
          result.push(line);
        } else {
          const after = line.slice(endIdx + 2);
          if (after.trim()) {
            result.push(after);
          }
        }
      } else if (isDocBlock) {
        result.push(line);
      }
      continue;
    }

    let processed = "";
    let j = 0;
    while (j < line.length) {
      const ch = line[j];

      // String literals
      if (ch === '"' || ch === "'") {
        const quote = ch;
        processed += ch;
        j++;
        while (j < line.length) {
          if (line[j] === "\\") {
            processed += line[j] + (line[j + 1] ?? "");
            j += 2;
            continue;
          }
          if (line[j] === quote) {
            processed += line[j];
            j++;
            break;
          }
          processed += line[j];
          j++;
        }
        continue;
      }

      // Block comment: /* or /**
      if (ch === "/" && line[j + 1] === "*") {
        if (line[j + 2] === "*" && line[j + 3] !== "/") {
          // Doc comment — preserve
          const endIdx = line.indexOf("*/", j + 3);
          if (endIdx !== -1) {
            processed += line.slice(j, endIdx + 2);
            j = endIdx + 2;
          } else {
            processed += line.slice(j);
            j = line.length;
            inBlockComment = true;
            isDocBlock = true;
          }
        } else {
          const endIdx = line.indexOf("*/", j + 2);
          if (endIdx !== -1) {
            j = endIdx + 2;
          } else {
            inBlockComment = true;
            isDocBlock = false;
            break;
          }
        }
        continue;
      }

      processed += ch;
      j++;
    }

    result.push(processed.trimEnd());
  }

  return result.join("\n");
}

/**
 * Strip SCSS comments: both // single-line and /* *​/ block.
 * Preserves /** *​/ doc comments.
 */
function stripScss(text: string): string {
  // SCSS supports both // and /* */ — reuse C-style which handles both
  return stripCStyle(text);
}

/**
 * Strip HTML comments (<!-- -->).
 */
function stripHtml(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inComment) {
      const endIdx = line.indexOf("-->");
      if (endIdx !== -1) {
        inComment = false;
        const after = line.slice(endIdx + 3);
        if (after.trim()) {
          result.push(after);
        }
      }
      // Lines inside HTML comments are discarded
      continue;
    }

    let processed = "";
    let j = 0;
    while (j < line.length) {
      // Check for <!-- comment start
      if (
        line[j] === "<" &&
        line[j + 1] === "!" &&
        line[j + 2] === "-" &&
        line[j + 3] === "-"
      ) {
        const endIdx = line.indexOf("-->", j + 4);
        if (endIdx !== -1) {
          // Single-line HTML comment — strip
          j = endIdx + 3;
        } else {
          // Multi-line HTML comment starts
          inComment = true;
          break;
        }
        continue;
      }

      processed += line[j];
      j++;
    }

    result.push(processed.trimEnd());
  }

  return result.join("\n");
}

/**
 * Strip SQL comments: -- single-line and /* *​/ block.
 * Preserves /** *​/ doc comments.
 */
function stripSql(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inBlockComment = false;
  let isDocBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inBlockComment) {
      const endIdx = line.indexOf("*/");
      if (endIdx !== -1) {
        inBlockComment = false;
        if (isDocBlock) {
          result.push(line);
        } else {
          const after = line.slice(endIdx + 2);
          if (after.trim()) {
            result.push(after);
          }
        }
      } else if (isDocBlock) {
        result.push(line);
      }
      continue;
    }

    let processed = "";
    let j = 0;
    while (j < line.length) {
      const ch = line[j];

      // String literals
      if (ch === "'") {
        processed += ch;
        j++;
        while (j < line.length) {
          if (line[j] === "'" && line[j + 1] === "'") {
            // Escaped quote in SQL
            processed += "''";
            j += 2;
            continue;
          }
          if (line[j] === "'") {
            processed += line[j];
            j++;
            break;
          }
          processed += line[j];
          j++;
        }
        continue;
      }

      // Block comment: /* or /**
      if (ch === "/" && line[j + 1] === "*") {
        if (line[j + 2] === "*" && line[j + 3] !== "/") {
          // Doc comment — preserve
          const endIdx = line.indexOf("*/", j + 3);
          if (endIdx !== -1) {
            processed += line.slice(j, endIdx + 2);
            j = endIdx + 2;
          } else {
            processed += line.slice(j);
            j = line.length;
            inBlockComment = true;
            isDocBlock = true;
          }
        } else {
          const endIdx = line.indexOf("*/", j + 2);
          if (endIdx !== -1) {
            j = endIdx + 2;
          } else {
            inBlockComment = true;
            isDocBlock = false;
            break;
          }
        }
        continue;
      }

      // SQL line comment: --
      if (ch === "-" && line[j + 1] === "-") {
        // Strip rest of line
        break;
      }

      processed += ch;
      j++;
    }

    result.push(processed.trimEnd());
  }

  return result.join("\n");
}

// ── Comment stripping dispatch ───────────────────────────────────

function stripComments(text: string, style: CommentStyle): string {
  switch (style) {
    case "c-style":
      return stripCStyle(text);
    case "hash":
      return stripHash(text);
    case "python":
      return stripPython(text);
    case "css":
      return stripCss(text);
    case "scss":
      return stripScss(text);
    case "html":
      return stripHtml(text);
    case "sql":
      return stripSql(text);
  }
}

// ── Blank line normalization ─────────────────────────────────────

/** Collapse multiple consecutive blank lines to a single blank line. */
function normalizeBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

// ── Filter export ────────────────────────────────────────────────

export function createReadFilter(): Filter {
  return {
    name: "read-filter",

    matches(command: string): boolean {
      if (!command.startsWith("read:")) return false;

      const ext = extractExtension(command);
      if (!ext) return false;

      // Never match excluded extensions
      if (EXCLUDED_EXTENSIONS.has(ext)) return false;

      // Only match supported languages
      return SUPPORTED_EXTENSIONS.has(ext);
    },

    apply(command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      // Files <= 5000 chars pass through unchanged
      if (rawChars <= MIN_CHARS) {
        return { filtered: raw, rawChars, filteredChars: rawChars };
      }

      const ext = extractExtension(command);
      if (!ext) {
        return { filtered: raw, rawChars, filteredChars: rawChars };
      }

      const langDef = LANGUAGE_MAP[ext];
      if (!langDef) {
        return { filtered: raw, rawChars, filteredChars: rawChars };
      }

      // Strip comments
      let filtered = stripComments(raw, langDef.style);

      // Normalize blank lines
      filtered = normalizeBlankLines(filtered);

      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
