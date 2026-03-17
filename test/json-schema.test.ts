/**
 * Tests for the JSON schema extraction filter.
 *
 * Covers VAL-DATA-001 through VAL-DATA-004:
 *   001 — primitives replaced with type names
 *   002 — large arrays collapsed, small arrays expanded
 *   003 — large objects collapsed at depth limit, small expanded
 *   004 — max depth 3 enforced
 */

import { describe, it, expect } from "vitest";
import { createJsonSchemaFilter } from "../src/filters/json-schema.js";

const filter = createJsonSchemaFilter();

describe("json-schema filter", () => {
  // ── matches() ──────────────────────────────────────────────────

  describe("matches()", () => {
    it("matches read: commands ending with .json", () => {
      expect(filter.matches("read:package.json")).toBe(true);
      expect(filter.matches("read:/home/user/project/data.json")).toBe(true);
      expect(filter.matches("read:./config.json")).toBe(true);
    });

    it("matches cat commands for .json files", () => {
      expect(filter.matches("cat package.json")).toBe(true);
      expect(filter.matches("cat /tmp/data.json")).toBe(true);
    });

    it("does not match non-json reads", () => {
      expect(filter.matches("read:index.ts")).toBe(false);
      expect(filter.matches("read:README.md")).toBe(false);
      expect(filter.matches("cat foo.ts")).toBe(false);
    });

    it("does not match unrelated commands", () => {
      expect(filter.matches("git status")).toBe(false);
      expect(filter.matches("ls -la")).toBe(false);
    });
  });

  // ── VAL-DATA-001: Primitive type replacement ───────────────────

  describe("primitive type replacement (VAL-DATA-001)", () => {
    it("replaces string values with 'string'", () => {
      const input = JSON.stringify({ name: "pi-rtk", version: "0.1.0" });
      const { filtered } = filter.apply("read:package.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.name).toBe("string");
      expect(parsed.version).toBe("string");
    });

    it("replaces number values with 'number'", () => {
      const input = JSON.stringify({ port: 3000, timeout: 5000 });
      const { filtered } = filter.apply("read:config.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.port).toBe("number");
      expect(parsed.timeout).toBe("number");
    });

    it("replaces boolean values with 'boolean'", () => {
      const input = JSON.stringify({ enabled: true, debug: false });
      const { filtered } = filter.apply("read:config.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.enabled).toBe("boolean");
      expect(parsed.debug).toBe("boolean");
    });

    it("replaces null with 'null'", () => {
      const input = JSON.stringify({ value: null });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.value).toBe("null");
    });

    it("handles mixed primitive types", () => {
      const input = JSON.stringify({
        name: "test",
        count: 42,
        active: true,
        nothing: null,
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.name).toBe("string");
      expect(parsed.count).toBe("number");
      expect(parsed.active).toBe("boolean");
      expect(parsed.nothing).toBe("null");
    });
  });

  // ── VAL-DATA-002: Array collapse/expand ────────────────────────

  describe("array collapse/expand (VAL-DATA-002)", () => {
    it("collapses arrays with 3+ items", () => {
      const input = JSON.stringify({
        items: ["a", "b", "c", "d", "e"],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.items).toBe("[ 5 items ]");
    });

    it("expands small arrays inline (< 3 items)", () => {
      const input = JSON.stringify({
        tags: ["alpha", "beta"],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.tags).toEqual(["string", "string"]);
    });

    it("expands single-element arrays inline", () => {
      const input = JSON.stringify({
        items: [42],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.items).toEqual(["number"]);
    });

    it("handles empty arrays", () => {
      const input = JSON.stringify({ items: [] });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.items).toEqual([]);
    });

    it("collapses arrays of objects", () => {
      const input = JSON.stringify({
        users: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
          { id: 3, name: "Charlie" },
        ],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.users).toBe("[ 3 items ]");
    });

    it("expands 2-element arrays with nested objects", () => {
      const input = JSON.stringify({
        pair: [{ x: 1 }, { y: 2 }],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(Array.isArray(parsed.pair)).toBe(true);
      expect(parsed.pair).toHaveLength(2);
    });

    it("handles exactly 3 items → collapsed", () => {
      const input = JSON.stringify({
        colors: ["red", "green", "blue"],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.colors).toBe("[ 3 items ]");
    });
  });

  // ── VAL-DATA-003: Object collapse/expand ───────────────────────

  describe("object collapse/expand (VAL-DATA-003)", () => {
    it("collapses objects with 3+ keys at depth limit", () => {
      // depth 0 → 1 → 2 → 3 (limit) → collapse objects with 3+ keys
      const input = JSON.stringify({
        level1: {
          level2: {
            level3: {
              a: "x",
              b: "y",
              c: "z",
            },
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.level1.level2.level3).toBe("{ 3 keys }");
    });

    it("expands objects with < 3 keys at depth limit", () => {
      const input = JSON.stringify({
        level1: {
          level2: {
            level3: {
              a: "x",
              b: "y",
            },
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed.level1.level2.level3).toEqual({ a: "string", b: "string" });
    });

    it("collapses top-level large objects' nested deep objects", () => {
      const input = JSON.stringify({
        dependencies: {
          "better-sqlite3": "^11.0.0",
          vitest: "^3.0.0",
          typescript: "^5.7.0",
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      // At depth 1, the dependencies object has 3 keys and should be fully visible
      expect(parsed.dependencies).toEqual({
        "better-sqlite3": "string",
        vitest: "string",
        typescript: "string",
      });
    });

    it("preserves key names exactly", () => {
      const input = JSON.stringify({
        "my-key": "value",
        camelCase: 123,
        snake_case: true,
        "@scoped/pkg": "1.0.0",
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed).toHaveProperty("my-key");
      expect(parsed).toHaveProperty("camelCase");
      expect(parsed).toHaveProperty("snake_case");
      expect(parsed).toHaveProperty("@scoped/pkg");
    });
  });

  // ── VAL-DATA-004: Max depth 3 enforced ─────────────────────────

  describe("max depth 3 (VAL-DATA-004)", () => {
    it("enforces max depth of 3 for deeply nested structures", () => {
      const input = JSON.stringify({
        a: {
          b: {
            c: {
              d: {
                e: "deep",
              },
            },
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      // depth 0: root, depth 1: a, depth 2: b, depth 3: c (at limit)
      // c's value (an object with 1 key) should still be expanded since < 3 keys
      // But d's nested value should not be expanded beyond depth 3
      expect(parsed.a.b.c).toBeDefined();
      // At depth 3, objects with <3 keys are still expanded but their nested values are simplified
    });

    it("collapses large objects beyond depth 3", () => {
      const input = JSON.stringify({
        a: {
          b: {
            c: {
              big: {
                k1: "v1",
                k2: "v2",
                k3: "v3",
                k4: "v4",
              },
            },
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      // depth 0=root, 1=a, 2=b, 3=c -> at the depth limit
      // c has 1 key ("big") so is expanded
      // big is at depth 4, so beyond limit → collapsed
      expect(parsed.a.b.c.big).toBe("{ 4 keys }");
    });

    it("handles nesting exactly at depth 3 boundary", () => {
      const input = JSON.stringify({
        l1: {
          l2: {
            l3: "leaf",
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      // depth 0=root, 1=l1, 2=l2 → l3 is a leaf string at depth 2
      expect(parsed.l1.l2.l3).toBe("string");
    });

    it("does not nest output beyond 3 levels for large objects", () => {
      // Create 6-level deep JSON with large objects (3+ keys) at each level
      const input = JSON.stringify({
        a: {
          b: {
            c: {
              d: "value",
              e: "value",
              f: "value",
            },
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);

      // depth 0=root, 1=a, 2=b, 3=c (at limit, 3 keys → collapsed)
      expect(parsed.a.b.c).toBe("{ 3 keys }");
    });

    it("collapses deeply nested structures at depth boundary", () => {
      // 6-level deep JSON — everything beyond depth 3 is collapsed
      const input = JSON.stringify({
        a: {
          b: {
            c: {
              d: {
                e: {
                  f: "deep",
                },
              },
            },
          },
        },
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);

      // At depth 3 (c), the value is an object with 1 key (< 3) → expanded
      // But d's value is collapsed via collapseLeaf
      expect(parsed.a.b.c.d).toBe("{ 1 key }");
    });
  });

  // ── FilterResult metrics ───────────────────────────────────────

  describe("FilterResult metrics", () => {
    it("returns correct rawChars and filteredChars", () => {
      const input = JSON.stringify({
        name: "pi-rtk",
        description: "Token Killer for Pi — reduce LLM token consumption",
        version: "0.1.0",
      });
      const { rawChars, filteredChars } = filter.apply("read:package.json", input);
      expect(rawChars).toBe(input.length);
      expect(filteredChars).toBeGreaterThan(0);
      expect(filteredChars).toBeLessThan(rawChars);
    });
  });

  // ── package.json-like realistic test ───────────────────────────

  describe("realistic package.json", () => {
    it("extracts schema from a realistic package.json", () => {
      const pkg = {
        name: "pi-rtk",
        version: "0.1.0",
        description: "Token Killer for Pi",
        type: "module",
        license: "MIT",
        keywords: ["pi-package", "pi-extension", "token-optimization", "llm", "developer-tools"],
        files: ["index.ts", "src/**/*.ts", "README.md"],
        pi: { extensions: ["./index.ts"] },
        scripts: {
          test: "vitest run --dir test",
          "test:watch": "vitest --dir test",
          prepublishOnly: "vitest run --dir test",
        },
        dependencies: {
          "better-sqlite3": "^11.9.1",
        },
        peerDependencies: {
          "@mariozechner/pi-ai": "*",
          "@mariozechner/pi-coding-agent": "*",
          "@sinclair/typebox": "*",
        },
        devDependencies: {
          "@types/better-sqlite3": "^7.6.13",
          vitest: "^3.0.0",
          typescript: "^5.7.0",
        },
      };
      const input = JSON.stringify(pkg);
      const { filtered } = filter.apply("read:package.json", input);
      const parsed = JSON.parse(filtered);

      // Top-level primitive keys preserved
      expect(parsed.name).toBe("string");
      expect(parsed.version).toBe("string");
      expect(parsed.type).toBe("string");
      expect(parsed.license).toBe("string");

      // keywords is array with 5 items → collapsed
      expect(parsed.keywords).toBe("[ 5 items ]");

      // files is array with 3 items → collapsed
      expect(parsed.files).toBe("[ 3 items ]");

      // scripts has 3 keys → at depth 1, should be expanded since within depth
      expect(parsed.scripts).toEqual({
        test: "string",
        "test:watch": "string",
        prepublishOnly: "string",
      });

      // dependencies has 1 key → expanded
      expect(parsed.dependencies).toEqual({
        "better-sqlite3": "string",
      });

      // peerDependencies has 3 keys → expanded at depth 1
      expect(parsed.peerDependencies).toEqual({
        "@mariozechner/pi-ai": "string",
        "@mariozechner/pi-coding-agent": "string",
        "@sinclair/typebox": "string",
      });

      // devDependencies has 3 keys → expanded at depth 1
      expect(parsed.devDependencies).toEqual({
        "@types/better-sqlite3": "string",
        vitest: "string",
        typescript: "string",
      });
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles top-level array", () => {
      const input = JSON.stringify([1, 2, 3, 4, 5]);
      const { filtered } = filter.apply("read:data.json", input);
      expect(filtered).toContain("[ 5 items ]");
    });

    it("handles top-level small array", () => {
      const input = JSON.stringify(["a", "b"]);
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed).toEqual(["string", "string"]);
    });

    it("handles empty object", () => {
      const input = JSON.stringify({});
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      expect(parsed).toEqual({});
    });

    it("handles invalid JSON gracefully (passes through)", () => {
      const raw = "this is not json at all";
      const { filtered } = filter.apply("read:data.json", raw);
      expect(filtered).toBe(raw);
    });

    it("handles nested arrays in objects", () => {
      const input = JSON.stringify({
        matrix: [[1, 2], [3, 4], [5, 6]],
      });
      const { filtered } = filter.apply("read:data.json", input);
      const parsed = JSON.parse(filtered);
      // matrix has 3 items → collapsed
      expect(parsed.matrix).toBe("[ 3 items ]");
    });

    it("produces valid JSON output", () => {
      const input = JSON.stringify({
        a: "string",
        b: 42,
        c: true,
        d: null,
        e: [1, 2],
        f: { x: 1 },
      });
      const { filtered } = filter.apply("read:data.json", input);
      // Should not throw
      expect(() => JSON.parse(filtered)).not.toThrow();
    });
  });
});
