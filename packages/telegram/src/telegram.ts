// Port of telegram.go (Service)
import {
  JsonClient,
  type Logger,
  type Params,
  PropKeyResolver,
  type Service,
  Standard,
} from "@woodpecker/core";
import { Client } from "./client.js";
import { Config, fields } from "./config.js";
import { createSendMessagePayload } from "./payload.js";

const MAX_LENGTH = 4096;

/** Service sends notifications to a given telegram chat. */
export class TelegramService implements Service {
  private readonly standard = new Standard();
  private config: Config | undefined;

  setLogger(logger: Logger): void {
    this.standard.setLogger(logger);
  }

  /** Initialize loads the Config from configURL and sets the logger. */
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.standard.setLogger(logger);
    }
    const config = new Config();
    config.preview = true;
    config.notification = true;
    config.setURL(configURL);
    this.config = config;
  }

  /** GetConfig returns the Config for the service. */
  getConfig(): Config {
    if (!this.config) {
      throw new Error("service has not been initialized");
    }
    return this.config;
  }

  /** Send a notification to Telegram. */
  async send(message: string, params?: Params): Promise<void> {
    // Go measures len(message) in UTF-8 bytes, not UTF-16 code units.
    if (Buffer.byteLength(message, "utf8") > MAX_LENGTH) {
      throw new Error("Message exceeds the max length");
    }

    const base = this.getConfig();
    // Work on a copy so params overrides don't mutate the stored config.
    const config = Object.assign(new Config(), base);

    const resolver = new PropKeyResolver(config, fields);
    resolver.updateConfigFromParams(params);

    await this.sendMessageForChatIDs(message, config);
  }

  private async sendMessageForChatIDs(
    message: string,
    config: Config,
  ): Promise<void> {
    // Default transport is the global fetch (tests override globalThis.fetch).
    const json = new JsonClient();
    // Mirror Go: iterate the originally-configured chats, but use the
    // params-overridden copy for the payload contents.
    for (const chat of this.getConfig().chats) {
      const client = new Client(config.token, json);
      const payload = createSendMessagePayload(message, chat, config);
      await client.sendMessage(payload);
    }
  }
}
