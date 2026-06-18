import {
  JsonClient,
  type Logger,
  type Params,
  type PropKeyResolver,
  type Service,
  Standard,
} from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { Config } from "./config.js";
import { createJSONToSend } from "./payload.js";

/** Default IFTTT Maker webhook base. Overridable for testing. */
export const DEFAULT_API_BASE = "https://maker.ifttt.com";

const apiURLFormat = (base: string, event: string, webHookID: string): string =>
  `${base}/trigger/${event}/with/key/${webHookID}`;

/**
 * IftttService sends notifications to an IFTTT Maker webhook, ported from
 * ifttt.go. An undici Dispatcher may be injected (e.g. for MockAgent), and the
 * API base may be overridden to point at a local test server.
 */
export class IftttService implements Service {
  private readonly standard = new Standard();
  private config: Config | undefined;
  private pkr: PropKeyResolver | undefined;
  private readonly client: JsonClient;
  private readonly apiBase: string;

  constructor(opts?: { dispatcher?: Dispatcher; apiBase?: string }) {
    this.client = new JsonClient(
      opts?.dispatcher ? { dispatcher: opts.dispatcher } : undefined,
    );
    this.apiBase = opts?.apiBase ?? DEFAULT_API_BASE;
  }

  /** initialize loads config from configURL and sets the logger. */
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.standard.setLogger(logger);
    }
    // useMessageAsValue defaults to 2 via the Config field initializer; setURL
    // additionally coerces an explicit 0 back to 2 (matching Go's setURL).
    const config = new Config();
    config.setURL(configURL);
    this.config = config;
    this.pkr = config.newResolver();
  }

  setLogger(logger: Logger): void {
    this.standard.setLogger(logger);
  }

  /** send delivers a notification message to each configured IFTTT event. */
  async send(message: string, params?: Params): Promise<void> {
    const config = this.config;
    const pkr = this.pkr;
    if (!config || !pkr) {
      throw new Error("service not initialized");
    }

    pkr.updateConfigFromParams(params);

    const payload = createJSONToSend(config, message, params);

    for (const event of config.events) {
      const apiURL = apiURLFormat(this.apiBase, event, config.webHookID);
      try {
        await this.client.post(apiURL, payload);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`failed to send IFTTT event "${event}": ${reason}`);
      }
    }
  }
}
