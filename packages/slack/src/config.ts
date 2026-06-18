// Port of pkg/services/slack/slack_config.go

import type {
  EnumFormatter,
  FieldSchema,
  ServiceConfig,
} from "@woodpecker/core";
import { EnumlessConfig, PropKeyResolver } from "@woodpecker/core";
import { Token } from "./token.js";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "slack";

/**
 * FieldSchema for the slack Config. Mirrors the Go struct tags:
 * BotName key:"botname,username"; Icon key:"icon,icon_emoji,icon_url";
 * Token url:"user,pass"; Color key:"color"; Title key:"title";
 * Channel url:"host"; ThreadTS key:"thread_ts".
 *
 * The Token (a ConfigProp) and Channel url-parts are mapped explicitly in
 * applyURL/buildURL below — Token needs ConfigProp (de)serialization and
 * Channel needs the legacy "webhook" special-casing — so they are NOT declared
 * as `urlParts` here, keeping config.ts the single source of truth for that
 * mapping and leaving the shared resolver to handle query keys only.
 */
export const configSchema: FieldSchema[] = [
  {
    name: "botName",
    type: "string",
    key: ["botname", "username"],
    default: "",
    desc: "Bot name",
  },
  {
    name: "icon",
    type: "string",
    key: ["icon", "icon_emoji", "icon_url"],
    default: "",
    desc: "Use emoji or URL as icon (based on presence of http(s):// prefix)",
  },
  {
    name: "token",
    type: "prop",
    desc: "API Bot token",
  },
  {
    name: "color",
    type: "string",
    key: ["color"],
    default: "",
    desc: "Message left-hand border color",
  },
  {
    name: "title",
    type: "string",
    key: ["title"],
    default: "",
    desc: "Prepended text above the message",
  },
  {
    name: "channel",
    type: "string",
    desc: "Channel to send messages to in Cxxxxxxxxxx format",
  },
  {
    name: "threadTS",
    type: "string",
    key: ["thread_ts"],
    default: "",
    desc: "ts value of the parent message (to send message as reply in thread)",
  },
];

/** Config for the slack service. */
export class Config extends EnumlessConfig implements ServiceConfig {
  [key: string]: unknown;

  botName = "";
  icon = "";
  token: Token = new Token();
  color = "";
  title = "";
  channel = "";
  threadTS = "";

  override enums(): Record<string, EnumFormatter> {
    return {};
  }

  /** GetURL returns a URL representation of the current field values. */
  getURL(): URL {
    const resolver = new PropKeyResolver(this, configSchema);
    return this.buildURL(resolver);
  }

  /** SetURL updates the config from a URL representation of its field values. */
  setURL(serviceURL: URL): void {
    const resolver = new PropKeyResolver(this, configSchema);
    this.applyURL(resolver, serviceURL);
  }

  private buildURL(resolver: PropKeyResolver): URL {
    // Build the (non-default) query string with the shared resolver. We use its
    // Go-faithful query escaping directly (buildQuery) rather than round-tripping
    // through a WHATWG URL, whose searchParams.toString() would re-encode chars
    // like '*', '(', ')' and diverge from Go's url.QueryEscape output.
    const query = resolver.buildQuery();

    // Assemble the canonical string the Go url.URL{User,Host,Scheme,RawQuery}
    // would produce: no trailing slash before the query (WHATWG URL would add
    // one for this non-special scheme when userinfo is present). The token's
    // normalized prop value ("type:p1-p2-p3") is exactly its userinfo form.
    const userinfo = this.token.getPropValue();
    const authority =
      userinfo !== "" ? `${userinfo}@${this.channel}` : this.channel;
    const canonical = `${Scheme}://${authority}${query !== "" ? `?${query}` : ""}`;

    return makeCanonicalURL(canonical);
  }

  private applyURL(resolver: PropKeyResolver, serviceURL: URL): void {
    let token: string;

    // url.pathname includes the leading "/"; Go checks len(Path) > 1.
    const path = serviceURL.pathname;
    if (path.length > 1) {
      // Reading legacy config URL format: slack://botname@HOST/PATH...
      token =
        decodeURIComponent(serviceURL.hostname) + decodeURIComponent(path);
      this.channel = "webhook";
      this.botName = decodeURIComponent(serviceURL.username);
    } else {
      // New format: userinfo holds "type:p1-p2-p3".
      token = userInfoString(serviceURL);
      this.channel = decodeURIComponent(serviceURL.hostname);
    }

    this.token.setFromProp(token);

    // Apply query params strictly: an unknown key (e.g. a typo) must error.
    // The shared resolver's setFromURL silently skips unknown keys, so we drive
    // resolver.set directly, which throws on any unrecognized config key.
    for (const [key, value] of serviceURL.searchParams.entries()) {
      resolver.set(key, value);
    }
  }
}

/**
 * Returns a real URL whose toString()/href emit the given canonical string.
 * WHATWG URL serialization adds a "/" before the query for the non-special
 * `slack:` scheme when userinfo is present; Go's url.URL does not. We override
 * the string accessors so the round-trip matches the Go-produced form exactly.
 */
function makeCanonicalURL(canonical: string): URL {
  const url = new URL(canonical);
  Object.defineProperty(url, "href", {
    value: canonical,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(url, "toString", {
    value: () => canonical,
    enumerable: false,
    configurable: true,
  });
  return url;
}

/** Reconstructs the Go url.User.String() form: "user", "user:pass", or "". */
function userInfoString(serviceURL: URL): string {
  const user = decodeURIComponent(serviceURL.username);
  const pass = decodeURIComponent(serviceURL.password);
  if (user === "" && pass === "" && !serviceURL.href.includes("@")) {
    return "";
  }
  if (pass !== "") {
    return `${user}:${pass}`;
  }
  return user;
}

/** CreateConfigFromURL builds a Config from a service URL. */
export function createConfigFromURL(serviceURL: URL): Config {
  const config = new Config();
  config.setURL(serviceURL);
  return config;
}
