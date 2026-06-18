import type { Service } from "@woodpecker-js/core";
import { TeamsService } from "./teams.js";

export type { WebhookParts } from "./config.js";
export {
  buildWebhookURL,
  Config,
  configFromWebhookURL,
  LegacyHost,
  LegacyPath,
  Path,
  ProviderName,
  parseAndVerifyWebhookURL,
  Scheme,
  verifyWebhookParts,
} from "./config.js";
export type { Fact, MessageCard, Section } from "./payload.js";
export { buildPayload } from "./payload.js";
export type { TeamsServiceOptions } from "./teams.js";
export { TeamsService } from "./teams.js";

/** Describes a service's URL schemes and how to construct it (Go: registry entry). */
export interface ServiceDescriptor {
  schemes: string[];
  factory: () => Service;
}

/** Registry descriptor for the teams service. */
export const descriptor: ServiceDescriptor = {
  schemes: ["teams"],
  factory: () => new TeamsService(),
};
