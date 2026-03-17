import { describe, it, expect } from "vitest";
import { createGitBranchFilter } from "../src/filters/git-branch.js";

const filter = createGitBranchFilter();

// ── Helpers ──────────────────────────────────────────────────────

/** Generate N branch lines with one marked as current. */
function makeBranches(count: number, currentIdx = 0): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = `feature/branch-${String(i).padStart(3, "0")}`;
    if (i === currentIdx) {
      lines.push(`* ${name}`);
    } else {
      lines.push(`  ${name}`);
    }
  }
  return lines.join("\n");
}

describe("git-branch filter", () => {
  // ── VAL-GIT-019: compact listing with * marker ─────────────────

  it("branches listed compactly with * marker", () => {
    const raw = `  develop
  feature/auth
  feature/dashboard
* main
  release/v1.0
  staging
`;

    const { filtered } = filter.apply("git branch", raw);

    // Current branch should be marked
    expect(filtered).toContain("*");
    expect(filtered).toContain("main");

    // Other branches should be present
    expect(filtered).toContain("develop");
    expect(filtered).toContain("feature/auth");
    expect(filtered).toContain("feature/dashboard");
    expect(filtered).toContain("release/v1.0");
    expect(filtered).toContain("staging");
  });

  it("compact format is space-efficient", () => {
    const raw = `  branch-a
  branch-b
  branch-c
  branch-d
  branch-e
* main
  branch-f
  branch-g
  branch-h
  branch-i
  branch-j
`;

    const { filtered } = filter.apply("git branch", raw);

    // Current branch marked
    expect(filtered).toContain("*");
    expect(filtered).toContain("main");

    // All branches present
    expect(filtered).toContain("branch-a");
    expect(filtered).toContain("branch-j");
  });

  // ── VAL-GIT-020: truncation at 50+ branches ───────────────────

  it("many branches truncated", () => {
    const raw = makeBranches(60, 5);
    const { filtered } = filter.apply("git branch", raw);

    // Current branch must always be present
    expect(filtered).toContain("*");
    expect(filtered).toContain("feature/branch-005");

    // Should have a truncation indicator
    expect(filtered).toMatch(/\+\s*\d+\s*more/i);

    // Count branches shown — should be capped at 50
    const branchNames = filtered.match(/feature\/branch-\d{3}/g) || [];
    expect(branchNames.length).toBeLessThanOrEqual(50);
  });

  it("exactly 50 branches — no truncation", () => {
    const raw = makeBranches(50, 0);
    const { filtered } = filter.apply("git branch", raw);

    // All 50 branches shown, no truncation
    expect(filtered).not.toMatch(/more/i);
    const branchNames = filtered.match(/feature\/branch-\d{3}/g) || [];
    expect(branchNames.length).toBe(50);
  });

  it("51 branches — shows 50 + truncation", () => {
    const raw = makeBranches(51, 0);
    const { filtered } = filter.apply("git branch", raw);

    expect(filtered).toMatch(/\+\s*1\s*more/i);
  });

  it("current branch always visible even when truncated", () => {
    // Put current branch at index 55 (beyond 50 limit)
    const raw = makeBranches(60, 55);
    const { filtered } = filter.apply("git branch", raw);

    // The current branch must be present in output
    expect(filtered).toContain("*");
    expect(filtered).toContain("feature/branch-055");
  });

  // ── Edge cases ─────────────────────────────────────────────────

  it("single branch (current)", () => {
    const raw = `* main
`;

    const { filtered } = filter.apply("git branch", raw);

    expect(filtered).toContain("*");
    expect(filtered).toContain("main");
  });

  it("empty output", () => {
    const raw = "";
    const { filtered } = filter.apply("git branch", raw);
    expect(typeof filtered).toBe("string");
  });

  it("remote branches with -a flag", () => {
    const raw = `* main
  develop
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
  remotes/origin/develop
  remotes/origin/feature/api
`;

    const { filtered } = filter.apply("git branch -a", raw);

    expect(filtered).toContain("*");
    expect(filtered).toContain("main");
    // Remote branches should be present
    expect(filtered).toContain("origin");
  });

  it("branches with slashes in names", () => {
    const raw = `  feature/deep/nested/branch
  fix/issue-123
  hotfix/critical-bug
* main
  release/v2.0.0-beta.1
`;

    const { filtered } = filter.apply("git branch", raw);

    expect(filtered).toContain("feature/deep/nested/branch");
    expect(filtered).toContain("fix/issue-123");
    expect(filtered).toContain("release/v2.0.0-beta.1");
  });

  it("verbose branch output with commit info", () => {
    // git branch -v shows hash and subject
    const raw = `* main        abc1234 Fix login bug
  develop     def5678 Merge feature/auth
  feature/api 111222a Add API endpoints
`;

    const { filtered } = filter.apply("git branch -v", raw);

    expect(filtered).toContain("*");
    expect(filtered).toContain("main");
    expect(filtered).toContain("develop");
    expect(filtered).toContain("feature/api");
  });

  // ── Command matching ───────────────────────────────────────────

  it("matches git branch command", () => {
    expect(filter.matches("git branch")).toBe(true);
    expect(filter.matches("git branch -a")).toBe(true);
    expect(filter.matches("git branch -v")).toBe(true);
    expect(filter.matches("git branch --list")).toBe(true);
    expect(filter.matches("git branch -r")).toBe(true);
  });

  it("does not match non-branch git commands", () => {
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("git diff")).toBe(false);
    expect(filter.matches("git log")).toBe(false);
    expect(filter.matches("git commit")).toBe(false);
  });

  it("filter has correct name", () => {
    expect(filter.name).toBe("git-branch");
  });
});
