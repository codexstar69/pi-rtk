/**
 * Remove ANSI escape codes from text.
 * Handles SGR sequences and OSC 8 hyperlink sequences.
 */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "")
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Estimate token count from text (rough: ~4 chars per token).
 * Returns 0 for empty strings.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Detect binary content by checking for null bytes in the first 1000 characters.
 */
export function isBinary(text: string): boolean {
  return /\x00/.test(text.slice(0, 1000));
}

/**
 * Determine whether a command should be filtered.
 * Returns false (skip filtering) if the command contains:
 * - Pipes to filter programs (head, tail, grep, rg, awk, sed, jq, wc, sort, uniq)
 * - Chained commands (&&, ||, ;)
 * - Redirects (>)
 * - Subshells ($( or backtick)
 */
export function shouldFilter(command: string): boolean {
  // Pipes to filter programs
  const filterPrograms = /\|\s*(head|tail|grep|rg|awk|sed|jq|wc|sort|uniq)\b/;
  if (filterPrograms.test(command)) return false;

  // Chained commands
  if (/&&|\|\||;/.test(command)) return false;

  // Redirects — check for > outside of quotes
  const unquoted = command.replace(/"[^"]*"|'[^']*'/g, "");
  if (/>/.test(unquoted)) return false;

  // Subshells
  if (/\$\(/.test(command) || /`/.test(command)) return false;

  return true;
}

/**
 * Strip leading KEY=VALUE environment variable prefixes from a command.
 */
export function extractBaseCommand(command: string): string {
  return command.replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)+/, "");
}

/**
 * Extract and join text content from an array of content blocks.
 */
export function extractText(content: Array<{ type: string; text?: string }>): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
