// Port of Go pkg/services/googlechat/googlechat.go.

import type { Logger, Params, Service } from "@woodpecker-js/core";
import { ApiError, JsonClient, Standard } from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { GoogleChatConfig } from "./config.ts";

/** JSON is the actual payload being sent to the Google Chat API. */
interface GoogleChatPayload {
  text: string;
}

export interface GoogleChatServiceOptions {
  dispatcher?: Dispatcher;
}

/** Service providing Google Chat as a notification service. */
export class GoogleChatService extends Standard implements Service {
  private config?: GoogleChatConfig;
  private readonly client: JsonClient;

  constructor(opts: GoogleChatServiceOptions = {}) {
    super();
    this.client = new JsonClient(
      opts.dispatcher ? { dispatcher: opts.dispatcher } : {},
    );
  }

  /** Loads config from the configuration URL and sets the logger. */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    const config = new GoogleChatConfig();
    config.setURL(url);
    this.config = config;
  }

  /** Sends a notification message to Google Chat. */
  async send(message: string, _params?: Params): Promise<void> {
    if (!this.config) {
      throw new Error("service not initialized");
    }

    const postURL = this.config.getAPIURL().toString();
    const payload: GoogleChatPayload = { text: message };

    try {
      await this.client.post<unknown>(postURL, payload);
    } catch (err) {
      if (err instanceof ApiError) {
        throw new Error(
          `Google Chat API notification returned ${err.statusCode} HTTP status code`,
        );
      }
      throw new Error(
        `failed to send notification to Google Chat: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
