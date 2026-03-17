import { describe, it, expect } from "vitest";
import { createNpmInstallFilter, createPipInstallFilter } from "../src/filters/npm-install.js";

// ── npm / bun / pnpm / yarn install filter ────────────────────────

describe("npm-install filter", () => {
  const filter = createNpmInstallFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("npm-install");
  });

  it("matches bun install", () => {
    expect(filter.matches("bun install")).toBe(true);
    expect(filter.matches("bun add lodash")).toBe(true);
    expect(filter.matches("bun i")).toBe(true);
  });

  it("matches npm install", () => {
    expect(filter.matches("npm install")).toBe(true);
    expect(filter.matches("npm install lodash")).toBe(true);
    expect(filter.matches("npm i")).toBe(true);
    expect(filter.matches("npm add express")).toBe(true);
  });

  it("matches pnpm install", () => {
    expect(filter.matches("pnpm install")).toBe(true);
    expect(filter.matches("pnpm add lodash")).toBe(true);
    expect(filter.matches("pnpm i")).toBe(true);
  });

  it("matches yarn install", () => {
    expect(filter.matches("yarn install")).toBe(true);
    expect(filter.matches("yarn add lodash")).toBe(true);
    expect(filter.matches("yarn i")).toBe(true);
  });

  it("does not match non-install commands", () => {
    expect(filter.matches("npm test")).toBe(false);
    expect(filter.matches("npm run build")).toBe(false);
    expect(filter.matches("bun test")).toBe(false);
    expect(filter.matches("ls -la")).toBe(false);
  });

  it("summarizes bun install output (VAL-DATA-007)", () => {
    const raw = [
      "bun install v1.3.10",
      "",
      "Resolving dependencies...",
      "Resolved 142 packages in 120ms",
      "Downloaded 42 packages in 800ms",
      "",
      "42 packages installed [1.23s]",
    ].join("\n");

    const result = filter.apply("bun install", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("42 packages installed");
    expect(result.filtered).toContain("1.23s");
  });

  it("summarizes npm install output", () => {
    const raw = [
      "",
      "added 156 packages, and audited 157 packages in 4s",
      "",
      "22 packages are looking for funding",
      "  run `npm fund` for details",
      "",
      "found 0 vulnerabilities",
    ].join("\n");

    const result = filter.apply("npm install", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("156 packages installed");
    expect(result.filtered).toContain("4s");
  });

  it("summarizes pnpm install output", () => {
    const raw = [
      "Packages: +85",
      "+++++++++++++++++++++++++++++++++++++++++++++++++++",
      "Progress: resolved 120, reused 85, downloaded 0, added 85, done",
      "",
      "dependencies:",
      "+ express 4.18.2",
      "+ lodash 4.17.21",
      "",
      "Done in 1.5s",
    ].join("\n");

    const result = filter.apply("pnpm install", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("85 packages installed");
    expect(result.filtered).toContain("1.5s");
  });

  it("preserves vulnerability warnings (VAL-DATA-007)", () => {
    const raw = [
      "",
      "added 156 packages, and audited 157 packages in 4s",
      "",
      "6 vulnerabilities (2 moderate, 3 high, 1 critical)",
      "",
      "To address all issues, run:",
      "  npm audit fix",
    ].join("\n");

    const result = filter.apply("npm install", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("156 packages installed");
    // Vulnerability warning preserved
    expect(result.filtered).toContain("vulnerabilit");
    expect(result.filtered).toContain("2 moderate");
  });

  it("preserves deprecated warnings", () => {
    const raw = [
      "npm warn deprecated inflight@1.0.6: This module is deprecated",
      "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are deprecated",
      "",
      "added 42 packages in 2s",
    ].join("\n");

    const result = filter.apply("npm install", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("42 packages installed");
    expect(result.filtered).toContain("deprecated");
  });

  it("handles install with no package count", () => {
    const raw = "up to date, audited 100 packages in 500ms";

    const result = filter.apply("npm install", raw);
    expect(result.filtered).toContain("ok ✓");
    // Should still have a summary even without "added N packages"
    expect(result.filtered).toContain("100 packages");
  });

  it("handles empty output", () => {
    const result = filter.apply("npm install", "");
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("install completed");
  });

  it("strips ANSI codes", () => {
    const raw = "\x1b[32madded 10 packages in 1s\x1b[0m";
    const result = filter.apply("npm install", raw);
    expect(result.filtered).not.toContain("\x1b");
    expect(result.filtered).toContain("10 packages installed");
  });

  it("reports correct rawChars and filteredChars", () => {
    const raw = [
      "bun install v1.3.10",
      "Resolving...",
      "Resolved 142 packages in 120ms",
      "Downloaded 42 packages in 800ms",
      "42 packages installed [1.23s]",
      "Extra line 1",
      "Extra line 2",
      "Extra line 3",
    ].join("\n");

    const result = filter.apply("bun install", raw);
    expect(result.rawChars).toBe(raw.length);
    expect(result.filteredChars).toBe(result.filtered.length);
    // Summary should be much shorter than full output
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });
});

// ── pip install filter ────────────────────────────────────────────

describe("pip-install filter", () => {
  const filter = createPipInstallFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("pip-install");
  });

  it("matches pip install", () => {
    expect(filter.matches("pip install flask")).toBe(true);
    expect(filter.matches("pip install -r requirements.txt")).toBe(true);
    expect(filter.matches("pip3 install django")).toBe(true);
  });

  it("does not match non-pip commands", () => {
    expect(filter.matches("npm install")).toBe(false);
    expect(filter.matches("pip freeze")).toBe(false);
    expect(filter.matches("pip list")).toBe(false);
  });

  it("summarizes pip install output (VAL-DATA-007)", () => {
    const raw = [
      "Collecting flask",
      "  Downloading flask-3.0.0-py3-none-any.whl (101 kB)",
      "Collecting werkzeug>=3.0.0",
      "  Downloading werkzeug-3.0.1-py3-none-any.whl (226 kB)",
      "Collecting jinja2>=3.1.2",
      "  Downloading Jinja2-3.1.3-py3-none-any.whl (133 kB)",
      "Installing collected packages: werkzeug, jinja2, flask",
      "Successfully installed flask-3.0.0 jinja2-3.1.3 werkzeug-3.0.1",
    ].join("\n");

    const result = filter.apply("pip install flask", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("3 packages installed");
  });

  it("preserves pip vulnerability warnings", () => {
    const raw = [
      "Collecting requests",
      "Successfully installed requests-2.31.0",
      "WARNING: pip has found 2 vulnerabilities (1 moderate, 1 high)",
    ].join("\n");

    const result = filter.apply("pip install requests", raw);
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("vulnerabilit");
  });

  it("handles empty output", () => {
    const result = filter.apply("pip install flask", "");
    expect(result.filtered).toContain("ok ✓");
    expect(result.filtered).toContain("install completed");
  });

  it("reports correct rawChars and filteredChars", () => {
    const raw = [
      "Collecting flask",
      "  Downloading flask-3.0.0-py3-none-any.whl (101 kB)",
      "  Downloading werkzeug-3.0.1-py3-none-any.whl (226 kB)",
      "  Downloading Jinja2-3.1.3-py3-none-any.whl (133 kB)",
      "Installing collected packages: werkzeug, jinja2, flask",
      "Successfully installed flask-3.0.0 jinja2-3.1.3 werkzeug-3.0.1",
    ].join("\n");

    const result = filter.apply("pip install flask", raw);
    expect(result.rawChars).toBe(raw.length);
    expect(result.filteredChars).toBe(result.filtered.length);
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });
});
