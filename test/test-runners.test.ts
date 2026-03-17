/**
 * Tests for test runner filters: test-js, test-py, test-rs, test-go.
 * Covers: VAL-TOOL-005, VAL-TOOL-006, VAL-TOOL-007, VAL-TOOL-008,
 *         VAL-TOOL-009, VAL-TOOL-010, VAL-TOOL-011
 */
import { describe, it, expect } from "vitest";
import { createTestJsFilter } from "../src/filters/test-js.js";
import { createTestPyFilter } from "../src/filters/test-py.js";
import { createTestRsFilter } from "../src/filters/test-rs.js";
import { createTestGoFilter } from "../src/filters/test-go.js";

// ═══════════════════════════════════════════════════════════════════
// test-js filter (bun / vitest / jest)
// ═══════════════════════════════════════════════════════════════════

const jsFilter = createTestJsFilter();

describe("test-js matching", () => {
  it("matches vitest", () => {
    expect(jsFilter.matches("vitest run")).toBe(true);
  });
  it("matches bunx vitest", () => {
    expect(jsFilter.matches("bunx vitest run --dir test")).toBe(true);
  });
  it("matches jest", () => {
    expect(jsFilter.matches("jest --coverage")).toBe(true);
  });
  it("matches npx jest", () => {
    expect(jsFilter.matches("npx jest")).toBe(true);
  });
  it("matches bun test", () => {
    expect(jsFilter.matches("bun test")).toBe(true);
  });
  it("matches npm test", () => {
    expect(jsFilter.matches("npm test")).toBe(true);
  });
  it("matches pnpm test", () => {
    expect(jsFilter.matches("pnpm test")).toBe(true);
  });
  it("matches bun run test", () => {
    expect(jsFilter.matches("bun run test")).toBe(true);
  });
  it("matches yarn test", () => {
    expect(jsFilter.matches("yarn test")).toBe(true);
  });
  it("does not match unrelated", () => {
    expect(jsFilter.matches("git status")).toBe(false);
    expect(jsFilter.matches("pytest")).toBe(false);
    expect(jsFilter.matches("cargo test")).toBe(false);
  });
});

// ── Vitest output ────────────────────────────────────────────────

const VITEST_ALL_PASS = `
 RUN  v3.2.4 /Users/dev/project

 ✓ test/utils.test.ts (51 tests) 6ms
 ✓ test/config.test.ts (28 tests) 30ms
 ✓ test/matcher.test.ts (113 tests) 8ms
 ✓ test/integration.test.ts (22 tests) 19ms
 ✓ test/git-status.test.ts (17 tests) 4ms
 ✓ test/git-diff.test.ts (19 tests) 5ms
 ✓ test/git-log.test.ts (14 tests) 6ms
 ✓ test/git-action.test.ts (18 tests) 5ms
 ✓ test/git-branch.test.ts (14 tests) 4ms
 ✓ test/tee.test.ts (19 tests) 21ms
 ✓ test/tracker.test.ts (19 tests) 33ms
 ✓ test/ls.test.ts (32 tests) 14ms

 Test Files  12 passed (12)
      Tests  366 passed (366)
   Start at  11:20:13
   Duration  526ms (transform 1.04s, setup 0ms, collect 1.61s, tests 155ms, environment 2ms, prepare 981ms)
`;

const VITEST_FAILURES = `
 RUN  v3.2.4 /Users/dev/project

 ✓ test/utils.test.ts (51 tests) 6ms
 ✗ test/config.test.ts (28 tests) 30ms
   ✗ config resolution > resolves env over defaults
     AssertionError: expected true to be false
      at /Users/dev/project/test/config.test.ts:42:18
      at processTicksAndRejections (node:internal/process/task_queues:95:5)
   ✗ config resolution > handles missing settings file
     TypeError: Cannot read properties of undefined (reading 'filters')
      at resolveConfig (/Users/dev/project/src/config.ts:98:22)
      at /Users/dev/project/test/config.test.ts:55:18
      at processTicksAndRejections (node:internal/process/task_queues:95:5)
 ✓ test/matcher.test.ts (113 tests) 8ms
 ✗ test/integration.test.ts (22 tests) 19ms
   ✗ full pipeline > processes git status
     Error: Expected filter result to contain branch
      at Object.<anonymous> (/Users/dev/project/test/integration.test.ts:88:14)
      at Promise.then.completed (/Users/dev/project/node_modules/jest-circus/build/utils.js:298:28)

 Test Files  2 failed | 10 passed (12)
      Tests  3 failed | 360 passed | 3 skipped (366)
   Start at  11:20:13
   Duration  526ms (transform 1.04s, setup 0ms, collect 1.61s, tests 155ms, environment 2ms, prepare 981ms)
`;

