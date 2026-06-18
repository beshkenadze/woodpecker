import type { Service } from "@woodpecker-js/core";
import { SlackService } from "./slack.js";

export type { Logger, Params, Service } from "@woodpecker-js/core";
export { Config, configSchema, createConfigFromURL, Scheme } from "./config.js";
export { ErrorInvalidToken, ErrorMismatchedTokenSeparators } from "./errors.js";
export {
  type APIResponse,
  type Attachment,
  type Block,
  type BlockText,
  createJSONPayload,
  type LegacyField,
  MessagePayload,
} from "./payload.js";
export { SlackService } from "./slack.js";
export { parseToken, Token } from "./token.js";

export interface ServiceDescriptor {
  schemes: string[];
  factory: () => Service;
}

export const descriptor: ServiceDescriptor = {
  schemes: ["slack"],
  factory: (): Service => new SlackService(),
};
