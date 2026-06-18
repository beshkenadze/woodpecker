// Port of Go pkg/services/join/join.go (Service).

import {
  goQueryEscape,
  JsonClient,
  type Logger,
  type Params,
  Standard,
} from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { Config } from "./config.js";

/** Default Join push endpoint (mirrors the Go hookURL constant). */
export const hookURL =
  "https://joinjoaomgcd.appspot.com/_ah/api/messaging/v1/sendPush";
const contentType = "text/plain";

export interface JoinServiceOptions {
  /** Injectable undici dispatcher (e.g. for connection pooling/testing). */
  dispatcher?: Dispatcher;
  /** Override the push endpoint base URL (used by tests). */
  baseURL?: string;
}

/** Service provides the Join notification service. */
export class JoinService extends Standard {
  private config: Config | undefined;
  private readonly client: JsonClient;
  private readonly baseURL: string;

  constructor(opts: JoinServiceOptions = {}) {
    super();
    this.client = new JsonClient({ dispatcher: opts.dispatcher });
    this.baseURL = opts.baseURL ?? hookURL;
  }

  /** initialize loads the config from configURL and sets the logger. */
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    const config = new Config();
    config.setURL(configURL);
    this.config = config;
  }

  /** send delivers message to the configured Join devices. */
  async send(message: string, params?: Params): Promise<void> {
    const config = this.config;
    if (!config) {
      throw new Error("service not initialized");
    }

    const title = params?.title ?? config.title;
    const icon = params?.icon ?? config.icon;
    const devices = config.devices.join(",");

    await this.sendToDevices(config.apiKey, devices, message, title, icon);
  }

  private async sendToDevices(
    apiKey: string,
    devices: string,
    message: string,
    title: string,
    icon: string,
  ): Promise<void> {
    // Build the query exactly like Go's url.Values.Encode() (space => "+",
    // comma => "%2C"); goQueryEscape matches that byte output.
    const pairs: Array<[string, string]> = [
      ["deviceIds", devices],
      ["apikey", apiKey],
      ["text", message],
    ];

    if (title.length > 0) {
      pairs.push(["title", title]);
    }

    if (icon.length > 0) {
      pairs.push(["icon", icon]);
    }

    const query = pairs
      .map(([key, value]) => `${goQueryEscape(key)}=${goQueryEscape(value)}`)
      .join("&");
    const apiURL = `${this.baseURL}?${query}`;

    // Mirrors Go's http.Post(apiURL, "text/plain", nil): a text/plain POST with
    // no body. request() returns the raw Response without throwing on non-2xx.
    const res = await this.client.request("POST", apiURL, { contentType });

    // Drain the body to release the connection.
    await res.text();

    if (res.status !== 200) {
      throw new Error(
        `failed to send notification to join devices "${devices}", response status "${res.status}"`,
      );
    }
  }
}
