/**
 * Settings persistence: load/save RTK config from Pi's settings.json.
 * Follows the pi-lcm pattern: project > global > defaults.
 * Atomic writes via temp file + rename.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RtkConfig } from "./config.js";

export const SETTINGS_KEY = "rtk";

export type SettingsScope = "global" | "project";
export type ConfigSource = SettingsScope | "default";

export interface LoadedConfig {
  config: Partial<RtkConfig>;
  source: ConfigSource;
  globalPath: string;
  projectPath: string;
}

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    // If the file exists but can't be parsed, throw instead of
    // silently returning {} (which would cause data loss on save)
    if (fs.existsSync(filePath)) {
      throw new Error(`Failed to parse settings file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return {};
  }
}

export function getGlobalSettingsPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

export function getProjectSettingsPath(cwd: string): string {
  return path.join(cwd, ".pi", "settings.json");
}

/**
 * Load RTK settings with project > global > default priority.
 */
export function loadSettings(cwd: string): LoadedConfig {
  const globalPath = getGlobalSettingsPath();
  const projectPath = getProjectSettingsPath(cwd);

  const projectRaw = readJsonFile(projectPath)[SETTINGS_KEY];
  if (projectRaw && typeof projectRaw === "object") {
    return { config: projectRaw as Partial<RtkConfig>, source: "project", globalPath, projectPath };
  }

  const globalRaw = readJsonFile(globalPath)[SETTINGS_KEY];
  if (globalRaw && typeof globalRaw === "object") {
    return { config: globalRaw as Partial<RtkConfig>, source: "global", globalPath, projectPath };
  }

  return { config: {}, source: "default", globalPath, projectPath };
}

/**
 * Save RTK settings to the specified scope. Uses atomic writes (temp + rename).
 */
export function saveSettings(
  config: Partial<RtkConfig>,
  scope: SettingsScope,
  cwd: string,
): string {
  const settingsPath =
    scope === "project" ? getProjectSettingsPath(cwd) : getGlobalSettingsPath();

  let settings: Record<string, unknown>;
  try {
    settings = readJsonFile(settingsPath);
  } catch (e) {
    // Don't overwrite a corrupted file — that would destroy other extensions' data
    throw new Error(`Cannot save RTK settings: ${e instanceof Error ? e.message : String(e)}`);
  }
  settings[SETTINGS_KEY] = config;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  // Atomic write: temp file + rename prevents corruption
  const tmpPath = `${settingsPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + "\n");
    fs.renameSync(tmpPath, settingsPath);
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
  }

  return settingsPath;
}
