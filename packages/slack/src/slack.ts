// Port of pkg/services/slack/slack.go

import type {
  FetchLike,
  Service as IService,
  Logger,
  Params,
} from "@woodpecker-js/core";
import {
  ContentType,
  JsonClient,
  PropKeyResolver,
  Standard,
} from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import { Config, configSchema } from "./config.js";
import type { APIResponse, MessagePayload } from "./payload.js";
import { createJSONPayload } from "./payload.js";

const apiPostMessage = "https://slack.com/api/chat.postMessage";

/** Service sends notifications to a pre-configured channel or user. */
export class SlackService implements IService {
  private readonly logger = new Standard();
  private config!: Config;
  private pkr!: PropKeyResolver;
  /** undici Dispatcher forwarded to the transport (e.g. an undici MockAgent on Node). */
  private dispatcher: Dispatcher | undefined;
  /** Injectable fetch transport (used by Bun-based tests). */
  private fetchImpl: FetchLike | undefined;

  /** setDispatcher overrides the undici dispatcher (used for testing on Node). */
  setDispatcher(dispatcher?: Dispatcher): void {
    this.dispatcher = dispatcher;
  }

  /** setFetch overrides the fetch transport (used for testing). */
  setFetch(fetchImpl?: FetchLike): void {
    this.fetchImpl = fetchImpl;
  }

  setLogger(logger?: Logger): void {
    if (logger) {
      this.logger.setLogger(logger);
    }
  }

  /** Initialize loads the ServiceConfig from configURL and sets the logger. */
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.logger.setLogger(logger);
    }
    this.config = new Config();
    this.pkr = new PropKeyResolver(this.config, configSchema);
    this.config.setURL(configURL);
  }

  /** Send a notification message to Slack. */
  async send(message: string, params?: Params): Promise<void> {
    const config = this.config;

    this.pkr.updateConfigFromParams(params);

    const payload = createJSONPayload(config, message);

    try {
      if (config.token.isAPIToken()) {
        await this.sendAPI(config, payload);
      } else {
        await this.sendWebhook(config, payload);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to send slack notification: ${reason}`);
    }
  }

  private async sendAPI(
    config: Config,
    payload: MessagePayload,
  ): Promise<void> {
    const jsonClient = new JsonClient({
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}),
    });
    jsonClient.headers.Authorization = config.token.authorization();

    const response = await jsonClient.post<APIResponse>(
      apiPostMessage,
      payload.toJSON(),
    );

    if (!response.ok) {
      if (response.error) {
        throw new Error(`api response: ${response.error}`);
      }
      throw new Error("unknown error");
    }

    if (response.warning) {
      this.logger.logf("Slack API warning: %q", response.warning);
    }
  }

  private async sendWebhook(
    config: Config,
    payload: MessagePayload,
  ): Promise<void> {
    const url = config.token.webhookURL();
    const doFetch: FetchLike =
      this.fetchImpl ?? ((input, init) => fetch(input, init));

    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": ContentType },
      body: JSON.stringify(payload.toJSON()),
      ...(this.dispatcher
        ? ({ dispatcher: this.dispatcher } as RequestInit)
        : {}),
    });

    const response = await res.text();

    switch (response) {
      case "":
        if (res.status !== 200) {
          throw new Error(`webhook status: ${res.status}`);
        }
        // Treat status 200 as no error regardless of actual content.
        return;
      case "ok":
        return;
      default:
        throw new Error(`webhook response: ${response}`);
    }
  }
}
