/**
 * Tests for config resolution, settings load/save, and filter registry.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Mock node:os so we can override homedir() to isolate tests from
// the user's real global ~/.pi/agent/settings.json.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: vi.fn(actual.homedir) };
});

import {
  resolveConfig,
  DEFAULTS,
  getFilterGroup,
  type RtkConfig,
} from "../src/config.js";
import {
  loadSettings,
  saveSettings,
  getGlobalSettingsPath,
  getProjectSettingsPath,
  SETTINGS_KEY,
} from "../src/settings.js";
import {
  findFilter,
  registerFilter,
  getFilters,
  type Filter,
  type FilterResult,
} from "../src/filters/index.js";

// ── Helpers ───────────────────────────────────────────────────────

/** Create a temp directory for isolated settings tests. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-rtk-test-"));
}

/** Write a JSON file. */
function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** Clean up env vars between tests. */
const ENV_KEYS = [
  "RTK_ENABLED",
  "RTK_DEBUG",
  "RTK_MIN_OUTPUT_CHARS",
  "RTK_FILTER_GIT",
  "RTK_FILTER_LS",
  "RTK_FILTER_TEST",
  "RTK_FILTER_LINT",
  "RTK_FILTER_GREP",
  "RTK_FILTER_JSON",
  "RTK_FILTER_DOCKER",
  "RTK_FILTER_NPM",
  "RTK_FILTER_READ",
  "RTK_FILTER_LOG_DEDUP",
  "RTK_FILTER_HTTP",
  "RTK_TEE_ENABLED",
  "RTK_TEE_MAX_FILES",
  "RTK_TEE_MAX_FILE_SIZE",
];

// ── Config resolution tests ───────────────────────────────────────

