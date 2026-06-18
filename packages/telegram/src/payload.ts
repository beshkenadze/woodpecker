// Port of telegram_json.go (payload + response shapes + builder)
import type { Config } from "./config.js";
import { ParseMode, parseModeString } from "./parseMode.js";

/** SendMessagePayload is the notification payload for the telegram service. */
export interface SendMessagePayload {
  text: string;
  chat_id: string;
  message_thread_id?: number;
  parse_mode?: string;
  disable_web_page_preview: boolean;
  disable_notification: boolean;
  reply_markup?: ReplyMarkup;
  entities?: Entity[];
  reply_to_message_id: number;
  message_id?: number;
}

/** Message represents one chat message. */
export interface Message {
  message_id: number;
  text: string;
  from?: User;
  chat?: Chat;
}

export interface MessageResponse {
  ok: boolean;
  result?: Message;
}

export interface ErrorResponse {
  ok: boolean;
  error_code: number;
  description: string;
}

export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name: string;
  username: string;
  language_code: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface UserResponse {
  ok: boolean;
  result: User;
}

export interface Chat {
  id: number;
  type: string;
  title: string;
  username: string;
}

export interface InlineKey {
  text: string;
  url: string;
  login_url: string;
  callback_data: string;
  switch_inline_query: string;
  switch_inline_query_current_chat: string;
}

export interface ReplyMarkup {
  inline_keyboard?: InlineKey[][];
}

export interface Entity {
  type: string;
  offset: number;
  length: number;
}

/**
 * strictAtoi mirrors Go strconv.Atoi: the entire string must be a base-10
 * integer (optionally signed), otherwise it fails. Unlike Number.parseInt it
 * does not accept trailing non-digit characters ("42abc" -> failure).
 */
function strictAtoi(s: string): number | undefined {
  if (!/^[+-]?[0-9]+$/.test(s)) {
    return undefined;
  }
  const parsed = Number(s);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Escapes the five HTML-significant characters (matches Go html.EscapeString). */
function htmlEscapeString(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&#34;");
}

/**
 * createSendMessagePayload builds the API payload for a single chat.
 * Mirrors the Go implementation including the thread-id split, the
 * None+Title => HTML escaping path, and the HTML title wrapping.
 */
export function createSendMessagePayload(
  message: string,
  channel: string,
  config: Config,
): SendMessagePayload {
  let threadID: number | undefined;
  const cutIndex = channel.indexOf(":");
  let chatID = channel;
  if (cutIndex !== -1) {
    chatID = channel.slice(0, cutIndex);
    const thread = channel.slice(cutIndex + 1);
    const parsed = strictAtoi(thread);
    if (parsed !== undefined) {
      threadID = parsed;
    }
  }

  const payload: SendMessagePayload = {
    text: message,
    chat_id: chatID,
    disable_notification: !config.notification,
    disable_web_page_preview: !config.preview,
    reply_to_message_id: 0,
  };
  if (threadID !== undefined) {
    payload.message_thread_id = threadID;
  }

  let parseMode = config.parseMode;
  let text = message;
  if (config.parseMode === ParseMode.None && config.title !== "") {
    parseMode = ParseMode.HTML;
    // no parse mode has been provided, treat message as unescaped HTML
    text = htmlEscapeString(message);
  }

  if (parseMode !== ParseMode.None) {
    payload.parse_mode = parseModeString(parseMode);
  }

  // only HTML parse mode is supported for titles
  if (parseMode === ParseMode.HTML) {
    payload.text = `<b>${htmlEscapeString(config.title)}</b>\n${text}`;
  } else {
    payload.text = text;
  }

  return payload;
}
