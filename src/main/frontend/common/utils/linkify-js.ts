import linkifyHtml from "linkify-html";
import { Opts } from "linkifyjs";

export const linkifyJsOptions: Opts = {
  rel: "noopener noreferrer",
  validate: {
    url: (value) => /^https?:\/\//.test(value),
  },
};

/**
 * Escape a plain-text console line so it can be handed to `linkify-html`, which
 * parses its input as HTML.
 *
 * Without this, characters that are common in build logs get treated as markup:
 * `30080 => 30080` came back as `=&gt;` (visible verbatim inside ANSI coloured text)
 * and `a < b` could swallow the rest of the line.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Linkify a plain-text console line (escaped first, so `>` / `<` / `&` survive). */
export function linkifyConsoleText(text: string): string {
  return linkifyHtml(escapeHtml(text), linkifyJsOptions);
}
