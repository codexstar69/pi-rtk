import { describe, it, expect } from "vitest";
import { createGitActionFilter } from "../src/filters/git-action.js";

const filter = createGitActionFilter();

describe("git-action filter", () => {
  // ── VAL-GIT-017: each git action → single "ok ✓" line (>80% savings) ──

  it("git push success reduced to ok line", () => {
    const raw = `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 10 threads
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 1.23 KiB | 1.23 MiB/s, done.
Total 3 (delta 2), reused 0 (delta 0), pack-reused 0
remote: Resolving deltas: 100% (2/2), completed with 2 local objects.
To github.com:user/repo.git
   abc1234..def5678  main -> main
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git push", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("push");
    // >80% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.2);
  });

  it("git pull success reduced to ok line", () => {
    const raw = `remote: Enumerating objects: 10, done.
remote: Counting objects: 100% (10/10), done.
remote: Compressing objects: 100% (6/6), done.
remote: Total 6 (delta 4), reused 0 (delta 0), pack-reused 0
Unpacking objects: 100% (6/6), 2.50 KiB | 640.00 KiB/s, done.
From github.com:user/repo
   abc1234..def5678  main       -> origin/main
Updating abc1234..def5678
Fast-forward
 src/app.ts    | 10 ++++++----
 src/config.ts |  3 ++-
 2 files changed, 8 insertions(+), 5 deletions(-)
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git pull", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("pull");
    // >80% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.2);
  });

  it("git fetch success reduced to ok line", () => {
    const raw = `remote: Enumerating objects: 30, done.
remote: Counting objects: 100% (30/30), done.
remote: Compressing objects: 100% (15/15), done.
remote: Total 20 (delta 12), reused 0 (delta 0), pack-reused 0
Unpacking objects: 100% (20/20), 8.40 KiB | 1.20 MiB/s, done.
From github.com:user/repo
   abc1234..def5678  main       -> origin/main
 * [new branch]      feature-x  -> origin/feature-x
 * [new tag]         v1.2.0     -> v1.2.0
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git fetch", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("fetch");
    // >80% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.2);
  });

  it("git add success reduced to ok line", () => {
    const raw = ``;
    // git add typically produces no output on success
    const { filtered } = filter.apply("git add .", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("add");
  });

  it("git add with verbose output reduced to ok line", () => {
    const raw = `add 'src/new-file.ts'
add 'src/another.ts'
add 'test/new.test.ts'
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git add -v .", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("add");
    // Even small outputs should be summarized
  });

  it("git commit success reduced to ok line", () => {
    const raw = `[main abc1234] Fix authentication bug in login handler

 Author: Developer <dev@example.com>
 Date: Mon Mar 17 10:00:00 2025 +0000

 3 files changed, 25 insertions(+), 10 deletions(-)
 create mode 100644 src/auth-handler.ts
 create mode 100644 src/auth-service.ts
 create mode 100644 src/auth-middleware.ts
 create mode 100644 test/auth-handler.test.ts
 create mode 100644 test/auth-service.test.ts
 rewrite src/legacy-auth.ts (100%)
 delete mode 100644 src/old-auth.ts
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git commit -m 'Fix auth bug'", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("commit");
    // >80% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.2);
  });

  it("each git action type produces single-line output", () => {
    const actions = [
      { cmd: "git push", raw: "To github.com:user/repo.git\n   abc..def  main -> main\n" },
      { cmd: "git pull", raw: "Already up to date.\n" },
      { cmd: "git fetch", raw: "From github.com:user/repo\n" },
      { cmd: "git add .", raw: "" },
      { cmd: "git commit -m 'msg'", raw: "[main abc1234] msg\n 1 file changed\n" },
    ];

    for (const { cmd, raw } of actions) {
      const { filtered } = filter.apply(cmd, raw);
      expect(filtered).toMatch(/ok\s*✓/);
      // Should be a single meaningful line (may have trailing newline)
      const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
      expect(lines.length).toBe(1);
    }
  });

  // ── VAL-GIT-018: rejected push preserves error ─────────────────

  it("rejected push preserves error", () => {
    const raw = `To github.com:user/repo.git
 ! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs to 'github.com:user/repo.git'
hint: Updates were rejected because the tip of your current branch is behind
hint: its remote counterpart. If you want to integrate the remote changes,
hint: use 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.
`;

    const { filtered } = filter.apply("git push", raw);

    // Must preserve the rejection info
    expect(filtered).toContain("rejected");
    // Should NOT be reduced to a simple "ok ✓"
    expect(filtered).not.toMatch(/^ok\s*✓/);
  });

  it("rejected push with force denied preserves error", () => {
    const raw = `remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Required status check "ci/build" is expected.
To github.com:user/repo.git
 ! [remote rejected] main -> main (protected branch hook declined)
error: failed to push some refs to 'github.com:user/repo.git'
`;

    const { filtered } = filter.apply("git push", raw);

    expect(filtered).toContain("rejected");
    expect(filtered).toContain("error");
  });

  it("merge conflict during pull preserved", () => {
    const raw = `remote: Enumerating objects: 5, done.
remote: Counting objects: 100% (5/5), done.
remote: Total 3 (delta 2), reused 0 (delta 0)
Unpacking objects: 100% (3/3), done.
From github.com:user/repo
   abc1234..def5678  main       -> origin/main
Auto-merging src/config.ts
CONFLICT (content): Merge conflict in src/config.ts
Automatic merge failed; fix conflicts and then commit the result.
`;

    const { filtered } = filter.apply("git pull", raw);

    // Must preserve conflict info
    expect(filtered).toContain("CONFLICT");
    expect(filtered).toContain("src/config.ts");
    // Should NOT be reduced to a simple "ok ✓"
    expect(filtered).not.toMatch(/^ok\s*✓/);
  });

  it("git commit with nothing to commit preserves message", () => {
    const raw = `On branch main
nothing to commit, working tree clean
`;

    const { filtered } = filter.apply("git commit", raw);

    // This is effectively an error/info, should preserve
    expect(filtered).toContain("nothing to commit");
  });

  // ── Edge cases ─────────────────────────────────────────────────

  it("empty output from git add", () => {
    const raw = "";
    const { filtered } = filter.apply("git add .", raw);

    expect(filtered).toMatch(/ok\s*✓/);
  });

  it("git pull already up to date", () => {
    const raw = `Already up to date.`;
    const { filtered } = filter.apply("git pull", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("pull");
  });

  it("git fetch with no new data", () => {
    const raw = ``;
    const { filtered } = filter.apply("git fetch", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("fetch");
  });

  it("forced push (three dots) extracts branch summary", () => {
    const raw = `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 10 threads
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 1.00 KiB | 1.00 MiB/s, done.
Total 3 (delta 1), reused 0 (delta 0), pack-reused 0
To github.com:user/repo.git
 + abc1234...def5678 feature -> feature (forced update)
`;

    const { filtered, rawChars, filteredChars } = filter.apply("git push --force", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("push");
    expect(filtered).toContain("feature -> feature");
    // >80% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.2);
  });

  it("git push with tags", () => {
    const raw = `Enumerating objects: 1, done.
Counting objects: 100% (1/1), done.
Writing objects: 100% (1/1), 170 bytes | 170.00 KiB/s, done.
Total 1 (delta 0), reused 0 (delta 0), pack-reused 0
To github.com:user/repo.git
 * [new tag]         v1.0.0 -> v1.0.0
`;

    const { filtered } = filter.apply("git push --tags", raw);

    expect(filtered).toMatch(/ok\s*✓/);
    expect(filtered).toContain("push");
  });

  // ── Command matching ───────────────────────────────────────────

  it("matches git push/pull/fetch/add/commit", () => {
    expect(filter.matches("git push")).toBe(true);
    expect(filter.matches("git push origin main")).toBe(true);
    expect(filter.matches("git pull")).toBe(true);
    expect(filter.matches("git pull --rebase")).toBe(true);
    expect(filter.matches("git fetch")).toBe(true);
    expect(filter.matches("git fetch --all")).toBe(true);
    expect(filter.matches("git add .")).toBe(true);
    expect(filter.matches("git add -A")).toBe(true);
    expect(filter.matches("git commit -m 'msg'")).toBe(true);
    expect(filter.matches("git commit --amend")).toBe(true);
  });

  it("does not match non-action git commands", () => {
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("git diff")).toBe(false);
    expect(filter.matches("git log")).toBe(false);
    expect(filter.matches("git branch")).toBe(false);
  });

  it("filter has correct name", () => {
    expect(filter.name).toBe("git-action");
  });
});
