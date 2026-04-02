/**
 * pi-rtk: Token Killer for Pi — main extension entry point.
 *
 * Wires together: command matching, filter registry, SQLite tracking,
 * tee recovery, and status footer. Follows the pi-lcm closure-based
 * state pattern exactly.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveConfig } from "./src/config.js";
import { openDb, closeDb, checkpointDb, getDb } from "./src/db/connection.js";
import { runMigrations } from "./src/db/schema.js";
import { Tracker } from "./src/tracker.js";
import { getFilters } from "./src/filters/index.js";
import {
  createToolCallHandler,
  createToolResultHandler,
  updateStatusFooter,
  type PipelineState,
} from "./src/pipeline.js";
import { formatGainOutput } from "./src/gain.js";
import { formatDiscoverOutput } from "./src/discover.js";
import { RtkSettingsPanel } from "./src/settings-panel.js";
import { loadSettings, saveSettings, type SettingsScope } from "./src/settings.js";
import type { SavingsPeriod } from "./src/tracker.js";

export default function (pi: ExtensionAPI) {
  let config = resolveConfig();
  if (!config.enabled) return;

  // ── Closure-based state ─────────────────────────────────────────

  const state: PipelineState = {
    commandMap: new Map(),
    tracker: null,
    config,
    sessionSavings: 0,
    debugMode: config.debugMode,
  };

  // ── Shared initialization logic ─────────────────────────────────

  function initializeSession(ctx: any): void {
    // Reload config (may have changed via settings)
    config = resolveConfig(ctx.cwd);
    state.config = config;
    state.debugMode = config.debugMode;

    const db = openDb();
    runMigrations(db);

    state.tracker = new Tracker(db);
    state.commandMap.clear();
    state.sessionSavings = 0;

    updateStatusFooter(state, ctx);

    if (config.debugMode) {
      ctx.ui.notify("RTK: Initialized", "info");
    }
  }

  function resetState(): void {
    state.commandMap.clear();
    state.sessionSavings = 0;
    state.tracker = null;
    closeDb();
  }

  // ── Create handlers ─────────────────────────────────────────────

  const toolCallHandler = createToolCallHandler(state);

  // ── Register event handlers ─────────────────────────────────────

  // 1. tool_call: stores command in Map by toolCallId
  pi.on("tool_call", async (event: any, _ctx: any) => {
    toolCallHandler(event);
  });

  // 2. tool_result: extract text → match filter → apply → track → status
  pi.on("tool_result", async (event, ctx) => {
    // Get current filters from registry
    const filters = getFilters() as any[];
    const handler = createToolResultHandler(state, filters);
    return handler(event as any, ctx as any) as any;
  });

  // 3. session_start: init DB, tracker (enhanced with reason-based routing)
  pi.on("session_start", async (event: any, ctx: any) => {
    try {
      // New Pi API: event.reason tells us why this session started
      if (typeof event.reason === "string" && event.reason !== "startup") {
        resetState();
      }
      initializeSession(ctx);
    } catch (e: any) {
      console.error("[RTK] Failed to initialize:", e.message);
      ctx.ui.notify(`RTK init failed: ${e.message}`, "warning");
      resetState();
    }
  });

  // 4. session_switch: Legacy handler — only fires on old Pi (removed in new Pi)
  pi.on("session_switch", async (_event: any, ctx: any) => {
    resetState();
    try {
      initializeSession(ctx);
    } catch (e: any) {
      console.error("[RTK] Re-init failed on session switch:", e.message);
      resetState();
    }
  });

  // 5. session_fork: Legacy handler — only fires on old Pi (removed in new Pi)
  pi.on("session_fork", async (_event: any, ctx: any) => {
    resetState();
    try {
      initializeSession(ctx);
    } catch (e: any) {
      console.error("[RTK] Re-init failed on session fork:", e.message);
      resetState();
    }
  });

  // 6. session_shutdown: flush + close
  pi.on("session_shutdown", async (_event: any, _ctx: any) => {
    try {
      checkpointDb();
    } catch {
      // Non-fatal
    }
    resetState();
  });

  // ── Register /rtk command with subcommand routing ───────────────

  pi.registerCommand("rtk", {
    description: "RTK Token Killer: gain, discover, settings",
    handler: async (args: string | undefined, ctx: any) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const sub = parts[0] || "gain";

      if (sub === "gain") {
        const db = getDb();
        if (!db) {
          ctx.ui.notify("RTK: Database not initialized. Start a session first.", "warning");
          return;
        }

        // Parse optional period argument: /rtk gain 7d
        const validPeriods = new Set<SavingsPeriod>(["24h", "7d", "30d", "all"]);
        const periodArg = parts[1] as SavingsPeriod | undefined;
        const period: SavingsPeriod = periodArg && validPeriods.has(periodArg) ? periodArg : "all";

        const output = formatGainOutput(db, {
          period,
          sessionSavings: state.sessionSavings,
        });

        ctx.ui.notify(output, "info");
        return;
      }

      if (sub === "discover") {
        const db = getDb();
        if (!db) {
          ctx.ui.notify("RTK: Database not initialized. Start a session first.", "warning");
          return;
        }

        const output = formatDiscoverOutput(db);
        ctx.ui.notify(output, "info");
        return;
      }

      if (sub === "settings") {
        const loaded = loadSettings(ctx.cwd);
        const currentScope: SettingsScope = loaded.source === "project" ? "project" : "global";

        ctx.ui.custom((tui: any, theme: any, kb: any, done: () => void) => {
          const panel = new RtkSettingsPanel({
            config: { ...config },
            scope: currentScope,
            cwd: ctx.cwd,
            save: (cfg, scope, cwd) => {
              saveSettings(cfg, scope, cwd);
              // Update the live config
              Object.assign(config, cfg);
              state.config = config;
            },
          });
          panel.onClose = () => done();
          return panel;
        }, { overlay: true });
        return;
      }

      ctx.ui.notify(`RTK: Unknown subcommand "${sub}". Available: gain, discover, settings`, "warning");
    },
  });
}
