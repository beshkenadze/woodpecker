// Port of telegram_config.go + telegram_token.go
import {
  type EnumFormatter,
  type FieldSchema,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker-js/core";
import { ParseMode, parseModeEnum } from "./parseMode.js";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "telegram";

const TOKEN_PATTERN = /^[0-9]+:[a-zA-Z0-9_-]+$/;

/** IsTokenValid validates a telegram bot token. */
export function isTokenValid(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Field schema for the telegram Config. */
export const fields: FieldSchema[] = [
  // Token comes from the URL user info and is handled manually in
  // setURL/getURL (split across username:password). It is intentionally
  // not bound via a urlPart so core's bindToURL does not re-encode the
  // whole "user:pass" token into the username.
  { name: "token", type: "string" },
  {
    name: "preview",
    type: "bool",
    key: ["preview"],
    default: "Yes",
    desc: "If disabled, no web page preview will be displayed for URLs",
  },
  {
    name: "notification",
    type: "bool",
    key: ["notification"],
    default: "Yes",
    desc: "If disabled, sends Message silently",
  },
  {
    name: "parseMode",
    type: "enum",
    key: ["parsemode"],
    default: "None",
    enumName: "ParseMode",
    desc: "How the text Message should be parsed",
  },
  {
    name: "chats",
    type: "string[]",
    key: ["chats", "channels"],
    desc: "Chat IDs or Channel names (using @channel-name)",
  },
  {
    name: "title",
    type: "string",
    key: ["title"],
    default: "",
    desc: "Notification title, optionally set by the sender",
  },
];

/** Config for the telegram service. */
export class Config implements ServiceConfig {
  token = "";
  preview = true;
  notification = true;
  parseMode: number = ParseMode.None;
  chats: string[] = [];
  title = "";

  /** Enums returns the EnumFormatter map for enum fields. */
  enums(): Record<string, EnumFormatter> {
    return { ParseMode: parseModeEnum };
  }

  private resolver(): PropKeyResolver {
    return new PropKeyResolver(this, fields);
  }

  /** GetURL returns a URL representation of the current field values. */
  getURL(): URL {
    const tokenParts = this.token.split(":");
    const username = tokenParts[0] ?? "";
    const password = tokenParts[1] ?? "";

    const url = new URL(`${Scheme}://${Scheme}`);
    url.username = encodeURIComponent(username);
    url.password = encodeURIComponent(password);
    this.resolver().bindToURL(url);
    // ForceQuery: always emit a trailing "?" even with no query params.
    if (!url.search) {
      url.search = "?";
    }
    return url;
  }

  /** SetURL updates the config from a URL representation. */
  setURL(url: URL): void {
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const token = `${username}:${password}`;
    if (!isTokenValid(token)) {
      throw new Error(`invalid telegram token ${token}`);
    }

    const resolver = this.resolver();
    for (const [key, value] of url.searchParams.entries()) {
      resolver.set(key, value);
    }

    if (this.chats.length < 1) {
      throw new Error("no channels defined in config URL");
    }

    this.token = token;
  }
}
