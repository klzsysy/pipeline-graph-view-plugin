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
 * A CSI escape sequence, i.e. what `tokenizeANSIString` treats as a style code.
 * Deliberately the same shape as that tokenizer's scan: anything it cuts out must
 * never reach linkify.
 */
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/;

/**
 * Move ANSI escapes out of Jenkins' anchors.
 *
 * Jenkins' HTML log view (`logText/progressiveHtml`) linkifies bare URLs itself and —
 * same trap linkify-html falls into — swallows the escape sequence that follows the
 * URL into the anchor:
 *
 *     <a href='https://host:port\u001b[0m'>https://host:port\u001b[0m</a>
 *
 * `tokenizeANSIString` splits exactly at those escapes, so the anchor would be torn
 * into `…<a href='https://host:port` + `'>https://host:port` and the page would show
 * the leftover attribute text. Pull the escapes out of the anchor (its href must be
 * the bare URL anyway) and put them right after it, so the anchor stays whole and the
 * reset still applies to the rest of the line.
 */
function detachEscapesFromAnchors(text: string): string {
  const global = new RegExp(ANSI_ESCAPE_PATTERN.source, "g");

  return text.replace(ANCHOR_PATTERN, (anchor) => {
    const escapes = anchor.match(global);
    if (!escapes) {
      return anchor;
    }
    return anchor.replace(global, "") + escapes.join("");
  });
}

/** Linkify one ANSI-free segment: keep Jenkins anchors, escape the rest, link URLs. */
function linkifySegment(text: string): string {
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

/**
 * Linkify a console line.
 *
 * Jenkins log lines are a mix of plain text (`2>&1`, `a < b`, `=>`), HTML fragments
 * (the `RUN_*_DISPLAY_URL` anchors and the URLs Jenkins' HTML log view linkifies
 * itself) and ANSI color codes (the e2e logs colour whole lines), so: detach escapes
 * from the anchors, split the remaining ANSI codes out, keep the anchors as markup,
 * escape the rest, and let linkify turn bare URLs into links.
 *
 * Both steps are load-bearing. linkify-web swallows a trailing escape into the URL
 * (`<a href="https://host:port\u001b[0m">…`), and Jenkins' server-side linkifier does
 * the same before the text even reaches us; either way `tokenizeANSIString` cuts the
 * anchor in half at the escape, and the page shows the leftover attribute text — the
 * `=">https://host:port` seen in Jenkins.
 */
export function linkifyConsoleText(text: string): string {
  const prepared = detachEscapesFromAnchors(text);

  // split() 带捕获组时会把分隔符（即 escape 序列本身）留在结果里。
  const segments = prepared.split(
    new RegExp(`(${ANSI_ESCAPE_PATTERN.source})`, "g"),
  );

  return segments
    .map((segment) =>
      segment !== "" && !ANSI_ESCAPE_PATTERN.test(segment)
        ? linkifySegment(segment)
        : segment,
    )
    .join("");
}
