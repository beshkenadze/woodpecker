import {
  ApiError,
  ContentType,
  JsonClient,
  type Logger,
  type Params,
  PropKeyResolver,
  parseBody,
  type Service,
  Standard,
} from "@woodpecker-js/core";
import { MattermostConfig, QUERY_SCHEMA } from "./config.js";
import { createJSONPayload, serializePayload } from "./payload.js";

/** Transport posts a serialized JSON body to a URL. Mirrors JsonClient.post. */
export type Transport = (url: string, body: string) => Promise<unknown>;

/** Options for constructing the service. */
export interface MattermostServiceOptions {
  /** Override the HTTP transport entirely (used for end-to-end tests). */
  transport?: Transport;
}

/**
 * Builds the actual webhook URL the request should go to. Preserves host:port
 * (port of buildURL — uses config.host which includes the port).
 */
export function buildURL(config: MattermostConfig): string {
  return `https://${config.host}/hooks/${config.token}`;
}

/** MattermostService sends notifications to a pre-configured channel or user. */
export class MattermostService implements Service {
  private readonly standard = new Standard();
  private config = new MattermostConfig();
  private resolver = new PropKeyResolver(this.config, QUERY_SCHEMA);
  private readonly transport: Transport;

  constructor(options: MattermostServiceOptions = {}) {
    if (options.transport) {
      this.transport = options.transport;
    } else {
      const client = new JsonClient();
      // `body` is already a serialized JSON string (Go field order + omitempty),
      // so POST it raw via `request` rather than `post`, which would re-stringify
      // and double-encode it. Mirror `post`'s 2xx-or-ApiError contract.
      this.transport = async (url, body) => {
        const res = await client.request("POST", url, {
          body,
          contentType: ContentType,
        });
        const parsed = await parseBody(res);
        if (res.status < 200 || res.status >= 300) {
          throw new ApiError(res.status, parsed);
        }
        return parsed;
      };
    }
  }

  /** Loads ServiceConfig from configURL and sets the logger for this service. */
  initialize(configURL: URL, logger?: Logger): void {
    if (logger) {
      this.standard.setLogger(logger);
    }
    this.config = new MattermostConfig();
    this.resolver = new PropKeyResolver(this.config, QUERY_SCHEMA);
    this.config.setURLWithResolver(configURL, this.resolver);
  }

  setLogger(logger: Logger): void {
    this.standard.setLogger(logger);
  }

  /** Sends a notification message to Mattermost. */
  async send(message: string, params?: Params): Promise<void> {
    const apiURL = buildURL(this.config);
    this.resolver.updateConfigFromParams(params);
    const payload = createJSONPayload(this.config, message, params);
    await this.transport(apiURL, serializePayload(payload));
  }
}
