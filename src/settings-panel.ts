/**
 * RTK Settings Panel — interactive TUI overlay for /rtk settings.
 *
 * Implements Pi's Component interface: render(width) / handleInput(data) / invalidate()
 * Opened via ctx.ui.custom() with overlay: true.
 * Follows the pi-lcm settings panel pattern exactly.
 *
 * Rows:
 *   0     — Scope (global/project toggle)
 *   1-11  — Filter toggles (git, ls, test, lint, grep, json, docker, npm, read, logDedup, http)
 *   12    — Tee enabled (boolean)
 *   13    — Tee mode (failures/all toggle)
 *   14    — Tee maxFiles (number)
 *   15    — Tee maxFileSize (number)
 */

import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";
import type { RtkConfig, FilterGroupConfig, TeeConfig } from "./config.js";
import type { SettingsScope } from "./settings.js";

// ─── ANSI helpers ──────────────────────────────────────────────────

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;

// ─── Settings items ────────────────────────────────────────────────

type RowType = "scope" | "filter-bool" | "tee-bool" | "tee-mode" | "tee-number";

interface SettingRow {
  label: string;
  type: RowType;
  /** Config key path for the value. */
  key: string;
  description: string;
  min?: number;
  max?: number;
  step?: number;
}

const ROWS: SettingRow[] = [
  // Row 0: Scope
  { label: "Scope", type: "scope", key: "scope", description: "Settings storage scope" },
  // Rows 1-10: Filter toggles
  { label: "Git", type: "filter-bool", key: "git", description: "Git command filters" },
  { label: "Ls", type: "filter-bool", key: "ls", description: "ls/find/fd/tree filters" },
  { label: "Test", type: "filter-bool", key: "test", description: "Test runner filters" },
  { label: "Lint", type: "filter-bool", key: "lint", description: "Linter/typecheck filters" },
  { label: "Grep", type: "filter-bool", key: "grep", description: "grep/rg filters" },
  { label: "JSON", type: "filter-bool", key: "json", description: "JSON schema extraction" },
  { label: "Docker", type: "filter-bool", key: "docker", description: "Docker/kubectl filters" },
  { label: "Npm", type: "filter-bool", key: "npm", description: "Package install filters" },
  { label: "Read", type: "filter-bool", key: "read", description: "Comment stripping for read" },
  { label: "Log Dedup", type: "filter-bool", key: "logDedup", description: "Log line deduplication" },
  { label: "Http", type: "filter-bool", key: "http", description: "HTTP request/response filters" },
  // Rows 12-15: Tee config
  { label: "Tee", type: "tee-bool", key: "enabled", description: "Save raw output on errors" },
  { label: "Tee Mode", type: "tee-mode", key: "mode", description: "When to save: failures or all" },
  { label: "Max Files", type: "tee-number", key: "maxFiles", description: "Max tee files to keep", min: 1, max: 100, step: 1 },
  { label: "Max Size", type: "tee-number", key: "maxFileSize", description: "Max tee file size", min: 65536, max: 10485760, step: 65536 },
];

// ─── Panel deps ────────────────────────────────────────────────────

export interface RtkPanelDeps {
  config: RtkConfig;
  scope: SettingsScope;
  cwd: string;
  save: (config: RtkConfig, scope: SettingsScope, cwd: string) => void;
}

// ─── Panel class ───────────────────────────────────────────────────

export class RtkSettingsPanel {
  /** Wire this to done() in the ctx.ui.custom callback. */
  onClose?: () => void;

  private row = 0;
  private cw?: number;
  private cl?: string[];
  private deps: RtkPanelDeps;

  constructor(deps: RtkPanelDeps) {
    this.deps = deps;
  }

  // ─── Component interface (required by Pi) ───────────────────────