describe("test-js vitest all-pass (VAL-TOOL-006)", () => {
  it("produces single summary line", () => {
    const result = jsFilter.apply("vitest run", VITEST_ALL_PASS);
    expect(result.filtered).toMatch(/^✓ \d+ suites, \d+ tests passed/);
    expect(result.filtered).not.toContain("\n");
    expect(result.filtered).toContain("366 tests passed");
    expect(result.filtered).toContain("12 suites");
  });
});

describe("test-js vitest with failures (VAL-TOOL-005)", () => {
  it("compacts output with failure details and >90% savings", () => {
    const result = jsFilter.apply("vitest run", VITEST_FAILURES);
    expect(result.filtered).toMatch(/^✗/);
    expect(result.filtered).toContain("3 failed");
    expect(result.filtered).toContain("360 passed");
    expect(result.filtered).toContain("3 skipped");
    expect(result.filtered).toContain("FAILED:");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.5);
  });

  it("includes failed test names", () => {
    const result = jsFilter.apply("vitest run", VITEST_FAILURES);
    expect(result.filtered).toContain("resolves env over defaults");
  });
});

describe("test-js strips stack traces (VAL-TOOL-007)", () => {
  it("does not include full stack trace paths", () => {
    const result = jsFilter.apply("vitest run", VITEST_FAILURES);
    // Should NOT contain the full stack trace lines
    expect(result.filtered).not.toContain("processTicksAndRejections");
    expect(result.filtered).not.toContain("node:internal");
  });

  it("preserves first file:line reference", () => {
    const result = jsFilter.apply("vitest run", VITEST_FAILURES);
    // Should contain a file:line reference
    expect(result.filtered).toMatch(/\.(ts|js):\d+/);
  });
});

// ── Jest output ────────────────────────────────────────────────

const JEST_ALL_PASS = `
PASS src/__tests__/App.test.tsx (5.234 s)
PASS src/__tests__/utils.test.ts
PASS src/__tests__/api.test.ts (2.567 s)
PASS src/__tests__/hooks.test.ts
PASS src/__tests__/components/Button.test.tsx
PASS src/__tests__/components/Modal.test.tsx
PASS src/__tests__/components/Form.test.tsx
PASS src/__tests__/services/auth.test.ts
PASS src/__tests__/services/api.test.ts (3.456 s)
PASS src/__tests__/services/cache.test.ts

Test Suites: 10 passed, 10 total
Tests:       150 passed, 150 total
Snapshots:   0 total
Time:        8.234 s
Ran all test suites.
`;

const JEST_FAILURES = `
PASS src/__tests__/utils.test.ts
FAIL src/__tests__/App.test.tsx
  ● App > renders without crashing

    expect(received).toBe(expected)

    Expected: true
    Received: false

      12 |     render(<App />);
      13 |     const element = screen.getByText('Hello');
    > 14 |     expect(element).toBe(true);
         |                     ^
      15 |   });
      16 | });

      at Object.<anonymous> (src/__tests__/App.test.tsx:14:21)
      at processTicksAndRejections (node:internal/process/task_queues:95:5)

  ● App > handles navigation

    TypeError: Cannot read properties of null (reading 'click')

      22 |   render(<App />);
    > 23 |   fireEvent.click(screen.getByRole('button'));
         |            ^
      24 | });

      at Object.<anonymous> (src/__tests__/App.test.tsx:23:12)
      at processTicksAndRejections (node:internal/process/task_queues:95:5)
      at node_modules/react-dom/cjs/react-dom.development.js:3456:12

FAIL src/__tests__/api.test.ts
  ● fetchData > handles timeout

    Error: Timeout - Async callback was not invoked within 5000ms

      at waitForTimeout (node_modules/jest-jasmine2/build/queueRunner.js:68:21)

PASS src/__tests__/hooks.test.ts
PASS src/__tests__/components/Button.test.tsx
PASS src/__tests__/components/Modal.test.tsx
PASS src/__tests__/components/Form.test.tsx
PASS src/__tests__/services/auth.test.ts
PASS src/__tests__/services/api.test.ts
PASS src/__tests__/services/cache.test.ts

Test Suites: 2 failed, 8 passed, 10 total
Tests:       3 failed, 145 passed, 2 skipped, 150 total
Snapshots:   0 total
Time:        12.456 s
Ran all test suites.
`;

describe("test-js jest all-pass", () => {
  it("produces single summary line", () => {
    const result = jsFilter.apply("jest", JEST_ALL_PASS);
    expect(result.filtered).toMatch(/^✓/);
    expect(result.filtered).not.toContain("\n");
    expect(result.filtered).toContain("150 tests passed");
    expect(result.filtered).toContain("10 suites");
  });
});

