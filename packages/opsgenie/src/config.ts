import {
  type EnumFormatter,
  goQueryEscape,
  type ServiceConfig,
} from "@woodpecker-js/core";
import { Entity } from "./payload.ts";

export const Scheme = "opsgenie";
export const defaultPort = 443;
export const defaultHost = "api.opsgenie.com";

/**
 * Plain string query fields. The lowercased name doubles as the query key and
 * config property, mirroring the Go struct `key:` tags in opsgenie_config.go.
 * Host/Port/APIKey are URL parts handled directly in set/getURL.
 */
const STRING_FIELDS = [
  "alias",
  "description",
  "entity",
  "source",
  "priority",
  "note",
  "user",
  "title",
] as const;
type StringField = (typeof STRING_FIELDS)[number];

/** Comma-separated string list query fields. */
const STRING_ARRAY_FIELDS = ["actions", "tags"] as const;

/** Entity (prop[]) query fields, keyed by the lowercased query key. */
const ENTITY_FIELDS = ["responders", "visibleTo"] as const;
type EntityField = (typeof ENTITY_FIELDS)[number];

/** Parses "key:value,key2:value2" into a map; a colon in a value errors (Go parity). */
function parseDetails(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const elems = pair.split(":");
    if (elems.length !== 2) {
      throw new Error("invalid field value format");
    }
    result[elems[0] as string] = elems[1] as string;
  }
  return result;
}

/** Serializes a details map back to "key:value,key2:value2". */
function serializeDetails(details: Record<string, string>): string {
  return Object.entries(details)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

/** Parses a comma-separated list of "type:identifier" entities. */
function parseEntities(raw: string): Entity[] {
  return raw.split(",").map((part) => {
    const entity = new Entity();
    entity.setFromProp(part);
    return entity;
  });
}

/** Config for the OpsGenie service. Port of opsgenie_config.go Config. */
export class Config implements ServiceConfig {
  // URL parts
  apiKey = "";
  host = defaultHost;
  port = 0;

  // Query-backed fields
  alias = "";
  description = "";
  responders: Entity[] = [];
  visibleTo: Entity[] = [];
  actions: string[] = [];
  tags: string[] = [];
  details: Record<string, string> = {};
  entity = "";
  source = "";
  priority = "";
  note = "";
  user = "";
  title = "";

  enums(): Record<string, EnumFormatter> {
    return {};
  }

  /** Assigns a single query/param field from its string value (unknown keys ignored). */
  set(key: string, value: string): void {
    const field = key.toLowerCase();
    switch (field) {
      case "responders":
        this.responders = parseEntities(value);
        return;
      case "visibleto":
        this.visibleTo = parseEntities(value);
        return;
      case "actions":
      case "tags":
        this[field] = value.split(",");
        return;
      case "details":
        this.details = parseDetails(value);
        return;
      default:
        if (!(STRING_FIELDS as readonly string[]).includes(field)) {
          // Mirror Go's resolver.Set, which both setURL and
          // UpdateConfigFromParams propagate as an error on unknown keys.
          throw new Error(`${key} is not a valid config key`);
        }
        this[field as StringField] = value;
    }
  }

  /** Applies runtime params onto the config (used after a defensive clone). */
  updateFromParams(params?: Record<string, string>): void {
    if (!params) {
      return;
    }
    for (const [key, value] of Object.entries(params)) {
      this.set(key, value);
    }
  }

  /** Builds the non-default query field map (key -> serialized value). */
  private queryValues(): Record<string, string> {
    const query: Record<string, string> = {};
    for (const field of STRING_FIELDS) {
      if (this[field] !== "") {
        query[field] = this[field];
      }
    }
    for (const field of STRING_ARRAY_FIELDS) {
      if (this[field].length > 0) {
        query[field] = this[field].join(",");
      }
    }
    for (const field of ENTITY_FIELDS) {
      const entities = this[field as EntityField];
      if (entities.length > 0) {
        query[field.toLowerCase()] = entities
          .map((entity) => entity.getPropValue())
          .join(",");
      }
    }
    if (Object.keys(this.details).length > 0) {
      query.details = serializeDetails(this.details);
    }
    return query;
  }

  /** getURL builds the configuration URL representation. */
  getURL(): URL {
    const host = this.port > 0 ? `${this.host}:${this.port}` : this.host;
    const query = this.queryValues();
    // Go's url.Values.Encode(): keys sorted, both sides goQueryEscaped, '&'-joined.
    const encoded = Object.keys(query)
      .sort()
      .map((k) => `${goQueryEscape(k)}=${goQueryEscape(query[k] as string)}`)
      .join("&");
    const url = new URL(`${Scheme}://${host}/${this.apiKey}`);
    // Assign the raw, Go-compatible query string directly (URLSearchParams would
    // re-encode using %20 instead of '+').
    url.search = encoded ? `?${encoded}` : "";
    return url;
  }

  /** setURL populates the config from a URL representation. */
  setURL(url: URL): void {
    this.host = url.hostname;
    this.apiKey = decodeURIComponent(url.pathname.slice(1));

    if (url.port !== "") {
      const port = Number.parseInt(url.port, 10);
      if (Number.isNaN(port)) {
        throw new Error(`invalid port: ${url.port}`);
      }
      this.port = port;
    } else {
      this.port = defaultPort;
    }

    for (const [key, value] of url.searchParams.entries()) {
      this.set(key, value);
    }
  }
}
