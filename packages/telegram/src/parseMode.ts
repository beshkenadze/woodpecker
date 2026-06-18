// Port of telegram_parsemode.go
import { createEnumFormatter, type EnumFormatter } from "@woodpecker-js/core";

/** ParseMode enum values, matching the Go iota ordering. */
export const ParseMode = {
  None: 0,
  Markdown: 1,
  HTML: 2,
  MarkdownV2: 3,
} as const;

export type ParseModeValue = (typeof ParseMode)[keyof typeof ParseMode];

/** Enum formatter for ParseMode (None is index 0, no empty offset). */
export const parseModeEnum: EnumFormatter = createEnumFormatter([
  "None",
  "Markdown",
  "HTML",
  "MarkdownV2",
]);

/** parseModeString returns the string representation of a ParseMode value. */
export function parseModeString(pm: number): string {
  return parseModeEnum.print(pm);
}
