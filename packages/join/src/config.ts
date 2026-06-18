// Port of Go pkg/services/join/join_config.go + join.go (error messages).

import {
  type EnumFormatter,
  type FieldSchema,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker/core";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "join";

/** ErrorMessage values for the join service. */
export const APIKeyMissing = "API key missing from config URL";
export const DevicesMissing = "devices missing from config URL";

/** Field schema mirroring the Go struct tags on join.Config. */
export const fields: FieldSchema[] = [
  {
    name: "devices",
    type: "string[]",
    key: ["devices"],
    desc: "Comma separated list of device IDs",
  },
  {
    name: "title",
    type: "string",
    key: ["title"],
    desc: "If set creates a notification",
  },
  {
    name: "icon",
    type: "string",
    key: ["icon"],
    desc: "Icon URL",
  },
];

/** Config for the Join notification service. */
export class Config implements ServiceConfig {
  apiKey = "";
  devices: string[] = [];
  title = "";
  icon = "";

  // The schema is immutable, so one resolver per Config is reused for both
  // serialization and parsing rather than rebuilt on every call.
  private readonly resolver = new PropKeyResolver(this, fields);

  enums(): Record<string, EnumFormatter> {
    return {};
  }

  /** getURL returns a URL representation of the current field values. */
  getURL(): URL {
    return new URL(this.getURLString());
  }

  /**
   * getURLString returns the exact Go-faithful URL string, mirroring
   * url.URL{User: UserPassword("Token", apiKey), Host: "join", Scheme: "join",
   * ForceQuery: true, RawQuery: BuildQuery()}.String().
   *
   * The WHATWG URL constructor normalizes the empty path to "/", so the exact
   * Go form (which has no path segment) is produced here directly.
   */
  getURLString(): string {
    const query = this.resolver.buildQuery();
    const userInfo = `Token:${encodeURIComponent(this.apiKey)}`;
    return `${Scheme}://${userInfo}@join?${query}`;
  }

  /** setURL updates the config from a URL representation. */
  setURL(url: URL): void {
    // Go's url.User.Password() returns the decoded password; the WHATWG URL API
    // leaves url.password percent-encoded, so decode to match.
    this.apiKey = decodeURIComponent(url.password);

    for (const [key, value] of url.searchParams.entries()) {
      this.resolver.set(key, value);
    }

    if (this.devices.length < 1) {
      throw new Error(DevicesMissing);
    }

    if (this.apiKey.length < 1) {
      throw new Error(APIKeyMissing);
    }
  }
}
