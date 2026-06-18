// Ported from Go pkg/services/ntfy/ntfy.go.

import {
  JsonClient,
  type Logger,
  type Params,
  PropKeyResolver,
  parseBody,
  type Service,
  Standard,
} from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { Config, fieldSchema } from "./config.js";
import { type ApiResponse, formatApiError } from "./payload.js";
import { priorityEnum } from "./priority.js";

const VERSION = "0.0.0-nodejs";

export interface NtfyServiceOptions {
  /** dispatcher is forwarded to the JSON client (enables undici MockAgent in tests). */
  dispatcher?: Dispatcher;
}

/** NtfyService sends notifications via ntfy. */
export class NtfyService implements Service {
  private readonly standard = new Standard();
  private config = new Config();
  private readonly dispatcher?: Dispatcher;

  constructor(opts: NtfyServiceOptions = {}) {
    this.dispatcher = opts.dispatcher;
  }

  setLogger(logger: Logger): void {
    this.standard.setLogger(logger);
  }

  /** initialize loads config from configURL and sets the logger. */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.standard.setLogger(logger);
    }
    this.config = new Config();
    this.config.setURL(url);
  }

  /** send delivers message to ntfy, applying any per-send params first. */
  async send(message: string, params?: Params): Promise<void> {
    const config = this.config;

    if (params) {
      const pkr = new PropKeyResolver(config, fieldSchema);
      pkr.updateConfigFromParams(params);
    }

    await this.sendAPI(config, message);
  }

  private async sendAPI(config: Config, message: string): Promise<void> {
    const client = new JsonClient(
      this.dispatcher ? { dispatcher: this.dispatcher } : {},
    );

    // ntfy expects a raw text body and custom headers, not a JSON Content-Type.
    // request() leaves Content-Type unset unless a contentType opt is passed.
    client.headers["User-Agent"] = `shoutrrr/${VERSION}`;
    addHeaderIfNotEmpty(client.headers, "Title", config.title);
    addHeaderIfNotEmpty(
      client.headers,
      "Priority",
      priorityEnum.print(config.priority),
    );
    addHeaderIfNotEmpty(client.headers, "Tags", config.tags.join(","));
    addHeaderIfNotEmpty(client.headers, "Delay", config.delay);
    addHeaderIfNotEmpty(client.headers, "Actions", config.actions.join(";"));
    addHeaderIfNotEmpty(client.headers, "Click", config.click);
    addHeaderIfNotEmpty(client.headers, "Attach", config.attach);
    addHeaderIfNotEmpty(client.headers, "X-Icon", config.icon);
    addHeaderIfNotEmpty(client.headers, "Filename", config.filename);
    addHeaderIfNotEmpty(client.headers, "Email", config.email);

    if (!config.cache) {
      client.headers.Cache = "no";
    }
    if (!config.firebase) {
      client.headers.Firebase = "no";
    }
    if (config.markdown) {
      client.headers.Markdown = "yes";
    }

    let res: Response;
    try {
      // ntfy posts the message as a raw text body with ntfy-specific headers,
      // so use request() (no JSON Content-Type) instead of post().
      res = await client.request("POST", config.getAPIURL(), { body: message });
    } catch (err) {
      // Transport error (DNS/connection): no response was produced.
      throw new Error(
        `failed to send ntfy notification: ${(err as Error).message}`,
      );
    }

    // Always read the body so the response stream is consumed (mirrors the Go
    // jsonclient, which reads the body on every response). HTTP >= 400 is the
    // error threshold (matching Go jsonclient.parseResponse and ntfy's apiResponse).
    const body = ((await parseBody(res)) ?? {}) as ApiResponse;
    if (res.status >= 400) {
      throw new Error(
        `failed to send ntfy notification: ${formatApiError(body)}`,
      );
    }
  }
}

function addHeaderIfNotEmpty(
  headers: Record<string, string>,
  key: string,
  value: string,
): void {
  if (value !== "") {
    headers[key] = value;
  }
}
