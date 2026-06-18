import { RocketchatService } from "./rocketchat.js";

export {
  Config,
  createConfigFromURL,
  NotEnoughArguments,
  Scheme,
} from "./config.js";
export type { RocketchatPayload } from "./payload.js";
export { createJSONPayload } from "./payload.js";
export { buildURL, RocketchatService } from "./rocketchat.js";

export const descriptor = {
  schemes: ["rocketchat"] as const,
  factory: (): RocketchatService => new RocketchatService(),
};
