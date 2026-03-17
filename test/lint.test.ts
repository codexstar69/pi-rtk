/**
 * Tests for lint filters: lint-tsc, lint-js, lint-py, lint-rs.
 *
 * Each filter groups errors by code/rule/lint name, caps at 5 instances per
 * group with overflow indicator, strips suggestions, and includes total summary.
 */

import { describe, it, expect } from "vitest";
import { createLintTscFilter } from "../src/filters/lint-tsc.js";
import { createLintJsFilter } from "../src/filters/lint-js.js";
import { createLintPyFilter } from "../src/filters/lint-py.js";
import { createLintRsFilter } from "../src/filters/lint-rs.js";

// ── lint-tsc ──────────────────────────────────────────────────────

describe("lint-tsc", () => {
  const filter = createLintTscFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("lint-tsc");
  });

  it("matches tsc commands", () => {
    expect(filter.matches("tsc --noEmit")).toBe(true);
    expect(filter.matches("tsc")).toBe(true);
    expect(filter.matches("bunx tsc --noEmit")).toBe(true);
    expect(filter.matches("npx tsc")).toBe(true);
  });

  it("does not match non-tsc commands", () => {
    expect(filter.matches("eslint .")).toBe(false);
    expect(filter.matches("node tsc.js")).toBe(false);
  });

  it("groups errors by TS code", () => {
    const raw = [
      "src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/index.ts(20,10): error TS2322: Type 'boolean' is not assignable to type 'number'.",
      "src/utils.ts(5,1): error TS2304: Cannot find name 'foo'.",
      "src/utils.ts(15,3): error TS2322: Type 'any' is not assignable to type 'string'.",
    ].join("\n");

    const result = filter.apply("tsc --noEmit", raw);

    // Should group TS2322 (3 errors) and TS2304 (1 error)
    expect(result.filtered).toContain("TS2322 (3 errors):");
    expect(result.filtered).toContain("TS2304 (1 error):");
    expect(result.filtered).toContain("✗ 4 errors (2 codes)");
  });

  it("caps at 5 instances per code with overflow indicator", () => {
    // Generate 8 TS2322 errors
    const lines: string[] = [];
    for (let i = 1; i <= 8; i++) {
      lines.push(`src/file${i}.ts(${i},1): error TS2322: Type 'string' is not assignable to type 'number'.`);
    }
    const raw = lines.join("\n");

    const result = filter.apply("tsc", raw);

    expect(result.filtered).toContain("TS2322 (8 errors):");
    // Should show 5 instances
    expect(result.filtered).toContain("src/file1.ts:1");
    expect(result.filtered).toContain("src/file5.ts:5");
    // Should NOT show 6th+
    expect(result.filtered).not.toContain("src/file6.ts:6");
    // Should show overflow
    expect(result.filtered).toContain("... and 3 more");
    expect(result.filtered).toContain("✗ 8 errors (1 code)");
  });

  it("strips 'Did you mean' suggestions", () => {
    const raw = [
      "src/index.ts(10,5): error TS2551: Property 'nmae' does not exist on type 'User'.",
      "  Did you mean 'name'?",
      "src/index.ts(20,5): error TS2551: Property 'emial' does not exist on type 'User'.",
      "  Did you mean 'email'?",
    ].join("\n");

    const result = filter.apply("tsc", raw);

    expect(result.filtered).not.toContain("Did you mean");
    expect(result.filtered).toContain("TS2551 (2 errors):");
    expect(result.filtered).toContain("✗ 2 errors");
  });

  it("strips 'help:' lines", () => {
    const raw = [
      "src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "help: try using parseInt()",
    ].join("\n");

    const result = filter.apply("tsc", raw);

    expect(result.filtered).not.toContain("help:");
    expect(result.filtered).toContain("TS2322");
  });

  it("includes total error count summary", () => {
    const raw = [
      "src/a.ts(1,1): error TS2322: msg1",
      "src/b.ts(2,1): error TS2304: msg2",
      "src/c.ts(3,1): error TS2345: msg3",
    ].join("\n");

    const result = filter.apply("tsc", raw);

    expect(result.filtered).toContain("✗ 3 errors (3 codes)");
  });

  it("handles clean output (no errors)", () => {
    const result = filter.apply("tsc --noEmit", "");
    expect(result.filtered).toContain("no errors");
  });

  it("handles 'Found 0 errors' output", () => {
    const result = filter.apply("tsc --noEmit", "Found 0 errors.");
    expect(result.filtered).toContain("Found 0 errors");
  });

  it("handles colon-separated format (file:line:col - error)", () => {
    const raw = [
      "src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/utils.ts:20:3 - error TS2304: Cannot find name 'bar'.",
    ].join("\n");

    const result = filter.apply("tsc", raw);

    expect(result.filtered).toContain("TS2322 (1 error):");
    expect(result.filtered).toContain("TS2304 (1 error):");
    expect(result.filtered).toContain("src/index.ts:10");
    expect(result.filtered).toContain("✗ 2 errors (2 codes)");
  });

  it("achieves >70% savings on large output", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 50; i++) {
      lines.push(`src/file${i}.ts(${i},1): error TS2322: Type 'string' is not assignable to type 'number'. This is a very long error message that takes up lots of space in the output and wastes tokens.`);
    }
    const raw = lines.join("\n");

    const result = filter.apply("tsc", raw);

    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.7);
  });

  it("handles ANSI color codes in output", () => {
    const raw = "\x1b[31msrc/index.ts(10,5): error TS2322: Type 'string' is not assignable.\x1b[0m";

    const result = filter.apply("tsc", raw);

    expect(result.filtered).toContain("TS2322");
    expect(result.filtered).not.toContain("\x1b[");
  });
});

