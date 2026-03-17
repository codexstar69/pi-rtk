/**
 * Tests for the grep/rg filter.
 *
 * Covers: VAL-TOOL-017, VAL-TOOL-018, VAL-TOOL-019
 */

import { describe, it, expect } from "vitest";
import { createGrepFilter } from "../src/filters/grep.js";

const filter = createGrepFilter();

// ── Helpers ───────────────────────────────────────────────────────

/** Build ripgrep-style output: file:line:match */
function rgOutput(entries: Array<{ file: string; line: number; text: string }>): string {
  return entries.map((e) => `${e.file}:${e.line}:${e.text}`).join("\n");
}

/** Build grep-style output (same format as rg for basic usage). */
function grepOutput(entries: Array<{ file: string; line: number; text: string }>): string {
  return entries.map((e) => `${e.file}:${e.line}:${e.text}`).join("\n");
}

// ── matches() ─────────────────────────────────────────────────────

describe("grep filter — matches()", () => {
  it('matches rg "pattern"', () => {
    expect(filter.matches('rg "TODO"')).toBe(true);
  });

  it("matches rg with flags", () => {
    expect(filter.matches("rg -n --type ts pattern")).toBe(true);
  });

  it('matches grep -r "pattern"', () => {
    expect(filter.matches('grep -r "pattern" .')).toBe(true);
  });

  it("matches grep -rn", () => {
    expect(filter.matches("grep -rn TODO src/")).toBe(true);
  });

  it("matches plain grep", () => {
    expect(filter.matches("grep pattern file.txt")).toBe(true);
  });

  it("does not match git grep", () => {
    expect(filter.matches("git grep pattern")).toBe(false);
  });

  it("does not match other commands", () => {
    expect(filter.matches("echo hello")).toBe(false);
    expect(filter.matches("ls -la")).toBe(false);
  });
});

// ── apply() — happy path ─────────────────────────────────────────

describe("grep filter — happy path", () => {
  it("groups results by file (VAL-TOOL-017)", () => {
    const raw = rgOutput([
      { file: "src/foo.ts", line: 10, text: "  const TODO = true;" },
      { file: "src/foo.ts", line: 25, text: "  // TODO: fix later" },
      { file: "src/bar.ts", line: 5, text: "  // TODO: refactor" },
    ]);

    const { filtered } = filter.apply("rg TODO", raw);

    // Should show file headers
    expect(filtered).toContain("src/foo.ts:");
    expect(filtered).toContain("src/bar.ts:");
    // Summary
    expect(filtered).toContain("3 matches in 2 files");
  });

  it("achieves >60% savings on typical output", () => {
    // Generate a moderately verbose output
    const entries: Array<{ file: string; line: number; text: string }> = [];
    for (let f = 0; f < 10; f++) {
      for (let l = 0; l < 3; l++) {
        entries.push({
          file: `src/module${f}/component${f}.ts`,
          line: (l + 1) * 10,
          text: `  const result${l} = someFunction("very long descriptive argument that pads the output significantly for testing purposes");`,
        });
      }
    }
    const raw = rgOutput(entries);

    const { filtered, rawChars, filteredChars } = filter.apply("rg someFunction", raw);
    const savings = 1 - filteredChars / rawChars;
    expect(savings).toBeGreaterThan(0.6);
    expect(filtered).toContain("30 matches in 10 files");
  });

  it("preserves line numbers in output", () => {
    const raw = rgOutput([
      { file: "src/a.ts", line: 42, text: "  const x = TODO;" },
    ]);

    const { filtered } = filter.apply("rg TODO", raw);
    expect(filtered).toContain("42");
  });
});

// ── apply() — max 5 matches per file ─────────────────────────────

describe("grep filter — max 5 per file", () => {
  it("caps at 5 matches per file with overflow indicator (VAL-TOOL-017)", () => {
    const entries: Array<{ file: string; line: number; text: string }> = [];
    for (let l = 0; l < 12; l++) {
      entries.push({ file: "src/big-file.ts", line: l + 1, text: `  // match line ${l}` });
    }
    const raw = rgOutput(entries);

    const { filtered } = filter.apply("rg match", raw);

    // Should show exactly 5 match lines
    const matchLines = filtered.split("\n").filter((l) => /^\s+\d+:/.test(l));
    expect(matchLines.length).toBe(5);

    // Should show overflow indicator
    expect(filtered).toContain("... 7 more matches");
  });
});

// ── apply() — max 20 files ───────────────────────────────────────

