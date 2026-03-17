import { describe, it, expect } from "vitest";
import { matchCommand } from "../src/matcher.js";

describe("matchCommand", () => {
  // ── Git subcommands (VAL-CORE-004) ──────────────────────────────

  describe("git subcommands", () => {
    it("matches git status", () => {
      const result = matchCommand("git status");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-status");
      expect(result!.confidence).toBeGreaterThan(0);
    });

    it("matches git status with flags", () => {
      const result = matchCommand("git status -s");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-status");
    });

    it("matches git diff", () => {
      const result = matchCommand("git diff");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-diff");
    });

    it("matches git diff --cached", () => {
      const result = matchCommand("git diff --cached");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-diff");
    });

    it("matches git diff --staged", () => {
      const result = matchCommand("git diff --staged");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-diff");
    });

    it("matches git diff with path", () => {
      const result = matchCommand("git diff src/foo.ts");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-diff");
    });

    it("matches git log", () => {
      const result = matchCommand("git log");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-log");
    });

    it("matches git log with flags", () => {
      const result = matchCommand("git log --oneline -20");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-log");
    });

    it("matches git push", () => {
      const result = matchCommand("git push");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git push with remote and branch", () => {
      const result = matchCommand("git push origin main");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git pull", () => {
      const result = matchCommand("git pull");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git fetch", () => {
      const result = matchCommand("git fetch");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git fetch --all", () => {
      const result = matchCommand("git fetch --all");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git add", () => {
      const result = matchCommand("git add .");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git add with files", () => {
      const result = matchCommand("git add src/foo.ts src/bar.ts");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git commit", () => {
      const result = matchCommand("git commit -m 'initial'");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-action");
    });

    it("matches git branch", () => {
      const result = matchCommand("git branch");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-branch");
    });

    it("matches git branch -a", () => {
      const result = matchCommand("git branch -a");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-branch");
    });

    // git stash — no filter exists yet, so matcher should not match
    it("returns null for git stash (no filter registered)", () => {
      expect(matchCommand("git stash")).toBeNull();
    });

    it("returns null for git stash pop (no filter registered)", () => {
      expect(matchCommand("git stash pop")).toBeNull();
    });

    it("returns null for git stash list (no filter registered)", () => {
      expect(matchCommand("git stash list")).toBeNull();
    });
  });

  // ── ls/find/fd/tree/exa/eza (VAL-CORE-005) ─────────────────────

  describe("ls/find/fd/tree/exa/eza variants", () => {
    it("matches ls", () => {
      const result = matchCommand("ls");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("ls");
    });

    it("matches ls -la", () => {
      const result = matchCommand("ls -la");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("ls");
    });

    it("matches ls with path", () => {
      const result = matchCommand("ls src/");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("ls");
    });

    it("matches exa", () => {
      const result = matchCommand("exa --long");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("ls");
    });

    it("matches eza", () => {
      const result = matchCommand("eza --tree");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("ls");
    });

    it("matches find", () => {
      const result = matchCommand('find . -name "*.ts"');
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("find");
    });

    it("matches fd", () => {
      const result = matchCommand("fd .ts");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("find");
    });

    it("matches fd with flags", () => {
      const result = matchCommand("fd -e ts -t f");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("find");
    });

    it("matches tree", () => {
      const result = matchCommand("tree");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("tree");
    });

    it("matches tree with depth", () => {
      const result = matchCommand("tree -L 3");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("tree");
    });
  });

  // ── Test runners (VAL-CORE-006) ─────────────────────────────────

  describe("test runner variants", () => {
    it("matches bun test", () => {
      const result = matchCommand("bun test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches bun run test", () => {
      const result = matchCommand("bun run test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches vitest", () => {
      const result = matchCommand("vitest");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches vitest run", () => {
      const result = matchCommand("vitest run");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches jest", () => {
      const result = matchCommand("jest");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches jest with pattern", () => {
      const result = matchCommand("jest --testPathPattern matcher");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches npm test", () => {
      const result = matchCommand("npm test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches npm run test", () => {
      const result = matchCommand("npm run test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches pnpm test", () => {
      const result = matchCommand("pnpm test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches pnpm run test", () => {
      const result = matchCommand("pnpm run test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("matches pytest", () => {
      const result = matchCommand("pytest");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-py");
    });

    it("matches pytest with flags", () => {
      const result = matchCommand("pytest -v --cov");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-py");
    });

    it("matches python -m pytest", () => {
      const result = matchCommand("python -m pytest");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-py");
    });

    it("matches python3 -m pytest", () => {
      const result = matchCommand("python3 -m pytest tests/");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-py");
    });

    it("matches cargo test", () => {
      const result = matchCommand("cargo test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-rs");
    });

    it("matches cargo test with filter", () => {
      const result = matchCommand("cargo test my_test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-rs");
    });

    it("matches go test", () => {
      const result = matchCommand("go test ./...");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-go");
    });

    it("matches go test with flags", () => {
      const result = matchCommand("go test -v -race ./pkg/...");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-go");
    });
  });

  // ── Linters (VAL-CORE-007) ──────────────────────────────────────

  describe("linter variants", () => {
    it("matches tsc", () => {
      const result = matchCommand("tsc");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-tsc");
    });

    it("matches tsc --noEmit", () => {
      const result = matchCommand("tsc --noEmit");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-tsc");
    });

    it("matches bunx tsc --noEmit", () => {
      const result = matchCommand("bunx tsc --noEmit");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-tsc");
    });

    it("matches npx tsc", () => {
      const result = matchCommand("npx tsc --noEmit");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-tsc");
    });

    it("matches eslint", () => {
      const result = matchCommand("eslint src/");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-js");
    });

    it("matches biome", () => {
      const result = matchCommand("biome check src/");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-js");
    });

    it("matches ruff", () => {
      const result = matchCommand("ruff check .");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-py");
    });

    it("matches ruff without subcommand", () => {
      const result = matchCommand("ruff .");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-py");
    });

    it("matches cargo clippy", () => {
      const result = matchCommand("cargo clippy");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-rs");
    });

    it("matches cargo clippy with flags", () => {
      const result = matchCommand("cargo clippy -- -W warnings");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-rs");
    });

    it("matches cargo build", () => {
      const result = matchCommand("cargo build");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-rs");
    });

    it("matches cargo build --release", () => {
      const result = matchCommand("cargo build --release");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("lint-rs");
    });
  });

  // ── Grep/rg (VAL-CORE-008) ─────────────────────────────────────

  describe("grep/rg variants", () => {
    it("matches rg with pattern", () => {
      const result = matchCommand('rg "pattern"');
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("grep");
    });

    it("matches rg -i pattern", () => {
      const result = matchCommand("rg -i pattern src/");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("grep");
    });

    it("matches grep -r", () => {
      const result = matchCommand('grep -r "pattern" .');
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("grep");
    });

    it("matches grep without flags", () => {
      const result = matchCommand('grep "foo" file.txt');
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("grep");
    });
  });

  // ── Docker/kubectl (VAL-CORE-009) ───────────────────────────────

  describe("docker/kubectl variants", () => {
    it("matches docker ps", () => {
      const result = matchCommand("docker ps");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("docker-list");
    });

    it("matches docker ps -a", () => {
      const result = matchCommand("docker ps -a");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("docker-list");
    });

    it("matches docker images", () => {
      const result = matchCommand("docker images");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("docker-list");
    });

    // docker compose — no filter exists yet, so matcher should not match
    it("returns null for docker compose (no filter registered)", () => {
      expect(matchCommand("docker compose up -d")).toBeNull();
    });

    it("returns null for docker compose ps (no filter registered)", () => {
      expect(matchCommand("docker compose ps")).toBeNull();
    });

    it("matches docker logs", () => {
      const result = matchCommand("docker logs mycontainer");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("docker-logs");
    });

    it("matches docker logs -f", () => {
      const result = matchCommand("docker logs -f mycontainer");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("docker-logs");
    });

    // kubectl — no filter exists yet, so matcher should not match
    it("returns null for kubectl get pods (no filter registered)", () => {
      expect(matchCommand("kubectl get pods")).toBeNull();
    });

    it("returns null for kubectl with namespace (no filter registered)", () => {
      expect(matchCommand("kubectl get pods -n production")).toBeNull();
    });

    it("returns null for kubectl describe (no filter registered)", () => {
      expect(matchCommand("kubectl describe pod my-pod")).toBeNull();
    });
  });

  // ── Package install (VAL-CORE-010) ──────────────────────────────

  describe("package install variants", () => {
    it("matches bun install", () => {
      const result = matchCommand("bun install");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches bun add", () => {
      const result = matchCommand("bun add vitest");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches npm install", () => {
      const result = matchCommand("npm install");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches npm install with package", () => {
      const result = matchCommand("npm install express");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches npm i (shorthand)", () => {
      const result = matchCommand("npm i");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches pnpm install", () => {
      const result = matchCommand("pnpm install");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches pnpm add", () => {
      const result = matchCommand("pnpm add zod");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches yarn install", () => {
      const result = matchCommand("yarn install");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches yarn add", () => {
      const result = matchCommand("yarn add express");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("npm-install");
    });

    it("matches pip install", () => {
      const result = matchCommand("pip install requests");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("pip-install");
    });

    it("matches pip install -r", () => {
      const result = matchCommand("pip install -r requirements.txt");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("pip-install");
    });

    it("matches pip3 install", () => {
      const result = matchCommand("pip3 install flask");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("pip-install");
    });
  });

  // ── HTTP (curl/wget/xh/http) ────────────────────────────────────

  describe("http variants", () => {
    it("matches curl", () => {
      const result = matchCommand("curl https://api.example.com");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("http");
    });

    it("matches curl with flags", () => {
      const result = matchCommand("curl -s -o /dev/null -w '%{http_code}' https://example.com");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("http");
    });

    it("matches wget", () => {
      const result = matchCommand("wget https://example.com/file.tar.gz");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("http");
    });

    it("matches xh", () => {
      const result = matchCommand("xh GET https://api.example.com/users");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("http");
    });

    it("matches http", () => {
      const result = matchCommand("http POST https://api.example.com/data");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("http");
    });
  });

  // ── Unmatched commands (VAL-CORE-011) ───────────────────────────

  describe("returns null for unmatched commands", () => {
    it("returns null for echo", () => {
      expect(matchCommand("echo hello")).toBeNull();
    });

    it("returns null for pwd", () => {
      expect(matchCommand("pwd")).toBeNull();
    });

    it("returns null for whoami", () => {
      expect(matchCommand("whoami")).toBeNull();
    });

    it("returns null for mkdir", () => {
      expect(matchCommand("mkdir -p src/lib")).toBeNull();
    });

    it("returns null for cp", () => {
      expect(matchCommand("cp file1.txt file2.txt")).toBeNull();
    });

    it("returns null for chmod", () => {
      expect(matchCommand("chmod 755 script.sh")).toBeNull();
    });

    it("returns null for mv", () => {
      expect(matchCommand("mv old.txt new.txt")).toBeNull();
    });

    it("returns null for rm", () => {
      expect(matchCommand("rm temp.txt")).toBeNull();
    });

    it("returns null for cat", () => {
      expect(matchCommand("cat file.txt")).toBeNull();
    });

    it("returns null for cd", () => {
      expect(matchCommand("cd /tmp")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(matchCommand("")).toBeNull();
    });

    it("returns null for whitespace only", () => {
      expect(matchCommand("   ")).toBeNull();
    });
  });

  // ── FilterMatch shape ───────────────────────────────────────────

  describe("FilterMatch object shape", () => {
    it("returns correct shape with filter, command, confidence", () => {
      const result = matchCommand("git status");
      expect(result).not.toBeNull();
      expect(result).toHaveProperty("filter");
      expect(result).toHaveProperty("command");
      expect(result).toHaveProperty("confidence");
      expect(typeof result!.filter).toBe("string");
      expect(typeof result!.command).toBe("string");
      expect(typeof result!.confidence).toBe("number");
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });

    it("command field contains the matched pattern", () => {
      const result = matchCommand("git diff --cached");
      expect(result).not.toBeNull();
      expect(result!.command).toBe("git diff --cached");
    });
  });

  // ── Edge cases with flags ───────────────────────────────────────

  describe("commands with various flags and arguments", () => {
    it("handles leading whitespace", () => {
      const result = matchCommand("  git status");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-status");
    });

    it("handles trailing whitespace", () => {
      const result = matchCommand("git status  ");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("git-status");
    });

    it("handles vitest with --dir flag", () => {
      const result = matchCommand("vitest run --dir test");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("handles bunx vitest", () => {
      const result = matchCommand("bunx vitest run");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    it("handles npx jest", () => {
      const result = matchCommand("npx jest --coverage");
      expect(result).not.toBeNull();
      expect(result!.filter).toBe("test-js");
    });

    // docker-compose (hyphenated) — no filter registered
    it("returns null for docker-compose hyphenated (no filter registered)", () => {
      expect(matchCommand("docker-compose up")).toBeNull();
    });

    // git stash apply — no filter registered
    it("returns null for git stash apply (no filter registered)", () => {
      expect(matchCommand("git stash apply")).toBeNull();
    });
  });
});