  render(width: number): string[] {
    if (this.cl && this.cw === width) return this.cl;

    const w = Math.max(20, Math.min(width, 64));
    const t = (s: string) => truncateToWidth(s, w);
    const lines: string[] = [];
    const { config, scope } = this.deps;
    const lw = 14; // label width

    // Header
    lines.push(t(`  ${bold("pi-rtk")} ${dim("settings")}`));
    lines.push(t(dim("  " + "\u2500".repeat(Math.min(w - 4, 40)))));
    lines.push("");

    for (let i = 0; i < ROWS.length; i++) {
      const s = ROWS[i]!;
      const sel = this.row === i;
      const pfx = sel ? cyan("  > ") : "    ";
      const label = s.label.padEnd(lw);

      let val: string;
      let hint = "";

      switch (s.type) {
        case "scope": {
          val = scope === "project" ? green("Project") : cyan("Global");
          hint = sel ? dim(" [enter]") : "";
          break;
        }
        case "filter-bool": {
          const enabled = config.filters[s.key as keyof FilterGroupConfig];
          val = enabled ? green("On") : red("Off");
          hint = sel ? dim(" [enter]") : "";
          break;
        }
        case "tee-bool": {
          const enabled = config.tee[s.key as keyof TeeConfig];
          val = enabled ? green("On") : red("Off");
          hint = sel ? dim(" [enter]") : "";
          break;
        }
        case "tee-mode": {
          val = config.tee.mode === "failures" ? cyan("Failures") : cyan("All");
          hint = sel ? dim(" [enter]") : "";
          break;
        }
        case "tee-number": {
          const n = config.tee[s.key as keyof TeeConfig] as number;
          val = s.key === "maxFileSize" ? cyan(formatSize(n)) : cyan(String(n));
          hint = sel ? dim(` [< > ${s.min}-${s.max}]`) : "";
          break;
        }
      }

      lines.push(t(`${pfx}${label}${val}${hint}`));

      // Show description for selected row
      if (sel) {
        lines.push(t(`      ${dim(s.description)}`));
      }

      // Separator between sections
      if (i === 0 || i === 11) {
        lines.push(t(dim("  " + "\u2500".repeat(Math.min(w - 4, 40)))));
      }
    }

    // Footer
    lines.push("");
    lines.push(t(dim("  enter toggle  < > adjust  esc close")));

    this.cl = lines;
    this.cw = width;
    return lines;
  }

  handleInput(data: string): void {
    const totalRows = ROWS.length;

    // Close
    if (matchesKey(data, Key.escape)) {
      this.onClose?.();
      return;
    }

    // Navigate up/down
    if (matchesKey(data, Key.up)) {
      this.row = this.row === 0 ? totalRows - 1 : this.row - 1;
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.row = this.row === totalRows - 1 ? 0 : this.row + 1;
      this.invalidate();
      return;
    }

    // Enter = toggle or increment
    if (matchesKey(data, Key.enter)) {
      this.handleEnter();
      this.invalidate();
      return;
    }

    // Left/Right = adjust numbers
    if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
      const s = ROWS[this.row];
      if (s?.type === "tee-number") {
        this.adjustNumber(s, matchesKey(data, Key.left) ? -1 : 1);
        this.invalidate();
      }
      return;
    }
  }

  invalidate(): void {
    this.cw = undefined;
    this.cl = undefined;
  }

  // ─── Actions ────────────────────────────────────────────────────

  private handleEnter(): void {
    const s = ROWS[this.row];
    if (!s) return;

    switch (s.type) {
      case "scope": {
        this.deps.scope = this.deps.scope === "project" ? "global" : "project";
        this.save();
        break;
      }
      case "filter-bool": {
        const key = s.key as keyof FilterGroupConfig;
        this.deps.config.filters[key] = !this.deps.config.filters[key];
        this.save();
        break;
      }
      case "tee-bool": {
        this.deps.config.tee.enabled = !this.deps.config.tee.enabled;
        this.save();
        break;
      }
      case "tee-mode": {
        this.deps.config.tee.mode = this.deps.config.tee.mode === "failures" ? "all" : "failures";
        this.save();
        break;
      }
      case "tee-number": {
        // Enter on number → increment by 1 step
        this.adjustNumber(s, 1);
        break;
      }
    }
  }

  private adjustNumber(s: SettingRow, dir: number): void {
    const key = s.key as keyof TeeConfig;
    const cur = this.deps.config.tee[key] as number;
    const step = s.step ?? 1;
    const min = s.min ?? 0;
    const max = s.max ?? Infinity;
    (this.deps.config.tee as any)[key] = Math.max(min, Math.min(max, cur + dir * step));
    this.save();
  }

  private save(): void {
    this.deps.save(this.deps.config, this.deps.scope, this.deps.cwd);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Format a byte count as a human-readable string.
 */
function formatSize(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)}M`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}K`;
  }
  return `${bytes}B`;
}
