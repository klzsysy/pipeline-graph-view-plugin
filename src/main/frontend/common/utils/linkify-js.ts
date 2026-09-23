import linkifyHtml from "linkify-html";
import { Opts } from "linkifyjs";

export const linkifyJsOptions: Opts = {
  rel: "noopener noreferrer",
  validate: {
    url: (value) => /^https?:\/\//.test(value),
  },
};

/**
 * Escape plain text so it can be handed to `linkify-html`, which parses its input
 * as HTML. Without this, characters that are common in build logs get treated as
 * markup: `30080 => 30080` came back as `=&gt;` and `a < b` could swallow the text
 * after it.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * `<a>` fragments that Jenkins itself puts into the console text.
 *
 * Some environment variables contain ready-made HTML, e.g. `RUN_TESTS_DISPLAY_URL`
 * and `RUN_CHANGES_DISPLAY_URL` are `<a href='…'>…</a>`, and `env` prints them
 * verbatim. Those anchors must stay markup (Blue Ocean renders them as links too),
 * so they are taken out before escaping and put back afterwards.
 */
const ANCHOR_PATTERN = /<a\s[^>]*>[\s\S]*?<\/a>/gi;

/**
 * Linkify a console line.
 *
 * Jenkins log lines are a mix of plain text (`2>&1`, `a < b`, `=>`) and HTML
 * fragments (the `RUN_*_DISPLAY_URL` anchors), so: keep the anchors as-is, escape
 * everything else, then let linkify turn bare URLs into links.
 */
export function linkifyConsoleText(text: string): string {
  const parts: string[] = [];
  let cursor = 0;

  for (const match of text.matchAll(ANCHOR_PATTERN)) {
    const start = match.index ?? 0;
    // 锚点之前的普通文本要转义
    parts.push(escapeHtml(text.slice(cursor, start)));
    // Jenkins 注入的锚点保持 HTML 原样
    parts.push(match[0]);
    cursor = start + match[0].length;
  }
  parts.push(escapeHtml(text.slice(cursor)));

  return linkifyHtml(parts.join(""), linkifyJsOptions);
}
