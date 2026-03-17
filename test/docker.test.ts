import { describe, it, expect } from "vitest";
import { createDockerListFilter, createDockerLogsFilter } from "../src/filters/docker.js";

// ── Docker ps / images (docker-list filter) ───────────────────────

describe("docker-list filter", () => {
  const filter = createDockerListFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("docker-list");
  });

  it("matches docker ps", () => {
    expect(filter.matches("docker ps")).toBe(true);
    expect(filter.matches("docker ps -a")).toBe(true);
    expect(filter.matches("docker ps --all")).toBe(true);
  });

  it("matches docker images", () => {
    expect(filter.matches("docker images")).toBe(true);
    expect(filter.matches("docker images -a")).toBe(true);
  });

  it("does not match non-docker commands", () => {
    expect(filter.matches("docker logs")).toBe(false);
    expect(filter.matches("docker compose")).toBe(false);
    expect(filter.matches("ls -la")).toBe(false);
  });

  it("compacts docker ps table with short IDs (VAL-DATA-005)", () => {
    const raw = [
      "CONTAINER ID   IMAGE          COMMAND                  CREATED       STATUS       PORTS                  NAMES",
      "abc123def456789abcdef   nginx:latest   \"/docker-entrypoint.…\"   2 hours ago   Up 2 hours   0.0.0.0:80->80/tcp     web",
      "def456789abcdef012345   redis:7        \"docker-entrypoint.s…\"   3 hours ago   Up 3 hours   6379/tcp               cache",
      "789abcdef012345678901   postgres:16    \"docker-entrypoint.s…\"   4 hours ago   Up 4 hours   5432/tcp               db",
    ].join("\n");

    const result = filter.apply("docker ps", raw);

    // IDs should be shortened to 12 chars
    expect(result.filtered).toContain("abc123def456");
    expect(result.filtered).not.toContain("abc123def456789abcdef");
    expect(result.filtered).toContain("def456789abc");
    expect(result.filtered).not.toContain("def456789abcdef012345");

    // Should still have header
    expect(result.filtered).toContain("CONTAINER ID");

    // Image names preserved
    expect(result.filtered).toContain("nginx:latest");
    expect(result.filtered).toContain("redis:7");
    expect(result.filtered).toContain("postgres:16");
  });

  it("compacts docker images table with short IDs", () => {
    const raw = [
      "REPOSITORY   TAG       IMAGE ID            CREATED       SIZE",
      "nginx        latest    abc123def456789a     2 weeks ago   187MB",
      "redis        7         def456789abcdef0     3 weeks ago   130MB",
    ].join("\n");

    const result = filter.apply("docker images", raw);

    expect(result.filtered).toContain("abc123def456");
    expect(result.filtered).not.toContain("abc123def456789a");
    expect(result.filtered).toContain("REPOSITORY");
    expect(result.filtered).toContain("nginx");
  });

  it("handles empty output", () => {
    const result = filter.apply("docker ps", "");
    expect(result.filtered).toBe("");
    expect(result.filteredChars).toBe(0);
  });

  it("handles header-only output (no containers)", () => {
    const raw = "CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES";
    const result = filter.apply("docker ps", raw);
    expect(result.filtered).toContain("CONTAINER ID");
  });

  it("preserves rows that have no long hex IDs", () => {
    const raw = [
      "CONTAINER ID   IMAGE     STATUS       NAMES",
      "abc123def456   nginx     Up 2 hours   web",
    ].join("\n");

    const result = filter.apply("docker ps", raw);
    // Short ID already 12 chars — should stay as is
    expect(result.filtered).toContain("abc123def456");
  });

  it("reports correct rawChars and filteredChars", () => {
    const raw = [
      "CONTAINER ID   IMAGE          COMMAND   CREATED       STATUS       PORTS   NAMES",
      "abc123def456789abcdef0123456   nginx:latest   cmd       2 hours ago   Up 2 hours   80/tcp  web",
    ].join("\n");

    const result = filter.apply("docker ps", raw);
    expect(result.rawChars).toBe(raw.length);
    expect(result.filteredChars).toBe(result.filtered.length);
    // Filtered should be shorter due to ID truncation
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });
});

