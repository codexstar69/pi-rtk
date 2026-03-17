/**
 * Tests for the read-filter: comment stripping for the read tool.
 *
 * Validates:
 * - VAL-DATA-008: ts comments stripped
 * - VAL-DATA-009: py comments stripped
 * - VAL-DATA-010: doc comments preserved
 * - VAL-DATA-011: small files unchanged
 * - VAL-DATA-012: each language stripped correctly
 * - VAL-DATA-013: blank lines normalized
 */

import { describe, it, expect } from "vitest";
import { createReadFilter } from "../src/filters/read-filter.js";

const filter = createReadFilter();

// ── Helpers ──────────────────────────────────────────────────────

/** Pad content to exceed the 5000-char threshold. */
function padToThreshold(content: string): string {
  const pad = "x".repeat(Math.max(0, 5001 - content.length));
  return content + "\n" + pad;
}

/** Generate a large file with many lines. */
function makeLargeFile(lines: string[]): string {
  const base = lines.join("\n");
  return padToThreshold(base);
}

// ── matches() ────────────────────────────────────────────────────

describe("read-filter matches()", () => {
  it("matches read: commands for source files", () => {
    expect(filter.matches("read:/home/user/file.ts")).toBe(true);
    expect(filter.matches("read:/project/src/app.py")).toBe(true);
    expect(filter.matches("read:/project/main.rs")).toBe(true);
    expect(filter.matches("read:/project/main.go")).toBe(true);
    expect(filter.matches("read:/project/script.rb")).toBe(true);
    expect(filter.matches("read:/project/run.sh")).toBe(true);
    expect(filter.matches("read:/project/config.yaml")).toBe(true);
    expect(filter.matches("read:/project/config.yml")).toBe(true);
    expect(filter.matches("read:/project/config.toml")).toBe(true);
    expect(filter.matches("read:/project/style.css")).toBe(true);
    expect(filter.matches("read:/project/style.scss")).toBe(true);
    expect(filter.matches("read:/project/index.html")).toBe(true);
    expect(filter.matches("read:/project/App.vue")).toBe(true);
    expect(filter.matches("read:/project/App.svelte")).toBe(true);
    expect(filter.matches("read:/project/query.sql")).toBe(true);
    expect(filter.matches("read:/project/app.jsx")).toBe(true);
    expect(filter.matches("read:/project/app.tsx")).toBe(true);
    expect(filter.matches("read:/project/run.bash")).toBe(true);
    expect(filter.matches("read:/project/run.zsh")).toBe(true);
  });

  it("does not match .json, .jsonc, .env files", () => {
    expect(filter.matches("read:/project/package.json")).toBe(false);
    expect(filter.matches("read:/project/settings.jsonc")).toBe(false);
    expect(filter.matches("read:/project/.env")).toBe(false);
    expect(filter.matches("read:/project/.env.local")).toBe(false);
  });

  it("does not match non-read commands", () => {
    expect(filter.matches("cat file.ts")).toBe(false);
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("ls -la")).toBe(false);
  });

  it("does not match unknown extensions", () => {
    expect(filter.matches("read:/project/file.txt")).toBe(false);
    expect(filter.matches("read:/project/file.md")).toBe(false);
    expect(filter.matches("read:/project/image.png")).toBe(false);
  });
});

// ── Small files (<=5000 chars) pass through ──────────────────────

describe("read-filter small files", () => {
  // VAL-DATA-011
  it("small files unchanged", () => {
    const small = "// this is a comment\nconst x = 1;\n";
    expect(small.length).toBeLessThanOrEqual(5000);

    const { filtered } = filter.apply("read:/project/file.ts", small);
    expect(filtered).toBe(small);
  });

  it("file exactly 5000 chars passes through unchanged", () => {
    const content = "// comment\n" + "x".repeat(4989);
    expect(content.length).toBe(5000);

    const { filtered } = filter.apply("read:/project/file.ts", content);
    expect(filtered).toBe(content);
  });
});

