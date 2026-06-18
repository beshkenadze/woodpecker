// Port of Go pkg/services/gotify/gotify.go.
import {
  JsonClient,
  type Logger,
  type Params,
  PropKeyResolver,
  Standard,
} from "@woodpecker/core";
import type { Dispatcher } from "undici";
import { Config } from "./config.js";
import {
  formatErrorResponse,
  isErrorResponse,
  type MessageRequest,
  type MessageResponse,
} from "./payload.js";

const TOKEN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_";

/**
 * isTokenValid mirrors the Gotify server token validation rules.
 * https://github.com/gotify/server/blob/ad157a138b4985086c484a7aabfc2deada5a33dd/auth/token.go#L8
 */
export function isTokenValid(token: string): boolean {
  if (token.length !== 15) {
    return false;
  }
  if (token[0] !== "A") {
    return false;
  }
  for (const c of token) {
    if (!TOKEN_CHARS.includes(c)) {
      return false;
    }
  }
  return true;
}

/** buildURL constructs the Gotify message endpoint URL from the config. */
export function buildURL(config: Config): string {
  const token = config.Token;
  if (!isTokenValid(token)) {
    throw new Error(`invalid gotify token "${token}"`);
  }
  const scheme = config.DisableTLS ? "http" : "https";
  return `${scheme}://${config.Host}${config.Path}/message?token=${token}`;
}

export interface GotifyServiceOptions {
  /** Injectable undici dispatcher (e.g. MockAgent in tests). */
  dispatcher?: Dispatcher;
}

/** GotifyService sends notifications to a Gotify server. */
export class GotifyService extends Standard {
  private config?: Config;
  private pkr?: PropKeyResolver;
  private client: JsonClient;

  constructor(options?: GotifyServiceOptions) {
    super();
    this.client = new JsonClient(
      options?.dispatcher ? { dispatcher: options.dispatcher } : undefined,
    );
  }

  /** initialize loads the config from configURL and sets the logger. */
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    this.config = new Config();
    this.pkr = new PropKeyResolver(this.config, Config.schema);
    this.config.setURL(configURL);
  }

  /** send posts a notification message to Gotify. */
  async send(message: string, params?: Params): Promise<void> {
    if (!this.config || !this.pkr) {
      throw new Error("service not initialized");
    }
    const config = this.config;
    try {
      this.pkr.updateConfigFromParams(params);
    } catch (err) {
      this.logf("Failed to update params: %v", err);
    }

    const postURL = buildURL(config);
    const request: MessageRequest = {
      message,
      title: config.Title,
      priority: config.Priority,
    };

    let response: unknown;
    try {
      response = await this.client.post<MessageResponse>(postURL, request);
    } catch (err) {
      const body = (err as { body?: unknown }).body;
      if (isErrorResponse(body)) {
        throw new Error(formatErrorResponse(body));
      }
      throw new Error(`failed to send notification to Gotify: ${String(err)}`);
    }

    // Go's jsonclient always json.Unmarshal-s the success body and surfaces any
    // failure (including a non-JSON 2xx body) as an error. The shared JsonClient
    // tolerates a non-JSON body by returning the raw text, so reject here to keep
    // Go parseResponse parity.
    if (typeof response !== "object" || response === null) {
      throw new Error(
        `failed to send notification to Gotify: unexpected response body`,
      );
    }
  }
}