// ── lint-js ───────────────────────────────────────────────────────

describe("lint-js", () => {
  const filter = createLintJsFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("lint-js");
  });

  it("matches eslint commands", () => {
    expect(filter.matches("eslint .")).toBe(true);
    expect(filter.matches("eslint src/")).toBe(true);
  });

  it("matches biome commands", () => {
    expect(filter.matches("biome check")).toBe(true);
    expect(filter.matches("biome lint")).toBe(true);
  });

  it("does not match non-lint commands", () => {
    expect(filter.matches("tsc --noEmit")).toBe(false);
    expect(filter.matches("prettier .")).toBe(false);
  });

  it("groups eslint errors by rule name", () => {
    const raw = [
      "/Users/dev/project/src/index.ts",
      "  10:5  error  'foo' is defined but never used  no-unused-vars",
      "  20:3  error  'bar' is defined but never used  no-unused-vars",
      "  30:1  error  Unexpected any                   @typescript-eslint/no-explicit-any",
      "",
      "/Users/dev/project/src/utils.ts",
      "  5:10  error  'baz' is defined but never used  no-unused-vars",
      "",
      "✖ 4 problems (4 errors, 0 warnings)",
    ].join("\n");

    const result = filter.apply("eslint .", raw);

    expect(result.filtered).toContain("no-unused-vars (3 errors):");
    expect(result.filtered).toContain("@typescript-eslint/no-explicit-any (1 error):");
    expect(result.filtered).toContain("✗ 4 errors (2 rules)");
  });

  it("caps at 5 instances per rule with overflow indicator", () => {
    const lines = ["/Users/dev/project/src/index.ts"];
    for (let i = 1; i <= 8; i++) {
      lines.push(`  ${i}:1  error  Var ${i} is unused  no-unused-vars`);
    }
    const raw = lines.join("\n");

    const result = filter.apply("eslint .", raw);

    expect(result.filtered).toContain("no-unused-vars (8 errors):");
    expect(result.filtered).toContain("... and 3 more");
    expect(result.filtered).toContain("✗ 8 errors (1 rule)");
  });

  it("strips 'Did you mean' suggestions", () => {
    const raw = [
      "/Users/dev/project/src/index.ts",
      "  10:5  error  'nmae' is not defined  no-undef",
      "  Did you mean 'name'?",
      "  20:5  error  'emial' is not defined  no-undef",
      "  Did you mean 'email'?",
    ].join("\n");

    const result = filter.apply("eslint .", raw);

    expect(result.filtered).not.toContain("Did you mean");
    expect(result.filtered).toContain("no-undef (2 errors):");
  });

  it("includes total error count summary", () => {
    const raw = [
      "/Users/dev/project/src/index.ts",
      "  10:5  error  msg1  rule-a",
      "  20:5  error  msg2  rule-b",
      "",
      "/Users/dev/project/src/utils.ts",
      "  5:1  error  msg3  rule-c",
    ].join("\n");

    const result = filter.apply("eslint .", raw);

    expect(result.filtered).toContain("✗ 3 errors (3 rules)");
  });

  it("handles clean output (no errors)", () => {
    const result = filter.apply("eslint .", "");
    expect(result.filtered).toContain("no errors");
  });

  it("handles biome format with ━ separator", () => {
    const raw = [
      "src/index.ts:10:5 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━",
      "  ✖ Unexpected any.",
      "",
      "src/utils.ts:20:3 lint/suspicious/noExplicitAny ━━━━━━━━━━━━━",
      "  ✖ Unexpected any.",
      "",
      "src/lib.ts:5:1 lint/correctness/noUnusedVariables ━━━━━━━━━━━━━",
      "  ✖ This variable is unused.",
    ].join("\n");

    const result = filter.apply("biome check", raw);

    expect(result.filtered).toContain("lint/suspicious/noExplicitAny (2 errors):");
    expect(result.filtered).toContain("lint/correctness/noUnusedVariables (1 error):");
    expect(result.filtered).toContain("✗ 3 errors (2 rules)");
  });

  it("achieves >70% savings on large output", () => {
    const lines = ["/Users/dev/project/src/bigfile.ts"];
    for (let i = 1; i <= 50; i++) {
      lines.push(`  ${i}:1  error  Variable '${String.fromCharCode(97 + (i % 26))}${i}' is declared but its value is never read. This is a very long error message.  no-unused-vars`);
    }
    lines.push("");
    lines.push("✖ 50 problems (50 errors, 0 warnings)");
    const raw = lines.join("\n");

    const result = filter.apply("eslint .", raw);

    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.7);
  });

  it("handles ANSI color codes in output", () => {
    const raw = [
      "\x1b[4m/Users/dev/project/src/index.ts\x1b[0m",
      "  \x1b[31m10:5\x1b[0m  error  'foo' is unused  no-unused-vars",
    ].join("\n");

    const result = filter.apply("eslint .", raw);

    expect(result.filtered).toContain("no-unused-vars");
    expect(result.filtered).not.toContain("\x1b[");
  });
});

