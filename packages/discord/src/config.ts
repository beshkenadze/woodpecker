import {
  EnumlessConfig,
  type FieldSchema,
  MessageLevel,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker/core";
import { MessageLevelCount } from "./message.ts";

/** Scheme is the identifying part of this service's configuration URL. */
export const SCHEME = "discord";

/**
 * Field schema for the discord config, porting the Go struct tags in
 * discord_config.go. The schema drives URL (de)serialization via PropKeyResolver.
 */
export const DISCORD_SCHEMA: FieldSchema[] = [
  { name: "title", type: "string", key: ["title"], default: "" },
  {
    name: "username",
    type: "string",
    key: ["username"],
    default: "",
    desc: "Override the webhook default username",
  },
  {
    name: "avatar",
    type: "string",
    key: ["avatar", "avatarurl"],
    default: "",
    desc: "Override the webhook default avatar with specified URL",
  },
  {
    name: "color",
    type: "uint",
    key: ["color"],
    default: "50d9ff",
    base: 16,
    desc: "The color of the left border for plain messages",
  },
  {
    name: "colorError",
    type: "uint",
    key: ["colorerror"],
    default: "d60510",
    base: 16,
    desc: "The color of the left border for error messages",
  },
  {
    name: "colorWarn",
    type: "uint",
    key: ["colorwarn"],
    default: "ffc441",
    base: 16,
    desc: "The color of the left border for warning messages",
  },
  {
    name: "colorInfo",
    type: "uint",
    key: ["colorinfo"],
    default: "2488ff",
    base: 16,
    desc: "The color of the left border for info messages",
  },
  {
    name: "colorDebug",
    type: "uint",
    key: ["colordebug"],
    default: "7b00ab",
    base: 16,
    desc: "The color of the left border for debug messages",
  },
  {
    name: "splitLines",
    type: "bool",
    key: ["splitlines"],
    default: "Yes",
    desc: "Whether to send each line as a separate embedded item",
  },
  {
    name: "json",
    type: "bool",
    key: ["json"],
    default: "No",
    desc: "Whether to send the whole message as the JSON payload instead of using it as the 'content' field",
  },
  {
    name: "threadID",
    type: "string",
    key: ["thread_id"],
    default: "",
    desc: "Optional thread ID for posting into a channel thread",
  },
];

/**
 * Config holds the discord notification settings. WebhookID is the URL host and
 * Token is the URL user. Faithful port of Go discord.Config.
 */
export class Config extends EnumlessConfig implements ServiceConfig {
  webhookID = "";
  token = "";
  title = "";
  username = "";
  avatar = "";
  color = 0;
  colorError = 0;
  colorWarn = 0;
  colorInfo = 0;
  colorDebug = 0;
  /** Whether to send each line as a separate embedded item. */
  splitLines = false;
  /** Whether to send the message as a raw JSON payload. */
  json = false;
  threadID = "";

  /** LevelColors returns colors indexed by MessageLevel, mirroring Go LevelColors. */
  levelColors(): number[] {
    const colors = new Array<number>(MessageLevelCount).fill(0);
    colors[MessageLevel.Unknown] = this.color;
    colors[MessageLevel.Error] = this.colorError;
    colors[MessageLevel.Warning] = this.colorWarn;
    colors[MessageLevel.Info] = this.colorInfo;
    colors[MessageLevel.Debug] = this.colorDebug;
    return colors;
  }

  /**
   * newResolver builds a PropKeyResolver bound directly to this config. Schema
   * field names match the config property names, so no record shuffling is
   * needed.
   */
  newResolver(): PropKeyResolver {
    // core's PropKeyResolver reads enums from config.enums() itself.
    return new PropKeyResolver(this, DISCORD_SCHEMA);
  }

  /** getURL returns a URL representation of the current field values. */
  getURL(): URL {
    // Host must be set before username: WHATWG URL silently drops a username
    // assigned while the host is still empty (especially for non-special schemes).
    const url = new URL(`${SCHEME}://`);
    url.host = this.webhookID;
    url.username = encodeURIComponent(this.token);
    if (this.json) {
      url.pathname = "/raw";
    }
    this.newResolver().bindToURL(url);
    return url;
  }

  /** setURL updates this config from a URL representation. Throws on bad input. */
  setURL(url: URL): void {
    this.webhookID = url.host;
    this.token = decodeURIComponent(url.username);

    const path = url.pathname;
    if (path.length > 0 && path !== "/") {
      switch (path) {
        case "/raw":
          this.json = true;
          break;
        default:
          throw new Error("illegal argument in config URL");
      }
    }

    if (this.webhookID === "") {
      throw new Error("webhook ID missing from config URL");
    }
    if (this.token.length < 1) {
      throw new Error("token missing from config URL");
    }

    this.newResolver().setFromURL(url);
  }

  /** clone returns a shallow copy of this config (used when overlaying params). */
  clone(): Config {
    const next = new Config();
    Object.assign(next, this);
    return next;
  }
}
