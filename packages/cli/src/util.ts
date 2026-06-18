/**
 * CLI utilities.
 *
 * Faithful ports of internal/dedupe.RemoveDuplicates and pkg/util.Ellipsis.
 */

/** Port of dedupe.RemoveDuplicates — preserves first-seen order. */
export function removeDuplicates(src: string[]): string[] {
  const unique: string[] = [];
  for (const s of src) {
    if (!unique.includes(s)) {
      unique.push(s);
    }
  }
  return unique;
}

const ELLIPSIS = "...";

/**
 * Port of util.Ellipsis — truncates `text` to at most `maxLength` chars,
 * appending "..." when truncation occurs.
 *
 * Go computes `text[:maxLength-len(ellipsis)]`, which panics if maxLength < 3.
 * This guards that edge so the result never exceeds maxLength (JS `slice` with
 * a negative end would otherwise keep most of the string).
 */
export function ellipsis(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= ELLIPSIS.length) {
    return ELLIPSIS.slice(0, maxLength);
  }
  return text.slice(0, maxLength - ELLIPSIS.length) + ELLIPSIS;
}
