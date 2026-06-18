import type { EnumFormatter, ServiceConfig } from "@woodpecker/core";
import { EnumlessConfig } from "@woodpecker/core";

// Scheme is the identifying part of this service's configuration URL.
export const Scheme = "rocketchat";
// NotEnoughArguments provided in the service URL.
export const NotEnoughArguments =
  "the apiURL does not include enough arguments";

// Config for the rocket.chat service, faithful port of rocketchat_config.go.
export class Config extends EnumlessConfig implements ServiceConfig {
  userName = "";
  host = "";
  port = "";
  tokenA = "";
  tokenB = "";
  channel = "";

  override enums(): Record<string, EnumFormatter> {
    return {};
  }

  // getURL returns a URL representation of the current field values. The port,
  // when present, is preserved (Go fix #495).
  getURL(): URL {
    const host = this.port !== "" ? `${this.host}:${this.port}` : this.host;
    const url = new URL(`${Scheme}://${host}`);
    url.pathname = `/${this.tokenA}/${this.tokenB}`;
    return url;
  }

  // setURL updates the config from a URL representation of its field values.
  setURL(serviceURL: URL): void {
    const userName = decodeURIComponent(serviceURL.username);
    const host = serviceURL.hostname;

    const path = serviceURL.pathname.split("/");
    if (path.length < 3) {
      throw new Error(NotEnoughArguments);
    }

    this.port = serviceURL.port;
    this.userName = userName;
    this.host = host;
    this.tokenA = path[1] ?? "";
    this.tokenB = path[2] ?? "";

    if (path.length > 3) {
      // WHATWG URL keeps the leading '#' in `hash`; Go's Fragment strips it.
      const fragment = serviceURL.hash.startsWith("#")
        ? serviceURL.hash.slice(1)
        : serviceURL.hash;
      const path3 = path[3] ?? "";
      if (fragment !== "") {
        this.channel = `#${fragment}`;
      } else if (!path3.startsWith("@")) {
        this.channel = `#${path3}`;
      } else {
        this.channel = path3;
      }
    }
  }
}

// createConfigFromURL builds a Config from a service URL.
export function createConfigFromURL(serviceURL: URL): Config {
  const config = new Config();
  config.setURL(serviceURL);
  return config;
}
