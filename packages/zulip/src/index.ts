import { ZulipService } from "./zulip.ts";

export type { Logger, Params, Service } from "@woodpecker-js/core";
export { Config, createConfigFromURL, ErrorMessage, Scheme } from "./config.ts";
export type { ZulipServiceOptions } from "./zulip.ts";
export { ZulipService } from "./zulip.ts";

/** Service descriptor for registration with the shoutrrr router. */
export const descriptor = {
  schemes: ["zulip"] as const,
  factory: (): ZulipService => new ZulipService(),
};