describe("grep filter — max 20 files", () => {
  it("caps at 20 files with overflow indicator (VAL-TOOL-017)", () => {
    const entries: Array<{ file: string; line: number; text: string }> = [];
    for (let f = 0; f < 30; f++) {
      entries.push({ file: `src/file${f.toString().padStart(2, "0")}.ts`, line: 1, text: "  match" });
    }
    const raw = rgOutput(entries);

    const { filtered } = filter.apply("rg match", raw);

    // Should show overflow
    expect(filtered).toContain("... 10 more files");

    // Summary still includes ALL files
    expect(filtered).toContain("30 matches in 30 files");
  });
});

// ── apply() — match count summary ────────────────────────────────

describe("grep filter — summary (VAL-TOOL-018)", () => {
  it("appends N matches in N files", () => {
    const raw = rgOutput([
      { file: "a.ts", line: 1, text: "match1" },
      { file: "a.ts", line: 2, text: "match2" },
      { file: "b.ts", line: 1, text: "match3" },
      { file: "c.ts", line: 5, text: "match4" },
    ]);

    const { filtered } = filter.apply('rg "pattern"', raw);
    expect(filtered).toContain("4 matches in 3 files");
  });

  it("uses singular for 1 match in 1 file", () => {
    const raw = rgOutput([{ file: "a.ts", line: 1, text: "match" }]);
    const { filtered } = filter.apply("rg pattern", raw);
    expect(filtered).toContain("1 match in 1 file");
  });
});

// ── apply() — deduplication ──────────────────────────────────────

describe("grep filter — dedup (VAL-TOOL-019)", () => {
  it("deduplicates identical match lines across files", () => {
    const raw = rgOutput([
      { file: "src/a.ts", line: 10, text: '  import { foo } from "bar";' },
      { file: "src/b.ts", line: 5, text: '  import { foo } from "bar";' },
      { file: "src/c.ts", line: 8, text: '  import { foo } from "bar";' },
      { file: "src/d.ts", line: 1, text: "  const foo = 42;" },
    ]);

    const { filtered } = filter.apply("rg foo", raw);

    // The identical import line should appear once with dedup note
    const importLines = filtered.split("\n").filter((l) => l.includes('import { foo } from "bar"'));
    // There should be fewer than 3 occurrences of the full match text
    expect(importLines.length).toBeLessThanOrEqual(1);

    // The unique line should still appear
    expect(filtered).toContain("const foo = 42");

    // Summary should reflect total matches
    expect(filtered).toContain("4 matches in 4 files");
  });

  it("shows dedup count for collapsed lines", () => {
    const raw = rgOutput([
      { file: "src/a.ts", line: 1, text: "  export default {};" },
      { file: "src/b.ts", line: 1, text: "  export default {};" },
      { file: "src/c.ts", line: 1, text: "  export default {};" },
    ]);

    const { filtered } = filter.apply("rg export", raw);

    // Should mention it was seen in multiple files
    expect(filtered).toMatch(/3 files|seen in 3|x3|\(3\)/i);
  });
});

// ── apply() — empty / edge cases ─────────────────────────────────

