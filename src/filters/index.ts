/**
 * Filter registry — dispatches commands to the appropriate filter module.
 * Initially empty; filters are registered by later features.
 */

import type { RtkConfig } from "../config.js";
import { getFilterGroup } from "../config.js";
import { createGitStatusFilter } from "./git-status.js";

/** Result returned by every filter's apply(). */
export interface FilterResult {
  /** The compressed output text. */
  filtered: string;
  /** Original character count. */
  rawChars: number;
  /** Compressed character count. */
  filteredChars: number;
}

/** Every filter module must implement this interface. */
export interface Filter {
  /** Unique filter name for tracking/config (e.g., "git-status"). */
  name: string;
  /** Test if this filter handles the given command. */
  matches(command: string): boolean;
  /** Apply the filter to the command's raw output. */
  apply(command: string, rawOutput: string): FilterResult;
}

/**
 * All registered filters. Order matters — first match wins.
 * Git filters are registered first as they provide the highest value.
 */
const ALL_FILTERS: Filter[] = [
  createGitStatusFilter(),
];

/** Register a filter (used by filter modules during setup). */
export function registerFilter(filter: Filter): void {
  ALL_FILTERS.push(filter);
}

/** Get a read-only snapshot of registered filters. */
export function getFilters(): readonly Filter[] {
  return ALL_FILTERS;
}

/**
 * Find the first matching filter for a command, respecting config enable/disable.
 * Returns null when no filters match or all matching filters are disabled.
 */
export function findFilter(command: string, config: RtkConfig): Filter | null {
  for (const f of ALL_FILTERS) {
    // Skip disabled filter groups
    const group = getFilterGroup(f.name);
    if (config.filters[group] === false) continue;
    if (f.matches(command)) return f;
  }
  return null;
}
