/**
 * Tests for the ls/find/fd/tree filter.
 * Covers: VAL-TOOL-001, VAL-TOOL-002, VAL-TOOL-003, VAL-TOOL-004
 */
import { describe, it, expect } from "vitest";
import { createLsFilter } from "../src/filters/ls.js";

const filter = createLsFilter();

// ── Matching ──────────────────────────────────────────────────────

describe("ls filter matching", () => {
  it("matches ls", () => {
    expect(filter.matches("ls")).toBe(true);
  });

  it("matches ls -la", () => {
    expect(filter.matches("ls -la")).toBe(true);
  });

  it("matches ls with path", () => {
    expect(filter.matches("ls src/")).toBe(true);
  });

  it("matches exa", () => {
    expect(filter.matches("exa --long")).toBe(true);
  });

  it("matches eza", () => {
    expect(filter.matches("eza --tree")).toBe(true);
  });

  it("matches find", () => {
    expect(filter.matches('find . -name "*.ts"')).toBe(true);
  });

  it("matches fd", () => {
    expect(filter.matches("fd .ts")).toBe(true);
  });

  it("matches tree", () => {
    expect(filter.matches("tree")).toBe(true);
  });

  it("matches tree with depth", () => {
    expect(filter.matches("tree -L 3")).toBe(true);
  });

  it("does not match unrelated commands", () => {
    expect(filter.matches("git status")).toBe(false);
    expect(filter.matches("echo hello")).toBe(false);
    expect(filter.matches("npm install")).toBe(false);
  });
});

// ── ls output ─────────────────────────────────────────────────────

describe("ls filter happy path (VAL-TOOL-001)", () => {
  it("compacts typical ls -la output with directory grouping and >60% savings", () => {
    const raw = `total 80
drwxr-xr-x  12 user  staff   384 Mar 17 10:00 .
drwxr-xr-x   5 user  staff   160 Mar 17 09:00 ..
drwxr-xr-x   8 user  staff   256 Mar 17 10:00 .git
-rw-r--r--   1 user  staff   375 Mar 17 10:00 tsconfig.json
-rw-r--r--   1 user  staff  1400 Mar 17 10:00 package.json
-rw-r--r--   1 user  staff  6800 Mar 17 10:00 README.md
-rw-r--r--   1 user  staff 11600 Mar 17 10:00 index.ts
drwxr-xr-x  10 user  staff   320 Mar 17 10:00 src
drwxr-xr-x   8 user  staff   256 Mar 17 10:00 test
drwxr-xr-x   4 user  staff   128 Mar 17 10:00 docs
drwxr-xr-x 120 user  staff  3840 Mar 17 10:00 node_modules
drwxr-xr-x   3 user  staff    96 Mar 17 10:00 dist`;

    const result = filter.apply("ls -la", raw);

    // Should contain directories and files
    expect(result.filtered).toContain("src/");
    expect(result.filtered).toContain("test/");
    expect(result.filtered).toContain("docs/");
    expect(result.filtered).toContain("index.ts");
    expect(result.filtered).toContain("package.json");

    // Should have extension breakdown summary line
    expect(result.filtered).toMatch(/📊/);

    // >60% savings
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.6);
  });

  it("handles simple ls output (no flags)", () => {
    const raw = `README.md
index.ts
package.json
src
test
tsconfig.json`;

    const result = filter.apply("ls", raw);

    // Should contain files
    expect(result.filtered).toContain("index.ts");
    expect(result.filtered).toContain("package.json");
    expect(result.filtered).toContain("README.md");
  });

  it("handles empty output", () => {
    const result = filter.apply("ls", "");
    expect(result.filtered).toBe("");
    expect(result.filteredChars).toBe(0);
  });

  it("handles single file output", () => {
    const raw = `index.ts`;
    const result = filter.apply("ls", raw);
    expect(result.filtered).toContain("index.ts");
  });
});

// ── Noise directory hiding (VAL-TOOL-002) ─────────────────────────

