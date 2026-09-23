import type { CSSProperties } from "react";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Result {
  isSelectGraphicRendition?: boolean;
  escapeCode?: string; // input
  setFG?: number | false; // 0-15 if a foreground color is specified
  setBG?: number | false; // 0-15 if a background color is specified
  setFGRgb?: Rgb | false; // rgb if a 256-color / truecolor foreground is specified
  setBGRgb?: Rgb | false; // rgb if a 256-color / truecolor background is specified
  resetFG?: boolean; // true if contains a reset back to default foreground
  resetBG?: boolean; // true if contains a reset back to default background
  setBold?: boolean; // true if contains a bold font style
  setFaint?: boolean; // true if contains a faint font style
  setItalic?: boolean; // true if contains an italic font style
  setUnderline?: boolean; // true if contains an underline font style
  setStrikeThrough?: boolean; // true if contains a strike-through font style
}

/**
 * Convert an xterm 256-color palette index into rgb.
 *
 * Indexes 0-15 are deliberately `undefined`: those are the theme colors that the
 * `ansi-fg-N` / `ansi-bg-N` classes already render (and which follow the light /
 * dark Jenkins theme), so callers should keep using the classes for them.
 */
export function palette256ToRgb(index: number): Rgb | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return undefined;
  }
  if (index < 16) {
    return undefined;
  }
  if (index < 232) {
    // 6x6x6 color cube
    const steps = [0, 95, 135, 175, 215, 255];
    const offset = index - 16;
    return {
      r: steps[Math.floor(offset / 36)],
      g: steps[Math.floor(offset / 6) % 6],
      b: steps[offset % 6],
    };
  }
  // 24 step gray ramp
  const value = 8 + (index - 232) * 10;
  return { r: value, g: value, b: value };
}

/**
 * Parse an isolated escape code, looking for "SelectGraphicsRendition" codes specifically.
 *
 * Result:
 * ```
 * // Supported code
 * {
 *     isSelectGraphicRendition: true,
 *     escapeCode: string, // input
 *     setFG: integer | false, // 0-7 if a foreground color is specified
 *     setBG: integer | false, // 0-7 if a background color is specified
 *     resetFG: bool, // true if contains a reset back to default foreground
 *     resetBG: bool // true if contains a reset back to default background
 *     setBold: boolean, // true if contains a bold font style
 *     setFaint: boolean; // true if contains a faint font style
 *     setItalic: boolean; // true if contains an italic font style
 *     setUnderline: boolean, // true if contains an underline font style
 *     setStrikeThrough: boolean, // true if contains a strike-through font style
 * }
 *
 * // Unsupported or malformed code:
 * {
 *     isSelectGraphicRendition: false,
 *     escapeCode: string // input
 * }
 * ```
 */