describe("grep filter — edge cases", () => {
  it("handles empty output", () => {
    const { filtered } = filter.apply("rg pattern", "");
    expect(filtered).toBe("");
  });

  it("handles no matches (just empty string)", () => {
    const { filtered } = filter.apply("rg pattern", "\n\n");
    expect(filtered).toBe("");
  });

  it("strips ANSI color codes from rg output", () => {
    const raw = "\x1b[0m\x1b[35msrc/foo.ts\x1b[0m:\x1b[0m\x1b[32m10\x1b[0m:  const \x1b[0m\x1b[1m\x1b[31mTODO\x1b[0m = true;\n";
    const { filtered } = filter.apply("rg TODO", raw);

    // No ANSI codes remain
    expect(filtered).not.toMatch(/\x1b/);
    // Content is preserved
    expect(filtered).toContain("src/foo.ts");
    expect(filtered).toContain("TODO");
  });

  it("handles rg output with --vimgrep format", () => {
    const raw = "src/foo.ts:10:5:  const TODO = true;\nsrc/bar.ts:20:3:  // TODO fix\n";
    const { filtered } = filter.apply("rg --vimgrep TODO", raw);

    expect(filtered).toContain("src/foo.ts:");
    expect(filtered).toContain("src/bar.ts:");
    expect(filtered).toContain("2 matches in 2 files");
  });

  it("handles grep output without line numbers", () => {
    const raw = "src/foo.ts:  const TODO = true;\nsrc/bar.ts:  // TODO fix\n";
    const { filtered } = filter.apply("grep -r TODO", raw);

    expect(filtered).toContain("src/foo.ts:");
    expect(filtered).toContain("src/bar.ts:");
  });

  it("handles single file grep (no filename prefix)", () => {
    const raw = "10:  const TODO = true;\n25:  // TODO fix later\n";
    const { filtered } = filter.apply("grep -n TODO file.ts", raw);
    // Should still produce output (might not group by file)
    expect(filtered.length).toBeGreaterThan(0);
  });

  it("handles rg with context separators (--)", () => {
    const raw = [
      "src/foo.ts:10:  match line 1",
      "src/foo.ts-11-  context line",
      "--",
      "src/foo.ts:20:  match line 2",
    ].join("\n");

    const { filtered } = filter.apply("rg -C1 pattern", raw);
    expect(filtered).toContain("src/foo.ts:");
  });

  it("preserves unicode filenames", () => {
    const raw = "src/日本語.ts:5:  const x = 1;\nREADME_中文.md:10:  hello\n";
    const { filtered } = filter.apply("rg hello", raw);
    expect(filtered).toContain("日本語");
    expect(filtered).toContain("中文");
  });

  it("handles large output (>500 lines)", () => {
    const entries: Array<{ file: string; line: number; text: string }> = [];
    for (let f = 0; f < 50; f++) {
      for (let l = 0; l < 12; l++) {
        entries.push({
          file: `dir${Math.floor(f / 5)}/file${f}.ts`,
          line: l * 10 + 1,
          text: `  const value = "${f}-${l}"; // match`,
        });
      }
    }
    const raw = rgOutput(entries);

    const { filtered, rawChars, filteredChars } = filter.apply("rg match", raw);

    // Max 20 files shown
    expect(filtered).toContain("... 30 more files");

    // Summary includes totals
    expect(filtered).toContain("600 matches in 50 files");

    // Savings > 60%
    const savings = 1 - filteredChars / rawChars;
    expect(savings).toBeGreaterThan(0.6);
  });
});

// ── apply() — combined scenario ──────────────────────────────────

describe("grep filter — combined", () => {
  it("groups, caps, deduplicates, and summarizes in one pass", () => {
    const entries: Array<{ file: string; line: number; text: string }> = [];

    // 8 matches in file A — exceeds cap of 5
    for (let l = 0; l < 8; l++) {
      entries.push({ file: "src/a.ts", line: l + 1, text: `  line ${l} matches` });
    }

    // 2 matches in file B
    entries.push({ file: "src/b.ts", line: 1, text: "  unique match in b" });
    entries.push({ file: "src/b.ts", line: 2, text: "  another match in b" });

    // Duplicate line in files C, D, E
    entries.push({ file: "src/c.ts", line: 1, text: '  import { x } from "y";' });
    entries.push({ file: "src/d.ts", line: 1, text: '  import { x } from "y";' });
    entries.push({ file: "src/e.ts", line: 1, text: '  import { x } from "y";' });

    const raw = rgOutput(entries);
    const { filtered } = filter.apply("rg match", raw);

    // File A: should have 5 matches shown + overflow
    expect(filtered).toContain("... 3 more matches");

    // File B: both matches shown
    expect(filtered).toContain("unique match in b");
    expect(filtered).toContain("another match in b");

    // Summary line
    expect(filtered).toContain("13 matches in 5 files");
  });
});

// ── noLineNum false positive guard ───────────────────────────────

describe("grep filter — noLineNum false positives", () => {
  it("does not treat 'Error: something' as file:text", () => {
    const raw = "Error: something went wrong\nWarning: deprecated function\n";
    const { filtered } = filter.apply("rg pattern", raw);
    // These should NOT be parsed as matches
    expect(filtered).toBe("");
  });

  it("does not treat 'TypeError: null is not an object' as a match", () => {
    const raw = "TypeError: null is not an object\n";
    const { filtered } = filter.apply("grep pattern", raw);
    expect(filtered).toBe("");
  });

  it("still parses valid file:text without line numbers", () => {
    const raw = "src/foo.ts:  const TODO = true;\nsrc/bar.ts:  // TODO fix\n";
    const { filtered } = filter.apply("grep -r TODO", raw);
    expect(filtered).toContain("src/foo.ts:");
    expect(filtered).toContain("src/bar.ts:");
    expect(filtered).toContain("2 matches in 2 files");
  });

  it("parses dotfile paths correctly", () => {
    const raw = ".eslintrc.js:  rule: 'off'\n";
    const { filtered } = filter.apply("grep -r rule", raw);
    expect(filtered).toContain(".eslintrc.js:");
  });
});