describe("test-js jest with failures", () => {
  it("shows failure summary with >90% savings", () => {
    const result = jsFilter.apply("jest", JEST_FAILURES);
    expect(result.filtered).toMatch(/^✗/);
    expect(result.filtered).toContain("3 failed");
    expect(result.filtered).toContain("145 passed");
    expect(result.filtered).toContain("FAILED:");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.5);
  });

  it("strips stack traces from jest output", () => {
    const result = jsFilter.apply("jest", JEST_FAILURES);
    expect(result.filtered).not.toContain("processTicksAndRejections");
    expect(result.filtered).not.toContain("node:internal");
    expect(result.filtered).not.toContain("react-dom");
  });
});

// ── Bun test output ──────────────────────────────────────────────

const BUN_ALL_PASS = `
bun test v1.3.10 (c12345abc)

test/utils.test.ts:
✓ stripAnsi removes SGR codes [0.12ms]
✓ stripAnsi removes OSC 8 hyperlinks [0.05ms]
✓ estimateTokens handles empty string [0.01ms]
✓ estimateTokens returns consistent results [0.02ms]

test/config.test.ts:
✓ defaults used when nothing set [0.08ms]
✓ settings override defaults [0.15ms]
✓ env var overrides settings [0.03ms]

test/matcher.test.ts:
✓ matches git status [0.01ms]
✓ matches git diff [0.01ms]
✓ matches vitest [0.01ms]
✓ matches pytest [0.01ms]
✓ matches cargo test [0.01ms]
✓ matches go test [0.01ms]

13 pass
0 fail
Ran 13 tests across 3 files. [520.00ms]
`;

const BUN_FAILURES = `
bun test v1.3.10 (c12345abc)

test/utils.test.ts:
✓ stripAnsi removes SGR codes [0.12ms]
✓ stripAnsi removes OSC 8 hyperlinks [0.05ms]
✗ estimateTokens handles empty string
  AssertionError: expected 0 to be 1
    at /Users/dev/project/test/utils.test.ts:42:18
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

test/config.test.ts:
✓ defaults used when nothing set [0.08ms]
✗ settings override defaults
  Error: ENOENT: no such file or directory, open '/tmp/settings.json'
    at Object.openSync (node:fs:603:3)
    at /Users/dev/project/test/config.test.ts:27:12

test/matcher.test.ts:
✓ matches git status [0.01ms]
✓ matches git diff [0.01ms]
✓ matches vitest [0.01ms]
✓ matches pytest [0.01ms]
✓ matches cargo test [0.01ms]
✓ matches go test [0.01ms]
✓ matches npm test [0.01ms]
✓ matches bun test [0.01ms]
✓ returns null for unknown [0.01ms]

13 pass
2 fail
Ran 15 tests across 3 files. [680.00ms]
`;

describe("test-js bun test all-pass", () => {
  it("produces single summary line", () => {
    const result = jsFilter.apply("bun test", BUN_ALL_PASS);
    expect(result.filtered).toMatch(/^✓/);
    expect(result.filtered).not.toContain("\n");
    expect(result.filtered).toContain("13 tests passed");
  });
});

describe("test-js bun test with failures", () => {
  it("shows failure summary", () => {
    const result = jsFilter.apply("bun test", BUN_FAILURES);
    expect(result.filtered).toMatch(/^✗/);
    expect(result.filtered).toContain("2 failed");
    expect(result.filtered).toContain("13 pass");
    expect(result.filtered).toContain("FAILED:");
  });

  it("strips stack traces from bun output", () => {
    const result = jsFilter.apply("bun test", BUN_FAILURES);
    expect(result.filtered).not.toContain("processTicksAndRejections");
    expect(result.filtered).not.toContain("node:internal");
    expect(result.filtered).not.toContain("node:fs");
  });
});

// ── Large vitest output for savings test ──────────────────────────