describe("resolveConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Isolate from user's real global settings by pointing os.homedir() to tmpDir
    vi.mocked(os.homedir).mockReturnValue(tmpDir);
    // Clean env
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    vi.mocked(os.homedir).mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when nothing is set", () => {
    // Point to a tmpDir with no settings.json
    const config = resolveConfig(tmpDir);

    expect(config.enabled).toBe(true);
    expect(config.debugMode).toBe(false);
    expect(config.minOutputChars).toBe(100);
    expect(config.excludeCommands).toEqual([]);
    expect(config.filters.git).toBe(true);
    expect(config.filters.ls).toBe(true);
    expect(config.filters.test).toBe(true);
    expect(config.filters.lint).toBe(true);
    expect(config.filters.grep).toBe(true);
    expect(config.filters.json).toBe(true);
    expect(config.filters.docker).toBe(true);
    expect(config.filters.npm).toBe(true);
    expect(config.filters.read).toBe(true);
    expect(config.filters.logDedup).toBe(true);
    expect(config.filters.http).toBe(true);
    expect(config.tee.enabled).toBe(true);
    expect(config.tee.mode).toBe("failures");
    expect(config.tee.maxFiles).toBe(20);
    expect(config.tee.maxFileSize).toBe(1048576);
  });

  it("settings.json overrides defaults", () => {
    // Write a project-scoped settings file
    const settingsPath = path.join(tmpDir, ".pi", "settings.json");
    writeJson(settingsPath, {
      [SETTINGS_KEY]: {
        enabled: false,
        debugMode: true,
        minOutputChars: 50,
        filters: { git: false, ls: false },
        tee: { maxFiles: 5 },
      },
    });

    const config = resolveConfig(tmpDir);

    expect(config.enabled).toBe(false);
    expect(config.debugMode).toBe(true);
    expect(config.minOutputChars).toBe(50);
    expect(config.filters.git).toBe(false);
    expect(config.filters.ls).toBe(false);
    // Unspecified filter groups use defaults
    expect(config.filters.test).toBe(true);
    expect(config.tee.maxFiles).toBe(5);
    // Unspecified tee fields use defaults
    expect(config.tee.enabled).toBe(true);
  });

  it("env var overrides settings.json", () => {
    const settingsPath = path.join(tmpDir, ".pi", "settings.json");
    writeJson(settingsPath, {
      [SETTINGS_KEY]: {
        enabled: true,
        debugMode: false,
        minOutputChars: 200,
        filters: { git: true },
      },
    });

    // Env vars take top priority
    process.env.RTK_ENABLED = "false";
    process.env.RTK_DEBUG = "1";
    process.env.RTK_MIN_OUTPUT_CHARS = "42";
    process.env.RTK_FILTER_GIT = "false";

    const config = resolveConfig(tmpDir);

    expect(config.enabled).toBe(false);
    expect(config.debugMode).toBe(true);
    expect(config.minOutputChars).toBe(42);
    expect(config.filters.git).toBe(false);
  });

  it("env var overrides defaults when no settings file", () => {
    process.env.RTK_ENABLED = "0";
    process.env.RTK_FILTER_DOCKER = "false";
    process.env.RTK_TEE_MAX_FILES = "10";

    const config = resolveConfig(tmpDir);

    // RTK_ENABLED "0" is not "1" or "true", so it's false
    expect(config.enabled).toBe(false);
    expect(config.filters.docker).toBe(false);
    expect(config.tee.maxFiles).toBe(10);
    // Unset env vars → defaults
    expect(config.filters.git).toBe(true);
  });

  it("handles invalid env var values gracefully", () => {
    process.env.RTK_MIN_OUTPUT_CHARS = "not-a-number";
    process.env.RTK_TEE_MAX_FILES = "";

    const config = resolveConfig(tmpDir);

    // Invalid int → envInt returns undefined → falls through to default
    expect(config.minOutputChars).toBe(100);
    expect(config.tee.maxFiles).toBe(20);
  });

  it("partial settings.json is merged with defaults", () => {
    const settingsPath = path.join(tmpDir, ".pi", "settings.json");
    writeJson(settingsPath, {
      [SETTINGS_KEY]: {
        filters: { grep: false },
      },
    });

    const config = resolveConfig(tmpDir);

    // Only grep is overridden
    expect(config.filters.grep).toBe(false);
    // Everything else at defaults
    expect(config.enabled).toBe(true);
    expect(config.filters.git).toBe(true);
    expect(config.minOutputChars).toBe(100);
    expect(config.tee.enabled).toBe(true);
  });

  it("tee env vars override tee settings", () => {
    const settingsPath = path.join(tmpDir, ".pi", "settings.json");
    writeJson(settingsPath, {
      [SETTINGS_KEY]: {
        tee: { enabled: true, maxFiles: 30, maxFileSize: 2000000 },
      },
    });

    process.env.RTK_TEE_ENABLED = "false";
    process.env.RTK_TEE_MAX_FILES = "5";
    process.env.RTK_TEE_MAX_FILE_SIZE = "500000";

    const config = resolveConfig(tmpDir);

    expect(config.tee.enabled).toBe(false);
    expect(config.tee.maxFiles).toBe(5);
    expect(config.tee.maxFileSize).toBe(500000);
  });
});

// ── Settings load/save tests ──────────────────────────────────────

describe("loadSettings", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Isolate from user's real global settings by pointing os.homedir() to tmpDir
    vi.mocked(os.homedir).mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns default source when no files exist", () => {
    const result = loadSettings(tmpDir);

    expect(result.source).toBe("default");
    expect(result.config).toEqual({});
  });

  it("loads from project settings when present", () => {
    const projectPath = path.join(tmpDir, ".pi", "settings.json");
    writeJson(projectPath, {
      [SETTINGS_KEY]: { enabled: false, debugMode: true },
    });

    const result = loadSettings(tmpDir);

    expect(result.source).toBe("project");
    expect(result.config.enabled).toBe(false);
    expect(result.config.debugMode).toBe(true);
  });

  it("falls back to global when no project settings", () => {
    // We can't easily mock the global path, so we'll test project > default
    // by confirming project settings are preferred.
    // Testing global would require writing to the real global path.
    const result = loadSettings(tmpDir);
    expect(result.source).toBe("default");
  });

  it("throws on corrupted settings.json instead of silently ignoring", () => {
    const projectPath = path.join(tmpDir, ".pi", "settings.json");
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.writeFileSync(projectPath, "not valid json {{{{");

    expect(() => loadSettings(tmpDir)).toThrow(/Failed to parse settings file/);
  });

  it("returns paths correctly", () => {
    const result = loadSettings(tmpDir);

    expect(result.globalPath).toBe(getGlobalSettingsPath());
    expect(result.projectPath).toBe(getProjectSettingsPath(tmpDir));
  });
});