// ── TypeScript / JavaScript comment stripping ────────────────────

describe("read-filter TypeScript/JavaScript", () => {
  // VAL-DATA-008
  it("ts comments stripped", () => {
    const raw = makeLargeFile([
      "import { foo } from './foo';",
      "// This is a single-line comment",
      "const x = 1; // inline comment",
      "/* multi-line",
      "   comment block */",
      "const y = 2;",
    ]);

    const { filtered, rawChars, filteredChars } = filter.apply("read:/project/file.ts", raw);

    expect(filtered).toContain("import { foo } from './foo';");
    expect(filtered).toContain("const x = 1;");
    expect(filtered).toContain("const y = 2;");
    // Single-line comment stripped
    expect(filtered).not.toContain("This is a single-line comment");
    // Inline comment stripped
    expect(filtered).not.toContain("inline comment");
    // Multi-line comment stripped
    expect(filtered).not.toContain("multi-line");
    expect(filtered).not.toContain("comment block");
    expect(filteredChars).toBeLessThan(rawChars);
  });

  it("strips .js comments", () => {
    const raw = makeLargeFile([
      "const a = 1;",
      "// js comment",
      "/* block */",
      "const b = 2;",
    ]);

    const { filtered } = filter.apply("read:/project/file.js", raw);
    expect(filtered).not.toContain("js comment");
    expect(filtered).not.toContain("block */");
    expect(filtered).toContain("const a = 1;");
    expect(filtered).toContain("const b = 2;");
  });

  it("strips .tsx and .jsx comments", () => {
    const raw = makeLargeFile([
      "const App = () => {",
      "  // tsx comment",
      "  /* block comment */",
      "  return <div />;",
      "};",
    ]);

    const { filtered } = filter.apply("read:/project/App.tsx", raw);
    expect(filtered).not.toContain("tsx comment");
    expect(filtered).not.toContain("block comment");
    expect(filtered).toContain("return <div />;");
  });

  // VAL-DATA-010 (partial)
  it("preserves JSDoc /** */ comments", () => {
    const raw = makeLargeFile([
      "/** This is a JSDoc comment */",
      "function foo() {}",
      "// regular comment",
      "/**",
      " * Multi-line JSDoc",
      " * @param x - the value",
      " */",
      "function bar(x: number) {}",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain("/** This is a JSDoc comment */");
    expect(filtered).toContain("Multi-line JSDoc");
    expect(filtered).toContain("@param x - the value");
    expect(filtered).not.toContain("regular comment");
  });

  it("preserves /// triple-slash doc comments in TS", () => {
    const raw = makeLargeFile([
      '/// <reference path="types.d.ts" />',
      "// regular comment",
      "const x = 1;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain('/// <reference path="types.d.ts" />');
    expect(filtered).not.toContain("regular comment");
  });

  it("does not strip comments inside string literals", () => {
    const raw = makeLargeFile([
      'const url = "http://example.com"; // comment to strip',
      "const msg = '// not a comment';",
      "const tpl = `/* also not a comment */`;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain("http://example.com");
    expect(filtered).toContain("// not a comment");
    expect(filtered).toContain("/* also not a comment */");
    expect(filtered).not.toContain("comment to strip");
  });
});

// ── Python comment stripping ─────────────────────────────────────

describe("read-filter Python", () => {
  // VAL-DATA-009
  it("py comments stripped", () => {
    const raw = makeLargeFile([
      "import os",
      "# This is a comment",
      "x = 1  # inline comment",
      "y = 2",
    ]);

    const { filtered, rawChars, filteredChars } = filter.apply("read:/project/file.py", raw);
    expect(filtered).toContain("import os");
    expect(filtered).toContain("x = 1");
    expect(filtered).toContain("y = 2");
    expect(filtered).not.toContain("This is a comment");
    expect(filtered).not.toContain("inline comment");
    expect(filteredChars).toBeLessThan(rawChars);
  });

  // VAL-DATA-010 (partial)
  it("preserves triple-quote docstrings", () => {
    const raw = makeLargeFile([
      "def foo():",
      '    """This is a docstring."""',
      "    # regular comment",
      "    pass",
      "",
      "def bar():",
      '    """',
      "    Multi-line docstring.",
      "    More details here.",
      '    """',
      "    return 1",
    ]);

    const { filtered } = filter.apply("read:/project/file.py", raw);
    expect(filtered).toContain("This is a docstring.");
    expect(filtered).toContain("Multi-line docstring.");
    expect(filtered).toContain("More details here.");
    expect(filtered).not.toContain("regular comment");
  });

  it("preserves single-quote triple-quote docstrings", () => {
    const raw = makeLargeFile([
      "def foo():",
      "    '''Single-quote docstring.'''",
      "    # comment",
      "    pass",
    ]);

    const { filtered } = filter.apply("read:/project/file.py", raw);
    expect(filtered).toContain("Single-quote docstring.");
    expect(filtered).not.toContain("# comment");
  });
});

// ── Rust comment stripping ───────────────────────────────────────

describe("read-filter Rust", () => {
  it("strips // and /* */ comments", () => {
    const raw = makeLargeFile([
      "fn main() {",
      "    // This is a comment",
      "    let x = 1; // inline",
      "    /* block comment */",
      "    let y = 2;",
      "}",
    ]);

    const { filtered } = filter.apply("read:/project/main.rs", raw);
    expect(filtered).toContain("fn main()");
    expect(filtered).toContain("let x = 1;");
    expect(filtered).toContain("let y = 2;");
    expect(filtered).not.toContain("This is a comment");
    expect(filtered).not.toContain("inline");
    expect(filtered).not.toContain("block comment");
  });

  it("preserves /// doc comments", () => {
    const raw = makeLargeFile([
      "/// Documentation for this function",
      "fn foo() {}",
      "// regular comment",
    ]);

    const { filtered } = filter.apply("read:/project/main.rs", raw);
    expect(filtered).toContain("/// Documentation for this function");
    expect(filtered).not.toContain("regular comment");
  });

  it("preserves /** */ doc comments", () => {
    const raw = makeLargeFile([
      "/** Module-level doc comment */",
      "mod stuff;",
      "/* regular block comment */",
    ]);

    const { filtered } = filter.apply("read:/project/main.rs", raw);
    expect(filtered).toContain("/** Module-level doc comment */");
    expect(filtered).not.toContain("regular block comment");
  });
});

// ── Go comment stripping ─────────────────────────────────────────

describe("read-filter Go", () => {
  it("strips // and /* */ comments", () => {
    const raw = makeLargeFile([
      "package main",
      "// Comment",
      "func main() {",
      "    /* block */",
      "    fmt.Println(42)",
      "}",
    ]);

    const { filtered } = filter.apply("read:/project/main.go", raw);
    expect(filtered).toContain("package main");
    expect(filtered).toContain("func main()");
    expect(filtered).not.toContain("// Comment");
    expect(filtered).not.toContain("block */");
  });

  it("preserves // doc comments (Go convention: comment before exported)", () => {
    // In Go, doc comments are just // comments before declarations.
    // We preserve /** */ style if present, and /// style.
    // Standard Go // comments are stripped.
    const raw = makeLargeFile([
      "/** Package doc */",
      "package main",
      "// just a comment",
    ]);

    const { filtered } = filter.apply("read:/project/main.go", raw);
    expect(filtered).toContain("/** Package doc */");
    expect(filtered).not.toContain("just a comment");
  });
});

// ── Ruby comment stripping ───────────────────────────────────────

describe("read-filter Ruby", () => {
  it("strips # comments", () => {
    const raw = makeLargeFile([
      "# frozen_string_literal: true",
      "class Foo",
      "  # method comment",
      "  def bar",
      "    42 # inline",
      "  end",
      "end",
    ]);

    const { filtered } = filter.apply("read:/project/app.rb", raw);
    expect(filtered).toContain("class Foo");
    expect(filtered).toContain("def bar");
    expect(filtered).not.toContain("method comment");
    expect(filtered).not.toContain("# inline");
    // Shebangs / magic comments on line 1 — we strip those too
  });
});

// ── Shell comment stripping ──────────────────────────────────────

describe("read-filter Shell", () => {
  it("strips # comments from .sh", () => {
    const raw = makeLargeFile([
      "#!/bin/bash",
      "# Script to do things",
      "echo hello # inline comment",
      "exit 0",
    ]);

    const { filtered } = filter.apply("read:/project/run.sh", raw);
    expect(filtered).toContain("#!/bin/bash"); // shebang preserved
    expect(filtered).toContain("echo hello");
    expect(filtered).toContain("exit 0");
    expect(filtered).not.toContain("Script to do things");
    expect(filtered).not.toContain("inline comment");
  });

  it("strips # comments from .bash and .zsh", () => {
    const raw = makeLargeFile([
      "# comment",
      "cd /tmp",
    ]);

    const { filtered: filteredBash } = filter.apply("read:/project/run.bash", raw);
    expect(filteredBash).not.toMatch(/^# comment$/m);
    expect(filteredBash).toContain("cd /tmp");

    const { filtered: filteredZsh } = filter.apply("read:/project/run.zsh", raw);
    expect(filteredZsh).not.toMatch(/^# comment$/m);
    expect(filteredZsh).toContain("cd /tmp");
  });
});

// ── YAML comment stripping ───────────────────────────────────────

describe("read-filter YAML", () => {
  it("strips # comments from .yaml and .yml", () => {
    const raw = makeLargeFile([
      "# Configuration file",
      "name: pi-rtk",
      "version: 1.0 # version comment",
      "features:",
      "  - name: filter # feature comment",
    ]);

    const { filtered } = filter.apply("read:/project/config.yaml", raw);
    expect(filtered).toContain("name: pi-rtk");
    expect(filtered).toContain("version: 1.0");
    expect(filtered).not.toContain("Configuration file");
    expect(filtered).not.toContain("version comment");
    expect(filtered).not.toContain("feature comment");

    // Also test .yml
    const { filtered: ymlFiltered } = filter.apply("read:/project/config.yml", raw);
    expect(ymlFiltered).toContain("name: pi-rtk");
    expect(ymlFiltered).not.toContain("Configuration file");
  });
});

// ── TOML comment stripping ───────────────────────────────────────

describe("read-filter TOML", () => {
  it("strips # comments from .toml", () => {
    const raw = makeLargeFile([
      "# TOML config",
      "[package]",
      'name = "pi-rtk" # package name',
      'version = "0.1.0"',
    ]);

    const { filtered } = filter.apply("read:/project/Cargo.toml", raw);
    expect(filtered).toContain("[package]");
    expect(filtered).toContain('name = "pi-rtk"');
    expect(filtered).not.toContain("TOML config");
    expect(filtered).not.toContain("package name");
  });
});

// ── CSS / SCSS comment stripping ─────────────────────────────────

describe("read-filter CSS/SCSS", () => {
  it("strips /* */ comments from .css", () => {
    const raw = makeLargeFile([
      "/* Main stylesheet */",
      "body {",
      "  color: red; /* text color */",
      "}",
      "/* Another block",
      "   comment */",
      ".foo { margin: 0; }",
    ]);

    const { filtered } = filter.apply("read:/project/style.css", raw);
    expect(filtered).toContain("body {");
    expect(filtered).toContain("color: red;");
    expect(filtered).toContain(".foo { margin: 0; }");
    expect(filtered).not.toContain("Main stylesheet");
    expect(filtered).not.toContain("text color");
    expect(filtered).not.toContain("Another block");
  });

  it("strips /* */ and // comments from .scss", () => {
    const raw = makeLargeFile([
      "// SCSS comment",
      "$color: red;",
      "/* block comment */",
      ".foo { color: $color; }",
    ]);

    const { filtered } = filter.apply("read:/project/style.scss", raw);
    expect(filtered).toContain("$color: red;");
    expect(filtered).toContain(".foo { color: $color; }");
    expect(filtered).not.toContain("SCSS comment");
    expect(filtered).not.toContain("block comment");
  });
});

// ── HTML / Vue / Svelte comment stripping ────────────────────────

describe("read-filter HTML/Vue/Svelte", () => {
  it("strips <!-- --> comments from .html", () => {
    const raw = makeLargeFile([
      "<!DOCTYPE html>",
      "<!-- Page header -->",
      "<html>",
      "<head>",
      "  <!-- Meta tags -->",
      "  <title>Test</title>",
      "</head>",
      "<body>Hello</body>",
      "</html>",
    ]);

    const { filtered } = filter.apply("read:/project/index.html", raw);
    expect(filtered).toContain("<!DOCTYPE html>");
    expect(filtered).toContain("<title>Test</title>");
    expect(filtered).toContain("<body>Hello</body>");
    expect(filtered).not.toContain("Page header");
    expect(filtered).not.toContain("Meta tags");
  });

  it("strips comments from .vue and .svelte", () => {
    const raw = makeLargeFile([
      "<!-- Vue component -->",
      "<template>",
      "  <div>Hello</div>",
      "</template>",
    ]);

    const { filteredVue } = { filteredVue: filter.apply("read:/project/App.vue", raw).filtered };
    expect(filteredVue).toContain("<template>");
    expect(filteredVue).not.toContain("Vue component");

    const { filteredSvelte } = { filteredSvelte: filter.apply("read:/project/App.svelte", raw).filtered };
    expect(filteredSvelte).toContain("<template>");
    expect(filteredSvelte).not.toContain("Vue component");
  });
});

// ── SQL comment stripping ────────────────────────────────────────

describe("read-filter SQL", () => {
  it("strips -- and /* */ comments from .sql", () => {
    const raw = makeLargeFile([
      "-- Create users table",
      "CREATE TABLE users (",
      "  id INTEGER PRIMARY KEY, -- primary key",
      "  name TEXT NOT NULL",
      ");",
      "/* Insert default data",
      "   for testing */",
      "INSERT INTO users (name) VALUES ('test');",
    ]);

    const { filtered } = filter.apply("read:/project/schema.sql", raw);
    expect(filtered).toContain("CREATE TABLE users");
    expect(filtered).toContain("id INTEGER PRIMARY KEY,");
    expect(filtered).toContain("INSERT INTO users");
    expect(filtered).not.toContain("Create users table");
    expect(filtered).not.toContain("primary key");
    expect(filtered).not.toContain("Insert default data");
    expect(filtered).not.toContain("for testing */");
  });
});

// ── Blank line normalization ─────────────────────────────────────

describe("read-filter blank line normalization", () => {
  // VAL-DATA-013
  it("blank lines normalized", () => {
    const raw = makeLargeFile([
      "const a = 1;",
      "",
      "",
      "",
      "const b = 2;",
      "",
      "",
      "",
      "",
      "const c = 3;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    // Multiple blank lines should be collapsed to single
    expect(filtered).not.toMatch(/\n\n\n/);
    expect(filtered).toContain("const a = 1;");
    expect(filtered).toContain("const b = 2;");
    expect(filtered).toContain("const c = 3;");
  });
});

// ── FilterResult chars ───────────────────────────────────────────

describe("read-filter FilterResult", () => {
  it("rawChars and filteredChars are accurate", () => {
    const raw = makeLargeFile([
      "// big comment block",
      "// more comments",
      "// even more comments",
      "const x = 1;",
    ]);

    const result = filter.apply("read:/project/file.ts", raw);
    expect(result.rawChars).toBe(raw.length);
    expect(result.filteredChars).toBe(result.filtered.length);
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });
});

// ── VAL-DATA-012: Each language stripped correctly ────────────────

describe("read-filter all languages", () => {
  const languages: Array<{ ext: string; comment: string; code: string }> = [
    { ext: ".ts", comment: "// ts comment", code: "const x = 1;" },
    { ext: ".js", comment: "// js comment", code: "const x = 1;" },
    { ext: ".tsx", comment: "// tsx comment", code: "const x = 1;" },
    { ext: ".jsx", comment: "// jsx comment", code: "const x = 1;" },
    { ext: ".py", comment: "# py comment", code: "x = 1" },
    { ext: ".rs", comment: "// rs comment", code: "let x = 1;" },
    { ext: ".go", comment: "// go comment", code: "var x = 1" },
    { ext: ".rb", comment: "# rb comment", code: "x = 1" },
    { ext: ".sh", comment: "# sh comment", code: "echo hello" },
    { ext: ".bash", comment: "# bash comment", code: "echo hello" },
    { ext: ".zsh", comment: "# zsh comment", code: "echo hello" },
    { ext: ".yaml", comment: "# yaml comment", code: "key: value" },
    { ext: ".yml", comment: "# yml comment", code: "key: value" },
    { ext: ".toml", comment: "# toml comment", code: 'key = "value"' },
    { ext: ".css", comment: "/* css comment */", code: "body { color: red; }" },
    { ext: ".scss", comment: "/* scss comment */", code: "$x: red;" },
    { ext: ".html", comment: "<!-- html comment -->", code: "<div>hello</div>" },
    { ext: ".vue", comment: "<!-- vue comment -->", code: "<template></template>" },
    { ext: ".svelte", comment: "<!-- svelte comment -->", code: "<div></div>" },
    { ext: ".sql", comment: "-- sql comment", code: "SELECT 1;" },
  ];

  for (const { ext, comment, code } of languages) {
    it(`strips comments from ${ext}`, () => {
      const raw = makeLargeFile([comment, code]);
      const { filtered } = filter.apply(`read:/project/file${ext}`, raw);
      expect(filtered).toContain(code);
      // The comment text (without the comment syntax) should be gone
      const commentText = comment
        .replace(/^\/\/\s*/, "")
        .replace(/^#\s*/, "")
        .replace(/^--\s*/, "")
        .replace(/^\/\*\s*/, "")
        .replace(/\s*\*\/$/, "")
        .replace(/^<!--\s*/, "")
        .replace(/\s*-->$/, "");
      expect(filtered).not.toContain(commentText);
    });
  }
});

// ── Edge cases ───────────────────────────────────────────────────

describe("read-filter edge cases", () => {
  it("empty file produces empty output", () => {
    const { filtered } = filter.apply("read:/project/file.ts", "");
    expect(filtered).toBe("");
  });

  it("file with only comments becomes mostly empty after stripping", () => {
    const raw = makeLargeFile([
      "// comment 1",
      "// comment 2",
      "// comment 3",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    // Should not contain the comment text
    expect(filtered).not.toContain("comment 1");
    expect(filtered).not.toContain("comment 2");
  });

  it("handles strings with hash in Python (not a comment)", () => {
    const raw = makeLargeFile([
      "x = 'hello # world'",
      "# real comment",
      "y = 2",
    ]);

    const { filtered } = filter.apply("read:/project/file.py", raw);
    expect(filtered).toContain("hello # world");
    expect(filtered).not.toContain("real comment");
  });

  it("handles URLs in comments-like positions", () => {
    const raw = makeLargeFile([
      'const url = "https://example.com";',
      "// actual comment",
      "const x = 1;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain("https://example.com");
    expect(filtered).not.toContain("actual comment");
  });

  it("preserves empty doc comment /***/ as a doc comment", () => {
    const raw = makeLargeFile([
      "/***/",
      "function foo() {}",
      "/* regular block comment */",
      "const x = 1;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain("/***/");
    expect(filtered).toContain("function foo() {}");
    expect(filtered).not.toContain("regular block comment");
  });

  it("preserves /***/ in CSS", () => {
    const raw = makeLargeFile([
      "/***/",
      "body { color: red; }",
      "/* stripped */",
    ]);

    const { filtered } = filter.apply("read:/project/style.css", raw);
    expect(filtered).toContain("/***/");
    expect(filtered).not.toContain("stripped");
  });

  it("preserves /***/ in SQL", () => {
    const raw = makeLargeFile([
      "/***/",
      "SELECT 1;",
      "/* stripped */",
    ]);

    const { filtered } = filter.apply("read:/project/query.sql", raw);
    expect(filtered).toContain("/***/");
    expect(filtered).not.toContain("stripped");
  });
});

// ── YAML block scalar handling ───────────────────────────────────

describe("read-filter YAML block scalars", () => {
  it("preserves # in YAML block scalar (|)", () => {
    const raw = makeLargeFile([
      "description: |",
      "  This line has a # hash that is content",
      "  Another line with # hash",
      "name: test",
    ]);

    const { filtered } = filter.apply("read:/project/config.yaml", raw);
    expect(filtered).toContain("This line has a # hash that is content");
    expect(filtered).toContain("Another line with # hash");
    expect(filtered).toContain("name: test");
  });

  it("preserves # in YAML block scalar (>)", () => {
    const raw = makeLargeFile([
      "description: >",
      "  Folded content # with hash",
      "  More content # here",
      "key: value",
    ]);

    const { filtered } = filter.apply("read:/project/config.yml", raw);
    expect(filtered).toContain("Folded content # with hash");
    expect(filtered).toContain("More content # here");
  });

  it("block scalar ends when indent decreases", () => {
    const raw = makeLargeFile([
      "data: |",
      "  block # content",
      "other: value # this is a comment",
    ]);

    const { filtered } = filter.apply("read:/project/config.yaml", raw);
    expect(filtered).toContain("block # content");
    expect(filtered).toContain("other: value");
    expect(filtered).not.toContain("this is a comment");
  });

  it("handles block scalar with modifiers (|2, >-, |+)", () => {
    const raw = makeLargeFile([
      "text: |2",
      "    indented # content",
      "fold: >-",
      "  folded # text",
      "next: value",
    ]);

    const { filtered } = filter.apply("read:/project/config.yaml", raw);
    expect(filtered).toContain("indented # content");
    expect(filtered).toContain("folded # text");
  });
});

// ── Cross-line string state (Bug 2+8) ───────────────────────────

describe("read-filter cross-line template literals", () => {
  it("preserves // on continuation line of multi-line template literal", () => {
    const raw = makeLargeFile([
      "const html = `",
      "  <div> // this is content </div>",
      "`;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain("// this is content");
  });

  it("handles nested backtick in template literal ${}", () => {
    const raw = makeLargeFile([
      "const x = `value: ${map.get(`key`)} end`;",
    ]);

    const { filtered } = filter.apply("read:/project/file.ts", raw);
    expect(filtered).toContain("const x = `value: ${map.get(`key`)} end`;");
  });
});

// ── YAML single-quote escape (Bug 3) ────────────────────────────

describe("read-filter YAML single-quote escape", () => {
  it("preserves # inside YAML single-quoted string with '' escape", () => {
    const raw = makeLargeFile([
      "key: 'it''s a value # not a comment'",
    ]);

    const { filtered } = filter.apply("read:/project/config.yaml", raw);
    expect(filtered).toContain("# not a comment");
  });
});

// ── TOML triple-quoted strings (Bug 4) ──────────────────────────

describe("read-filter TOML triple-quoted strings", () => {
  it("preserves # inside TOML triple-quoted string", () => {
    const raw = makeLargeFile([
      'desc = """',
      "This has a # hash inside",
      '"""',
    ]);

    const { filtered } = filter.apply("read:/project/config.toml", raw);
    expect(filtered).toContain("# hash inside");
  });
});