// ── lint-py ───────────────────────────────────────────────────────

describe("lint-py", () => {
  const filter = createLintPyFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("lint-py");
  });

  it("matches ruff commands", () => {
    expect(filter.matches("ruff check .")).toBe(true);
    expect(filter.matches("ruff check src/")).toBe(true);
    expect(filter.matches("ruff .")).toBe(true);
  });

  it("does not match non-ruff commands", () => {
    expect(filter.matches("pylint .")).toBe(false);
    expect(filter.matches("mypy .")).toBe(false);
  });

  it("groups errors by rule code", () => {
    const raw = [
      "src/main.py:10:1: F401 `os` imported but unused",
      "src/main.py:11:1: F401 `sys` imported but unused",
      "src/utils.py:20:5: E501 Line too long (120 > 88)",
      "src/utils.py:25:5: F401 `json` imported but unused",
      "Found 4 errors.",
    ].join("\n");

    const result = filter.apply("ruff check .", raw);

    expect(result.filtered).toContain("F401 (3 errors):");
    expect(result.filtered).toContain("E501 (1 error):");
    expect(result.filtered).toContain("✗ 4 errors (2 rules)");
  });

  it("caps at 5 instances per code with overflow indicator", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 8; i++) {
      lines.push(`src/file${i}.py:${i}:1: F401 \`module${i}\` imported but unused`);
    }
    const raw = lines.join("\n");

    const result = filter.apply("ruff check .", raw);

    expect(result.filtered).toContain("F401 (8 errors):");
    expect(result.filtered).toContain("... and 3 more");
    expect(result.filtered).toContain("✗ 8 errors (1 rule)");
  });

  it("strips 'Did you mean' suggestions", () => {
    const raw = [
      "src/main.py:10:1: F821 Undefined name `nmae`",
      "  Did you mean `name`?",
      "src/main.py:20:1: F821 Undefined name `emial`",
      "  Did you mean `email`?",
    ].join("\n");

    const result = filter.apply("ruff check .", raw);

    expect(result.filtered).not.toContain("Did you mean");
    expect(result.filtered).toContain("F821 (2 errors):");
  });

  it("strips 'help:' lines", () => {
    const raw = [
      "src/main.py:10:1: F401 `os` imported but unused",
      "help: Remove unused import",
    ].join("\n");

    const result = filter.apply("ruff check .", raw);

    expect(result.filtered).not.toContain("help:");
    expect(result.filtered).toContain("F401");
  });

  it("includes total error count summary", () => {
    const raw = [
      "src/a.py:1:1: F401 `os` imported but unused",
      "src/b.py:2:1: E501 Line too long",
      "src/c.py:3:1: W291 Trailing whitespace",
    ].join("\n");

    const result = filter.apply("ruff check .", raw);

    expect(result.filtered).toContain("✗ 3 errors (3 rules)");
  });

  it("handles clean output (no errors)", () => {
    const result = filter.apply("ruff check .", "");
    expect(result.filtered).toContain("no errors");
  });

  it("handles 'All checks passed' output", () => {
    const result = filter.apply("ruff check .", "All checks passed!");
    expect(result.filtered).toContain("All checks passed");
  });

  it("handles 'Found 0 errors' output", () => {
    const result = filter.apply("ruff check .", "Found 0 errors.");
    expect(result.filtered).toContain("Found 0 errors");
  });

  it("achieves >70% savings on large output", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 50; i++) {
      lines.push(`src/file${i}.py:${i}:1: F401 \`module_${i}_with_a_very_long_name\` imported but unused and this is a very long error message that wastes tokens`);
    }
    const raw = lines.join("\n");

    const result = filter.apply("ruff check .", raw);

    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.7);
  });

  it("handles ANSI color codes in output", () => {
    const raw = "\x1b[1m\x1b[31msrc/main.py:10:1: F401\x1b[0m `os` imported but unused";

    const result = filter.apply("ruff check .", raw);

    expect(result.filtered).toContain("F401");
    expect(result.filtered).not.toContain("\x1b[");
  });
});

