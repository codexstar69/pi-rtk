/**
 * Configuration types and resolution: env vars > settings.json > defaults.
 * Follows the pi-lcm pattern exactly.
 */

import { loadSettings } from "./settings.js";

/** Per-filter-group enable/disable flags. */
export interface FilterGroupConfig {
  git: boolean;
  ls: boolean;
  test: boolean;
  lint: boolean;
  grep: boolean;
  json: boolean;
  docker: boolean;
  npm: boolean;
  read: boolean;
  logDedup: boolean;
  http: boolean;
}

/** Tee recovery configuration. */
export interface TeeConfig {
  enabled: boolean;
  mode: "failures" | "all";
  maxFiles: number;
  maxFileSize: number;
}

/** Root configuration for pi-rtk. */
export interface RtkConfig {
  enabled: boolean;
  filters: FilterGroupConfig;
  tee: TeeConfig;
  minOutputChars: number;
  excludeCommands: string[];
  debugMode: boolean;
}

const DEFAULT_FILTERS: FilterGroupConfig = {
  git: true,
  ls: true,
  test: true,
  lint: true,
  grep: true,
  json: true,
  docker: true,
  npm: true,
  read: true,
  logDedup: true,
  http: true,
};

const DEFAULT_TEE: TeeConfig = {
  enabled: true,
  mode: "failures",
  maxFiles: 20,
  maxFileSize: 1048576, // 1 MB
};

export const DEFAULTS: RtkConfig = {
  enabled: true,
  filters: { ...DEFAULT_FILTERS },
  tee: { ...DEFAULT_TEE },
  minOutputChars: 100,
  excludeCommands: [],
  debugMode: false,
};

// ── Env-var helpers ───────────────────────────────────────────────

function envBool(name: string): boolean | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  return v === "1" || v.toLowerCase() === "true";
}

function envInt(name: string): number | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

// ── Filter group mapping ──────────────────────────────────────────

/** Map a filter name to its config group. */
export function getFilterGroup(filterName: string): keyof FilterGroupConfig {
  if (filterName.startsWith("git-")) return "git";
  if (filterName === "ls" || filterName === "find" || filterName === "tree") return "ls";
  if (filterName.startsWith("test-")) return "test";
  if (filterName.startsWith("lint-")) return "lint";
  if (filterName === "grep") return "grep";
  if (filterName === "json-schema") return "json";
  if (filterName.startsWith("docker") || filterName === "kubectl") return "docker";
  if (filterName === "npm-install" || filterName === "pip-install") return "npm";
  if (filterName === "read-filter") return "read";
  if (filterName === "log-dedup") return "logDedup";
  if (filterName === "http") return "http";
  // Fallback — treat unknown as enabled by returning a group that's always on
  return "git";
}

// ── Config resolution ─────────────────────────────────────────────

/**
 * Resolve config with 3-layer priority: env vars > settings.json > defaults.
 *
 * @param cwd  Working directory for project-scoped settings lookup.
 *             When omitted, only global and env vars are considered.
 */
export function resolveConfig(cwd?: string): RtkConfig {
  const file = cwd
    ? loadSettings(cwd).config
    : loadSettings(process.cwd()).config;

  const fileFilters = (file.filters ?? {}) as Partial<FilterGroupConfig>;
  const fileTee = (file.tee ?? {}) as Partial<TeeConfig>;

  return {
    enabled: envBool("RTK_ENABLED") ?? file.enabled ?? DEFAULTS.enabled,

    filters: {
      git: envBool("RTK_FILTER_GIT") ?? fileFilters.git ?? DEFAULTS.filters.git,
      ls: envBool("RTK_FILTER_LS") ?? fileFilters.ls ?? DEFAULTS.filters.ls,
      test: envBool("RTK_FILTER_TEST") ?? fileFilters.test ?? DEFAULTS.filters.test,
      lint: envBool("RTK_FILTER_LINT") ?? fileFilters.lint ?? DEFAULTS.filters.lint,
      grep: envBool("RTK_FILTER_GREP") ?? fileFilters.grep ?? DEFAULTS.filters.grep,
      json: envBool("RTK_FILTER_JSON") ?? fileFilters.json ?? DEFAULTS.filters.json,
      docker: envBool("RTK_FILTER_DOCKER") ?? fileFilters.docker ?? DEFAULTS.filters.docker,
      npm: envBool("RTK_FILTER_NPM") ?? fileFilters.npm ?? DEFAULTS.filters.npm,
      read: envBool("RTK_FILTER_READ") ?? fileFilters.read ?? DEFAULTS.filters.read,
      logDedup: envBool("RTK_FILTER_LOG_DEDUP") ?? fileFilters.logDedup ?? DEFAULTS.filters.logDedup,
      http: envBool("RTK_FILTER_HTTP") ?? fileFilters.http ?? DEFAULTS.filters.http,
    },

    tee: {
      enabled: envBool("RTK_TEE_ENABLED") ?? fileTee.enabled ?? DEFAULTS.tee.enabled,
      mode: fileTee.mode ?? DEFAULTS.tee.mode,
      maxFiles: envInt("RTK_TEE_MAX_FILES") ?? fileTee.maxFiles ?? DEFAULTS.tee.maxFiles,
      maxFileSize: envInt("RTK_TEE_MAX_FILE_SIZE") ?? fileTee.maxFileSize ?? DEFAULTS.tee.maxFileSize,
    },

    minOutputChars:
      envInt("RTK_MIN_OUTPUT_CHARS") ?? file.minOutputChars ?? DEFAULTS.minOutputChars,

    excludeCommands: file.excludeCommands ?? DEFAULTS.excludeCommands,

    debugMode: envBool("RTK_DEBUG") ?? file.debugMode ?? DEFAULTS.debugMode,
  };
}
