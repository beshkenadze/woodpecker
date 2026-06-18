import {
  EnumlessConfig,
  type FieldSchema,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker-js/core";

/** Identifying scheme for the mattermost service. */
export const SCHEME = "mattermost";

/** Error returned when the service URL lacks the required token argument. */
export const NOT_ENOUGH_ARGUMENTS =
  "the apiURL does not include enough arguments, either provide 1 or 3 arguments (they may be empty)";

/**
 * Query-prop schema for the mattermost config. Only `icon` (with aliases
 * `icon_emoji` / `icon_url`) and `title` are query props; user/host/path are
 * URL parts handled directly in setURL/getURL. Port of mattermost_config.go tags.
 */
export const QUERY_SCHEMA: FieldSchema[] = [
  {
    name: "icon",
    key: ["icon", "icon_emoji", "icon_url"],
    default: "",
    desc: "Use emoji or URL as icon (based on presence of http(s):// prefix)",
  },
  {
    name: "title",
    key: ["title"],
    default: "",
    desc: "Notification title, optionally set by the sender (not used)",
  },
];

/**
 * MattermostConfig holds all information for a mattermost webhook.
 * Faithful port of mattermost.Config (preserves host:port).
 */
export class MattermostConfig extends EnumlessConfig implements ServiceConfig {
  /** Override webhook user (url:user). */
  userName = "";
  /** Use emoji or URL as icon (key:icon,icon_emoji,icon_url). */
  icon = "";
  /** Notification title, set by the sender (not used) (key:title). */
  title = "";
  /** Override webhook channel (url:path2). */
  channel = "";
  /** Mattermost server host, including optional port (url:host,port). */
  host = "";
  /** Webhook token (url:path1). */
  token = "";

  private resolver(): PropKeyResolver {
    return new PropKeyResolver(this, QUERY_SCHEMA);
  }

  /** GetURL returns a URL representation of the current field values. */
  getURL(): URL {
    const paths = ["", this.token];
    if (this.channel !== "") {
      paths.push(this.channel);
    }

    const url = new URL(`${SCHEME}://placeholder`);
    url.host = this.host;
    url.pathname = paths.join("/");
    if (this.userName !== "") {
      url.username = this.userName;
    }
    this.resolver().bindToURL(url);
    return url;
  }

  /** SetURL updates the config from a URL representation of its field values. */
  setURL(url: URL): void {
    this.setURLWithResolver(url, this.resolver());
  }

  /** setURLWithResolver shares the parse path with the service (port of setURL). */
  setURLWithResolver(serviceURL: URL, resolver: PropKeyResolver): void {
    this.host = serviceURL.host;

    if (serviceURL.pathname === "" || serviceURL.pathname === "/") {
      throw new Error(NOT_ENOUGH_ARGUMENTS);
    }

    this.userName = decodeUserInfo(serviceURL.username);

    for (const [key, value] of serviceURL.searchParams.entries()) {
      resolver.set(key, value);
    }

    const path = serviceURL.pathname.slice(1).split("/");
    if (path.length < 1) {
      throw new Error(NOT_ENOUGH_ARGUMENTS);
    }

    this.token = path[0] ?? "";
    if (path.length > 1 && path[1] !== "") {
      this.channel = path[1] ?? "";
    }
  }
}

/**
 * decodeUserInfo decodes a URL-encoded userinfo segment, matching Go's
 * url.User.Username() (which returns the decoded value). Unlike
 * decodeURIComponent it tolerates malformed percent-encoding instead of
 * throwing, so URLs that Go accepts do not crash the parser.
 */
function decodeUserInfo(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** CreateConfigFromURL builds and populates a config from a service URL. */
export function createConfigFromURL(serviceURL: URL): MattermostConfig {
  const config = new MattermostConfig();
  config.setURL(serviceURL);
  return config;
}