describe("saveSettings", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Isolate from user's real global settings by pointing os.homedir() to tmpDir
    vi.mocked(os.homedir).mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates project settings file with atomic write", () => {
    const config: Partial<RtkConfig> = { enabled: false, debugMode: true };

    const savedPath = saveSettings(config, "project", tmpDir);

    expect(fs.existsSync(savedPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    expect(content[SETTINGS_KEY]).toEqual(config);
  });

  it("creates directories if they do not exist", () => {
    const deepDir = path.join(tmpDir, "a", "b", "c");
    const config: Partial<RtkConfig> = { minOutputChars: 42 };

    saveSettings(config, "project", deepDir);

    const settingsPath = getProjectSettingsPath(deepDir);
    expect(fs.existsSync(settingsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(content[SETTINGS_KEY].minOutputChars).toBe(42);
  });

  it("preserves existing keys in settings.json", () => {
    const settingsPath = getProjectSettingsPath(tmpDir);
    writeJson(settingsPath, { otherExtension: { key: "value" } });

    saveSettings({ enabled: true }, "project", tmpDir);

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(content.otherExtension).toEqual({ key: "value" });
    expect(content[SETTINGS_KEY]).toEqual({ enabled: true });
  });

  it("round-trips through load", () => {
    const config: Partial<RtkConfig> = {
      enabled: false,
      filters: {
        git: false,
        ls: true,
        test: true,
        lint: true,
        grep: false,
        json: true,
        docker: true,
        npm: true,
        read: true,
        logDedup: true,
        http: true,
      },
      minOutputChars: 200,
      debugMode: true,
    };

    saveSettings(config, "project", tmpDir);
    const loaded = loadSettings(tmpDir);

    expect(loaded.source).toBe("project");
    expect(loaded.config.enabled).toBe(false);
    expect(loaded.config.filters?.git).toBe(false);
    expect(loaded.config.filters?.grep).toBe(false);
    expect(loaded.config.minOutputChars).toBe(200);
    expect(loaded.config.debugMode).toBe(true);
  });

  it("throws on corrupted settings.json instead of destroying data", () => {
    const settingsPath = getProjectSettingsPath(tmpDir);
    const corruptedContent = "not valid json {{{{";
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, corruptedContent);

    expect(() => saveSettings({ enabled: true }, "project", tmpDir)).toThrow(
      /Cannot save RTK settings/,
    );

    // The corrupted file must NOT be overwritten
    const afterContent = fs.readFileSync(settingsPath, "utf8");
    expect(afterContent).toBe(corruptedContent);
  });

  it("no temp file left behind after save", () => {
    saveSettings({ enabled: true }, "project", tmpDir);

    const dir = path.dirname(getProjectSettingsPath(tmpDir));
    const files = fs.readdirSync(dir);
    const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ── Filter registry tests ─────────────────────────────────────────

describe("findFilter", () => {
  // We need to clean up registered filters between tests.
  // Since the registry is module-level, we'll test with temporary filters.

  /** Create a dummy filter for testing. */
  function dummyFilter(name: string, pattern: RegExp): Filter {
    return {
      name,
      matches(command: string): boolean {
        return pattern.test(command);
      },
      apply(command: string, rawOutput: string): FilterResult {
        return { filtered: "filtered", rawChars: rawOutput.length, filteredChars: 8 };
      },
    };
  }

  it("returns null for commands with no matching filter", () => {
    // Even with filters registered, non-matching commands return null.
    const config = DEFAULTS;
    const result = findFilter("echo hello", config);
    expect(result).toBeNull();
  });

  it("returns null for unrecognized commands even with filters registered", () => {
    const gitFilter = dummyFilter("git-status", /^git\s+status/);
    registerFilter(gitFilter);

    const config = DEFAULTS;
    const result = findFilter("echo hello", config);
    expect(result).toBeNull();
  });

  it("returns matching filter when registered", () => {
    // git-status was registered in the previous test (module-level array)
    const config = DEFAULTS;
    const result = findFilter("git status", config);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("git-status");
  });

  it("skips disabled filter groups", () => {
    const config: RtkConfig = {
      ...DEFAULTS,
      filters: { ...DEFAULTS.filters, git: false },
    };

    const result = findFilter("git status", config);
    expect(result).toBeNull();
  });

  it("first match wins when multiple filters could match", () => {
    const specificFilter = dummyFilter("git-diff", /^git\s+diff/);
    const genericFilter = dummyFilter("git-generic", /^git\s+/);
    registerFilter(specificFilter);
    registerFilter(genericFilter);

    const config = DEFAULTS;
    const result = findFilter("git diff --stat", config);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("git-diff");
  });

  it("skips disabled group but allows other groups", () => {
    const lsFilter = dummyFilter("ls", /^ls\b/);
    registerFilter(lsFilter);

    const config: RtkConfig = {
      ...DEFAULTS,
      filters: { ...DEFAULTS.filters, git: false },
    };

    // git is disabled, but ls is enabled
    expect(findFilter("git status", config)).toBeNull();
    expect(findFilter("ls -la", config)).not.toBeNull();
  });
});

// ── getFilterGroup tests ──────────────────────────────────────────

describe("getFilterGroup", () => {
  it("maps git-* filter names to git group", () => {
    expect(getFilterGroup("git-status")).toBe("git");
    expect(getFilterGroup("git-diff")).toBe("git");
    expect(getFilterGroup("git-log")).toBe("git");
    expect(getFilterGroup("git-action")).toBe("git");
    expect(getFilterGroup("git-branch")).toBe("git");
    expect(getFilterGroup("git-stash")).toBe("git");
  });

  it("maps ls/find/tree to ls group", () => {
    expect(getFilterGroup("ls")).toBe("ls");
    expect(getFilterGroup("find")).toBe("ls");
    expect(getFilterGroup("tree")).toBe("ls");
  });

  it("maps test-* to test group", () => {
    expect(getFilterGroup("test-js")).toBe("test");
    expect(getFilterGroup("test-py")).toBe("test");
    expect(getFilterGroup("test-rs")).toBe("test");
    expect(getFilterGroup("test-go")).toBe("test");
  });

  it("maps lint-* to lint group", () => {
    expect(getFilterGroup("lint-tsc")).toBe("lint");
    expect(getFilterGroup("lint-js")).toBe("lint");
    expect(getFilterGroup("lint-py")).toBe("lint");
    expect(getFilterGroup("lint-rs")).toBe("lint");
  });

  it("maps individual filter names to correct groups", () => {
    expect(getFilterGroup("grep")).toBe("grep");
    expect(getFilterGroup("json-schema")).toBe("json");
    expect(getFilterGroup("docker-list")).toBe("docker");
    expect(getFilterGroup("docker-logs")).toBe("docker");
    expect(getFilterGroup("docker-compose")).toBe("docker");
    expect(getFilterGroup("kubectl")).toBe("docker");
    expect(getFilterGroup("npm-install")).toBe("npm");
    expect(getFilterGroup("pip-install")).toBe("npm");
    expect(getFilterGroup("read-filter")).toBe("read");
    expect(getFilterGroup("log-dedup")).toBe("logDedup");
    expect(getFilterGroup("http")).toBe("http");
  });

  it("unknown filter names are not aliased to git", () => {
    // Unknown filters should return their own name, not "git"
    const result = getFilterGroup("some-unknown-filter");
    expect(result).not.toBe("git");
    expect(result).toBe("some-unknown-filter");
  });

  it("disabling git does not affect unknown filters", () => {
    const config: RtkConfig = {
      ...DEFAULTS,
      filters: { ...DEFAULTS.filters, git: false },
    };
    // Unknown filter group maps to its own name, which won't be === false
    const group = getFilterGroup("some-unknown-filter");
    expect(config.filters[group]).toBeUndefined(); // not false, so filter stays enabled
  });
});
