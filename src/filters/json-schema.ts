/**
 * JSON schema extraction filter — replaces values with type names,
 * collapses large arrays/objects, enforces max depth 3.
 *
 * Output format (for a package.json):
 * {
 *   "name": "string",
 *   "version": "string",
 *   "dependencies": "{ 14 keys }",
 *   "scripts": "{ 4 keys }",
 *   "nested": {
 *     "key": "string",
 *     "arr": "[ 3 items ]"
 *   }
 * }
 *
 * Rules:
 *  - String values → "string"
 *  - Number values → "number"
 *  - Boolean values → "boolean"
 *  - null → "null"
 *  - Arrays ≥3 items → "[ N items ]"
 *  - Arrays <3 items → expanded inline with type-replaced elements
 *  - Objects ≥3 keys at depth limit → "{ N keys }"
 *  - Objects <3 keys at depth limit → expanded with type-replaced values
 *  - Beyond max depth: all objects → "{ N keys }", all arrays ≥3 → "[ N items ]"
 *  - Max depth of 3 levels
 *  - Key names preserved exactly
 */

import type { Filter, FilterResult } from "./index.js";

const MAX_DEPTH = 3;
const ARRAY_COLLAPSE_THRESHOLD = 3;
const OBJECT_COLLAPSE_THRESHOLD = 3;

/**
 * Collapse a value to a leaf representation — no further nesting allowed.
 * Used when we've exceeded max depth.
 */
function collapseLeaf(value: unknown): unknown {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return `[ ${value.length} items ]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return {};
    return `{ ${keys.length} keys }`;
  }
  return "unknown";
}

/**
 * Recursively extract schema from a JSON value.
 *
 * @param value  The parsed JSON value.
 * @param depth  Current nesting depth (0 = root object's children).
 * @returns A simplified representation suitable for JSON.stringify.
 */
function extractSchema(value: unknown, depth: number): unknown {
  // Primitives → type name strings
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    // Collapse large arrays regardless of depth
    if (value.length >= ARRAY_COLLAPSE_THRESHOLD) {
      return `[ ${value.length} items ]`;
    }
    // At or beyond depth limit: small arrays still expand but with leaf values
    if (depth >= MAX_DEPTH) {
      return value.map((item) => collapseLeaf(item));
    }
    // Small arrays: expand inline, recurse with depth + 1
    return value.map((item) => extractSchema(item, depth + 1));
  }

  // Objects
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);

    // Beyond max depth: collapse all objects
    if (depth >= MAX_DEPTH) {
      if (keys.length === 0) return {};
      if (keys.length >= OBJECT_COLLAPSE_THRESHOLD) {
        return `{ ${keys.length} keys }`;
      }
      // Small objects at depth limit: expand but only with leaf values
      // (no further nesting allowed)
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = collapseLeaf((value as Record<string, unknown>)[key]);
      }
      return result;
    }

    // Within depth limit: always expand, recurse children
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = extractSchema((value as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }

  // Fallback for undefined or other types
  return "unknown";
}

export function createJsonSchemaFilter(): Filter {
  return {
    name: "json-schema",

    matches(command: string): boolean {
      // Match read tool output for .json files, or cat/bat of .json files
      return /^read:.*\.json$/i.test(command) || /^(cat|bat)\s+.*\.json\b/i.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;

      // Try to parse as JSON; on failure, pass through unchanged
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { filtered: raw, rawChars, filteredChars: raw.length };
      }

      // Extract schema starting at depth 0
      const schema = extractSchema(parsed, 0);

      // For top-level arrays that get collapsed to a string
      const filtered = typeof schema === "string"
        ? JSON.stringify(schema)
        : JSON.stringify(schema, null, 2);

      return { filtered, rawChars, filteredChars: filtered.length };
    },
  };
}
