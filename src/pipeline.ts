/**
 * Core pipeline logic for tool_call and tool_result handlers.
 *
 * Extracted from index.ts so it can be tested independently with mocked events.
 * The entry point (index.ts) wires these handlers onto pi.on().
 */

import type { Filter, FilterResult } from "./filters/index.js";
import type { RtkConfig } from "./config.js";
import type { Tracker } from "./tracker.js";
import { extractText, stripAnsi, isBinary, shouldFilter, extractBaseCommand, estimateTokens } from "./utils.js";
import { getFilterGroup } from "./config.js";
import { saveTee, getTeeHint } from "./tee.js";

/** Shared mutable state for the extension lifetime. */
export interface PipelineState {
  /** Map from toolCallId → tracked command info. */
  commandMap: Map<string, { command: string; toolName: string }>;
  /** SQLite tracker instance (may be null before session_start). */
  tracker: Tracker | null;
  /** Resolved configuration. */
  config: RtkConfig;
  /** Cumulative session savings in tokens. */
  sessionSavings: number;
  /** Whether debug mode is active. */
  debugMode: boolean;
}

/** Minimal tool_call event shape for handler. */
export interface ToolCallInput {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

/** Minimal tool_result event shape for handler. */
export interface ToolResultInput {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: Array<{ type: string; text?: string }>;
  isError: boolean;
}

/** Minimal ctx shape for handler. */
export interface PipelineCtx {
  ui: {
    setStatus(key: string, text: string | undefined): void;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
  cwd?: string;
  sessionManager?: {
    getSessionId(): string | null;
  };
}

/** Return type for tool_result handler (matches ToolResultEventResult). */
export interface ToolResultReturn {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Create the tool_call handler function.
 * Stores command info by toolCallId for later retrieval in tool_result.
 */
export function createToolCallHandler(
  state: PipelineState,
): (event: ToolCallInput) => void {
  return (event: ToolCallInput) => {
    if (event.toolName === "bash") {
      const command = (event.input as { command?: string }).command;
      if (typeof command === "string") {
        state.commandMap.set(event.toolCallId, {
          command,
          toolName: "bash",
        });
      }
    } else if (event.toolName === "read") {
      const path = (event.input as { path?: string }).path;
      if (typeof path === "string") {
        state.commandMap.set(event.toolCallId, {
          command: `read:${path}`,
          toolName: "read",
        });
      }
    }
  };
}

/**
 * Create the tool_result handler function.
 *
 * Pipeline:
 * 1. Extract text from content blocks
 * 2. Retrieve tracked command by toolCallId
 * 3. Check shouldFilter (pipes, chaining, redirects)
 * 4. Check minOutputChars threshold
 * 5. Check for binary output
 * 6. Strip ANSI codes
 * 7. Extract base command (strip env var prefixes)
 * 8. Find matching filter (respecting config enable/disable)
 * 9. Apply filter (catch errors → passthrough)
 * 10. Track savings in SQLite
 * 11. If error + tee enabled: save raw, append hint
 * 12. Update status footer
 * 13. Return modified content or undefined (passthrough)
 */
export function createToolResultHandler(
  state: PipelineState,
  filters: Filter[],
): (event: ToolResultInput, ctx: PipelineCtx) => ToolResultReturn | undefined {
  return (event: ToolResultInput, ctx: PipelineCtx): ToolResultReturn | undefined => {
    // 1. Extract text content
    const rawText = extractText(event.content);
    if (!rawText) return undefined;

    // 2. Retrieve tracked command
    const tracked = state.commandMap.get(event.toolCallId);
    state.commandMap.delete(event.toolCallId);
    if (!tracked) return undefined;

    const command = tracked.command;

    // 3. Check shouldFilter (skip pipes, chaining, etc.)
    if (!shouldFilter(command)) return undefined;

    // 3b. Check excludeCommands (skip filtering if command matches an exclude pattern)
    if (isExcludedCommand(command, state.config.excludeCommands)) return undefined;

    // 4. Check minOutputChars threshold
    if (rawText.length < state.config.minOutputChars) return undefined;

    // 5. Check for binary output
    if (isBinary(rawText)) return undefined;

    // 6. Strip ANSI codes
    const cleanText = stripAnsi(rawText);

    // 7. Extract base command (strip env var prefixes)
    const baseCommand = extractBaseCommand(command);

    // 8. Find matching filter (respecting config)
    const filter = findMatchingFilter(baseCommand, filters, state.config);
    if (!filter) {
      // Track as unfiltered for /rtk discover
      if (state.tracker) {
        try {
          state.tracker.recordUnfiltered(baseCommand, cleanText.length);
        } catch {
          // Non-fatal
        }
      }
      return undefined;
    }

    // 9. Apply filter (catch errors → passthrough)
    let result: FilterResult;
    try {
      result = filter.apply(baseCommand, cleanText);
    } catch (e: any) {
      if (state.debugMode) {
        ctx.ui.notify(`RTK filter error: ${e.message}`, "warning");
      }
      return undefined; // Passthrough on crash
    }

    // 10. Track savings in SQLite
    if (state.tracker) {
      try {
        state.tracker.record(baseCommand, result.rawChars, result.filteredChars, {
          filterName: filter.name,
          sessionId: ctx.sessionManager?.getSessionId() ?? undefined,
          cwd: ctx.cwd,
        });
      } catch {
        // Non-fatal: don't crash on tracking errors
      }
    }

    // Update cumulative session savings
    const rawTokens = estimateTokens(cleanText);
    const filteredTokens = estimateTokens(result.filtered);
    state.sessionSavings += rawTokens - filteredTokens;

    // 11. If error + tee enabled: save raw, append hint
    let finalText = result.filtered;
    if (event.isError && state.config.tee.enabled) {
      try {
        const teePath = saveTee(baseCommand, rawText, state.config.tee);
        finalText += "\n" + getTeeHint(teePath);
      } catch {
        // Non-fatal: tee write failure shouldn't break filtering
      }
    }

    // 12. Update status footer
    updateStatusFooter(state, ctx);

    // 13. Return modified content
    return {
      content: [{ type: "text", text: finalText }],
    };
  };
}

/**
 * Check if a command matches any of the excludeCommands patterns.
 * Patterns are matched as substrings against the full command string.
 */
function isExcludedCommand(command: string, excludePatterns: string[]): boolean {
  if (excludePatterns.length === 0) return false;
  return excludePatterns.some((pattern) => command.includes(pattern));
}

/**
 * Find a matching filter from the provided list, respecting config enable/disable.
 */
function findMatchingFilter(
  command: string,
  filters: Filter[],
  config: RtkConfig,
): Filter | null {
  for (const f of filters) {
    const group = getFilterGroup(f.name);
    if (config.filters[group] === false) continue;
    if (f.matches(command)) return f;
  }
  return null;
}

/**
 * Format and set the status footer.
 * Must be under 20 chars to avoid terminal overflow.
 */
export function updateStatusFooter(state: PipelineState, ctx: PipelineCtx): void {
  const saved = state.sessionSavings;
  let text: string;

  if (saved >= 1000000) {
    text = `rtk ~${(saved / 1000000).toFixed(1)}Mt`;
  } else if (saved >= 1000) {
    text = `rtk ~${(saved / 1000).toFixed(0)}Kt`;
  } else {
    text = `rtk ~${saved}t`;
  }

  // Safety: ensure under 20 chars
  if (text.length > 20) {
    text = text.slice(0, 20);
  }

  ctx.ui.setStatus("rtk", text);
}
