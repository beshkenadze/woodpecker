/**
 * Built-in `logger://` notification service.
 *
 * Faithful port of `pkg/services/logger` (config.go + logger.go) plus the
 * `pkg/services/standard` Logger behaviour it embeds. This is the one service
 * vendored inline so the CLI is runnable end-to-end; the remaining 20 services
 * self-register via their descriptors in the integration pass.
 */

import type {
  EnumFormatter,
  FieldInfo,
  Logger,
  Params,
  Service,
  ServiceConfig,
} from "../types.js";

export const SCHEME = "logger";

/**
 * Config is the configuration object for the Logger service.
 * Port of logger.Config (embeds standard.EnumlessConfig). It has no URL fields.
 */
class LoggerConfig implements ServiceConfig {
  getURL(): URL {
    // Port of logger.Config.GetURL — only the scheme is meaningful.
    return new URL(`${SCHEME}://`);
  }

  setURL(_url: URL): void {
    // Port of logger.Config.SetURL — no-op (no fields to populate).
  }

  enums(): Record<string, EnumFormatter> {
    // Port of standard.EnumlessConfig.Enums — empty.
    return {};
  }

  configFields(): FieldInfo[] {
    // The logger config exposes no user-configurable fields.
    return [];
  }
}

/**
 * LoggerService writes the notification message via the injected Logger
 * (falling back to console). Port of logger.Service.
 */
export class LoggerService implements Service {
  private logger?: Logger;
  private config: LoggerConfig = new LoggerConfig();

  initialize(_url: URL, logger?: Logger): void {
    // Port of logger.Service.Initialize.
    if (logger !== undefined) {
      this.logger = logger;
    }
    this.config = new LoggerConfig();
  }

  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  async send(message: string, params?: Params): Promise<void> {
    // Port of logger.Service.Send/doSend: log the message without mutating the
    // caller's params. (Templating is omitted from the CLI vendored subset.)
    void params;
    if (this.logger !== undefined) {
      this.logger.logf("%s", message);
    } else {
      // eslint-disable-next-line no-console
      console.log(message);
    }
  }

  getConfig(): ServiceConfig {
    return this.config;
  }
}
