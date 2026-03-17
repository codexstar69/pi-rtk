import { describe, it, expect } from "vitest";
import { createGitLogFilter } from "../src/filters/git-log.js";

const filter = createGitLogFilter();

// ── Helpers ──────────────────────────────────────────────────────

/** Generate a realistic verbose git log entry (like default `git log` output). */
function makeLogEntry(hash: string, subject: string, author = "Dev User", date = "Mon Mar 17 10:00:00 2025 +0000"): string {
  return `commit ${hash}
Author: ${author} <dev@example.com>
Date:   ${date}

    ${subject}
`;
}

/** Generate N verbose git log entries. */
function makeLog(count: number, subjectPrefix = "Fix issue"): string {
  const entries: string[] = [];
  for (let i = 0; i < count; i++) {
    const hash = `a${String(i).padStart(6, "0")}b${String(i).padStart(6, "0")}c${String(i).padStart(6, "0")}d${String(i).padStart(6, "0")}e${String(i).padStart(3, "0")}`;
    entries.push(makeLogEntry(hash.slice(0, 40), `${subjectPrefix} #${i + 1}`));
  }
  return entries.join("\n");
}

describe("git-log filter", () => {
  // ── VAL-GIT-014: happy path (oneline format, >50% savings) ─────

  it("log produces oneline format", () => {
    const raw = makeLog(10);
    const { filtered, rawChars, filteredChars } = filter.apply("git log", raw);

    // Should have 10 entries
    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(10);

    // Each line should contain a short hash and subject
    for (let i = 0; i < 10; i++) {
      expect(lines[i]).toContain(`Fix issue #${i + 1}`);
    }

    // Each line should have a short hash (7 chars)
    expect(lines[0]).toMatch(/^[a-f0-9]{7,}\s/);

    // >50% savings
    expect(filteredChars).toBeLessThan(rawChars * 0.5);
  });

  // ── VAL-GIT-015: truncation at 20 commits ─────────────────────

  it("log truncated at 20 commits", () => {
    const raw = makeLog(50);
    const { filtered } = filter.apply("git log", raw);

    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);

    // Should show at most 20 commit lines + 1 truncation indicator
    const commitLines = lines.filter((l) => /^[a-f0-9]{7,}\s/.test(l));
    expect(commitLines.length).toBe(20);

    // Should have a truncation indicator
    expect(filtered).toMatch(/\+\s*30\s*more/i);
  });

  // ── VAL-GIT-016: subject truncation at 80 chars ───────────────

  it("long subjects truncated", () => {
    const longSubject = "A".repeat(120);
    const raw = makeLogEntry("abcdef1234567890abcdef1234567890abcdef12", longSubject);
    const { filtered } = filter.apply("git log", raw);

    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    // Subject portion should be truncated (with ellipsis)
    // Full line = hash + space + subject; subject itself ≤80 chars
    const firstLine = lines[0];
    // Extract subject part after the hash
    const subjectPart = firstLine.replace(/^[a-f0-9]+\s+/, "");
    expect(subjectPart.length).toBeLessThanOrEqual(83); // 80 + "..."
    expect(subjectPart).toContain("...");
  });

  it("subjects at exactly 80 chars not truncated", () => {
    const subject = "B".repeat(80);
    const raw = makeLogEntry("abcdef1234567890abcdef1234567890abcdef12", subject);
    const { filtered } = filter.apply("git log", raw);

    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
    const subjectPart = lines[0].replace(/^[a-f0-9]+\s+/, "");
    expect(subjectPart).toBe(subject);
    expect(subjectPart).not.toContain("...");
  });

  it("subjects under 80 chars preserved", () => {
    const subject = "Short commit message";
    const raw = makeLogEntry("abcdef1234567890abcdef1234567890abcdef12", subject);
    const { filtered } = filter.apply("git log", raw);

    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
    expect(lines[0]).toContain(subject);
  });

  // ── Edge cases ─────────────────────────────────────────────────

  it("empty log output", () => {
    const raw = "";
    const { filtered } = filter.apply("git log", raw);
    expect(typeof filtered).toBe("string");
  });

  it("single commit log", () => {
    const raw = makeLog(1, "Initial commit");
    const { filtered } = filter.apply("git log", raw);

    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("Initial commit #1");
  });

  it("exactly 20 commits — no truncation indicator", () => {
    const raw = makeLog(20);
    const { filtered } = filter.apply("git log", raw);

    const lines = filtered.split("\n").filter((l) => l.trim().length > 0);
    const commitLines = lines.filter((l) => /^[a-f0-9]{7,}\s/.test(l));
    expect(commitLines.length).toBe(20);
    expect(filtered).not.toMatch(/more/i);
  });

  it("21 commits — shows 20 + truncation", () => {
    const raw = makeLog(21);
    const { filtered } = filter.apply("git log", raw);

    const commitLines = filtered.split("\n").filter((l) => /^[a-f0-9]{7,}\s/.test(l));
    expect(commitLines.length).toBe(20);
    expect(filtered).toMatch(/\+\s*1\s*more/i);
  });

  it("handles --oneline format input gracefully", () => {
    // If input is already oneline, just pass through (up to 20 limit)
    const lines = Array.from({ length: 10 }, (_, i) =>
      `abc${String(i).padStart(4, "0")} Fix something #${i}`
    );
    const raw = lines.join("\n");
    const { filtered } = filter.apply("git log --oneline", raw);

    // Should contain the commit info
    const outputLines = filtered.split("\n").filter((l) => l.trim().length > 0);
    expect(outputLines.length).toBe(10);
  });

  // ── Command matching ───────────────────────────────────────────

  it("matches git log command", () => {
    expect(filter.matches("git log")).toBe(true);
    expect(filter.matches("git log --oneline")).toBe(true);
    expect(filter.matches("git log -10")).toBe(true);
    expect(filter.matches("git log --pretty=format:'%h %s'")).toBe(true);
  });

  it("does not match non-log git commands", () => {
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("git diff")).toBe(false);
    expect(filter.matches("git commit")).toBe(false);
  });

  it("filter has correct name", () => {
    expect(filter.name).toBe("git-log");
  });

  // ── Savings verification ───────────────────────────────────────

  it("large verbose log achieves significant savings", () => {
    const raw = makeLog(20, "Implement feature with detailed description of changes made");
    const { rawChars, filteredChars } = filter.apply("git log", raw);

    // Should achieve >50% savings on verbose output
    expect(filteredChars).toBeLessThan(rawChars * 0.5);
  });
});
