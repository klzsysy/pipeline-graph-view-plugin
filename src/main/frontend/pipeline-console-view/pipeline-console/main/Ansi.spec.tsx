/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import type { CSSProperties, ReactElement } from "react";

import { linkifyConsoleText } from "../../../common/utils/linkify-js.ts";
import {
  makeReactChildren,
  palette256ToRgb,
  parseEscapeCode,
  tokenizeANSIString,
} from "./Ansi.tsx";

describe("palette256ToRgb", () => {
  it("maps the 6x6x6 color cube", () => {
    expect(palette256ToRgb(16)).toEqual({ r: 0, g: 0, b: 0 });
    expect(palette256ToRgb(46)).toEqual({ r: 0, g: 255, b: 0 });
    expect(palette256ToRgb(196)).toEqual({ r: 255, g: 0, b: 0 });
    expect(palette256ToRgb(208)).toEqual({ r: 255, g: 135, b: 0 });
  });

  it("maps the gray ramp", () => {
    expect(palette256ToRgb(232)).toEqual({ r: 8, g: 8, b: 8 });
    expect(palette256ToRgb(255)).toEqual({ r: 238, g: 238, b: 238 });
  });

  it("leaves the base 16 colors to the theme", () => {
    expect(palette256ToRgb(0)).toBeUndefined();
    expect(palette256ToRgb(15)).toBeUndefined();
    expect(palette256ToRgb(256)).toBeUndefined();
    expect(palette256ToRgb(-1)).toBeUndefined();
  });
});

