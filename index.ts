/**
 * pi-rtk: Token Killer for Pi — main extension entry point.
 *
 * Wires together: command matching, filter registry, SQLite tracking,
 * tee recovery, and status footer. Follows the pi-lcm closure-based
 * state pattern exactly.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolveConfig } from "./src/config.js";
import { openDb, closeDb, checkpointDb } from "./src/db/connection.js";
import { runMigrations } from "./src/db/schema.js";
import { Tracker } from "./src/tracker.js";
import { getFilters } from "./src/filters/index.js";
import {
  createToolCallHandler,
  createToolResultHandler,
  updateStatusFooter,
  type PipelineState,
} from "./src/pipeline.js";

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

  // 3. session_start: init DB, tracker
  pi.on("session_start", async (_event: any, ctx: any) => {
    try {
      initializeSession(ctx);
    } catch (e: any) {
      console.error("[RTK] Failed to initialize:", e.message);
      ctx.ui.notify(`RTK init failed: ${e.message}`, "warning");
      resetState();
    }
  });

  // 4. session_switch: reset + reinit (Fix 6 from pi-lcm lessons)
  pi.on("session_switch", async (_event: any, ctx: any) => {
    resetState();
    try {
      initializeSession(ctx);
    } catch (e: any) {
      console.error("[RTK] Re-init failed on session switch:", e.message);
      resetState();
    }
  });

  // 5. session_fork: reset + reinit
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
}
