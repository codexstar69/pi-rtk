import { describe, it, expect } from "vitest";
import { createGitDiffFilter } from "../src/filters/git-diff.js";

const filter = createGitDiffFilter();

// ── Helpers ──────────────────────────────────────────────────────

/** Generate a hunk with N changed lines. */
function makeHunk(file: string, line: number, count: number): string {
  const header = `@@ -${line},${count} +${line},${count} @@`;
  const lines = Array.from({ length: count }, (_, i) => `+  line ${i + 1}`);
  return `diff --git a/${file} b/${file}
index abc1234..def5678 100644
--- a/${file}
+++ b/${file}
${header}
${lines.join("\n")}`;
}

/** Generate a multi-file diff with stat summary. Realistic verbose output
 *  mimicking what `git diff` actually produces — lots of headers and context. */
function makeTypicalDiff(): string {
  // Real diffs have significant overhead: diff headers, index lines,
  // ---/+++ lines, and 3 context lines before/after each change.
  const files = [
    "src/handlers/user-handler.ts",
    "src/services/auth-service.ts",
    "src/utils/validation-helpers.ts",
    "src/config/app-settings.ts",
    "src/middleware/error-handler.ts",
  ];
  const parts: string[] = [];

  for (let f = 0; f < files.length; f++) {
    const file = files[f];
    parts.push(`diff --git a/${file} b/${file}`);
    parts.push(`index ${String(f).repeat(7)}..${String(f + 5).repeat(7)} 100644`);
    parts.push(`--- a/${file}`);
    parts.push(`+++ b/${file}`);

    // Each file gets 2 hunks with standard 3-line context
    for (let h = 0; h < 2; h++) {
      const base = 20 + h * 60;
      parts.push(`@@ -${base},14 +${base},14 @@ export function processRequest${h}(req: Request, res: Response) {`);
      // 3 context lines before
      parts.push(`   const requestId = generateRequestId();`);
      parts.push(`   const startTime = performance.now();`);
      parts.push(`   const logger = getLogger("${file}");`);
      // 1 change
      parts.push(`-  const result = legacyProcess(req);`);
      parts.push(`+  const result = modernProcess(req);`);
      // 3 context lines after
      parts.push(`   logger.info("processed", { requestId });`);
      parts.push(`   const duration = performance.now() - startTime;`);
      parts.push(`   metrics.record("request_duration", duration);`);
    }
  }

  return parts.join("\n");
}