describe("ls filter hides noise directories (VAL-TOOL-002)", () => {
  it("strips node_modules, .git, __pycache__, .next, dist, build, coverage", () => {
    const raw = `total 120
drwxr-xr-x  12 user  staff    384 Mar 17 10:00 .
drwxr-xr-x   5 user  staff    160 Mar 17 09:00 ..
drwxr-xr-x   8 user  staff    256 Mar 17 10:00 .git
drwxr-xr-x 120 user  staff   3840 Mar 17 10:00 node_modules
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 __pycache__
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 .next
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 dist
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 build
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 coverage
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 .venv
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 target
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 .cache
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 .nuxt
drwxr-xr-x   3 user  staff     96 Mar 17 10:00 .svelte-kit
drwxr-xr-x  10 user  staff    320 Mar 17 10:00 src
-rw-r--r--   1 user  staff    375 Mar 17 10:00 tsconfig.json
-rw-r--r--   1 user  staff  11600 Mar 17 10:00 index.ts`;

    const result = filter.apply("ls -la", raw);

    // Noise directories stripped
    expect(result.filtered).not.toContain("node_modules");
    expect(result.filtered).not.toMatch(/\b\.git\b/);
    expect(result.filtered).not.toContain("__pycache__");
    expect(result.filtered).not.toContain(".next");
    expect(result.filtered).not.toContain("dist/");
    expect(result.filtered).not.toContain("build/");
    expect(result.filtered).not.toContain("coverage");
    expect(result.filtered).not.toContain(".venv");
    expect(result.filtered).not.toContain("target");
    expect(result.filtered).not.toContain(".cache");
    expect(result.filtered).not.toContain(".nuxt");
    expect(result.filtered).not.toContain(".svelte-kit");

    // Real content preserved
    expect(result.filtered).toContain("src/");
    expect(result.filtered).toContain("index.ts");
    expect(result.filtered).toContain("tsconfig.json");
  });

  it("hides noise in simple ls output (no -la)", () => {
    const raw = `dist
index.ts
node_modules
package.json
src
test`;

    const result = filter.apply("ls", raw);
    expect(result.filtered).not.toContain("node_modules");
    expect(result.filtered).not.toContain("dist");
    expect(result.filtered).toContain("src");
    expect(result.filtered).toContain("index.ts");
  });
});

// ── Human-readable sizes (VAL-TOOL-003) ───────────────────────────

describe("ls filter human-readable sizes (VAL-TOOL-003)", () => {
  it("displays sizes in B/K/M/G format from ls -la output", () => {
    const raw = `total 80
-rw-r--r--  1 user  staff       375 Mar 17 10:00 tsconfig.json
-rw-r--r--  1 user  staff      1400 Mar 17 10:00 package.json
-rw-r--r--  1 user  staff     11600 Mar 17 10:00 index.ts
-rw-r--r--  1 user  staff   1048576 Mar 17 10:00 bundle.js
-rw-r--r--  1 user  staff 104857600 Mar 17 10:00 data.bin`;

    const result = filter.apply("ls -la", raw);

    // Human-readable sizes present
    expect(result.filtered).toMatch(/375B/);
    expect(result.filtered).toMatch(/1\.4K/);
    expect(result.filtered).toMatch(/11\.3K/);
    expect(result.filtered).toMatch(/1\.0M/);
    expect(result.filtered).toMatch(/100\.0M/);
  });

  it("handles zero-byte files", () => {
    const raw = `total 0
-rw-r--r--  1 user  staff  0 Mar 17 10:00 .gitkeep`;

    const result = filter.apply("ls -la", raw);
    expect(result.filtered).toContain("0B");
  });
});

// ── find/fd grouped by directory (VAL-TOOL-004) ───────────────────

