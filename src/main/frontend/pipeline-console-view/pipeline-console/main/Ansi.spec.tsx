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
