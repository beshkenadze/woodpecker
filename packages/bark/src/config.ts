import {
  EnumlessConfig,
  type FieldSchema,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker/core";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "bark";

/**
 * forceQuery mirrors Go's url.URL.ForceQuery: the serialized URL always ends
 * with a "?" even when there are no query parameters. The WHATWG URL serializer
 * drops the trailing "?", so toString()/href are patched to re-add it.
 */
function forceQuery(url: URL): URL {
  if (url.search !== "") {
    return url;
  }
  const base = url.toString();
  const withQuery = (): string => `${base}?`;
  Object.defineProperty(url, "toString", {
    value: withQuery,
    enumerable: false,
  });
  Object.defineProperty(url, "href", { get: withQuery, enumerable: false });
  return url;
}

/**
 * Field schema for the bark config, mirroring the struct tags in Go's
 * bark_config.go. The 9 key-tagged fields are the query props; host, path and
 * deviceKey are derived from URL parts.
 */
const FIELDS: FieldSchema[] = [
  {
    name: "title",
    type: "string",
    key: ["title"],
    default: "",
    desc: "Notification title, optionally set by the sender",
  },
  {
    name: "scheme",
    type: "string",
    key: ["scheme"],
    default: "https",
    desc: "Server protocol, http or https",
  },
  {
    name: "sound",
    type: "string",
    key: ["sound"],
    default: "",
    desc: "Value from https://github.com/Finb/Bark/tree/master/Sounds",
  },
  {
    name: "badge",
    type: "int",
    key: ["badge"],
    default: "0",
    desc: "The number displayed next to App icon",
  },
  {
    name: "icon",
    type: "string",
    key: ["icon"],
    default: "",
    desc: "An url to the icon, available only on iOS 15 or later",
  },
  {
    name: "group",
    type: "string",
    key: ["group"],
    default: "",
    desc: "The group of the notification",
  },
  {
    name: "url",
    type: "string",
    key: ["url"],
    default: "",
    desc: "Url that will jump when click notification",
  },
  {
    name: "category",
    type: "string",
    key: ["category"],
    default: "",
    desc: "Reserved field, no use yet",
  },
  {
    name: "copy",
    type: "string",
    key: ["copy"],
    default: "",
    desc: "The value to be copied",
  },
];

/**
 * Config for the bark service, mirroring Go's bark.Config (bark_config.go).
 */
export class Config extends EnumlessConfig implements ServiceConfig {
  title = "";
  host = "";
  path = "/";
  deviceKey = "";
  scheme = "https";
  sound = "";
  badge = 0;
  icon = "";
  group = "";
  url = "";
  category = "";
  copy = "";

  static fields(): FieldSchema[] {
    return FIELDS;
  }

  /**
   * GetAPIURL returns the API URL for the passed endpoint, mirroring Go's
   * Config.GetAPIURL. The path always has a single leading slash and a trailing
   * slash before the endpoint is appended.
   */
  getAPIURL(endpoint: string): string {
    let path = this.path;
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    if (!path.endsWith("/")) {
      path = `${path}/`;
    }
    path += endpoint;

    const apiURL = new URL(`${this.scheme}://${this.host}`);
    apiURL.pathname = path;
    return apiURL.toString();
  }

  setURL(url: URL): void {
    const resolver = new PropKeyResolver(this, FIELDS);
    this.setURLWithResolver(resolver, url);
  }

  setURLWithResolver(resolver: PropKeyResolver, url: URL): void {
    // The bark config encodes the device key as the URL password (user is empty).
    this.deviceKey = decodeURIComponent(url.password);
    this.host = url.host;
    this.path = decodeURIComponent(url.pathname);
    // Mirror Go's setURL: every query key is fed through the resolver, so an
    // unknown key (or an invalid value) is rejected. Core's setFromURL only
    // visits known keys and silently ignores the rest, so we loop ourselves.
    for (const [key, value] of url.searchParams) {
      resolver.set(key, value);
    }
  }

  getURL(): URL {
    const resolver = new PropKeyResolver(this, FIELDS);
    return this.getURLWithResolver(resolver);
  }

  getURLWithResolver(resolver: PropKeyResolver): URL {
    const url = new URL(`${Scheme}://${this.host}`);
    // Device key is carried as the password; the user component stays empty.
    url.username = "";
    url.password = encodeURIComponent(this.deviceKey);
    url.pathname = this.path;
    resolver.bindToURL(url);
    return forceQuery(url);
  }
}
