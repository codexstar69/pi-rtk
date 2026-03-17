import { describe, it, expect } from "vitest";
import { createHttpFilter } from "../src/filters/http.js";

describe("http filter", () => {
  const filter = createHttpFilter();

  it("has correct name", () => {
    expect(filter.name).toBe("http");
  });

  it("matches curl", () => {
    expect(filter.matches("curl https://example.com")).toBe(true);
    expect(filter.matches("curl -i https://api.github.com")).toBe(true);
    expect(filter.matches("curl -v https://example.com")).toBe(true);
  });

  it("matches wget", () => {
    expect(filter.matches("wget https://example.com")).toBe(true);
    expect(filter.matches("wget -O file.html https://example.com")).toBe(true);
  });

  it("matches xh", () => {
    expect(filter.matches("xh https://api.github.com/users")).toBe(true);
    expect(filter.matches("xh GET https://example.com")).toBe(true);
  });

  it("matches http (httpie)", () => {
    expect(filter.matches("http https://example.com")).toBe(true);
    expect(filter.matches("http GET https://api.github.com")).toBe(true);
  });

  it("does not match non-http commands", () => {
    expect(filter.matches("ls -la")).toBe(false);
    expect(filter.matches("npm install")).toBe(false);
    expect(filter.matches("git push")).toBe(false);
  });

  it("extracts status code from curl -i output (VAL-DATA-018)", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "Content-Length: 42",
      "",
      '{"name":"test","value":123}',
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.filtered).toContain("HTTP 200 OK");
    expect(result.filtered).toContain("application/json");
    expect(result.filtered).toContain('"name":"test"');
  });

  it("extracts status code from curl -v output", () => {
    const raw = [
      "* Connected to example.com",
      "> GET / HTTP/1.1",
      "> Host: example.com",
      ">",
      "< HTTP/1.1 404 Not Found",
      "< Content-Type: text/html",
      "< Content-Length: 256",
      "<",
      "<html><body>Not Found</body></html>",
    ].join("\n");

    const result = filter.apply("curl -v https://example.com", raw);
    expect(result.filtered).toContain("HTTP 404 Not Found");
    expect(result.filtered).toContain("text/html");
  });

  it("extracts status code from HTTP/2 response", () => {
    const raw = [
      "HTTP/2 301",
      "location: https://www.example.com/",
      "content-type: text/html",
      "",
      "<html>Redirecting...</html>",
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.filtered).toContain("HTTP 301");
  });

  it("extracts status from wget output", () => {
    const raw = [
      "--2024-01-15 10:30:00--  https://example.com/file.zip",
      "Resolving example.com... 93.184.216.34",
      "Connecting to example.com|93.184.216.34|:443... connected.",
      "HTTP request sent, awaiting response... 200 OK",
      "Length: 1024 (1.0K) [application/zip]",
      "Saving to: 'file.zip'",
      "",
      "file.zip            100%[===================>]   1.0K  --.-KB/s    in 0s",
      "",
      "2024-01-15 10:30:01 (100 MB/s) - 'file.zip' saved [1024/1024]",
    ].join("\n");

    const result = filter.apply("wget https://example.com/file.zip", raw);
    expect(result.filtered).toContain("HTTP 200 OK");
  });

  it("truncates long response bodies", () => {
    const longBody = "x".repeat(500);
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "",
      longBody,
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.filtered).toContain("HTTP 200 OK");
    // Body should be truncated
    expect(result.filtered).toContain("...");
    // Should not contain the full 500-char body
    expect(result.filtered.length).toBeLessThan(raw.length);
  });

  it("handles body-only output (no headers)", () => {
    const raw = '{"data": [1, 2, 3], "count": 3}';

    const result = filter.apply("curl https://example.com/api", raw);
    expect(result.filtered).toContain('"data"');
    expect(result.filtered).toContain('"count"');
  });

  it("shows content type and size in status line", () => {
    const body = '{"key": "value"}';
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      body,
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.filtered).toContain("application/json");
    // Size should be shown
    expect(result.filtered).toMatch(/\d+(\.\d+)?[BKM]/);
  });

  it("handles empty output", () => {
    const result = filter.apply("curl https://example.com", "");
    // Should not crash
    expect(result.rawChars).toBe(0);
  });

  it("handles 500 error response", () => {
    const raw = [
      "HTTP/1.1 500 Internal Server Error",
      "Content-Type: text/html",
      "",
      "<html><body>Internal Server Error</body></html>",
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.filtered).toContain("HTTP 500");
    expect(result.filtered).toContain("Internal Server Error");
  });

  it("strips ANSI codes from output", () => {
    const raw = [
      "\x1b[32mHTTP/1.1 200 OK\x1b[0m",
      "Content-Type: text/plain",
      "",
      "Hello World",
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.filtered).not.toContain("\x1b");
    expect(result.filtered).toContain("HTTP 200 OK");
  });

  it("reports correct rawChars and filteredChars", () => {
    const body = "x".repeat(300);
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/plain",
      "X-Custom-Header: value",
      "X-Another-Header: value2",
      "",
      body,
    ].join("\n");

    const result = filter.apply("curl -i https://example.com", raw);
    expect(result.rawChars).toBe(raw.length);
    expect(result.filteredChars).toBe(result.filtered.length);
    // Filtered should be shorter (headers stripped, body truncated)
    expect(result.filteredChars).toBeLessThan(result.rawChars);
  });

  it("handles xh JSON output", () => {
    const raw = [
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}',
    ].join("\n");

    const result = filter.apply("xh https://api.example.com/users", raw);
    expect(result.filtered).toContain("HTTP 200 OK");
    expect(result.filtered).toContain("application/json");
    expect(result.filtered).toContain("Alice");
  });
});
