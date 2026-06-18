import {
  ApiError,
  JsonClient,
  type Logger,
  type Params,
  parseBody,
  type Service,
  Standard,
} from "@woodpecker/core";
import type { Dispatcher } from "undici";
import { Config } from "./config.ts";
import { type AlertPayload, Entity, serializeAlertPayload } from "./payload.ts";

/** Maximum message length (in bytes) before it is split into title + description. */
const MAX_TITLE_LENGTH = 130;

/**
 * Truncates a string to at most `maxBytes` UTF-8 bytes without splitting a
 * multibyte character, mirroring Go's byte-indexed message[:130] slice.
 */
function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }
  // Back off to a UTF-8 character boundary (continuation bytes are 0b10xxxxxx).
  let end = maxBytes;
  while (end > 0 && ((bytes[end] as number) & 0xc0) === 0x80) {
    end--;
  }
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/** Builds the create-alert endpoint URL for the configured host/port. */
function alertEndpoint(config: Config): string {
  return `https://${config.host}:${config.port}/v2/alerts`;
}

/**
 * OpsgenieService sends alerts to the OpsGenie create-alert API.
 * Port of Go pkg/services/opsgenie.Service.
 */
export class OpsgenieService extends Standard implements Service {
  private config: Config | undefined;
  private readonly dispatcher: Dispatcher | undefined;

  /** dispatcher is injectable so tests can supply an undici MockAgent. */
  constructor(opts?: { dispatcher?: Dispatcher }) {
    super();
    this.dispatcher = opts?.dispatcher;
  }

  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.setLogger(logger);
    }
    const config = new Config();
    config.setURL(url);
    this.config = config;
  }

  async send(message: string, params?: Params): Promise<void> {
    const config = this.config;
    if (!config) {
      throw new Error("service not initialized");
    }
    const payload = this.newAlertPayload(config, message, params);
    await this.sendAlert(alertEndpoint(config), config.apiKey, payload);
  }

  private async sendAlert(
    url: string,
    apiKey: string,
    payload: AlertPayload,
  ): Promise<void> {
    const client = new JsonClient(
      this.dispatcher ? { dispatcher: this.dispatcher } : {},
    );
    client.headers.Authorization = `GenieKey ${apiKey}`;

    // Faithful JSON byte order requires custom serialization; POST the raw body
    // via the request escape hatch (post() would re-stringify and reorder keys).
    const res = await client.request("POST", url, {
      body: serializeAlertPayload(payload),
      contentType: "application/json",
    });
    if (res.status < 200 || res.status >= 300) {
      throw new ApiError(res.status, await parseBody(res));
    }
  }

  private newAlertPayload(
    config: Config,
    message: string,
    params?: Params,
  ): AlertPayload {
    // Defensive copy so runtime params never leak into the stored config.
    const fields = cloneConfig(config);
    fields.updateFromParams(params);

    // Use `title` for the title if available, or if the message is too long.
    // Use `description` for the message in these scenarios.
    let title = fields.title;
    let description = message;
    if (title === "") {
      if (new TextEncoder().encode(message).length > MAX_TITLE_LENGTH) {
        title = truncateUtf8(message, MAX_TITLE_LENGTH);
      } else {
        title = message;
        description = "";
      }
    }

    if (fields.description !== "" && description !== "") {
      description = `${description}\n`;
    }

    return {
      message: title,
      alias: fields.alias,
      description: description + fields.description,
      responders: fields.responders,
      visibleTo: fields.visibleTo,
      actions: fields.actions,
      tags: fields.tags,
      details: fields.details,
      entity: fields.entity,
      source: fields.source,
      priority: fields.priority,
      user: fields.user,
      note: fields.note,
    };
  }
}

/** Produces an independent copy of a Config (defensive copy before applying params). */
function cloneConfig(config: Config): Config {
  const copy = new Config();
  copy.apiKey = config.apiKey;
  copy.host = config.host;
  copy.port = config.port;
  copy.alias = config.alias;
  copy.description = config.description;
  copy.responders = config.responders.map((e) => new Entity(e));
  copy.visibleTo = config.visibleTo.map((e) => new Entity(e));
  copy.actions = [...config.actions];
  copy.tags = [...config.tags];
  copy.details = { ...config.details };
  copy.entity = config.entity;
  copy.source = config.source;
  copy.priority = config.priority;
  copy.note = config.note;
  copy.user = config.user;
  copy.title = config.title;
  return copy;
}
