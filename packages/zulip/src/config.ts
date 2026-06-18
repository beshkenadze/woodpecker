import { EnumlessConfig } from "@woodpecker-js/core";

/** Identifying scheme for the Zulip service configuration URL. */
export const Scheme = "zulip";

/** Error messages for config/URL parsing, mirroring Go's zulip_errors.go. */
export const ErrorMessage = {
  MissingAPIKey: "missing API key",
  MissingHost: "missing Zulip host",
  MissingBotMail: "missing Bot mail address",
  /** Format string: max length, actual length. */
  TopicTooLong: "topic exceeds max length (%d characters): was %d characters",
} as const;

/**
 * Config for the Zulip service.
 *
 * URL shape: zulip://{botMail}:{botKey}@{host[:port]}?stream={stream}&topic={topic}
 * - botMail -> URL user
 * - botKey  -> URL password
 * - host    -> host[:port] (non-standard ports are preserved, per Go fix #495)
 * - stream  -> query "stream"
 * - topic   -> query "topic" (alias "title")
 */
export class Config extends EnumlessConfig {
  botMail = "";
  botKey = "";
  host = "";
  stream = "";
  topic = "";

  /** Builds a URL representation of the current field values. */
  getURL(): URL {
    return new URL(this.toURLString());
  }

  /**
   * Serializes the config to its canonical Go-compatible URL string. Unlike
   * URL.toString(), this omits the empty path slash that the WHATWG serializer
   * would otherwise insert before the query (matching Go's url.URL.String()).
   */
  toURLString(): string {
    const query = new URLSearchParams();
    if (this.stream !== "") {
      query.set("stream", this.stream);
    }
    if (this.topic !== "") {
      query.set("topic", this.topic);
    }
    const auth = `${encodeURIComponent(this.botMail)}:${encodeURIComponent(this.botKey)}`;
    const queryString = query.toString();
    const suffix = queryString === "" ? "" : `?${queryString}`;
    // host may already include a non-standard port (e.g. "example.com:8443").
    return `${Scheme}://${auth}@${this.host}${suffix}`;
  }

  /** Populates this config from a service URL, validating required parts. */
  setURL(url: URL): void {
    setConfigFromURL(this, url);
  }

  /** Clones the config to a new Config instance. */
  clone(): Config {
    const c = new Config();
    c.botMail = this.botMail;
    c.botKey = this.botKey;
    c.host = this.host;
    c.stream = this.stream;
    c.topic = this.topic;
    return c;
  }
}

/**
 * Determines whether the URL's userinfo contains an explicit password component
 * (i.e. a ':' separator), matching Go's url.User.Password() "ok" semantics.
 */
function hasPasswordComponent(url: URL): boolean {
  const raw = url.href;
  const afterScheme = raw.slice(raw.indexOf("://") + 3);
  const atIndex = afterScheme.indexOf("@");
  if (atIndex === -1) {
    return false;
  }
  const userinfo = afterScheme.slice(0, atIndex);
  return userinfo.includes(":");
}

function setConfigFromURL(config: Config, url: URL): void {
  config.botMail = decodeURIComponent(url.username);
  if (config.botMail === "") {
    throw new Error(ErrorMessage.MissingBotMail);
  }

  if (!hasPasswordComponent(url)) {
    throw new Error(ErrorMessage.MissingAPIKey);
  }
  config.botKey = decodeURIComponent(url.password);

  config.host = url.host;
  if (config.host === "") {
    throw new Error(ErrorMessage.MissingHost);
  }

  config.stream = url.searchParams.get("stream") ?? "";
  config.topic = url.searchParams.get("topic") ?? "";
}

/** Builds a Config from a service URL (mirrors Go's CreateConfigFromURL). */
export function createConfigFromURL(url: URL): Config {
  const config = new Config();
  config.setURL(url);
  return config;
}
