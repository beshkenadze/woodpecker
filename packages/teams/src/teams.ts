import {
  JsonClient,
  type JsonClientOptions,
  type Logger,
  type Params,
  PropKeyResolver,
  type Service,
  Standard,
} from "@woodpecker-js/core";
import {
  buildWebhookURL,
  Config,
  configFromWebhookURL,
  LegacyHost,
  PROP_SCHEMA,
} from "./config.js";
import { buildPayload } from "./payload.js";

/** Options for constructing a TeamsService (forwards the transport to JsonClient). */
export type TeamsServiceOptions = JsonClientOptions;

/** TeamsService sends notifications to a Microsoft Teams incoming webhook. */
export class TeamsService implements Service {
  private readonly standard = new Standard();
  private readonly client: JsonClient;
  private config = new Config();

  constructor(opts: TeamsServiceOptions = {}) {
    this.client = new JsonClient(opts);
  }

  setLogger(logger: Logger): void {
    this.standard.setLogger(logger);
  }

  /** Loads config from the service URL and sets the logger (Go: Initialize). */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.standard.setLogger(logger);
    }
    this.config = new Config();
    this.config.host = LegacyHost;
    this.config.setURL(url);
  }

  /** Sends a notification message to Microsoft Teams (Go: Send/doSend). */
  async send(message: string, params?: Params): Promise<void> {
    const resolver = new PropKeyResolver(this.config, PROP_SCHEMA);
    try {
      resolver.updateConfigFromParams(params);
    } catch (err) {
      this.standard.logf("Failed to update params: %v", err);
    }

    const payload = buildPayload(message, this.config.title, this.config.color);

    let host = this.config.host;
    if (host === "") {
      host = LegacyHost;
      this.standard.logf(
        "Warning: No host specified, update your Teams URL: %s",
        "https://containrrr.dev/shoutrrr/services/teams",
      );
    }

    const postURL = buildWebhookURL(
      host,
      this.config.group,
      this.config.tenant,
      this.config.altID,
      this.config.groupOwner,
    );

    await this.client.post(postURL, payload);
  }

  /** Creates a regular service URL from one with a custom host (Go: GetConfigURLFromCustom). */
  getConfigURLFromCustom(customURL: URL): URL {
    const config = configFromWebhookURL(customURL);
    const resolver = new PropKeyResolver(config, PROP_SCHEMA);
    for (const [key, value] of customURL.searchParams.entries()) {
      resolver.set(key, value);
    }
    return config.getURL();
  }
}
