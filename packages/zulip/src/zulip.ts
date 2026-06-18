import { STATUS_CODES } from "node:http";
import type { Logger, Params, Service } from "@woodpecker-js/core";
import { JsonClient, Standard } from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { Config, ErrorMessage } from "./config.ts";

const CONTENT_MAX_SIZE = 10000; // bytes
const TOPIC_MAX_LENGTH = 60; // characters

/**
 * Formats a status line as Go's net/http does for res.Status: "<code> <reason>".
 * undici does not expose the wire reason phrase, so it is derived from the code.
 */
function statusText(code: number): string {
  const reason = STATUS_CODES[code];
  return reason ? `${code} ${reason}` : `${code}`;
}

export interface ZulipServiceOptions {
  /**
   * Injectable undici dispatcher (e.g. MockAgent under Node) for testing. Note:
   * Bun's built-in undici ignores custom dispatchers, so Bun tests use a real
   * loopback server via `apiOrigin` instead.
   */
  dispatcher?: Dispatcher;
  /**
   * Overrides the request origin (scheme + host) used to reach the Zulip API.
   * Defaults to `https://{host}`. Intended for tests that point the service at a
   * loopback server; production code never sets this.
   */
  apiOrigin?: string;
}

/** Builds the Zulip messages payload, mirroring Go's CreatePayload. */
function createPayload(config: Config, message: string): URLSearchParams {
  const form = new URLSearchParams();
  form.set("type", "stream");
  form.set("to", config.stream);
  form.set("content", message);
  if (config.topic !== "") {
    form.set("topic", config.topic);
  }
  return form;
}

/** Service sends notifications to a pre-configured Zulip stream/topic. */
export class ZulipService extends Standard implements Service {
  private config = new Config();
  private readonly dispatcher?: Dispatcher;
  private readonly apiOrigin?: string;

  constructor(opts: ZulipServiceOptions = {}) {
    super();
    this.dispatcher = opts.dispatcher;
    this.apiOrigin = opts.apiOrigin;
  }

  /** Loads config from the service URL and sets the logger. */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    const config = new Config();
    config.setURL(url);
    this.config = config;
  }

  /** Sends a notification message to Zulip. */
  async send(message: string, params?: Params): Promise<void> {
    // Clone the config because params may override stream/topic for this Send only.
    const config = this.config.clone();

    if (params) {
      if (params.stream !== undefined) {
        config.stream = params.stream;
      }
      if (params.topic !== undefined) {
        config.topic = params.topic;
      }
    }

    const topicLength = [...config.topic].length; // count runes, not UTF-16 units
    if (topicLength > TOPIC_MAX_LENGTH) {
      throw new Error(
        `topic exceeds max length (${TOPIC_MAX_LENGTH} characters): was ${topicLength} characters`,
      );
    }

    const messageSize = Buffer.byteLength(message, "utf8");
    if (messageSize > CONTENT_MAX_SIZE) {
      throw new Error(
        `message exceeds max size (${CONTENT_MAX_SIZE} bytes): was ${messageSize} bytes`,
      );
    }

    await this.doSend(config, message);
  }

  private async doSend(config: Config, message: string): Promise<void> {
    const origin = this.apiOrigin ?? `https://${config.host}`;
    const apiURL = `${origin}/api/v1/messages`;
    const payload = createPayload(config, message);
    const token = Buffer.from(`${config.botMail}:${config.botKey}`).toString(
      "base64",
    );
    const client = new JsonClient({ dispatcher: this.dispatcher });

    // Use the raw request escape hatch (not postForm) so transport reaches us as
    // a thrown error and any non-200 surfaces as a Response we can check
    // ourselves — Zulip's API treats only HTTP 200 as success.
    let status: number;
    try {
      const res = await client.request("POST", apiURL, {
        body: payload.toString(),
        contentType: "application/x-www-form-urlencoded",
        headers: { Authorization: `Basic ${token}` },
      });
      status = res.status;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to send zulip message: ${reason}`);
    }

    // Zulip's API returns 200 on success; mirror Go's strict status check.
    if (status !== 200) {
      throw new Error(
        `failed to send zulip message: response status code ${statusText(status)}`,
      );
    }
  }
}

export { ErrorMessage };
