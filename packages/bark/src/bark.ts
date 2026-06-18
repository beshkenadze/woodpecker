import {
  ApiError,
  JsonClient,
  type JsonClientOptions,
  type Logger,
  type Params,
  PropKeyResolver,
  type Service,
  Standard,
} from "@woodpecker-js/core";
import { Config } from "./config.js";
import { type ApiResponse, buildPushPayload } from "./payload.js";

/** Transport dispatcher accepted by the JSON client (e.g. an undici MockAgent). */
type Dispatcher = NonNullable<JsonClientOptions["dispatcher"]>;

/**
 * BarkService sends notifications to a Bark server, mirroring Go's bark.Service.
 */
export class BarkService extends Standard implements Service {
  private config!: Config;
  private resolver!: PropKeyResolver;
  private dispatcher?: Dispatcher;

  /** Inject an undici Dispatcher (e.g. a MockAgent) for testing. */
  setDispatcher(dispatcher: Dispatcher): void {
    this.dispatcher = dispatcher;
  }

  /** Exposes the resolved config for assertions in tests. */
  getConfigForTest(): Config {
    return this.config;
  }

  initialize(u: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    this.config = new Config();
    this.resolver = new PropKeyResolver(this.config, Config.fields());
    this.resolver.setDefaultProps();
    this.config.setURLWithResolver(this.resolver, u);
  }

  async send(message: string, params?: Params): Promise<void> {
    this.resolver.updateConfigFromParams(params);

    try {
      await this.sendAPI(message);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to send bark notification: ${reason}`);
    }
  }

  private async sendAPI(message: string): Promise<void> {
    const config = this.config;
    const payload = buildPushPayload({
      body: message,
      device_key: config.deviceKey,
      title: config.title,
      category: config.category,
      copy: config.copy,
      sound: config.sound,
      group: config.group,
      badge: config.badge,
      icon: config.icon,
      url: config.url,
    });

    const client = new JsonClient(
      this.dispatcher ? { dispatcher: this.dispatcher } : undefined,
    );

    let response: ApiResponse;
    try {
      response = await client.post<ApiResponse>(
        config.getAPIURL("push"),
        payload,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        // Mirror Go's ErrorResponse: when the error body parses into the
        // apiResponse shape, surface "server response: <message>" (Go reports
        // an empty message as "server response: "). A non-object body (raw
        // text / unparseable) falls through to the raw transport error.
        const body = err.body;
        if (typeof body === "object" && body !== null) {
          const message = (body as Partial<ApiResponse>).message ?? "";
          throw new Error(`server response: ${message}`);
        }
      }
      throw err;
    }

    if (response.code !== 200) {
      throw new Error("unknown error");
    }
  }
}
