import {
  JsonClient,
  type Logger,
  type Params,
  PropKeyResolver,
  type Service,
  Standard,
} from "@woodpecker-js/core";
import {
  type Config,
  configFromWebhookURL,
  configSchema,
  defaultConfig,
  Scheme,
} from "./config.ts";
import { jsonPayload } from "./payload.ts";
import { Templater } from "./templater.ts";

/** Common key for the title param (port of Go `types.TitleKey`). */
const TitleKey = "title";

/** Service providing a generic notification webhook (scheme `generic`, custom form `generic+https`). */
export class GenericService implements Service {
  private readonly logger = new Standard();
  private readonly templater = new Templater();
  private config: Config;
  private pkr: PropKeyResolver;

  constructor() {
    const { config, pkr } = defaultConfig();
    this.config = config;
    this.pkr = pkr;
  }

  setLogger(logger: Logger): void {
    this.logger.setLogger(logger);
  }

  /** Initialize loads config from the service URL and stores the logger. */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.logger.setLogger(logger);
    }
    const { config, pkr } = defaultConfig();
    this.config = config;
    this.pkr = pkr;
    this.config.setURLWith(this.pkr, url);
  }

  /** SetTemplateString compiles an inline template for use via the `template=` config. */
  setTemplateString(id: string, body: string): void {
    this.templater.setTemplateString(id, body);
  }

  /** GetConfigURLFromCustom converts a `generic+<scheme>://` custom URL into a `generic://` service URL. */
  getConfigURLFromCustom(customURL: URL): URL {
    let raw = customURL.href;
    if (raw.toLowerCase().startsWith(`${Scheme}+`)) {
      // Strip the "generic+" prefix from the scheme (e.g. generic+https -> https).
      raw = raw.slice(Scheme.length + 1);
    }
    const { config, pkr } = configFromWebhookURL(raw);
    return config.getURLWith(pkr);
  }

  /** Send dispatches the message to the configured webhook endpoint. */
  async send(message: string, params?: Params): Promise<void> {
    // Work on a copy of the config so per-send param overrides don't leak.
    const config = this.cloneConfig();
    const resolver = new PropKeyResolver(config as never, configSchema);

    const sendParamsInput: Params = params ? { ...params } : {};
    // Mirror Go: log (don't throw on) the first invalid/unknown param and proceed with the send.
    try {
      resolver.updateConfigFromParams(sendParamsInput);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.logf("Failed to update params: %v", reason);
    }

    const sendParams = createSendParams(config, sendParamsInput, message);

    try {
      await this.doSend(config, sendParams);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `an error occurred while sending notification to generic webhook: ${reason}`,
      );
    }
  }

  private cloneConfig(): Config {
    const config = Object.assign(
      Object.create(Object.getPrototypeOf(this.config) as object),
      this.config,
    ) as Config;
    // Shallow copies are sufficient; maps/URL are not mutated during send.
    config.headers = { ...this.config.headers };
    config.extraData = { ...this.config.extraData };
    return config;
  }

  private async doSend(config: Config, params: Params): Promise<void> {
    const postURL = config.webhookURLString();
    const payload = this.getPayload(config, params);

    const headers: Record<string, string> = {
      "Content-Type": config.contentType,
      Accept: config.contentType,
    };
    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = value;
    }

    const client = new JsonClient();
    const res = await client.request(config.requestMethod, postURL, {
      headers,
      contentType: config.contentType,
      body: payload,
    });
    const responseBody = await res.text();

    this.logger.logf("Server response: %s", responseBody);

    if (res.status >= 300) {
      throw new Error(`server returned response status code ${res.status}`);
    }
  }

  /** getPayload builds the request body based on the configured template. */
  getPayload(config: Config, params: Params): string {
    switch (config.template) {
      case "":
        return params[config.messageKey] ?? "";
      case "json":
      case "JSON":
        return jsonPayload(params, config.extraData);
      default: {
        const { template, found } = this.templater.getTemplate(config.template);
        if (!found || !template) {
          throw new Error(`template "${config.template}" has not been loaded`);
        }
        return template.execute(params);
      }
    }
  }
}

/**
 * createSendParams remaps the title param onto the configured titleKey and injects the message
 * under the configured messageKey. Faithful port of Go `createSendParams`.
 */
export function createSendParams(
  config: Config,
  params: Params,
  message: string,
): Params {
  const sendParams: Params = {};
  for (const [key, val] of Object.entries(params)) {
    const target = key === TitleKey ? config.titleKey : key;
    sendParams[target] = val;
  }
  sendParams[config.messageKey] = message;
  return sendParams;
}