describe("git-diff filter", () => {
  // ── VAL-GIT-008: happy path (>50% savings) ─────────────────────

  it("typical diff compacted with >50% savings", () => {
    const raw = makeTypicalDiff();
    const { filtered, rawChars, filteredChars } = filter.apply("git diff", raw);

    // Must have stat summary at top
    expect(filtered).toContain("files changed");

    // Must have hunk headers with file:line info
    expect(filtered).toMatch(/@@.*user-handler\.ts/);
    expect(filtered).toMatch(/@@.*auth-service\.ts/);

    // Must have summary line at bottom
    expect(filtered).toMatch(/\d+ files? changed/);

    // >50% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.5);
  });

  // ── VAL-GIT-009: empty diff ─────────────────────────────────────

  it("empty diff no crash", () => {
    const raw = "";
    const { filtered } = filter.apply("git diff", raw);
    expect(filtered).toBeDefined();
    // Should handle gracefully — empty or a "no changes" message
    expect(typeof filtered).toBe("string");
  });

  it("empty diff with just whitespace", () => {
    const raw = "\n\n  \n";
    const { filtered } = filter.apply("git diff", raw);
    expect(typeof filtered).toBe("string");
  });

  // ── VAL-GIT-010: hunk truncation ───────────────────────────────

  it("large hunks truncated", () => {
    // Create a hunk with 30 lines (>20 threshold)
    const raw = makeHunk("src/big.ts", 1, 30);
    const { filtered } = filter.apply("git diff", raw);

    // Should show first 10 lines of the hunk content
    expect(filtered).toContain("line 1");
    expect(filtered).toContain("line 10");

    // Should NOT show line 20+
    expect(filtered).not.toContain("line 20");
    expect(filtered).not.toContain("line 30");

    // Should have truncation indicator
    expect(filtered).toMatch(/\.\.\.\s*\d+\s*more lines/);
  });

  it("hunks with exactly 20 lines not truncated", () => {
    const raw = makeHunk("src/exact.ts", 1, 20);
    const { filtered } = filter.apply("git diff", raw);

    // 20 lines should all be present (at the threshold)
    expect(filtered).toContain("line 1");
    expect(filtered).toContain("line 20");
    expect(filtered).not.toMatch(/\.\.\.\s*\d+\s*more lines/);
  });

  it("hunks with 19 lines not truncated", () => {
    const raw = makeHunk("src/small.ts", 1, 19);
    const { filtered } = filter.apply("git diff", raw);

    expect(filtered).toContain("line 1");
    expect(filtered).toContain("line 19");
    expect(filtered).not.toMatch(/\.\.\.\s*\d+\s*more lines/);
  });

  // ── VAL-GIT-011: binary diffs skipped ──────────────────────────

  it("binary diffs skipped", () => {
    const raw = `diff --git a/image.png b/image.png
index abc1234..def5678 100644
Binary files a/image.png and b/image.png differ
diff --git a/src/code.ts b/src/code.ts
index 111222..333444 100644
--- a/src/code.ts
+++ b/src/code.ts
@@ -1,3 +1,3 @@
-const x = 1;
+const x = 2;
`;

    const { filtered } = filter.apply("git diff", raw);

    // Binary file should be indicated with a single line
    expect(filtered).toMatch(/binary/i);
    expect(filtered).toContain("image.png");

    // Text diff should still be present
    expect(filtered).toContain("src/code.ts");
  });

  it("all-binary diff produces indicator only", () => {
    const raw = `diff --git a/photo.jpg b/photo.jpg
index abc1234..def5678 100644
Binary files a/photo.jpg and b/photo.jpg differ
diff --git a/icon.svg b/icon.svg
index 111222..333444 100644
Binary files a/icon.svg and b/icon.svg differ
`;

    const { filtered } = filter.apply("git diff", raw);

    expect(filtered).toMatch(/binary/i);
    expect(filtered).toContain("photo.jpg");
    expect(filtered).toContain("icon.svg");
  });

  // ── VAL-GIT-012: hunk headers contain file:line ────────────────

  it("hunk headers contain file:line", () => {
    const raw = `diff --git a/src/handler.ts b/src/handler.ts
index abc1234..def5678 100644
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -42,7 +42,7 @@ function process() {
   const a = 1;
-  old();
+  updated();
`;

    const { filtered } = filter.apply("git diff", raw);

    // Hunk header should include file and line info
    expect(filtered).toMatch(/@@\s*src\/handler\.ts:\d+\s*@@/);
  });

  it("multiple hunk headers in same file preserve file:line", () => {
    const raw = `diff --git a/src/app.ts b/src/app.ts
index abc1234..def5678 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,3 @@ function init() {
-  old1();
+  new1();
@@ -50,3 +50,3 @@ function run() {
-  old2();
+  new2();
`;

    const { filtered } = filter.apply("git diff", raw);

    // Both hunk headers should reference the file
    expect(filtered).toMatch(/@@\s*src\/app\.ts:10\s*@@/);
    expect(filtered).toMatch(/@@\s*src\/app\.ts:50\s*@@/);
  });

  // ── VAL-GIT-013: stat summary at top and bottom ────────────────

  it("diff stat summary present", () => {
    const raw = makeTypicalDiff();
    const { filtered } = filter.apply("git diff", raw);

    // Summary should include files changed and insertions/deletions
    expect(filtered).toMatch(/\d+ files? changed/);
    expect(filtered).toMatch(/insertion|deletion/);
  });

  it("single file diff has correct stat", () => {
    const raw = `diff --git a/src/only.ts b/src/only.ts
index abc1234..def5678 100644
--- a/src/only.ts
+++ b/src/only.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

    const { filtered } = filter.apply("git diff", raw);

    expect(filtered).toMatch(/1 file changed/);
    expect(filtered).toMatch(/1 insertion/);
  });

  // ── Additional edge cases ───────────────────────────────────────

  it("matches git diff command", () => {
    expect(filter.matches("git diff")).toBe(true);
    expect(filter.matches("git diff --staged")).toBe(true);
    expect(filter.matches("git diff HEAD~1")).toBe(true);
    expect(filter.matches("git diff --stat")).toBe(true);
    expect(filter.matches("git diff main..feature")).toBe(true);
  });

  it("does not match non-diff git commands", () => {
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("git log")).toBe(false);
    expect(filter.matches("git difftool")).toBe(false);
  });

  it("filter has correct name", () => {
    expect(filter.name).toBe("git-diff");
  });

  it("preserves deletion lines", () => {
    const raw = `diff --git a/src/removed.ts b/src/removed.ts
index abc1234..def5678 100644
--- a/src/removed.ts
+++ b/src/removed.ts
@@ -1,5 +1,3 @@
 const a = 1;
-const b = 2;
-const c = 3;
 const d = 4;
`;

    const { filtered } = filter.apply("git diff", raw);

    expect(filtered).toContain("-const b = 2;");
    expect(filtered).toContain("-const c = 3;");
    expect(filtered).toMatch(/deletion/);
  });

  it("handles diff with rename", () => {
    const raw = `diff --git a/old-name.ts b/new-name.ts
similarity index 95%
rename from old-name.ts
rename to new-name.ts
index abc1234..def5678 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
-export const name = "old";
+export const name = "new";
`;

    const { filtered } = filter.apply("git diff", raw);

    expect(filtered).toContain("new-name.ts");
  });

  it("keeps 1 context line before and after each change block", () => {
    const raw = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,9 +10,9 @@ function example() {
 context line 1
 context line 2
 context line 3
-old line
+new line
 context line 4
 context line 5
 context line 6
`;

    const { filtered } = filter.apply("git diff", raw);

    // Should keep 1 context line before the change (line 3)
    expect(filtered).toContain("context line 3");
    // Should keep the change lines
    expect(filtered).toContain("-old line");
    expect(filtered).toContain("+new line");
    // Should keep 1 context line after the change (line 4)
    expect(filtered).toContain("context line 4");
    // Should NOT keep the extra context lines (lines 1, 2, 5, 6)
    expect(filtered).not.toContain("context line 1");
    expect(filtered).not.toContain("context line 2");
    expect(filtered).not.toContain("context line 5");
    expect(filtered).not.toContain("context line 6");
  });

  it("keeps context between adjacent change blocks", () => {
    const raw = `diff --git a/src/bar.ts b/src/bar.ts
index abc1234..def5678 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,9 +1,9 @@ function test() {
 before ctx 1
 before ctx 2
 before ctx 3
-old A
+new A
 middle ctx
-old B
+new B
 after ctx 1
 after ctx 2
 after ctx 3
`;

    const { filtered } = filter.apply("git diff", raw);

    // 1 context before first change
    expect(filtered).toContain("before ctx 3");
    expect(filtered).not.toContain("before ctx 1");
    expect(filtered).not.toContain("before ctx 2");
    // Change lines
    expect(filtered).toContain("-old A");
    expect(filtered).toContain("+new A");
    // Middle context is adjacent to both changes — kept
    expect(filtered).toContain("middle ctx");
    // Second change
    expect(filtered).toContain("-old B");
    expect(filtered).toContain("+new B");
    // 1 context after last change
    expect(filtered).toContain("after ctx 1");
    expect(filtered).not.toContain("after ctx 2");
    expect(filtered).not.toContain("after ctx 3");
  });

  it("handles diff with no-newline-at-end-of-file marker", () => {
    const raw = `diff --git a/src/file.ts b/src/file.ts
index abc1234..def5678 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,2 +1,2 @@
-const x = 1;
\\ No newline at end of file
+const x = 2;
\\ No newline at end of file
`;

    const { filtered } = filter.apply("git diff", raw);
    // Should not crash
    expect(typeof filtered).toBe("string");
    expect(filtered).toContain("src/file.ts");
  });

  it("large multi-file diff achieves good compression", () => {
    // Generate a realistic large diff with 5 files
    const files = ["src/a.ts", "src/b.ts", "src/c.ts", "lib/d.ts", "test/e.ts"];
    const parts: string[] = [];
    for (const file of files) {
      const lines = Array.from({ length: 15 }, (_, i) =>
        `+  added line ${i + 1} with some content here`
      );
      parts.push(`diff --git a/${file} b/${file}
index abc1234..def5678 100644
--- a/${file}
+++ b/${file}
@@ -1,3 +1,${lines.length + 3} @@
 existing line
${lines.join("\n")}
 more existing`);
    }
    const raw = parts.join("\n");

    const { filtered, rawChars, filteredChars } = filter.apply("git diff", raw);

    // Should be well compressed
    expect(filteredChars).toBeLessThan(rawChars);
    // Should have stat summary
    expect(filtered).toMatch(/5 files changed/);
  });
});
