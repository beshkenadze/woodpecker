export type { Logger, Params, Service, ServiceConfig } from "@woodpecker/core";
export { Config, Scheme } from "./config.js";
export { IftttService } from "./ifttt.js";
export { createJSONToSend, type JsonPayload } from "./payload.js";

import { IftttService } from "./ifttt.js";

/** descriptor registers this service's schemes and factory. */
export const descriptor = {
  schemes: ["ifttt"],
  factory: (): IftttService => new IftttService(),
};