describe("parseEscapeCode", () => {
  it("still parses the base 16 / bright colors", () => {
    expect(parseEscapeCode("\u001b[31m").setFG).toBe(1);
    expect(parseEscapeCode("\u001b[42m").setBG).toBe(2);
    expect(parseEscapeCode("\u001b[94m").setFG).toBe(12);
    expect(parseEscapeCode("\u001b[105m").setBG).toBe(13);
    expect(parseEscapeCode("\u001b[0m").resetFG).toBe(true);
    expect(parseEscapeCode("\u001b[39m").resetFG).toBe(true);
  });

  it("parses 256 color foreground and background", () => {
    const fg = parseEscapeCode("\u001b[38;5;196m");
    expect(fg.setFGRgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(fg.setFG).toBe(false);

    const bg = parseEscapeCode("\u001b[48;5;22m");
    expect(bg.setBGRgb).toEqual({ r: 0, g: 95, b: 0 });
    expect(bg.setBG).toBe(false);

    // 0-15 stay with the theme classes instead of hard coded rgb
    const themeColor = parseEscapeCode("\u001b[38;5;9m");
    expect(themeColor.setFG).toBe(9);
    expect(themeColor.setFGRgb).toBe(false);
  });

  it("parses truecolor", () => {
    expect(parseEscapeCode("\u001b[38;2;12;34;56m").setFGRgb).toEqual({
      r: 12,
      g: 34,
      b: 56,
    });
    expect(parseEscapeCode("\u001b[48;2;1;2;3m").setBGRgb).toEqual({
      r: 1,
      g: 2,
      b: 3,
    });
  });

  it("keeps other attributes of the same escape code", () => {
    const result = parseEscapeCode("\u001b[1;38;5;208m");
    expect(result.setBold).toBe(true);
    expect(result.setFGRgb).toEqual({ r: 255, g: 135, b: 0 });
  });

  it("clears the rgb color when reset", () => {
    const result = parseEscapeCode("\u001b[0m");
    expect(result.resetFG).toBe(true);
    expect(result.resetBG).toBe(true);
    expect(result.setFGRgb).toBe(false);
    expect(result.setBGRgb).toBe(false);
  });

  it("ignores a malformed extended color instead of misreading it", () => {
    // 38;5 without an index (and no trailing params) must not be read as color 5
    const malformed = parseEscapeCode("\u001b[38;5m");
    expect(malformed.setFG).toBe(false);
    expect(malformed.setFGRgb).toBe(false);
  });
});

describe("makeReactChildren", () => {
  it("renders 256 color text with an inline rgb style", () => {
    const children = makeReactChildren(
      tokenizeANSIString("\u001b[38;5;196mwarn\u001b[0m"),
      "key",
    ) as unknown as ReactElement<{
      className?: string;
      style?: CSSProperties;
    }>[];

    expect(children).toHaveLength(1);
    expect(children[0].props.style?.color).toBe("rgb(255, 0, 0)");
    expect(children[0].props.className).not.toContain("ansi-fg-");
  });

  it("keeps using the theme classes for the base 16 colors", () => {
    const children = makeReactChildren(
      tokenizeANSIString("\u001b[36mtheme\u001b[0m"),
      "key",
    ) as unknown as ReactElement<{
      className?: string;
      style?: CSSProperties;
    }>[];

    expect(children[0].props.className).toBe("ansi-fg-6");
    expect(children[0].props.style?.color).toBeUndefined();
  });
});

describe("console text with HTML entities", () => {
  it("renders => and < correctly inside ANSI coloured text", () => {
    const { container } = render(
      <>
        {makeReactChildren(
          tokenizeANSIString(
            linkifyConsoleText(
              "\u001b[38;5;36m30080 => 30080 < 40000\u001b[0m",
            ),
          ),
          "key",
        )}
      </>,
    );

    // 回归：linkify-html 会把 ">" 转义成 "&gt;"，彩色 span 以前用子节点渲染，
    // 于是界面上直接显示成 "=&gt;"。
    expect(container.textContent).toBe("30080 => 30080 < 40000");
  });

  it("renders plain (non coloured) text correctly", () => {
    const { container } = render(
      <>
        {makeReactChildren(
          tokenizeANSIString(linkifyConsoleText("a < b & c")),
          "key",
        )}
      </>,
    );

    expect(container.textContent).toBe("a < b & c");
  });

  it("keeps the HTML anchors Jenkins puts into env vars as real links", () => {
    const line =
      "RUN_TESTS_DISPLAY_URL=<a href='https://jenkins.example/job/x/9/display/redirect?page=tests'>https://jenkins.example/job/x/9/display/redirect?page=tests</a>";
    const { container } = render(
      <>
        {makeReactChildren(
          tokenizeANSIString(
            linkifyConsoleText("\u001b[38;5;36m" + line + "\u001b[0m"),
          ),
          "key",
        )}
      </>,
    );

    // 回归：上一版把 Jenkins 注入的锚点也转义了，界面上直接显示成 "<a href=...>"
    expect(container.textContent).not.toContain("<a href");
    expect(container.textContent).toBe(
      "RUN_TESTS_DISPLAY_URL=https://jenkins.example/job/x/9/display/redirect?page=tests",
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://jenkins.example/job/x/9/display/redirect?page=tests",
    );
  });

  it("does not let a trailing ANSI reset be swallowed into the URL", () => {
    // 回归：e2e 日志整行着色，URL 后面紧跟 \x1b[0m。linkify 会把 escape 当成 URL 的
    // 一部分，于是锚点变成 <a href="https://…\x1b[0m">，而 tokenizeANSIString 正是从
    // escape 处切开 —— 界面上剩下 `">https://…`，链接的 href 里还带着 ESC 字节。
    const line =
      "\u001b[1;38;5;136mINFO:  [...] Run ksctl to install SKS: ... --core-extend-env SKS_FILE_SERVER_URL=https://192.168.27.13:30443\u001b[0m";
    const { container } = render(
      <>
        {makeReactChildren(tokenizeANSIString(linkifyConsoleText(line)), "key")}
      </>,
    );

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://192.168.27.13:30443");
    expect(container.textContent).toContain(
      "SKS_FILE_SERVER_URL=https://192.168.27.13:30443",
    );
    // 不该出现属性残留或转义后的 markup
    expect(container.textContent).not.toContain("rel=");
    expect(container.textContent).not.toContain('">');
    expect(container.textContent).not.toContain("\u001b");
  });

  it("repairs the anchors Jenkins' HTML log view linkified (escape inside href)", () => {
    // 回归：Jenkins 的 logText/progressiveHtml 会自己把裸 URL 变成锚点，并把紧跟 URL 的
    // ANSI reset 一起吞进 href 与链接文本：
    //   <a href='https://host:port\u001b[0m'>https://host:port\u001b[0m</a>
    // tokenizeANSIString 正是从 escape 处切开，锚点会被撕成两半，界面上剩下 "'>https://…"。
    const content =
      "\u001b[1;38;5;136mINFO:  [...] --core-extend-env " +
      "SKS_FILE_SERVER_URL=<a href='https://10.255.0.24:30443\u001b[0m'>" +
      "https://10.255.0.24:30443\u001b[0m</a>";
    const { container } = render(
      <>
        {makeReactChildren(
          tokenizeANSIString(linkifyConsoleText(content)),
          "key",
        )}
      </>,
    );

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://10.255.0.24:30443");
    expect(container.textContent).toContain(
      "SKS_FILE_SERVER_URL=https://10.255.0.24:30443",
    );
    expect(container.textContent).not.toContain("<a href");
    expect(container.textContent).not.toContain("'>");
    expect(container.textContent).not.toContain("\u001b");
  });

  it("keeps linkified URLs as links", () => {
    const { container } = render(
      <>
        {makeReactChildren(
          tokenizeANSIString(
            linkifyConsoleText("see https://example.com/x now"),
          ),
          "key",
        )}
      </>,
    );

    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/x",
    );
    expect(container.textContent).toBe("see https://example.com/x now");
  });
});
