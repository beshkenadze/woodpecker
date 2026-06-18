import {
  type EnumFormatter,
  EnumlessConfig,
  type FieldSchema,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker-js/core";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "ifttt";

/**
 * Field schema for the IFTTT config, ported from the struct tags in
 * ifttt_config.go. WebHookID is taken from the URL host (not a query key).
 */
const fieldSchema: FieldSchema[] = [
  { name: "events", type: "string[]", key: ["events"], required: true },
  { name: "value1", type: "string", key: ["value1"], default: "" },
  { name: "value2", type: "string", key: ["value2"], default: "" },
  { name: "value3", type: "string", key: ["value3"], default: "" },
  {
    name: "useMessageAsValue",
    type: "uint",
    key: ["messagevalue"],
    default: "2",
    desc: "Sets the corresponding value field to the notification message",
  },
  {
    name: "useTitleAsValue",
    type: "uint",
    key: ["titlevalue"],
    default: "0",
    desc: "Sets the corresponding value field to the notification title",
  },
  {
    name: "title",
    type: "string",
    key: ["title"],
    default: "",
    title: true,
    desc: "Notification title, optionally set by the sender",
  },
];

/**
 * Config is the configuration needed to send IFTTT notifications, ported from
 * ifttt_config.go.
 */
export class Config extends EnumlessConfig implements ServiceConfig {
  webHookID = "";
  events: string[] = [];
  value1 = "";
  value2 = "";
  value3 = "";
  useMessageAsValue = 2;
  useTitleAsValue = 0;
  title = "";

  /** schema exposes the field schema for resolver construction. */
  static get schema(): FieldSchema[] {
    return fieldSchema;
  }

  /** newResolver builds a PropKeyResolver bound to this config. */
  newResolver(): PropKeyResolver {
    return new PropKeyResolver(this, fieldSchema);
  }

  /** getURL returns a URL representation of the current field values. */
  getURL(): URL {
    return this.getURLWith(this.newResolver());
  }

  /** setURL updates the config from a URL representation of its field values. */
  setURL(url: URL): void {
    this.setURLWith(this.newResolver(), url);
  }

  private getURLWith(resolver: PropKeyResolver): URL {
    const url = new URL(`${Scheme}://${this.webHookID}/`);
    resolver.bindToURL(url);
    return url;
  }

  private setURLWith(resolver: PropKeyResolver, url: URL): void {
    if (this.useMessageAsValue === 0) {
      this.useMessageAsValue = 2;
    }
    this.webHookID = url.hostname;

    // Apply each distinct query key via the resolver, which throws on an
    // unknown key (matching Go's setURL loop). Core's PropKeyResolver.setFromURL
    // silently ignores unknown keys, so it is not used here.
    const seen = new Set<string>();
    for (const key of url.searchParams.keys()) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      resolver.set(key, url.searchParams.get(key) ?? "");
    }

    // Core's string[] parser splits "" into [""]; drop empty event names so an
    // explicit `events=` is treated as no events (matching Go's empty handling).
    this.events = this.events.filter((event) => event !== "");

    if (this.useMessageAsValue > 3 || this.useMessageAsValue < 1) {
      throw new Error(
        "invalid value for messagevalue: only values 1-3 are supported",
      );
    }

    if (this.useTitleAsValue > 3) {
      throw new Error(
        "invalid value for titlevalue: only values 1-3 or 0 (for disabling) are supported",
      );
    }

    if (this.useTitleAsValue === this.useMessageAsValue) {
      throw new Error("titlevalue cannot use the same number as messagevalue");
    }

    if (this.events.length < 1) {
      throw new Error("events missing from config URL");
    }

    if (this.webHookID.length < 1) {
      throw new Error("webhook ID missing from config URL");
    }
  }

  override enums(): Record<string, EnumFormatter> {
    return {};
  }
}