function generateLargeVitestOutput(numSuites: number, testsPerSuite: number, numFailed: number): string {
  const lines: string[] = [` RUN  v3.2.4 /Users/dev/project`, ""];
  let totalTests = 0;
  let failedCount = 0;

  for (let s = 0; s < numSuites; s++) {
    const suiteName = `test/suite-${s}.test.ts`;
    const passed = s < numFailed ? testsPerSuite - 1 : testsPerSuite;

    if (s < numFailed) {
      lines.push(` ✗ ${suiteName} (${testsPerSuite} tests) ${s + 1}ms`);
      lines.push(`   ✗ test case that fails in suite ${s}`);
      lines.push(`     AssertionError: expected "foo" to be "bar"`);
      lines.push(`      at /Users/dev/project/${suiteName}:${10 + s}:18`);
      lines.push(`      at processTicksAndRejections (node:internal/process/task_queues:95:5)`);
      lines.push(`      at runTest (node_modules/vitest/dist/runner.js:100:5)`);
      lines.push(`      at processEach (node_modules/vitest/dist/runner.js:200:3)`);
      lines.push(`      at /Users/dev/project/node_modules/vitest/dist/runner.js:300:8`);
      failedCount++;
    } else {
      lines.push(` ✓ ${suiteName} (${testsPerSuite} tests) ${s + 1}ms`);
    }

    // Add individual test output lines (verbose mode)
    for (let t = 0; t < testsPerSuite; t++) {
      if (s < numFailed && t === 0) continue; // already shown above
      lines.push(`   ✓ test case ${t} in suite ${s} [0.${t}ms]`);
    }

    totalTests += testsPerSuite;
  }

  const totalPassed = totalTests - failedCount;
  lines.push("");
  if (failedCount > 0) {
    lines.push(` Test Files  ${failedCount} failed | ${numSuites - failedCount} passed (${numSuites})`);
    lines.push(`      Tests  ${failedCount} failed | ${totalPassed} passed (${totalTests})`);
  } else {
    lines.push(` Test Files  ${numSuites} passed (${numSuites})`);
    lines.push(`      Tests  ${totalTests} passed (${totalTests})`);
  }
  lines.push(`   Start at  11:20:13`);
  lines.push(`   Duration  526ms (transform 1.04s, setup 0ms, collect 1.61s, tests 155ms, environment 2ms, prepare 981ms)`);

  return lines.join("\n");
}

describe("test-js savings on large output", () => {
  it("achieves >90% savings on failure with large vitest output (VAL-TOOL-005)", () => {
    const raw = generateLargeVitestOutput(20, 30, 3);
    const result = jsFilter.apply("vitest run", raw);
    expect(result.filtered).toContain("FAILED:");
    expect(result.filtered).toContain("3 failed");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.9);
  });

  it("achieves good savings on all-pass large output", () => {
    const raw = generateLargeVitestOutput(20, 30, 0);
    const result = jsFilter.apply("vitest run", raw);
    expect(result.filtered).toMatch(/^✓/);
    expect(result.filtered).not.toContain("\n");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.9);
  });
});

// ═══════════════════════════════════════════════════════════════════
// test-py filter (pytest)
// ═══════════════════════════════════════════════════════════════════

const pyFilter = createTestPyFilter();

describe("test-py matching", () => {
  it("matches pytest", () => {
    expect(pyFilter.matches("pytest")).toBe(true);
  });
  it("matches pytest with args", () => {
    expect(pyFilter.matches("pytest tests/ -v")).toBe(true);
  });
  it("matches python -m pytest", () => {
    expect(pyFilter.matches("python -m pytest")).toBe(true);
  });
  it("matches python3 -m pytest", () => {
    expect(pyFilter.matches("python3 -m pytest tests/")).toBe(true);
  });
  it("does not match unrelated", () => {
    expect(pyFilter.matches("vitest")).toBe(false);
    expect(pyFilter.matches("cargo test")).toBe(false);
  });
});

const PYTEST_ALL_PASS = `
============================= test session starts ==============================
platform linux -- Python 3.11.5, pytest-7.4.3, pluggy-1.3.0
rootdir: /home/dev/project
collected 42 items

tests/test_utils.py ............                                         [ 28%]
tests/test_api.py ..........                                             [ 52%]
tests/test_models.py ..............                                      [ 85%]
tests/test_views.py ......                                               [100%]

============================== 42 passed in 1.23s ==============================
`;

const PYTEST_FAILURES = `
============================= test session starts ==============================
platform linux -- Python 3.11.5, pytest-7.4.3, pluggy-1.3.0
rootdir: /home/dev/project
collected 42 items

tests/test_utils.py ............                                         [ 28%]
tests/test_api.py ..F.F.....                                             [ 52%]
tests/test_models.py ..............                                      [ 85%]
tests/test_views.py ......                                               [100%]

=================================== FAILURES ===================================
_________________________________ test_fetch ________________________________

    def test_fetch():
        result = fetch_data("http://example.com")
>       assert result.status == 200
E       AssertionError: assert 404 == 200
E        +  where 404 = Response(status=404).status

tests/test_api.py:42: AssertionError
________________________________ test_timeout _________________________________

    def test_timeout():
        with pytest.raises(TimeoutError):
>           fetch_data("http://slow.example.com", timeout=0.001)
E           Failed: DID NOT RAISE <class 'TimeoutError'>

tests/test_api.py:58: Failed
=========================== short test summary info ============================
FAILED tests/test_api.py::test_fetch - AssertionError: assert 404 == 200
FAILED tests/test_api.py::test_timeout - Failed: DID NOT RAISE <class 'TimeoutError'>
============================== 2 failed, 38 passed, 2 skipped in 2.45s ==============================
`;

