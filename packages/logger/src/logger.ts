// Port of Go pkg/services/logger/logger.go

import type { Logger, Params, Service } from "@woodpecker-js/core";
import { Standard } from "@woodpecker-js/core";
import { Config } from "./config.js";

/**
 * Minimal faithful subset of Go's text/template for the logger service.
 *
 * The logger only ever renders flat string maps (types.Params) through simple
 * field-substitution templates such as `{{.level}}: {{.message}}`. We support
 * `{{ .field }}` actions (with optional surrounding whitespace). Referencing a
 * field that is absent yields the empty string, matching how shoutrrr's
 * templates are used in practice.
 */
class MessageTemplate {
  private readonly body: string;

  constructor(body: string) {
    this.body = body;
  }

  execute(data: Params): string {
    return this.body.replace(
      /\{\{\s*\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
      (_match, key: string) => {
        // Only own string keys substitute; absent keys render Go's "<no value>"
        // sentinel rather than leaking inherited Object.prototype members.
        if (!Object.hasOwn(data, key)) {
          return "<no value>";
        }
        return String(data[key]);
      },
    );
  }
}

/** A Logger that drops everything, mirroring Go util.DiscardLogger. */
const discardLogger: Logger = {
  logf(): void {
    /* no-op */
  },
};

/** LoggerService writes notification messages to an injected Logger. */
export class LoggerService extends Standard implements Service {
  private config: Config = new Config();
  private template?: MessageTemplate;

  /** Initialize sets the logger and resets the config. The URL is unused. */
  initialize(url: URL, logger?: Logger): void {
    // Always (re)assign the logger so a re-initialize without a logger resets
    // to discard, mirroring Go's Initialize → SetLogger(nil) → DiscardLogger.
    this.setLogger(logger ?? discardLogger);
    this.config = new Config();
    this.config.setURL(url);
    this.template = undefined;
  }

  /** SetTemplateString registers the named template (only "message" is used). */
  setTemplateString(id: string, body: string): void {
    if (id !== "message") {
      throw new Error(`unknown template id "${id}"`);
    }
    this.template = new MessageTemplate(body);
  }

  /** Send writes the (optionally templated) message to the logger. */
  async send(message: string, params?: Params): Promise<void> {
    // Copy params into data without mutating the caller's object.
    const data: Params = params ? { ...params } : {};
    data.message = message;
    this.doSend(data);
  }

  private doSend(data: Params): void {
    let msg = data.message;
    if (this.template) {
      msg = this.template.execute(data);
    }
    this.logf("%s", msg);
  }
}