describe("find/fd grouped by parent directory (VAL-TOOL-004)", () => {
  it("groups find output by parent directory", () => {
    const raw = `./src/index.ts
./src/matcher.ts
./src/config.ts
./src/utils.ts
./src/filters/index.ts
./src/filters/git-status.ts
./src/filters/git-diff.ts
./test/matcher.test.ts
./test/config.test.ts
./test/utils.test.ts
./package.json
./tsconfig.json
./README.md`;

    const result = filter.apply('find . -name "*.ts"', raw);

    // Grouped by directory with counts
    expect(result.filtered).toContain("src/");
    expect(result.filtered).toContain("src/filters/");
    expect(result.filtered).toContain("test/");

    // Summary line
    expect(result.filtered).toMatch(/📊/);
  });

  it("groups fd output by parent directory", () => {
    const raw = `src/index.ts
src/matcher.ts
src/config.ts
src/filters/index.ts
src/filters/git-status.ts
test/matcher.test.ts
test/config.test.ts
package.json
README.md`;

    const result = filter.apply("fd .ts", raw);

    // Grouped by directory
    expect(result.filtered).toContain("src/");
    expect(result.filtered).toContain("src/filters/");
    expect(result.filtered).toContain("test/");

    // Summary
    expect(result.filtered).toMatch(/📊/);
  });

  it("filters out noise directories in find output", () => {
    const raw = `./src/index.ts
./node_modules/some-pkg/index.js
./node_modules/some-pkg/lib/util.js
./.git/objects/ab/cdef123
./src/config.ts
./dist/bundle.js
./__pycache__/module.pyc`;

    const result = filter.apply("find . -type f", raw);

    expect(result.filtered).not.toContain("node_modules");
    expect(result.filtered).not.toContain(".git");
    expect(result.filtered).not.toContain("dist");
    expect(result.filtered).not.toContain("__pycache__");
    expect(result.filtered).toContain("src/");
  });

  it("handles empty find output", () => {
    const result = filter.apply("find . -name '*.xyz'", "");
    expect(result.filtered).toBe("");
  });
});

// ── tree output ───────────────────────────────────────────────────

describe("tree filter", () => {
  it("compacts tree output with directory grouping", () => {
    const raw = `.
├── README.md
├── index.ts
├── package.json
├── src
│   ├── config.ts
│   ├── filters
│   │   ├── git-diff.ts
│   │   ├── git-status.ts
│   │   └── index.ts
│   ├── matcher.ts
│   └── utils.ts
├── test
│   ├── config.test.ts
│   ├── matcher.test.ts
│   └── utils.test.ts
└── tsconfig.json

3 directories, 12 files`;

    const result = filter.apply("tree", raw);

    // Should mention directories and files
    expect(result.filtered).toContain("src/");
    expect(result.filtered).toContain("test/");
    expect(result.filtered).toMatch(/📊/);
  });

  it("hides noise directories from tree output", () => {
    const raw = `.
├── index.ts
├── node_modules
│   ├── some-pkg
│   │   └── index.js
│   └── other-pkg
│       └── lib.js
├── .git
│   └── config
├── src
│   └── main.ts
└── dist
    └── bundle.js

6 directories, 6 files`;

    const result = filter.apply("tree", raw);

    expect(result.filtered).not.toContain("node_modules");
    expect(result.filtered).not.toMatch(/\b\.git\b/);
    expect(result.filtered).not.toContain("dist");
    expect(result.filtered).toContain("src/");
  });
});

  it("treats Makefile, Dockerfile, and .gitignore as files, not directories", () => {
    const raw = `.
├── Makefile
├── Dockerfile
├── .gitignore
├── src
│   ├── main.ts
│   └── utils.ts
└── README.md

1 directory, 6 files`;

    const result = filter.apply("tree", raw);

    // These extensionless files should appear in the output as files
    expect(result.filtered).toContain("Makefile");
    expect(result.filtered).toContain("Dockerfile");
    expect(result.filtered).toContain(".gitignore");
    expect(result.filtered).toContain("README.md");
    // src should be recognized as a directory since it has children
    expect(result.filtered).toContain("src/");
  });
});

// ── Extension breakdown summary ───────────────────────────────────

