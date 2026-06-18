import type { EnumFormatter, ServiceConfig } from "@woodpecker/core";
import { type FieldSchema, PropKeyResolver } from "@woodpecker/core";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "pushover";

/** ErrorMessage values for config URL validation failures. */
export const UserMissing = "user missing from config URL";
export const TokenMissing = "token missing from config URL";

/** Field schema describing the query props (devices, priority, title). */
export const fieldSchema: FieldSchema[] = [
  { name: "devices", type: "string[]", key: ["devices"], separator: "," },
  { name: "priority", type: "int", key: ["priority"], default: "0", bits: 8 },
  { name: "title", type: "string", key: ["title"] },
];

/**
 * Config for the Pushover notification service. Faithful port of Go
 * pushover.Config: Token comes from the URL password, User from the host, and
 * devices/priority/title are query props.
 */
export class Config implements ServiceConfig {
  token = "";
  user = "";
  devices: string[] = [];
  priority = 0;
  title = "";

  enums(): Record<string, EnumFormatter> {
    return {};
  }

  /** newResolver binds a PropKeyResolver to this config's query props. */
  newResolver(): PropKeyResolver {
    return new PropKeyResolver(this, fieldSchema);
  }

  /** getURL returns a URL representation of the current field values. */
  getURL(): URL {
    const resolver = this.newResolver();
    const query = resolver.buildQuery();
    // Go uses url.UserPassword("Token", config.Token): the username is literally
    // "Token". Build the authority as a string so username/password/host all
    // survive WHATWG URL parsing (mutating .password after .host drops it).
    const auth = `Token:${encodeURIComponent(this.token)}@${this.user}`;
    // Go sets ForceQuery: true, so the URL always carries a trailing "?".
    const search = query === "" ? "?" : `?${query}`;
    return new URL(`${Scheme}://${auth}${search}`);
  }

  /** setURL updates this config from a URL representation of its field values. */
  setURL(url: URL): void {
    const resolver = this.newResolver();
    this.setURLWithResolver(url, resolver);
  }

  /** setURLWithResolver mirrors Go (config).setURL, sharing a resolver instance. */
  setURLWithResolver(url: URL, resolver: PropKeyResolver): void {
    this.user = url.host;
    this.token = url.password;

    for (const [key, value] of url.searchParams.entries()) {
      resolver.set(key, value);
    }

    if (this.user.length < 1) {
      throw new Error(UserMissing);
    }
    if (this.token.length < 1) {
      throw new Error(TokenMissing);
    }
  }
}
