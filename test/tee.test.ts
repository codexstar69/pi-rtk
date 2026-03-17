/**
 * Tests for the tee recovery system.
 * Verifies: file creation, content matching, filename format,
 * rotation at maxFiles, truncation at maxFileSize, hint format.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { saveTee, getTeeHint } from "../src/tee.js";
import type { TeeConfig } from "../src/config.js";

/** Create a temp dir that mimics ~/.pi/agent/rtk/tee/ */
function makeTempTeeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-rtk-tee-test-"));
  return dir;
}

describe("tee recovery system", () => {
  let teeDir: string;
  let defaultConfig: TeeConfig;

  beforeEach(() => {
    teeDir = makeTempTeeDir();
    defaultConfig = {
      enabled: true,
      mode: "failures",
      maxFiles: 20,
      maxFileSize: 1048576, // 1 MB
    };
  });

  afterEach(() => {
    // Clean up temp dir
    fs.rmSync(teeDir, { recursive: true, force: true });
  });

  // ── File creation ──────────────────────────────────────────────

  describe("file creation", () => {
    it("creates a file in the tee directory", () => {
      const filePath = saveTee("git diff", "some raw output", defaultConfig, teeDir);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("creates the tee directory if it does not exist", () => {
      const nested = path.join(teeDir, "nested", "deep", "tee");
      const filePath = saveTee("git status", "output text", defaultConfig, nested);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(nested)).toBe(true);
    });

    it("returns an absolute path to the saved file", () => {
      const filePath = saveTee("bun test", "test output", defaultConfig, teeDir);
      expect(path.isAbsolute(filePath)).toBe(true);
    });
  });

  // ── Content matching ───────────────────────────────────────────

  describe("content matching", () => {
    it("file content matches raw output exactly", () => {
      const raw = "line1\nline2\nline3\n";
      const filePath = saveTee("git diff", raw, defaultConfig, teeDir);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toBe(raw);
    });

    it("preserves unicode characters in output", () => {
      const raw = "🎉 Tests passed! ✓ — файл.ts\n日本語テスト\n";
      const filePath = saveTee("bun test", raw, defaultConfig, teeDir);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toBe(raw);
    });

    it("handles empty output", () => {
      const filePath = saveTee("git status", "", defaultConfig, teeDir);
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toBe("");
    });
  });

  // ── Filename format ────────────────────────────────────────────

  describe("filename format", () => {
    it("uses timestamp-based filename", () => {
      const filePath = saveTee("git diff", "output", defaultConfig, teeDir);
      const basename = path.basename(filePath);
      // Expected format: YYYY-MM-DD_HHMMSS_<command-slug>.txt
      expect(basename).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}_[\w-]+\.txt$/);
    });

    it("includes sanitized command name in filename", () => {
      const filePath = saveTee("git diff --stat", "output", defaultConfig, teeDir);
      const basename = path.basename(filePath);
      expect(basename).toContain("git-diff");
    });

    it("sanitizes special characters in command for filename", () => {
      const filePath = saveTee('grep -r "pattern" src/', "output", defaultConfig, teeDir);
      const basename = path.basename(filePath);
      // Should not contain quotes or spaces or slashes
      expect(basename).not.toMatch(/["\s/]/);
      expect(basename).toContain("grep");
    });

    it("has .txt extension", () => {
      const filePath = saveTee("ls -la", "output", defaultConfig, teeDir);
      expect(filePath).toMatch(/\.txt$/);
    });
  });

  // ── Rotation at maxFiles ───────────────────────────────────────

  describe("rotation at maxFiles", () => {
    it("deletes oldest file when count exceeds maxFiles", () => {
      const config: TeeConfig = { ...defaultConfig, maxFiles: 3 };

      // Create 3 files first (at the limit)
      const paths: string[] = [];
      for (let i = 0; i < 3; i++) {
        // Use a small delay to ensure different timestamps in filenames
        const p = saveTee(`cmd-${i}`, `output ${i}`, config, teeDir);
        paths.push(p);
      }

      // All 3 should exist
      expect(fs.readdirSync(teeDir).filter((f) => f.endsWith(".txt")).length).toBe(3);

      // Add one more — should trigger rotation (delete oldest)
      const newPath = saveTee("cmd-3", "output 3", config, teeDir);

      const remaining = fs.readdirSync(teeDir).filter((f) => f.endsWith(".txt"));
      expect(remaining.length).toBe(3); // still at max
      expect(fs.existsSync(newPath)).toBe(true);

      // The oldest file should have been deleted
      expect(fs.existsSync(paths[0])).toBe(false);
    });

    it("handles maxFiles of 1 — only keeps latest file", () => {
      const config: TeeConfig = { ...defaultConfig, maxFiles: 1 };

      const first = saveTee("cmd-a", "output a", config, teeDir);
      expect(fs.existsSync(first)).toBe(true);

      const second = saveTee("cmd-b", "output b", config, teeDir);
      const files = fs.readdirSync(teeDir).filter((f) => f.endsWith(".txt"));
      expect(files.length).toBe(1);
      expect(fs.existsSync(second)).toBe(true);
      expect(fs.existsSync(first)).toBe(false);
    });

    it("does not delete files when under maxFiles limit", () => {
      const config: TeeConfig = { ...defaultConfig, maxFiles: 10 };

      for (let i = 0; i < 5; i++) {
        saveTee(`cmd-${i}`, `output ${i}`, config, teeDir);
      }

      const files = fs.readdirSync(teeDir).filter((f) => f.endsWith(".txt"));
      expect(files.length).toBe(5);
    });
  });

  // ── Truncation at maxFileSize ──────────────────────────────────

  describe("truncation at maxFileSize", () => {
    it("truncates output when exceeding maxFileSize", () => {
      const config: TeeConfig = { ...defaultConfig, maxFileSize: 100 };
      const longOutput = "x".repeat(500);

      const filePath = saveTee("git diff", longOutput, config, teeDir);
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content.length).toBeLessThanOrEqual(100);
    });

    it("does not truncate output within maxFileSize", () => {
      const config: TeeConfig = { ...defaultConfig, maxFileSize: 1000 };
      const output = "short output";

      const filePath = saveTee("git diff", output, config, teeDir);
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toBe(output);
    });

    it("truncation preserves the start of the output", () => {
      const config: TeeConfig = { ...defaultConfig, maxFileSize: 50 };
      const output = "HEADER: important info\n" + "x".repeat(500);

      const filePath = saveTee("tsc", output, config, teeDir);
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content.startsWith("HEADER: important info")).toBe(true);
    });
  });

  // ── Hint format ────────────────────────────────────────────────

  describe("hint format", () => {
    it("returns hint in correct format", () => {
      const filePath = saveTee("git diff", "output", defaultConfig, teeDir);
      const hint = getTeeHint(filePath);
      expect(hint).toBe(`[full output: ${filePath}]`);
    });

    it("hint contains the exact file path", () => {
      const filePath = saveTee("bun test", "test output here", defaultConfig, teeDir);
      const hint = getTeeHint(filePath);
      expect(hint).toContain(filePath);
    });

    it("hint uses square bracket format", () => {
      const filePath = saveTee("npm test", "output", defaultConfig, teeDir);
      const hint = getTeeHint(filePath);
      expect(hint).toMatch(/^\[full output: .+\]$/);
    });
  });
});
