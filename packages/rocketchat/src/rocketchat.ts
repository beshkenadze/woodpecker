import type { Logger, Params, Service } from "@woodpecker-js/core";
import { ContentType, JsonClient, Standard } from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { Config } from "./config.js";
import { createJSONPayload } from "./payload.js";

// RocketchatService sends notifications to a pre-configured Rocket.Chat
// channel or user via an incoming webhook. Faithful port of rocketchat.go.
export class RocketchatService extends Standard implements Service {
  private config?: Config;
  private readonly client: JsonClient;

  // The dispatcher is injectable so callers can supply a custom undici
  // connection pool / proxy (forwarded to the core JsonClient on Node).
  constructor(opts?: { dispatcher?: Dispatcher }) {
    super();
    this.client = new JsonClient(
      opts?.dispatcher ? { dispatcher: opts.dispatcher } : {},
    );
  }

  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    const config = new Config();
    config.setURL(configURL);
    this.config = config;
  }

  async send(message: string, params?: Params): Promise<void> {
    const config = this.config;
    if (!config) {
      throw new Error("service not initialized");
    }

    const apiURL = buildURL(config);
    const payload = createJSONPayload(config, message, params);

    // Use the raw request escape hatch: Rocket.Chat treats only HTTP 200 as
    // success and surfaces the response body verbatim, so we keep control of
    // the success/error handling instead of relying on ApiError.
    let res: Response;
    try {
      res = await this.client.request("POST", apiURL, {
        body: JSON.stringify(payload),
        contentType: ContentType,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Error while posting to URL: ${reason}\nHOST: ${config.host}\nPORT: ${config.port}`,
      );
    }

    if (res.status !== 200) {
      const body = await res.text();
      throw new Error(`notification failed: ${res.status} ${body}`);
    }
  }
}

// buildURL builds the webhook URL, preserving host:port when a port is set.
export function buildURL(config: Config): string {
  if (config.port !== "") {
    return `https://${config.host}:${config.port}/hooks/${config.tokenA}/${config.tokenB}`;
  }
  return `https://${config.host}/hooks/${config.tokenA}/${config.tokenB}`;
}