// ── Docker logs (docker-logs filter) ──────────────────────────────

describe("docker-logs filter", () => {
  const filter = createDockerLogsFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("docker-logs");
  });

  it("matches docker logs", () => {
    expect(filter.matches("docker logs web")).toBe(true);
    expect(filter.matches("docker logs --tail 100 web")).toBe(true);
    expect(filter.matches("docker logs -f container")).toBe(true);
  });

  it("does not match non-logs commands", () => {
    expect(filter.matches("docker ps")).toBe(false);
    expect(filter.matches("docker images")).toBe(false);
    expect(filter.matches("ls -la")).toBe(false);
  });

  it("collapses 3+ consecutive identical lines with (xN) (VAL-DATA-006)", () => {
    const lines = [
      "Starting server...",
      "Listening on port 3000",
      "Listening on port 3000",
      "Listening on port 3000",
      "Listening on port 3000",
      "Listening on port 3000",
      "Connection received",
    ];
    const raw = lines.join("\n");

    const result = filter.apply("docker logs web", raw);
    expect(result.filtered).toContain("Listening on port 3000 (x5)");
    expect(result.filtered).toContain("Starting server...");
    expect(result.filtered).toContain("Connection received");
  });

  it("preserves runs of fewer than 3 identical lines", () => {
    const raw = [
      "line A",
      "line A",
      "line B",
    ].join("\n");

    const result = filter.apply("docker logs web", raw);
    // Should have two "line A" lines, not collapsed
    const matches = result.filtered.match(/line A/g);
    expect(matches).toHaveLength(2);
    expect(result.filtered).not.toContain("(x");
  });

  it("collapses lines with different timestamps but same message", () => {
    const raw = [
      "2024-01-15T10:30:00Z Server ready",
      "2024-01-15T10:30:01Z Server ready",
      "2024-01-15T10:30:02Z Server ready",
      "2024-01-15T10:30:03Z Server ready",
    ].join("\n");

    const result = filter.apply("docker logs web", raw);
    // Should be collapsed since the message "Server ready" is the same
    expect(result.filtered).toContain("(x4)");
  });

  it("handles empty output", () => {
    const result = filter.apply("docker logs web", "");
    expect(result.filtered).toBe("");
  });

  it("handles single line output", () => {
    const result = filter.apply("docker logs web", "Starting...");
    expect(result.filtered).toBe("Starting...");
  });

  it("handles multiple different repeated groups", () => {
    const raw = [
      "request handled",
      "request handled",
      "request handled",
      "request handled",
      "error occurred",
      "retrying...",
      "retrying...",
      "retrying...",
    ].join("\n");

    const result = filter.apply("docker logs web", raw);
    expect(result.filtered).toContain("request handled (x4)");
    expect(result.filtered).toContain("retrying... (x3)");
    expect(result.filtered).toContain("error occurred");
  });

  it("reports correct rawChars and filteredChars", () => {
    const lines = Array(20).fill("repeated log line");
    const raw = lines.join("\n");

    const result = filter.apply("docker logs web", raw);
    expect(result.rawChars).toBe(raw.length);
    expect(result.filteredChars).toBe(result.filtered.length);
    // Should be significantly shorter
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });

  it("strips ANSI codes before dedup", () => {
    const raw = [
      "\x1b[32mGreen line\x1b[0m",
      "\x1b[32mGreen line\x1b[0m",
      "\x1b[32mGreen line\x1b[0m",
    ].join("\n");

    const result = filter.apply("docker logs web", raw);
    expect(result.filtered).toContain("Green line (x3)");
    expect(result.filtered).not.toContain("\x1b");
  });
});
