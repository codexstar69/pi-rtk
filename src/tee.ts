/**
 * Tee recovery system — saves raw output to disk for later retrieval.
 *
 * When a command fails or tee is enabled, raw output is saved to
 * ~/.pi/agent/rtk/tee/ with a timestamp-based filename.
 * Enforces maxFiles rotation and maxFileSize truncation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { TeeConfig } from "./config.js";

/** Default tee directory path. */
const DEFAULT_TEE_DIR = path.join(os.homedir(), ".pi", "agent", "rtk", "tee");

/**
 * Sanitize a command string into a safe filename slug.
 * Keeps only alphanumeric, hyphens; replaces spaces/special chars with hyphens.
 * Truncates to 40 chars max.
 */
function slugify(command: string): string {
  return command
    .replace(/[^a-zA-Z0-9-]/g, "-") // replace non-alphanum with hyphen
    .replace(/-+/g, "-")            // collapse multiple hyphens
    .replace(/^-|-$/g, "")          // trim leading/trailing hyphens
    .slice(0, 40)                   // truncate to 40 chars
    .toLowerCase();
}

/**
 * Generate a timestamp-based filename.
 * Format: YYYY-MM-DD_HHMMSS_<command-slug>.txt
 */
function generateFilename(command: string): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const slug = slugify(command);
  return `${date}_${time}_${slug}.txt`;
}

/**
 * Enforce maxFiles rotation by deleting the oldest .txt files
 * until the count is under the limit.
 *
 * Files are sorted by name (which is timestamp-based, so oldest first).
 */
function rotateFiles(teeDir: string, maxFiles: number): void {
  let files: string[];
  try {
    files = fs
      .readdirSync(teeDir)
      .filter((f) => f.endsWith(".txt"))
      .sort(); // lexicographic sort = chronological for our timestamp format
  } catch {
    return; // directory doesn't exist or unreadable — nothing to rotate
  }

  // Delete oldest files until we're at maxFiles - 1 (to make room for the new file)
  while (files.length >= maxFiles) {
    const oldest = files.shift()!;
    try {
      fs.unlinkSync(path.join(teeDir, oldest));
    } catch {
      // Ignore deletion errors (file may already be gone)
    }
  }
}

/**
 * Save raw output to the tee directory.
 *
 * @param command    The command that produced the output.
 * @param rawOutput  The raw command output to save.
 * @param config     Tee configuration (maxFiles, maxFileSize, etc.).
 * @param teeDir     Override tee directory (for testing). Defaults to ~/.pi/agent/rtk/tee/.
 * @returns          Absolute path to the saved file.
 */
export function saveTee(
  command: string,
  rawOutput: string,
  config: TeeConfig,
  teeDir: string = DEFAULT_TEE_DIR,
): string {
  // Ensure tee directory exists
  fs.mkdirSync(teeDir, { recursive: true });

  // Rotate old files before writing new one
  rotateFiles(teeDir, config.maxFiles);

  // Truncate output if exceeding maxFileSize
  const content =
    rawOutput.length > config.maxFileSize
      ? rawOutput.slice(0, config.maxFileSize)
      : rawOutput;

  // Generate filename and write
  const filename = generateFilename(command);
  const filePath = path.join(teeDir, filename);
  fs.writeFileSync(filePath, content, "utf-8");

  return filePath;
}

/**
 * Generate the tee hint string that gets appended to filtered output.
 * Format: [full output: <path>]
 */
export function getTeeHint(filePath: string): string {
  return `[full output: ${filePath}]`;
}
