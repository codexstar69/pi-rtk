/**
 * HTTP filter — compresses curl/wget/xh output to status code + response
 * summary line. Extracts HTTP status from headers or verbose output and
 * provides a brief summary of the response body.
 *
 * Output format:
 *   HTTP 200 OK — application/json, 1.2K
 *   {"users":[...], "total": 42}   (first 200 chars of body)
 *
 * For errors:
 *   HTTP 404 Not Found — text/html, 256B
 *   <html>... (first 200 chars)
 */

import type { Filter, FilterResult } from "./index.js";

/** Strip ANSI escape sequences. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
}

/** Format byte size to human-readable. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

interface HttpInfo {
  statusCode: number | null;
  statusText: string;
  contentType: string | null;
  body: string;
}

/**
 * Parse HTTP response info from curl/wget/xh output.
 * Handles various output formats:
 *   - curl -i (headers + body)
 *   - curl -v (verbose with < prefixed headers)
 *   - curl plain (body only)
 *   - wget output
 *   - xh output
 */
function parseHttpResponse(raw: string): HttpInfo {
  const lines = raw.split("\n");
  let statusCode: number | null = null;
  let statusText = "";
  let contentType: string | null = null;
  let bodyStart = 0;
  let inHeaders = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // curl -v format: "< HTTP/1.1 200 OK"
    const verboseStatus = line.match(/^<\s*HTTP\/[\d.]+\s+(\d{3})\s*(.*)/);
    if (verboseStatus) {
      statusCode = parseInt(verboseStatus[1], 10);
      statusText = verboseStatus[2].trim();
      inHeaders = true;
      continue;
    }

    // curl -i / direct: "HTTP/1.1 200 OK" or "HTTP/2 200"
    const directStatus = line.match(/^HTTP\/[\d.]+\s+(\d{3})\s*(.*)/);
    if (directStatus) {
      statusCode = parseInt(directStatus[1], 10);
      statusText = directStatus[2].trim();
      inHeaders = true;
      continue;
    }

    // wget format: "HTTP request sent, awaiting response... 200 OK"
    const wgetStatus = line.match(/awaiting response[.…]*\s*(\d{3})\s*(.*)/i);
    if (wgetStatus) {
      statusCode = parseInt(wgetStatus[1], 10);
      statusText = wgetStatus[2].trim();
      continue;
    }

    // xh format: "HTTP/1.1 200 OK" (same as direct)

    // Content-Type header
    if (inHeaders) {
      const ctMatch = line.match(/^<?\s*content-type:\s*(.+)/i);
      if (ctMatch) {
        contentType = ctMatch[1].split(";")[0].trim();
      }

      // Verbose header: "< Content-Type: ..."
      const verboseCt = line.match(/^<\s*content-type:\s*(.+)/i);
      if (verboseCt) {
        contentType = verboseCt[1].split(";")[0].trim();
      }

      // Empty line marks end of headers
      if (line === "" || line === "<") {
        bodyStart = i + 1;
        inHeaders = false;
      }
    }
  }

  // Extract body: everything after headers, or entire output if no headers found
  let body: string;
  if (bodyStart > 0) {
    body = lines.slice(bodyStart)
      .filter((l) => !l.startsWith("< ") && !l.startsWith("> ") && !l.startsWith("* "))
      .join("\n")
      .trim();
  } else {
    // No headers found — the entire output might be just the body
    body = lines
      .filter((l) => !l.startsWith("< ") && !l.startsWith("> ") && !l.startsWith("* "))
      .join("\n")
      .trim();
  }

  return { statusCode, statusText, contentType, body };
}

const BODY_PREVIEW_MAX = 200;

export function createHttpFilter(): Filter {
  return {
    name: "http",

    matches(command: string): boolean {
      return /^(curl|wget|xh|http)\b/.test(command);
    },

    apply(_command: string, raw: string): FilterResult {
      const rawChars = raw.length;
      const cleaned = strip(raw);
      const info = parseHttpResponse(cleaned);

      const parts: string[] = [];

      // Status line
      if (info.statusCode !== null) {
        let statusLine = `HTTP ${info.statusCode}`;
        if (info.statusText) statusLine += ` ${info.statusText}`;

        const meta: string[] = [];
        if (info.contentType) meta.push(info.contentType);
        if (info.body.length > 0) meta.push(formatSize(info.body.length));

        if (meta.length > 0) statusLine += ` — ${meta.join(", ")}`;
        parts.push(statusLine);
      }

      // Body preview
      if (info.body.length > 0) {
        const preview = info.body.length > BODY_PREVIEW_MAX
          ? info.body.slice(0, BODY_PREVIEW_MAX) + "..."
          : info.body;
        parts.push(preview);
      } else if (info.statusCode === null) {
        // No status and no body — just return the raw output trimmed
        const trimmed = cleaned.trim();
        const preview = trimmed.length > BODY_PREVIEW_MAX
          ? trimmed.slice(0, BODY_PREVIEW_MAX) + "..."
          : trimmed;
        if (preview) parts.push(preview);
      }

      const filtered = parts.join("\n");
      return { filtered: filtered || cleaned, rawChars, filteredChars: (filtered || cleaned).length };
    },
  };
}
