import { describe, it, expect } from "vitest";
import { createGitStatusFilter } from "../src/filters/git-status.js";

const filter = createGitStatusFilter();

describe("git-status filter", () => {
  // ── VAL-GIT-001: happy path (>50% savings) ─────────────────────

  it("compacts typical git status with >50% savings", () => {
    const raw = `On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tmodified:   src/foo.ts
\tnew file:   src/bar.ts
\tnew file:   src/baz.ts

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   src/config.ts
\tmodified:   src/utils.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\ttemp.log
\tdebug.txt
\tnotes.md
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git status", raw);

    // Branch info
    expect(filtered).toContain("📌 main");
    expect(filtered).toContain("up to date");

    // Staged files with emoji
    expect(filtered).toContain("✅ Staged:");
    expect(filtered).toContain("3 files");
    expect(filtered).toContain("src/foo.ts");
    expect(filtered).toContain("src/bar.ts");
    expect(filtered).toContain("src/baz.ts");

    // Modified files with emoji
    expect(filtered).toContain("📝 Modified:");
    expect(filtered).toContain("2 files");
    expect(filtered).toContain("src/config.ts");
    expect(filtered).toContain("src/utils.ts");

    // Untracked files with emoji
    expect(filtered).toContain("❓ Untracked:");
    expect(filtered).toContain("temp.log");
    expect(filtered).toContain("debug.txt");
    expect(filtered).toContain("notes.md");

    // Savings > 50%
    expect(filteredChars).toBeLessThan(rawChars * 0.5);
    expect(rawChars).toBe(raw.length);
  });

  // ── VAL-GIT-002: clean repo produces branch-only line ──────────

  it("clean status produces branch line only", () => {
    const raw = `On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("📌 main");
    expect(filtered).toContain("up to date");
    // No file sections
    expect(filtered).not.toContain("✅ Staged");
    expect(filtered).not.toContain("📝 Modified");
    expect(filtered).not.toContain("❓ Untracked");
    expect(filtered).not.toContain("🗑️ Deleted");
  });

  // ── VAL-GIT-003: large output (50+ files, >60% savings) ────────

  it("50+ files inline with >60% savings", () => {
    // Use realistic longer file paths that git status typically shows
    const stagedFiles = Array.from({ length: 25 }, (_, i) =>
      `\tmodified:   src/components/module-${i}/index.ts`
    ).join("\n");
    const stagedNewFiles = Array.from({ length: 5 }, (_, i) =>
      `\tnew file:   src/components/new-${i}/setup.ts`
    ).join("\n");
    const modifiedFiles = Array.from({ length: 15 }, (_, i) =>
      `\tmodified:   src/services/handler-${i}.ts`
    ).join("\n");
    const untrackedFiles = Array.from({ length: 10 }, (_, i) =>
      `\ttest/fixtures/data-${i}.json`
    ).join("\n");

    const raw = `On branch feature/big-change
Your branch is ahead of 'origin/feature/big-change' by 5 commits.
  (use "git push" to publish your local commits)

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
${stagedFiles}
${stagedNewFiles}

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
${modifiedFiles}

Untracked files:
  (use "git add <file>..." to include in what will be committed)
${untrackedFiles}
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git status", raw);

    // Branch info
    expect(filtered).toContain("📌 feature/big-change");
    expect(filtered).toContain("ahead 5");

    // Staged files listed inline (space-separated)
    expect(filtered).toContain("✅ Staged:");
    expect(filtered).toContain("30 files");

    // Modified files listed inline
    expect(filtered).toContain("📝 Modified:");
    expect(filtered).toContain("15 files");

    // Untracked files listed inline
    expect(filtered).toContain("❓ Untracked:");
    expect(filtered).toContain("10 files");

    // Total is 55 files
    const totalFiles = 25 + 5 + 15 + 10;
    expect(totalFiles).toBeGreaterThanOrEqual(50);

    // Files are listed inline (space-separated), first files shown
    expect(filtered).toContain("src/components/module-0/index.ts");
    expect(filtered).toContain("src/components/module-9/index.ts");
    // Truncated files show "+N more" indicator
    expect(filtered).toContain("+20 more");

    // >60% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.4);
  });

  // ── VAL-GIT-004: error preservation ─────────────────────────────

  it("fatal error preserved", () => {
    const raw = `fatal: not a git repository (or any of the parent directories): .git`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("fatal:");
    expect(filtered).toContain("not a git repository");
  });

  // ── VAL-GIT-005: ahead/behind tracking info ─────────────────────

  it("ahead/behind info in branch line", () => {
    const raw = `On branch feature-x
Your branch is ahead of 'origin/feature-x' by 3 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("📌 feature-x");
    expect(filtered).toContain("ahead 3");
  });

  it("behind info in branch line", () => {
    const raw = `On branch main
Your branch is behind 'origin/main' by 7 commits, and can be fast-forwarded.
  (use "git pull" to update your local branch)

nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("📌 main");
    expect(filtered).toContain("behind 7");
  });

  it("ahead and behind info in branch line", () => {
    const raw = `On branch develop
Your branch and 'origin/develop' have diverged,
and have 3 and 5 different commits each, respectively.
  (use "git pull" to merge the remote branch into yours)

nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("📌 develop");
    expect(filtered).toContain("ahead 3");
    expect(filtered).toContain("behind 5");
  });

  // ── VAL-GIT-006: detached HEAD shows commit hash ────────────────

  it("detached HEAD shows hash", () => {
    const raw = `HEAD detached at abc1234
nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("abc1234");
    expect(filtered).toContain("📌");
  });

  it("detached HEAD at full hash", () => {
    const raw = `HEAD detached at a1b2c3d4e5f6
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
\tmodified:   src/main.ts`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("a1b2c3d4e5f6");
    expect(filtered).toContain("📝 Modified:");
    expect(filtered).toContain("src/main.ts");
  });

  // ── VAL-GIT-007: unicode filenames preserved ────────────────────

  it("unicode filenames in output", () => {
    const raw = `On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tmodified:   docs/日本語.md
\tnew file:   src/über-config.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\t中文文件.txt
\tкириллица.rs
`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("docs/日本語.md");
    expect(filtered).toContain("src/über-config.ts");
    expect(filtered).toContain("中文文件.txt");
    expect(filtered).toContain("кириллица.rs");
  });

  // ── Additional edge cases ───────────────────────────────────────

  it("handles deleted files", () => {
    const raw = `On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tdeleted:    old-file.ts
\tdeleted:    deprecated.js

Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
\tdeleted:    src/temp.ts
`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("🗑️ Deleted:");
    expect(filtered).toContain("old-file.ts");
    expect(filtered).toContain("deprecated.js");
    expect(filtered).toContain("src/temp.ts");
  });

  it("handles renamed files", () => {
    const raw = `On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\trenamed:    old-name.ts -> new-name.ts
`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("✅ Staged:");
    expect(filtered).toContain("old-name.ts -> new-name.ts");
  });

  it("handles merge conflicts", () => {
    const raw = `On branch main
You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
\tboth modified:   src/conflict.ts
\tboth modified:   src/another.ts

Changes to be committed:
\tmodified:   src/clean.ts
`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("⚠️ Conflicts:");
    expect(filtered).toContain("src/conflict.ts");
    expect(filtered).toContain("src/another.ts");
    expect(filtered).toContain("✅ Staged:");
    expect(filtered).toContain("src/clean.ts");
  });

  it("matches git status command", () => {
    expect(filter.matches("git status")).toBe(true);
    expect(filter.matches("git status -s")).toBe(true);
    expect(filter.matches("git status --short")).toBe(true);
  });

  it("does not match non-status git commands", () => {
    expect(filter.matches("git diff")).toBe(false);
    expect(filter.matches("git log")).toBe(false);
    expect(filter.matches("git commit")).toBe(false);
  });

  it("filter has correct name", () => {
    expect(filter.name).toBe("git-status");
  });

  it("handles no tracking info", () => {
    const raw = `On branch local-only

nothing to commit, working tree clean`;

    const { filtered } = filter.apply("git status", raw);

    expect(filtered).toContain("📌 local-only");
  });
});
