// Cuts a line of the course into its words and the punctuation between them.
import type { Token } from "@norsk/course";

export interface TextPart {
  /** Where the part starts in the line. No two parts start at the same place. */
  start: number;
  text: string;
  /** The word this part is, or null for the spaces and punctuation between words. */
  token: Token | null;
  /** The position of the word among the tokens of the line, or -1. */
  index: number;
}

const gap = (line: string, start: number, end: number): TextPart[] =>
  end > start
    ? [{ index: -1, start, text: line.slice(start, end), token: null }]
    : [];

/** Every word keeps its link to its token; a token that is not in the line is left out. */
export const splitLine = (
  line: string,
  tokens: readonly Token[]
): TextPart[] => {
  const parts: TextPart[] = [];
  // How far into the line the parts reach.
  let end = 0;

  for (const [index, token] of tokens.entries()) {
    // A word is looked for after the one before it, so a repeated word finds its own place.
    const found = line.indexOf(token.t, end);

    if (found !== -1) {
      parts.push(...gap(line, end, found), {
        index,
        start: found,
        text: token.t,
        token,
      });
      end = found + token.t.length;
    }
  }

  return [...parts, ...gap(line, end, line.length)];
};

/** True if the word belongs to the item: it is that word, or part of that phrase. */
export const belongsTo = (part: TextPart, id: string): boolean =>
  part.token !== null && (part.token.w === id || part.token.c === id);
