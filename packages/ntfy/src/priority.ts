// Ported from Go pkg/services/ntfy/ntfy_priority.go.
import { createEnumFormatter, type EnumFormatter } from "@woodpecker-js/core";

/** Priority enum integer values. */
export const Priority = {
  Min: 1,
  Low: 2,
  Default: 3,
  High: 4,
  Max: 5,
} as const;

export type PriorityValue = (typeof Priority)[keyof typeof Priority];

/**
 * priorityEnum maps priority names/aliases to their integer values.
 * Index 0 is the "" offset entry; aliases cover numeric strings and "urgent".
 */
export const priorityEnum: EnumFormatter = createEnumFormatter(
  ["", "Min", "Low", "Default", "High", "Max"],
  {
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    urgent: 5,
  },
);
