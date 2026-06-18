import { MessageLevel } from "@woodpecker/core";
import { levelString, type MessageItem } from "./message.ts";

/** EmbedFooter mirrors Go discord.embedFooter. */
export interface EmbedFooter {
  text: string;
  icon_url?: string;
}

/** EmbedItem mirrors Go discord.embedItem (a single embed in the payload). */
export interface EmbedItem {
  title?: string;
  /** Serialized as "description" in the Discord API. */
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: EmbedFooter;
}

/** WebhookPayload mirrors Go discord.WebhookPayload (the webhook body). */
export interface WebhookPayload {
  embeds: EmbedItem[];
  username?: string;
  avatar_url?: string;
}

/**
 * createPayloadFromItems builds the webhook payload from message items, applying
 * the per-level color and footer. Faithful port of Go CreatePayloadFromItems.
 * Throws if there are no items (empty message).
 */
export function createPayloadFromItems(
  items: MessageItem[],
  title: string,
  colors: number[],
): WebhookPayload {
  if (items.length < 1) {
    throw new Error("message is empty");
  }

  // Go uses Min(9, len) only as the initial slice capacity, not as a cap;
  // every item is appended as an embed (see CreatePayloadFromItems).
  const embeds: EmbedItem[] = [];

  for (const item of items) {
    const level = item.level ?? MessageLevel.Unknown;
    let color = 0;
    if (level >= MessageLevel.Unknown && level < colors.length) {
      color = colors[level] ?? 0;
    }

    const embed: EmbedItem = {
      description: item.text,
      color,
    };

    if (level !== MessageLevel.Unknown) {
      embed.footer = { text: levelString(level) };
    }

    if (item.timestamp && !Number.isNaN(item.timestamp.getTime())) {
      embed.timestamp = formatRFC3339UTC(item.timestamp);
    }

    embeds.push(embed);
  }

  const first = embeds[0];
  if (first) {
    first.title = title;
  }

  return { embeds };
}

/**
 * formatRFC3339UTC renders a Date as Go's time.RFC3339 in UTC, e.g.
 * "2006-01-02T15:04:05Z" (seconds precision, no fractional part).
 */
function formatRFC3339UTC(date: Date): string {
  const iso = date.toISOString(); // 2006-01-02T15:04:05.000Z
  return iso.replace(/\.\d{3}Z$/, "Z");
}
