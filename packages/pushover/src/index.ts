export * from "@woodpecker-js/core";
export {
  Config,
  fieldSchema,
  Scheme,
  TokenMissing,
  UserMissing,
} from "./config.js";
export { PushoverService } from "./pushover.js";

import { PushoverService } from "./pushover.js";

/** descriptor registers this service's schemes and factory. */
export const descriptor = {
  schemes: ["pushover"],
  factory: (): PushoverService => new PushoverService(),
};