describe("test-py all-pass single line (VAL-TOOL-009)", () => {
  it("produces single summary line", () => {
    const result = pyFilter.apply("pytest", PYTEST_ALL_PASS);
    expect(result.filtered).toMatch(/^✓/);
    expect(result.filtered).not.toContain("\n");
    expect(result.filtered).toContain("42 tests passed");
    expect(result.filtered).toContain("1.23s");
  });
});

describe("test-py with failures (VAL-TOOL-008)", () => {
  it("compacts with >80% savings", () => {
    const result = pyFilter.apply("pytest", PYTEST_FAILURES);
    expect(result.filtered).toMatch(/^✗/);
    expect(result.filtered).toContain("2 failed");
    expect(result.filtered).toContain("38 passed");
    expect(result.filtered).toContain("2 skipped");
    expect(result.filtered).toContain("FAILED:");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.5);
  });

  it("includes failed test names", () => {
    const result = pyFilter.apply("pytest", PYTEST_FAILURES);
    expect(result.filtered).toContain("test_fetch");
    expect(result.filtered).toContain("test_timeout");
  });

  it("includes file:line references", () => {
    const result = pyFilter.apply("pytest", PYTEST_FAILURES);
    expect(result.filtered).toMatch(/test_api\.py:\d+/);
  });

  it("strips verbose traceback", () => {
    const result = pyFilter.apply("pytest", PYTEST_FAILURES);
    expect(result.filtered).not.toContain("def test_fetch():");
    expect(result.filtered).not.toContain("result = fetch_data");
    expect(result.filtered).not.toContain("platform linux");
    expect(result.filtered).not.toContain("rootdir:");
  });
});

// Large pytest output for savings test
function generateLargePytestOutput(numFiles: number, testsPerFile: number, numFailed: number): string {
  const lines: string[] = [
    "============================= test session starts ==============================",
    "platform linux -- Python 3.11.5, pytest-7.4.3, pluggy-1.3.0",
    "rootdir: /home/dev/project",
    `collected ${numFiles * testsPerFile} items`,
    "",
  ];

  for (let f = 0; f < numFiles; f++) {
    const dots = ".".repeat(testsPerFile);
    lines.push(`tests/test_module_${f}.py ${dots}     [${Math.floor(((f + 1) / numFiles) * 100)}%]`);
  }

  const totalTests = numFiles * testsPerFile;
  const passed = totalTests - numFailed;

  if (numFailed > 0) {
    lines.push("");
    lines.push("=================================== FAILURES ===================================");

    for (let i = 0; i < numFailed; i++) {
      lines.push(`_________________________________ test_failure_${i} _________________________________`);
      lines.push("");
      lines.push(`    def test_failure_${i}():`);
      lines.push(`        result = compute(${i})`);
      lines.push(`>       assert result == expected_${i}`);
      lines.push(`E       AssertionError: assert ${i} == ${i + 1}`);
      lines.push(`E        +  where ${i} = compute(${i})`);
      lines.push("");
      lines.push(`tests/test_module_0.py:${42 + i * 10}: AssertionError`);
    }

    lines.push("=========================== short test summary info ============================");
    for (let i = 0; i < numFailed; i++) {
      lines.push(`FAILED tests/test_module_0.py::test_failure_${i} - AssertionError: assert ${i} == ${i + 1}`);
    }
    lines.push(`============================== ${numFailed} failed, ${passed} passed in 5.67s ==============================`);
  } else {
    lines.push(`============================== ${totalTests} passed in 3.45s ==============================`);
  }

  return lines.join("\n");
}