describe("extension breakdown summary", () => {
  it("includes extension breakdown in summary line", () => {
    const raw = `total 80
-rw-r--r--  1 user  staff   375 Mar 17 10:00 tsconfig.json
-rw-r--r--  1 user  staff  1400 Mar 17 10:00 package.json
-rw-r--r--  1 user  staff  6800 Mar 17 10:00 README.md
-rw-r--r--  1 user  staff 11600 Mar 17 10:00 index.ts
-rw-r--r--  1 user  staff  3200 Mar 17 10:00 CHANGELOG.md
-rw-r--r--  1 user  staff   800 Mar 17 10:00 .gitignore
drwxr-xr-x  10 user  staff   320 Mar 17 10:00 src
drwxr-xr-x   8 user  staff   256 Mar 17 10:00 test
drwxr-xr-x   4 user  staff   128 Mar 17 10:00 docs`;

    const result = filter.apply("ls -la", raw);

    // Extension breakdown
    expect(result.filtered).toMatch(/📊/);
    expect(result.filtered).toMatch(/\.md/);
    expect(result.filtered).toMatch(/\.json/);
    expect(result.filtered).toMatch(/\.ts/);
  });

  it("shows +N more for many extensions", () => {
    const raw = `total 120
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.ts
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.js
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.json
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.md
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.css
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.html
-rw-r--r--  1 user  staff  100 Mar 17 10:00 file.py`;

    const result = filter.apply("ls -la", raw);

    // Should have +N more for extensions beyond the top displayed
    expect(result.filtered).toMatch(/\+\d+ more/);
  });
});

// ── Large output ──────────────────────────────────────────────────

describe("large ls output", () => {
  it("handles 200+ file listing with >60% savings", () => {
    const lines = ["total 2048"];
    for (let i = 0; i < 200; i++) {
      const ext = [".ts", ".js", ".json", ".md", ".css"][i % 5];
      const size = 100 + i * 50;
      lines.push(
        `-rw-r--r--  1 user  staff  ${size} Mar 17 10:00 file${i}${ext}`,
      );
    }
    const raw = lines.join("\n");

    const result = filter.apply("ls -la", raw);

    // Summary should be present
    expect(result.filtered).toMatch(/📊/);

    // >60% savings on large output
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.6);
  });
});

// ── eza/exa output ────────────────────────────────────────────────

describe("eza/exa output", () => {
  it("handles eza --long output", () => {
    const raw = `.rw-r--r-- 11k user 17 Mar 10:00 index.ts
.rw-r--r-- 1.4k user 17 Mar 10:00 package.json
.rw-r--r-- 6.8k user 17 Mar 10:00 README.md
drwxr-xr-x    - user 17 Mar 10:00 src
drwxr-xr-x    - user 17 Mar 10:00 test
drwxr-xr-x    - user 17 Mar 10:00 node_modules
.rw-r--r--  375 user 17 Mar 10:00 tsconfig.json`;

    const result = filter.apply("eza --long", raw);

    // node_modules hidden
    expect(result.filtered).not.toContain("node_modules");

    // Files preserved
    expect(result.filtered).toContain("index.ts");
    expect(result.filtered).toContain("src/");
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles unicode filenames", () => {
    const raw = `total 16
-rw-r--r--  1 user  staff  100 Mar 17 10:00 日本語.ts
-rw-r--r--  1 user  staff  200 Mar 17 10:00 données.json
-rw-r--r--  1 user  staff  300 Mar 17 10:00 café.md`;

    const result = filter.apply("ls -la", raw);
    expect(result.filtered).toContain("日本語.ts");
    expect(result.filtered).toContain("données.json");
    expect(result.filtered).toContain("café.md");
  });

  it("handles filenames with spaces", () => {
    const raw = `total 8
-rw-r--r--  1 user  staff  100 Mar 17 10:00 my file.ts
-rw-r--r--  1 user  staff  200 Mar 17 10:00 another file.json`;

    const result = filter.apply("ls -la", raw);
    expect(result.filtered).toContain("my file.ts");
    expect(result.filtered).toContain("another file.json");
  });

  it("handles only directories (no files)", () => {
    const raw = `total 0
drwxr-xr-x  10 user  staff  320 Mar 17 10:00 src
drwxr-xr-x   8 user  staff  256 Mar 17 10:00 test
drwxr-xr-x   4 user  staff  128 Mar 17 10:00 docs`;

    const result = filter.apply("ls -la", raw);
    expect(result.filtered).toContain("src/");
    expect(result.filtered).toContain("test/");
    expect(result.filtered).toContain("docs/");
  });

  it("handles only noise directories (all filtered out)", () => {
    const raw = `node_modules
.git
dist
build`;

    const result = filter.apply("ls", raw);
    // All noise stripped - may be empty or just the summary
    expect(result.filtered).not.toContain("node_modules");
    expect(result.filtered).not.toMatch(/\b\.git\b/);
  });
});