// ── lint-rs ───────────────────────────────────────────────────────

describe("lint-rs", () => {
  const filter = createLintRsFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("lint-rs");
  });

  it("matches cargo clippy commands", () => {
    expect(filter.matches("cargo clippy")).toBe(true);
    expect(filter.matches("cargo clippy -- -D warnings")).toBe(true);
  });

  it("matches cargo build commands", () => {
    expect(filter.matches("cargo build")).toBe(true);
    expect(filter.matches("cargo build --release")).toBe(true);
  });

  it("does not match non-cargo commands", () => {
    expect(filter.matches("rustc main.rs")).toBe(false);
    expect(filter.matches("cargo test")).toBe(false);
  });

  it("groups warnings by lint name", () => {
    const raw = [
      "warning: unneeded `return` statement",
      "  --> src/main.rs:10:5",
      "   |",
      "10 |     return x;",
      "   |     ^^^^^^^^^",
      "   |",
      "   = note: `#[warn(clippy::needless_return)]` on by default",
      "",
      "warning: unneeded `return` statement",
      "  --> src/lib.rs:20:9",
      "   |",
      "20 |     return y;",
      "   |     ^^^^^^^^^",
      "   |",
      "   = note: `#[warn(clippy::needless_return)]` on by default",
      "",
      "warning: unused import: `std::io`",
      "  --> src/main.rs:1:5",
      "   |",
      " 1 | use std::io;",
      "   |     ^^^^^^^",
      "   |",
      "   = note: `#[warn(clippy::unused_imports)]` on by default",
      "",
      "warning: `myproject` (bin \"myproject\") generated 3 warnings",
    ].join("\n");

    const result = filter.apply("cargo clippy", raw);

    expect(result.filtered).toContain("clippy::needless_return (2 warnings):");
    expect(result.filtered).toContain("clippy::unused_imports (1 warning):");
    expect(result.filtered).toContain("✗ 3 warnings (2 lints)");
  });

  it("caps at 5 instances per lint with overflow indicator", () => {
    const blocks: string[] = [];
    for (let i = 1; i <= 8; i++) {
      blocks.push(
        `warning: unneeded \`return\` statement`,
        `  --> src/file${i}.rs:${i * 10}:5`,
        `   |`,
        `   = note: \`#[warn(clippy::needless_return)]\` on by default`,
        ``,
      );
    }
    blocks.push(`warning: \`myproject\` (bin "myproject") generated 8 warnings`);
    const raw = blocks.join("\n");

    const result = filter.apply("cargo clippy", raw);

    expect(result.filtered).toContain("clippy::needless_return (8 warnings):");
    expect(result.filtered).toContain("... and 3 more");
    expect(result.filtered).toContain("✗ 8 warnings (1 lint)");
  });

  it("strips 'help:' suggestion lines", () => {
    const raw = [
      "warning: unneeded `return` statement",
      "  --> src/main.rs:10:5",
      "   |",
      "10 |     return x;",
      "   |     ^^^^^^^^^",
      "   |",
      "   = help: remove `return`",
      "   = note: `#[warn(clippy::needless_return)]` on by default",
      "",
      "warning: `myproject` (bin \"myproject\") generated 1 warning",
    ].join("\n");

    const result = filter.apply("cargo clippy", raw);

    expect(result.filtered).not.toContain("help:");
    expect(result.filtered).toContain("clippy::needless_return");
  });

  it("handles error-level diagnostics", () => {
    const raw = [
      "error[E0425]: cannot find value `x` in this scope",
      "  --> src/main.rs:10:5",
      "   |",
      "10 |     let y = x;",
      "   |             ^ not found in this scope",
      "",
      "error[E0425]: cannot find value `y` in this scope",
      "  --> src/main.rs:20:5",
      "   |",
      "20 |     let z = y;",
      "   |             ^ not found in this scope",
      "",
      "error: aborting due to 2 previous errors",
    ].join("\n");

    const result = filter.apply("cargo build", raw);

    expect(result.filtered).toContain("E0425 (2 errors):");
    expect(result.filtered).toContain("✗ 2 errors (1 lint)");
  });

  it("includes total summary", () => {
    const raw = [
      "warning: unused variable: `x`",
      "  --> src/main.rs:5:9",
      "   |",
      "   = note: `#[warn(unused_variables)]` on by default",
      "",
      "warning: unused import: `std::io`",
      "  --> src/main.rs:1:5",
      "   |",
      "   = note: `#[warn(unused_imports)]` on by default",
      "",
      "warning: `myproject` (bin \"myproject\") generated 2 warnings",
    ].join("\n");

    const result = filter.apply("cargo clippy", raw);

    expect(result.filtered).toContain("✗ 2 warnings (2 lints)");
  });

  it("handles clean output (no warnings)", () => {
    const raw = [
      "    Compiling myproject v0.1.0",
      "    Finished dev [unoptimized + debuginfo] target(s) in 1.23s",
    ].join("\n");

    const result = filter.apply("cargo clippy", raw);

    // Should not contain error marker
    expect(result.filtered).not.toContain("✗");
  });

  it("handles empty output", () => {
    const result = filter.apply("cargo clippy", "");
    expect(result.filtered).toContain("no warnings");
  });

  it("achieves >70% savings on large output", () => {
    const blocks: string[] = [];
    for (let i = 1; i <= 30; i++) {
      blocks.push(
        `warning: unneeded \`return\` statement with a very long description that explains why this is bad practice and should be avoided in all cases`,
        `  --> src/file${i}.rs:${i * 10}:5`,
        `   |`,
        `${i * 10} |     return some_very_long_variable_name_${i};`,
        `   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^`,
        `   |`,
        `   = help: remove \`return\` as it is unnecessary`,
        `   = note: \`#[warn(clippy::needless_return)]\` on by default`,
        ``,
      );
    }
    blocks.push(`warning: \`myproject\` (bin "myproject") generated 30 warnings`);
    const raw = blocks.join("\n");

    const result = filter.apply("cargo clippy", raw);

    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.7);
  });

  it("handles ANSI color codes in output", () => {
    const raw = [
      "\x1b[33mwarning\x1b[0m: unused variable: `x`",
      "  --> src/main.rs:5:9",
      "   |",
      "   = note: `#[warn(unused_variables)]` on by default",
    ].join("\n");

    const result = filter.apply("cargo clippy", raw);

    expect(result.filtered).toContain("unused_variables");
    expect(result.filtered).not.toContain("\x1b[");
  });
});

// ── Filter registry integration ──────────────────────────────────

describe("lint filter registry integration", () => {
  it("all lint filters are importable and have correct interface", () => {
    const filters = [
      createLintTscFilter(),
      createLintJsFilter(),
      createLintPyFilter(),
      createLintRsFilter(),
    ];

    for (const f of filters) {
      expect(f.name).toBeTruthy();
      expect(typeof f.matches).toBe("function");
      expect(typeof f.apply).toBe("function");
    }
  });

  it("lint filters are registered in main registry", async () => {
    const { getFilters } = await import("../src/filters/index.js");
    const filters = getFilters();
    const names = filters.map((f) => f.name);

    expect(names).toContain("lint-tsc");
    expect(names).toContain("lint-js");
    expect(names).toContain("lint-py");
    expect(names).toContain("lint-rs");
  });
});