describe("test-py large output savings", () => {
  it("achieves >80% savings on large failure output (VAL-TOOL-008)", () => {
    const raw = generateLargePytestOutput(15, 20, 5);
    const result = pyFilter.apply("pytest", raw);
    expect(result.filtered).toContain("FAILED:");
    expect(result.filtered).toContain("5 failed");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });

  it("achieves high savings on large all-pass output", () => {
    const raw = generateLargePytestOutput(15, 20, 0);
    const result = pyFilter.apply("pytest", raw);
    expect(result.filtered).toMatch(/^✓/);
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// test-rs filter (cargo test)
// ═══════════════════════════════════════════════════════════════════

const rsFilter = createTestRsFilter();

describe("test-rs matching", () => {
  it("matches cargo test", () => {
    expect(rsFilter.matches("cargo test")).toBe(true);
  });
  it("matches cargo test with args", () => {
    expect(rsFilter.matches("cargo test -- --nocapture")).toBe(true);
  });
  it("does not match unrelated", () => {
    expect(rsFilter.matches("cargo build")).toBe(false);
    expect(rsFilter.matches("vitest")).toBe(false);
  });
});

const CARGO_ALL_PASS = `
   Compiling myproject v0.1.0 (/home/dev/project)
    Finished test [unoptimized + debuginfo] target(s) in 2.34s
     Running unittests src/lib.rs (target/debug/deps/myproject-abc123)

running 15 tests
test utils::test_strip ... ok
test utils::test_parse ... ok
test utils::test_format ... ok
test config::test_defaults ... ok
test config::test_override ... ok
test config::test_env ... ok
test matcher::test_git ... ok
test matcher::test_ls ... ok
test matcher::test_grep ... ok
test matcher::test_docker ... ok
test matcher::test_npm ... ok
test api::test_create ... ok
test api::test_read ... ok
test api::test_update ... ok
test api::test_delete ... ok

test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.52s

     Running unittests src/main.rs (target/debug/deps/myproject-def456)

running 3 tests
test integration::test_startup ... ok
test integration::test_shutdown ... ok
test integration::test_lifecycle ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.12s

   Doc-tests myproject

running 2 tests
test src/lib.rs - example (line 15) ... ok
test src/api.rs - create (line 42) ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.23s
`;

const CARGO_FAILURES = `
   Compiling myproject v0.1.0 (/home/dev/project)
    Finished test [unoptimized + debuginfo] target(s) in 2.34s
     Running unittests src/lib.rs (target/debug/deps/myproject-abc123)

running 15 tests
test utils::test_strip ... ok
test utils::test_parse ... ok
test utils::test_format ... FAILED
test config::test_defaults ... ok
test config::test_override ... FAILED
test config::test_env ... ok
test matcher::test_git ... ok
test matcher::test_ls ... ok
test matcher::test_grep ... ok
test matcher::test_docker ... ok
test matcher::test_npm ... ok
test api::test_create ... ok
test api::test_read ... ok
test api::test_update ... ok
test api::test_delete ... ok

failures:

---- utils::test_format stdout ----
thread 'utils::test_format' panicked at 'assertion failed: expected "hello" but got "world"', src/utils.rs:42:9
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace
stack backtrace:
   0: rust_begin_unwind
             at /rustc/xxxxx/library/std/src/panicking.rs:578:5
   1: core::panicking::panic_fmt
             at /rustc/xxxxx/library/core/src/panicking.rs:67:14
   2: myproject::utils::test_format
             at ./src/utils.rs:42:9
   3: myproject::utils::test_format::{{closure}}
             at ./src/utils.rs:38:23

---- config::test_override stdout ----
thread 'config::test_override' panicked at 'called Result::unwrap() on an Err value: IoError("not found")', src/config.rs:98:22
stack backtrace:
   0: rust_begin_unwind
   1: core::panicking::panic_fmt
   2: core::result::unwrap_failed

failures:
    utils::test_format
    config::test_override

test result: FAILED. 13 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.52s
`;

describe("test-rs all-pass (VAL-TOOL-010)", () => {
  it("produces single summary line with suite count", () => {
    const result = rsFilter.apply("cargo test", CARGO_ALL_PASS);
    expect(result.filtered).toMatch(/^✓/);
    expect(result.filtered).not.toContain("\n");
    expect(result.filtered).toContain("20 tests passed");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });
});

describe("test-rs with failures", () => {
  it("compacts with >80% savings (VAL-TOOL-010)", () => {
    const result = rsFilter.apply("cargo test", CARGO_FAILURES);
    expect(result.filtered).toMatch(/^✗/);
    expect(result.filtered).toContain("2 failed");
    expect(result.filtered).toContain("13 passed");
    expect(result.filtered).toContain("FAILED:");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.5);
  });

  it("includes failed test names", () => {
    const result = rsFilter.apply("cargo test", CARGO_FAILURES);
    expect(result.filtered).toContain("utils::test_format");
    expect(result.filtered).toContain("config::test_override");
  });

  it("includes file:line references", () => {
    const result = rsFilter.apply("cargo test", CARGO_FAILURES);
    expect(result.filtered).toMatch(/\.rs:\d+/);
  });

  it("strips stack traces", () => {
    const result = rsFilter.apply("cargo test", CARGO_FAILURES);
    expect(result.filtered).not.toContain("rust_begin_unwind");
    expect(result.filtered).not.toContain("core::panicking");
    expect(result.filtered).not.toContain("stack backtrace:");
    expect(result.filtered).not.toContain("core::result::unwrap_failed");
  });
});

// Large cargo test output for savings
function generateLargeCargoOutput(numTests: number, numFailed: number): string {
  const lines: string[] = [
    "   Compiling myproject v0.1.0 (/home/dev/project)",
    "    Finished test [unoptimized + debuginfo] target(s) in 2.34s",
    "     Running unittests src/lib.rs (target/debug/deps/myproject-abc123)",
    "",
    `running ${numTests} tests`,
  ];

  for (let i = 0; i < numTests; i++) {
    const status = i < numFailed ? "FAILED" : "ok";
    lines.push(`test module_${Math.floor(i / 5)}::test_${i} ... ${status}`);
  }

  if (numFailed > 0) {
    lines.push("");
    lines.push("failures:");
    lines.push("");

    for (let i = 0; i < numFailed; i++) {
      lines.push(`---- module_${Math.floor(i / 5)}::test_${i} stdout ----`);
      lines.push(`thread 'module_${Math.floor(i / 5)}::test_${i}' panicked at 'assertion failed: expected ${i} but got ${i + 1}', src/module_${Math.floor(i / 5)}.rs:${42 + i}:9`);
      lines.push("note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace");
      lines.push("stack backtrace:");
      lines.push("   0: rust_begin_unwind");
      lines.push("   1: core::panicking::panic_fmt");
      lines.push(`   2: myproject::module_${Math.floor(i / 5)}::test_${i}`);
      lines.push("");
    }

    lines.push("failures:");
    for (let i = 0; i < numFailed; i++) {
      lines.push(`    module_${Math.floor(i / 5)}::test_${i}`);
    }
    lines.push("");
  }

  const passed = numTests - numFailed;
  const status = numFailed > 0 ? "FAILED" : "ok";
  lines.push(`test result: ${status}. ${passed} passed; ${numFailed} failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.52s`);

  return lines.join("\n");
}

describe("test-rs large output savings", () => {
  it("achieves >80% savings on large failure output", () => {
    const raw = generateLargeCargoOutput(200, 5);
    const result = rsFilter.apply("cargo test", raw);
    expect(result.filtered).toContain("FAILED:");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });

  it("achieves >80% savings on large all-pass output", () => {
    const raw = generateLargeCargoOutput(200, 0);
    const result = rsFilter.apply("cargo test", raw);
    expect(result.filtered).toMatch(/^✓/);
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// test-go filter (go test)
// ═══════════════════════════════════════════════════════════════════

const goFilter = createTestGoFilter();

describe("test-go matching", () => {
  it("matches go test", () => {
    expect(goFilter.matches("go test")).toBe(true);
  });
  it("matches go test with args", () => {
    expect(goFilter.matches("go test ./... -v")).toBe(true);
  });
  it("does not match unrelated", () => {
    expect(goFilter.matches("go build")).toBe(false);
    expect(goFilter.matches("vitest")).toBe(false);
  });
});

const GO_ALL_PASS = `
=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
=== RUN   TestSubtract
--- PASS: TestSubtract (0.00s)
=== RUN   TestMultiply
--- PASS: TestMultiply (0.00s)
=== RUN   TestDivide
--- PASS: TestDivide (0.00s)
=== RUN   TestDivideByZero
--- PASS: TestDivideByZero (0.00s)
=== RUN   TestParse
--- PASS: TestParse (0.00s)
=== RUN   TestFormat
--- PASS: TestFormat (0.00s)
=== RUN   TestValidate
--- PASS: TestValidate (0.00s)
=== RUN   TestSerialize
--- PASS: TestSerialize (0.00s)
=== RUN   TestDeserialize
--- PASS: TestDeserialize (0.00s)
PASS
ok  	github.com/user/project/pkg	0.234s
`;

const GO_FAILURES = `
=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
=== RUN   TestSubtract
--- PASS: TestSubtract (0.00s)
=== RUN   TestMultiply
--- PASS: TestMultiply (0.00s)
=== RUN   TestDivide
--- FAIL: TestDivide (0.00s)
    math_test.go:42: expected 5, got 4
    math_test.go:43: division result mismatch
=== RUN   TestDivideByZero
--- PASS: TestDivideByZero (0.00s)
=== RUN   TestParse
--- FAIL: TestParse (0.00s)
    parser_test.go:28: unexpected token at position 5
    parser_test.go:29: parse error: expected '}' but got ']'
    parser_test.go:30: full context: {"key": [1,2,3]}
=== RUN   TestFormat
--- PASS: TestFormat (0.00s)
=== RUN   TestValidate
--- PASS: TestValidate (0.00s)
=== RUN   TestSkipped
--- SKIP: TestSkipped (0.00s)
    utils_test.go:10: skipping in short mode
FAIL
FAIL	github.com/user/project/pkg	0.456s
`;

describe("test-go all-pass (VAL-TOOL-011)", () => {
  it("produces single summary line", () => {
    const result = goFilter.apply("go test ./...", GO_ALL_PASS);
    expect(result.filtered).toMatch(/^✓/);
    expect(result.filtered).not.toContain("\n");
    expect(result.filtered).toContain("10 tests passed");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.5);
  });
});

describe("test-go with failures", () => {
  it("compacts with failure details", () => {
    const result = goFilter.apply("go test ./...", GO_FAILURES);
    expect(result.filtered).toMatch(/^✗/);
    expect(result.filtered).toContain("2 failed");
    expect(result.filtered).toContain("FAILED:");
    expect(result.filtered).toContain("1 skipped");
  });

  it("includes failed test names", () => {
    const result = goFilter.apply("go test ./...", GO_FAILURES);
    expect(result.filtered).toContain("TestDivide");
    expect(result.filtered).toContain("TestParse");
  });

  it("includes file:line references", () => {
    const result = goFilter.apply("go test ./...", GO_FAILURES);
    expect(result.filtered).toMatch(/_test\.go:\d+/);
  });

  it("strips verbose test output lines", () => {
    const result = goFilter.apply("go test ./...", GO_FAILURES);
    // Should not contain the full verbose output
    expect(result.filtered).not.toContain("full context:");
    expect(result.filtered).not.toContain('{"key": [1,2,3]}');
  });
});

// Large go test output for savings
function generateLargeGoOutput(numTests: number, numFailed: number): string {
  const lines: string[] = [];

  for (let i = 0; i < numTests; i++) {
    const name = `TestFunction${i}`;
    lines.push(`=== RUN   ${name}`);

    if (i < numFailed) {
      lines.push(`--- FAIL: ${name} (0.0${i}s)`);
      lines.push(`    module_test.go:${42 + i}: expected ${i}, got ${i + 1}`);
      lines.push(`    module_test.go:${43 + i}: additional context for failure ${i}`);
      lines.push(`    module_test.go:${44 + i}: more debug info here`);
    } else {
      lines.push(`--- PASS: ${name} (0.0${i % 10}s)`);
    }
  }

  if (numFailed > 0) {
    lines.push("FAIL");
    lines.push(`FAIL\tgithub.com/user/project/pkg\t1.234s`);
  } else {
    lines.push("PASS");
    lines.push(`ok  \tgithub.com/user/project/pkg\t0.987s`);
  }

  return lines.join("\n");
}

describe("test-go large output savings", () => {
  it("achieves >80% savings on large failure output (VAL-TOOL-011)", () => {
    const raw = generateLargeGoOutput(50, 5);
    const result = goFilter.apply("go test ./...", raw);
    expect(result.filtered).toContain("FAILED:");
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });

  it("achieves >80% savings on large all-pass output", () => {
    const raw = generateLargeGoOutput(50, 0);
    const result = goFilter.apply("go test ./...", raw);
    expect(result.filtered).toMatch(/^✓/);
    const savings = 1 - result.filteredChars / result.rawChars;
    expect(savings).toBeGreaterThan(0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Registry integration
// ═══════════════════════════════════════════════════════════════════

describe("filter registry integration", () => {
  it("all test runner filters are registered", async () => {
    const { findFilter } = await import("../src/filters/index.js");
    const { DEFAULTS } = await import("../src/config.js");

    expect(findFilter("vitest run", DEFAULTS)).toBeTruthy();
    expect(findFilter("vitest run", DEFAULTS)!.name).toBe("test-js");

    expect(findFilter("jest --coverage", DEFAULTS)).toBeTruthy();
    expect(findFilter("jest --coverage", DEFAULTS)!.name).toBe("test-js");

    expect(findFilter("bun test", DEFAULTS)).toBeTruthy();
    expect(findFilter("bun test", DEFAULTS)!.name).toBe("test-js");

    expect(findFilter("npm test", DEFAULTS)).toBeTruthy();
    expect(findFilter("npm test", DEFAULTS)!.name).toBe("test-js");

    expect(findFilter("pytest tests/", DEFAULTS)).toBeTruthy();
    expect(findFilter("pytest tests/", DEFAULTS)!.name).toBe("test-py");

    expect(findFilter("python -m pytest", DEFAULTS)).toBeTruthy();
    expect(findFilter("python -m pytest", DEFAULTS)!.name).toBe("test-py");

    expect(findFilter("cargo test", DEFAULTS)).toBeTruthy();
    expect(findFilter("cargo test", DEFAULTS)!.name).toBe("test-rs");

    expect(findFilter("go test ./...", DEFAULTS)).toBeTruthy();
    expect(findFilter("go test ./...", DEFAULTS)!.name).toBe("test-go");
  });
});
