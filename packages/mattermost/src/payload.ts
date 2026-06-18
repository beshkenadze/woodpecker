import type { Params } from "@woodpecker-js/core";
import type { MattermostConfig } from "./config.js";

/** JSON payload for mattermost notifications (port of mattermost_json.go JSON). */
export interface MattermostJSON {
  text: string;
  username?: string;
  channel?: string;
  icon_emoji?: string;
  icon_url?: string;
}

const ICON_URL_PATTERN = /https?:\/\//;

/**
 * setIcon writes the icon onto the payload as either icon_url (when it looks like
 * a URL) or icon_emoji. Port of (*JSON).SetIcon — clears both first.
 */
export function setIcon(payload: MattermostJSON, icon: string): void {
  delete payload.icon_url;
  delete payload.icon_emoji;

  if (icon !== "") {
    if (ICON_URL_PATTERN.test(icon)) {
      payload.icon_url = icon;
    } else {
      payload.icon_emoji = icon;
    }
  }
}

/**
 * createJSONPayload builds the mattermost payload from config, message and optional
 * params. Port of CreateJSONPayload. Params `username` / `channel` override config.
 */
export function createJSONPayload(
  config: MattermostConfig,
  message: string,
  params?: Params,
): MattermostJSON {
  // Mirror Go CreateJSONPayload: assign unconditionally, then let serialization
  // apply omitempty. Params (when present) override config.
  const payload: MattermostJSON = {
    text: message,
    username: config.userName,
    channel: config.channel,
  };

  if (params) {
    if (params.username !== undefined) {
      payload.username = params.username;
    }
    if (params.channel !== undefined) {
      payload.channel = params.channel;
    }
  }

  setIcon(payload, config.icon);

  return payload;
}

/**
 * Serialize the payload to a JSON string preserving Go field order and
 * omitempty semantics: text is always present; username/channel/icon_*
 * are omitted when empty (matching the `,omitempty` tags in mattermost_json.go).
 */
export function serializePayload(payload: MattermostJSON): string {
  const ordered: Record<string, string> = { text: payload.text };
  if (payload.username) {
    ordered.username = payload.username;
  }
  if (payload.channel) {
    ordered.channel = payload.channel;
  }
  if (payload.icon_emoji) {
    ordered.icon_emoji = payload.icon_emoji;
  }
  if (payload.icon_url) {
    ordered.icon_url = payload.icon_url;
  }
  return JSON.stringify(ordered);
}