export function parseEscapeCode(escapeCode: string): Result {
  // eslint-disable-next-line no-control-regex
  const graphicsPattern = /^\u001b\[([;0-9]*)m$/; // We only care about SGR codes

  const result: Result = {
    isSelectGraphicRendition: false, // True when is a color / font command
    escapeCode,
  };

  const match = graphicsPattern.exec(escapeCode);

  if (match) {
    result.isSelectGraphicRendition = true;
    result.setFG = false;
    result.setBG = false;
    result.setFGRgb = false;
    result.setBGRgb = false;
    result.resetFG = false;
    result.resetBG = false;

    // Convert param string to array<int> with length > 1
    const params = (match[1] || "")
      .split(";")
      .map((str) => parseInt(str || "0"));

    // Now go through the ints, decode them into bg/fg info
    for (let i = 0; i < params.length; i++) {
      const num = params[i];

      if (num === 38 || num === 48) {
        // Extended colors: 38;5;N (256 colors) and 38;2;R;G;B (truecolor), same for 48/background.
        const isForeground = num === 38;
        const mode = params[i + 1];

        if (mode === 5 && i + 2 < params.length) {
          const index = params[i + 2];
          const rgb = palette256ToRgb(index);
          if (isForeground) {
            result.setFGRgb = rgb ?? false;
            result.setFG = rgb ? false : index; // 0-15 keep using the theme classes
            result.resetFG = false;
          } else {
            result.setBGRgb = rgb ?? false;
            result.setBG = rgb ? false : index;
            result.resetBG = false;
          }
          i += 2;
          continue;
        }

        if (mode === 2 && i + 4 < params.length) {
          const rgb: Rgb = {
            r: params[i + 2],
            g: params[i + 3],
            b: params[i + 4],
          };
          if (isForeground) {
            result.setFGRgb = rgb;
            result.setFG = false;
            result.resetFG = false;
          } else {
            result.setBGRgb = rgb;
            result.setBG = false;
            result.resetBG = false;
          }
          i += 4;
          continue;
        }

        // Malformed extended color (e.g. a bare "38"): ignore just this code.
        continue;
      }

      if (num >= 30 && num <= 37) {
        result.setFG = num - 30; // Normal FG set
        result.setFGRgb = false;
      } else if (num >= 40 && num <= 47) {
        result.setBG = num - 40; // Normal BG set
        result.setBGRgb = false;
      } else if (num >= 90 && num <= 97) {
        result.setFG = num - 90 + 8; // Bright FG set
        result.setFGRgb = false;
      } else if (num >= 100 && num <= 107) {
        result.setBG = num - 100 + 8; // Bright BG set
        result.setBGRgb = false;
      } else if (num === 1) {
        result.setBold = true;
      } else if (num === 2) {
        result.setFaint = true;
      } else if (num === 22) {
        result.setBold = false;
        result.setFaint = false;
      } else if (num === 3) {
        result.setItalic = true;
      } else if (num === 23) {
        result.setItalic = false;
      } else if (num === 4) {
        result.setUnderline = true;
      } else if (num === 24) {
        result.setUnderline = false;
      } else if (num === 9) {
        result.setStrikeThrough = true;
      } else if (num === 29) {
        result.setStrikeThrough = false;
      } else {
        if (num === 39 || num === 0) {
          result.resetFG = true;
          result.setFG = false;
          result.setFGRgb = false;
        }

        if (num === 49 || num === 0) {
          result.resetBG = true;
          result.setBG = false;
          result.setBGRgb = false;
        }

        // ANSI code 0 should reset all formatting attributes
        if (num === 0) {
          result.setBold = false;
          result.setFaint = false;
          result.setItalic = false;
          result.setUnderline = false;
          result.setStrikeThrough = false;
        }
      }
    }
  }

  return result;
}

/**
 * Break up a string into an array of plain strings and escape codes. Returns [input] if no codes present.
 */
export function tokenizeANSIString(input?: string): string[] | Result[] {
  if (typeof input !== "string") {
    return [];
  }

  const len = input.length;

  if (len === 0) {
    return [];
  }

  /*
    loopCounter         - Where should the next loop start looping for escape codes.
    escapeCodeIndex     - The index in the string of the next ANSI escape code or -1.
    parsedPointer       - The parse pointer how far in the string have we parsed.
                          This will === loopCounter unless there are commented ANSI escape characters.
    commentStartIndex   - The start index of the next comment block, or -1.
    commentEndIndex     - The end index of the next comment block, or -1.
  */
  let loopCounter = 0;
  let escapeCodeIndex = 0;
  let parsedPointer = 0;
  // comment start
  let commentStartIndex = 0;
  // comment end
  let commentEndIndex = 0;
  const result: string[] | Result[] = [];

  while (loopCounter < len) {
    //--------------------------------------------------------------------------
    //  Find next escape code
    escapeCodeIndex = input.indexOf("\x1b", loopCounter);

    if (escapeCodeIndex === -1) {
      // No more escape codes
      break;
    }

    // Check if escape code is commented
    commentStartIndex = input.indexOf("<!--", loopCounter);
    commentEndIndex = input.indexOf("-->", commentStartIndex);
    if (commentEndIndex !== -1) {
      commentEndIndex += 3;
    }
    if (
      escapeCodeIndex > commentStartIndex &&
      escapeCodeIndex < commentEndIndex
    ) {
      // Skip past the comment
      loopCounter = commentEndIndex;
      continue;
    }

    //--------------------------------------------------------------------------
    //  Capture any text between the start pointer and the escape code

    if (escapeCodeIndex > loopCounter) {
      result.push(input.substring(loopCounter, escapeCodeIndex));
      loopCounter = escapeCodeIndex; // Advance our start pointer to the beginning of the escape code
    }

    //--------------------------------------------------------------------------
    //  Find the end of the escape code (a char from 64 - 126 indicating command)

    escapeCodeIndex += 2; // Skip past ESC and '['

    let code = input.charCodeAt(escapeCodeIndex);
    while (escapeCodeIndex < len && (code < 64 || code > 126)) {
      escapeCodeIndex++;
      code = input.charCodeAt(escapeCodeIndex);
    }

    //--------------------------------------------------------------------------
    //  Create token for the escape code

    // TODO fix type checking
    const parsedEscapeCode: any = parseEscapeCode(
      input.substring(loopCounter, escapeCodeIndex + 1),
    );
    result.push(parsedEscapeCode);

    //--------------------------------------------------------------------------
    //  Keep looking in the rest of the string

    loopCounter = escapeCodeIndex + 1;
    // Move parsedPointer as we have processes the text to this point.
    parsedPointer = loopCounter;
  }

  if (parsedPointer < len) {
    result.push(input.substr(parsedPointer));
  }

  return result;
}

/**
 * Takes an array of string snippets and parsed escape codes produced bv tokenizeANSIString, and creates
 * an array of strings and spans with classNames for attributes.
 */
export function makeReactChildren(
  tokenizedInput: string[] | Result[],
  key: string,
) {
  const result = [];
  let currentState: Result = {
    setFG: false,
    setBG: false,
    setBold: false,
    setFaint: false,
    setItalic: false,
    setUnderline: false,
    setStrikeThrough: false,
  };

  for (let i = 0; i < tokenizedInput.length; i++) {
    const codeOrString = tokenizedInput[i];
    if (typeof codeOrString === "string") {
      // Need to output a <span> or plain text if there's no interesting current state
      if (
        !currentState.setFG &&
        !currentState.setBG &&
        !currentState.setFGRgb &&
        !currentState.setBGRgb &&
        !currentState.setBold &&
        !currentState.setFaint &&
        !currentState.setItalic &&
        !currentState.setUnderline &&
        !currentState.setStrikeThrough
      ) {
        result.push(
          <div
            dangerouslySetInnerHTML={{ __html: codeOrString }}
            key={`${key}-${i}`}
          />,
        );
      } else {
        const classNames = [];
        const style: CSSProperties = {};

        if (typeof currentState.setFG === "number") {
          classNames.push(`ansi-fg-${currentState.setFG}`);
        }
        if (typeof currentState.setBG === "number") {
          classNames.push(`ansi-bg-${currentState.setBG}`);
        }
        if (currentState.setFGRgb) {
          const { r, g, b } = currentState.setFGRgb;
          style.color = `rgb(${r}, ${g}, ${b})`;
        }
        if (currentState.setBGRgb) {
          const { r, g, b } = currentState.setBGRgb;
          style.background = `rgb(${r}, ${g}, ${b})`;
        }
        if (currentState.setBold) {
          classNames.push("ansi-bold");
        }
        if (currentState.setFaint) {
          classNames.push("ansi-faint");
        }
        if (currentState.setItalic) {
          classNames.push("ansi-italic");
        }
        if (currentState.setUnderline) {
          classNames.push("ansi-underline");
        }
        if (currentState.setStrikeThrough) {
          classNames.push("ansi-strikethrough");
        }

        // 用 dangerouslySetInnerHTML 而不是子节点：进入这里的文本已经过
        // linkify（HTML 形式，含 &gt; 等实体和 <a> 链接），按子节点渲染会把实体
        // 原样显示成 "=&gt;"，链接也不会生效。
        result.push(
          <span
            key={`${key}-${i}`}
            className={classNames.join(" ")}
            style={style}
            dangerouslySetInnerHTML={{ __html: codeOrString }}
          />,
        );
      }
    } else if (codeOrString.isSelectGraphicRendition) {
      // Update the current FG / BG colors for the next text span
      const nextState = { ...currentState };

      if (codeOrString.resetFG) {
        nextState.setFG = false;
        nextState.setFGRgb = false;
      }
      if (codeOrString.resetBG) {
        nextState.setBG = false;
        nextState.setBGRgb = false;
      }

      if (typeof codeOrString.setFGRgb === "object" && codeOrString.setFGRgb) {
        nextState.setFGRgb = codeOrString.setFGRgb;
        nextState.setFG = false;
      } else if (typeof codeOrString.setFG === "number") {
        nextState.setFG = codeOrString.setFG;
        nextState.setFGRgb = false;
      }

      if (typeof codeOrString.setBGRgb === "object" && codeOrString.setBGRgb) {
        nextState.setBGRgb = codeOrString.setBGRgb;
        nextState.setBG = false;
      } else if (typeof codeOrString.setBG === "number") {
        nextState.setBG = codeOrString.setBG;
        nextState.setBGRgb = false;
      }

      if (codeOrString.setBold !== undefined) {
        nextState.setBold = codeOrString.setBold;
      }

      if (codeOrString.setFaint !== undefined) {
        nextState.setFaint = codeOrString.setFaint;
      }

      if (codeOrString.setItalic !== undefined) {
        nextState.setItalic = codeOrString.setItalic;
      }

      if (codeOrString.setUnderline !== undefined) {
        nextState.setUnderline = codeOrString.setUnderline;
      }

      if (codeOrString.setStrikeThrough !== undefined) {
        nextState.setStrikeThrough = codeOrString.setStrikeThrough;
      }

      currentState = nextState;
    }
  }

  return result;
}
