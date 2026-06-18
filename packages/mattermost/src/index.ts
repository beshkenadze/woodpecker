import type { Service } from "@woodpecker/core";
import { MattermostService } from "./mattermost.js";

export type { Logger, Params, Service } from "@woodpecker/core";
export {
  createConfigFromURL,
  MattermostConfig,
  NOT_ENOUGH_ARGUMENTS,
  SCHEME,
} from "./config.js";
export type { MattermostServiceOptions, Transport } from "./mattermost.js";
export { buildURL, MattermostService } from "./mattermost.js";
export {
  createJSONPayload,
  type MattermostJSON,
  serializePayload,
  setIcon,
} from "./payload.js";

/** Service descriptor for scheme-based registration. */
export const descriptor: {
  schemes: string[];
  factory: () => Service;
} = {
  schemes: ["mattermost"],
  factory: (): Service => new MattermostService(),
};
