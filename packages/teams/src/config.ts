import {
  EnumlessConfig,
  type FieldSchema,
  PropKeyResolver,
  type ServiceConfig,
} from "@woodpecker-js/core";

/** Scheme is the identifying part of this service's configuration URL. */
export const Scheme = "teams";
/** LegacyHost is the default host for legacy webhook requests. */
export const LegacyHost = "outlook.office.com";
/** LegacyPath is the initial path of the webhook URL for legacy webhook requests. */
export const LegacyPath = "webhook";
/** Path is the initial path of the webhook URL for domain-scoped webhook requests. */
export const Path = "webhookb2";
/** ProviderName is the name of the Teams integration provider. */
export const ProviderName = "IncomingWebhook";

/** A teams webhook is identified by exactly four parts. */
export type WebhookParts = [string, string, string, string];

const uuid4Pattern =
  /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;
const hex32Pattern = /[A-Za-z0-9]{32}/;
// Mirrors Go's parseAndVerifyWebhookURL regexp.
const webhookURLPattern =
  /([0-9a-f-]{36})@([0-9a-f-]{36})\/[^/]+\/([0-9a-f]{32})\/([0-9a-f-]{36})/;

function uuidPartValid(token: string): boolean {
  return uuid4Pattern.test(token);
}

function hashPartValid(token: string): boolean {
  return hex32Pattern.test(token);
}

/** Validates the four webhook parts, throwing on the first invalid one (Go: verifyWebhookParts). */
export function verifyWebhookParts(p: WebhookParts): void {
  if (!uuidPartValid(p[0])) {
    throw new Error(`first token part is invalid: '${p[0]}'`);
  }
  if (!uuidPartValid(p[1])) {
    throw new Error(`second token part is invalid: '${p[1]}'`);
  }
  if (!hashPartValid(p[2])) {
    throw new Error(`third token part is invalid: '${p[2]}'`);
  }
  if (!uuidPartValid(p[3])) {
    throw new Error(`forth token part is invalid: '${p[3]}'`);
  }
}

/** Extracts and verifies the four webhook parts from a full webhook URL (Go: parseAndVerifyWebhookURL). */
export function parseAndVerifyWebhookURL(webhookURL: string): WebhookParts {
  const groups = webhookURLPattern.exec(webhookURL);
  const [, group, tenant, altID, groupOwner] = groups ?? [];
  if (
    group === undefined ||
    tenant === undefined ||
    altID === undefined ||
    groupOwner === undefined
  ) {
    throw new Error("invalid webhook URL format");
  }
  return [group, tenant, altID, groupOwner];
}

/** Builds the full Teams webhook URL from its parts (Go: buildWebhookURL). */
export function buildWebhookURL(
  host: string,
  group: string,
  tenant: string,
  altID: string,
  groupOwner: string,
): string {
  const path = host === LegacyHost ? LegacyPath : Path;
  return `https://${host}/${path}/${group}@${tenant}/${ProviderName}/${altID}/${groupOwner}`;
}

/** Field schema for the key-tagged props (title/color/host) used by PropKeyResolver. */
const PROP_SCHEMA: FieldSchema[] = [
  { name: "color", type: "string", key: ["color"] },
  { name: "host", type: "string", key: ["host"], default: LegacyHost },
  { name: "title", type: "string", key: ["title"] },
];

/**
 * Config for the teams service, ported from teams_config.go. The URL parts
 * (group/tenant/altID/groupOwner) plus the key-tagged props (title/color/host).
 */
export class Config extends EnumlessConfig implements ServiceConfig {
  [key: string]: unknown;

  group = "";
  tenant = "";
  altID = "";
  groupOwner = "";

  title = "";
  color = "";
  host = LegacyHost;

  /** Returns the four webhook parts in order (Go: webhookParts). */
  webhookParts(): WebhookParts {
    return [this.group, this.tenant, this.altID, this.groupOwner];
  }

  /** Assigns the four webhook parts to the config fields (Go: setFromWebhookParts). */
  setFromWebhookParts(parts: WebhookParts): void {
    this.group = parts[0];
    this.tenant = parts[1];
    this.altID = parts[2];
    this.groupOwner = parts[3];
  }

  /** Updates the config WebhookParts from a teams webhook URL string (Go: SetFromWebhookURL). */
  setFromWebhookURL(webhookURL: string): void {
    this.setFromWebhookParts(parseAndVerifyWebhookURL(webhookURL));
  }

  /** Serializes the config to a service URL (Go: getURL). */
  getURL(): URL {
    const url = new URL(`${Scheme}://`);
    // Host must be set before username/pathname: WHATWG URL drops userinfo
    // and ignores a path while the host is empty.
    url.host = this.tenant;
    if (this.group !== "") {
      url.username = this.group;
    }
    url.pathname = `/${this.altID}/${this.groupOwner}`;
    const resolver = new PropKeyResolver(this, PROP_SCHEMA);
    resolver.bindToURL(url);
    return url;
  }

  /** Parses a service URL into the config (Go: setURL). */
  setURL(url: URL): void {
    let webhookParts: WebhookParts;

    const password = url.password;
    if (password !== "") {
      // Legacy format: user is "group@tenant" with the AltID as the password.
      const parts = decodeURIComponent(url.username).split("@");
      const [group, tenant] = parts;
      if (parts.length !== 2 || group === undefined || tenant === undefined) {
        throw new Error("invalid URL format");
      }
      webhookParts = [group, tenant, password, url.hostname];
    } else {
      const segments = trimLeadingSlash(url.pathname).split("/");
      webhookParts = [
        decodeURIComponent(url.username),
        url.hostname,
        decodeURIComponent(segments[0] ?? ""),
        decodeURIComponent(segments[1] ?? ""),
      ];
    }

    try {
      verifyWebhookParts(webhookParts);
    } catch (err) {
      throw new Error(`invalid URL format: ${(err as Error).message}`);
    }

    this.setFromWebhookParts(webhookParts);

    const resolver = new PropKeyResolver(this, PROP_SCHEMA);
    for (const [key, value] of url.searchParams.entries()) {
      resolver.set(key, value);
    }
  }
}

/** Creates a new Config from a parsed custom webhook URL (Go: ConfigFromWebhookURL). */
export function configFromWebhookURL(webhookURL: URL): Config {
  const config = new Config();
  config.host = webhookURL.host;
  config.setFromWebhookURL(webhookURL.toString());
  return config;
}

function trimLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

export { PROP_SCHEMA };
