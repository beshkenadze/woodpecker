// Port of Go pkg/services/googlechat/googlechat_config.go.
import { EnumlessConfig } from "@woodpecker-js/core";

export const Scheme = "googlechat";

const DEFAULT_HOST = "chat.googleapis.com";

/**
 * Config holds the Google Chat webhook parameters reconstructed from a
 * `googlechat://`/`hangouts://` configuration URL.
 */
export class GoogleChatConfig extends EnumlessConfig {
  host = DEFAULT_HOST;
  path = "";
  token = "";
  key = "";

  /** Updates the config from a configuration URL representation. */
  setURL(url: URL): void {
    this.host = url.host;
    this.path = url.pathname;
    this.key = url.searchParams.get("key") ?? "";
    this.token = url.searchParams.get("token") ?? "";

    if (this.key === "") {
      throw new Error("missing field 'key'");
    }
    if (this.token === "") {
      throw new Error("missing field 'token'");
    }
  }

  /** Returns a configuration URL representation of the current field values. */
  getURL(): URL {
    return this.buildURL(Scheme);
  }

  /** Returns the reconstructed `https://` webhook URL to POST to. */
  getAPIURL(): URL {
    return this.buildURL("https");
  }

  private buildURL(scheme: string): URL {
    const url = new URL(`${scheme}://${this.host}`);
    url.pathname = this.path;
    // Go's url.Values.Encode sorts keys alphabetically: key, token.
    url.searchParams.set("key", this.key);
    url.searchParams.set("token", this.token);
    return url;
  }
}
