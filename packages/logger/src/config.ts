// Port of Go pkg/services/logger/logger_config.go
import type { FieldSchema, ServiceConfig } from "@woodpecker-js/core";
import { EnumlessConfig } from "@woodpecker-js/core";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "logger";

/**
 * Config is the configuration object for the Logger service.
 *
 * The logger URL carries no fields (Go's SetURL is a no-op and GetURL returns
 * the bare scheme). We retain the supplied URL so getURL() round-trips it.
 */
export class Config extends EnumlessConfig implements ServiceConfig {
  /** The logger service has no configurable fields. */
  static readonly fields: FieldSchema[] = [];

  private url: URL = new URL(`${Scheme}://`);

  getURL(): URL {
    return new URL(this.url.toString());
  }

  setURL(u: URL): void {
    this.url = new URL(u.toString());
  }
}
