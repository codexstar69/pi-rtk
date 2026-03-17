import { describe, it, expect } from "vitest";
import {
  stripAnsi,
  estimateTokens,
  isBinary,
  shouldFilter,
  extractBaseCommand,
  extractText,
} from "../src/utils.js";

// --- stripAnsi ---

describe("stripAnsi", () => {
  it("removes SGR color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("removes bold and other SGR sequences", () => {
    expect(stripAnsi("\x1b[1mbold\x1b[22m normal")).toBe("bold normal");
  });

  it("removes OSC 8 hyperlink sequences", () => {
    const input = "\x1b]8;;https://example.com\x1b\\link text\x1b]8;;\x1b\\";
    expect(stripAnsi(input)).toBe("link text");
  });

  it("removes mixed SGR and OSC 8 sequences", () => {
    const input = "\x1b[32m\x1b]8;;https://x.com\x1b\\green link\x1b]8;;\x1b\\\x1b[0m";
    expect(stripAnsi(input)).toBe("green link");
  });

  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("handles multiple SGR sequences in a row", () => {
    expect(stripAnsi("\x1b[1m\x1b[31m\x1b[4mtext\x1b[0m")).toBe("text");
  });
});

// --- estimateTokens ---

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 1 for 1-4 chars", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("returns 2 for 5-8 chars", () => {
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("handles large strings", () => {
    const large = "x".repeat(10000);
    expect(estimateTokens(large)).toBe(2500);
  });

  it("is deterministic", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const r1 = estimateTokens(text);
    const r2 = estimateTokens(text);
    expect(r1).toBe(r2);
  });

  it("ceil rounds up for non-multiples of 4", () => {
    // 3 chars -> ceil(3/4) = 1
    expect(estimateTokens("abc")).toBe(1);
    // 5 chars -> ceil(5/4) = 2
    expect(estimateTokens("abcde")).toBe(2);
  });
});

// --- isBinary ---

describe("isBinary", () => {
  it("detects null bytes as binary", () => {
    expect(isBinary("hello\x00world")).toBe(true);
  });

  it("returns false for normal text", () => {
    expect(isBinary("hello world")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isBinary("")).toBe(false);
  });

  it("detects null byte at position 0", () => {
    expect(isBinary("\x00start")).toBe(true);
  });

  it("detects null byte at position 999", () => {
    const text = "a".repeat(999) + "\x00" + "b".repeat(100);
    expect(isBinary(text)).toBe(true);
  });

  it("ignores null bytes beyond 1000 chars", () => {
    const text = "a".repeat(1000) + "\x00" + "b".repeat(100);
    expect(isBinary(text)).toBe(false);
  });

  it("handles unicode text without null bytes", () => {
    expect(isBinary("日本語テスト")).toBe(false);
  });
});

// --- shouldFilter ---

describe("shouldFilter", () => {
  it("returns true for simple commands", () => {
    expect(shouldFilter("git status")).toBe(true);
    expect(shouldFilter("ls -la")).toBe(true);
    expect(shouldFilter("npm test")).toBe(true);
  });

  it("returns false for pipes to head", () => {
    expect(shouldFilter("git log | head -20")).toBe(false);
  });

  it("returns false for pipes to tail", () => {
    expect(shouldFilter("cat file.log | tail -50")).toBe(false);
  });

  it("returns false for pipes to grep", () => {
    expect(shouldFilter("cat file | grep pattern")).toBe(false);
  });

  it("returns false for pipes to rg", () => {
    expect(shouldFilter("cat file | rg pattern")).toBe(false);
  });

  it("returns false for pipes to awk", () => {
    expect(shouldFilter("ls -la | awk '{print $1}'")).toBe(false);
  });

  it("returns false for pipes to sed", () => {
    expect(shouldFilter("echo hello | sed 's/h/H/'")).toBe(false);
  });

  it("returns false for pipes to jq", () => {
    expect(shouldFilter("curl api | jq .data")).toBe(false);
  });

  it("returns false for pipes to wc", () => {
    expect(shouldFilter("cat file | wc -l")).toBe(false);
  });

  it("returns false for pipes to sort", () => {
    expect(shouldFilter("ls | sort")).toBe(false);
  });

  it("returns false for pipes to uniq", () => {
    expect(shouldFilter("cat file | uniq")).toBe(false);
  });

  it("returns false for chained commands with &&", () => {
    expect(shouldFilter("cd dir && ls")).toBe(false);
  });

  it("returns false for chained commands with ||", () => {
    expect(shouldFilter("test -f file || echo missing")).toBe(false);
  });

  it("returns false for chained commands with ;", () => {
    expect(shouldFilter("echo a; echo b")).toBe(false);
  });

  it("returns false for redirects", () => {
    expect(shouldFilter("echo hello > file.txt")).toBe(false);
  });

  it("returns false for append redirects", () => {
    expect(shouldFilter("echo hello >> file.txt")).toBe(false);
  });

  it("returns false for subshells with $()", () => {
    expect(shouldFilter("echo $(date)")).toBe(false);
  });

  it("returns false for subshells with backticks", () => {
    expect(shouldFilter("echo `date`")).toBe(false);
  });
});

// --- extractBaseCommand ---

describe("extractBaseCommand", () => {
  it("strips a single env var prefix", () => {
    expect(extractBaseCommand("NODE_ENV=prod npm test")).toBe("npm test");
  });

  it("strips multiple env var prefixes", () => {
    expect(extractBaseCommand("FOO=bar BAZ=qux command arg")).toBe("command arg");
  });

  it("returns command unchanged when no env vars", () => {
    expect(extractBaseCommand("npm test")).toBe("npm test");
  });

  it("handles env var with path value", () => {
    expect(extractBaseCommand("PATH=/usr/bin:/bin ls")).toBe("ls");
  });

  it("handles env var with equals in value", () => {
    // KEY=val=ue would stop at first space
    expect(extractBaseCommand("KEY=val=ue cmd")).toBe("cmd");
  });

  it("returns empty string for empty input", () => {
    expect(extractBaseCommand("")).toBe("");
  });

  it("handles complex env var names with numbers and underscores", () => {
    expect(extractBaseCommand("MY_VAR_2=hello world")).toBe("world");
  });
});

// --- extractText ---

describe("extractText", () => {
  it("joins text from multiple content blocks", () => {
    const content = [
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ];
    expect(extractText(content)).toBe("hello\nworld");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("skips non-text blocks", () => {
    const content = [
      { type: "image", text: "ignored" },
      { type: "text", text: "kept" },
    ];
    expect(extractText(content)).toBe("kept");
  });

  it("handles single text block", () => {
    expect(extractText([{ type: "text", text: "only" }])).toBe("only");
  });

  it("handles blocks without text property", () => {
    const content = [
      { type: "text" },
      { type: "text", text: "valid" },
    ];
    expect(extractText(content)).toBe("valid");
  });

  it("handles empty text values", () => {
    const content = [
      { type: "text", text: "" },
      { type: "text", text: "after" },
    ];
    expect(extractText(content)).toBe("\nafter");
  });
});
