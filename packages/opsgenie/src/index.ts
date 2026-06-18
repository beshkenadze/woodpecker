import { OpsgenieService } from "./opsgenie.ts";

export type { Logger, Params, Service } from "@woodpecker-js/core";
export { Config, defaultHost, defaultPort, Scheme } from "./config.ts";
export { OpsgenieService } from "./opsgenie.ts";
export {
  type AlertPayload,
  Entity,
  isOpsGenieID,
  serializeAlertPayload,
} from "./payload.ts";

/** Service descriptor for registry-based discovery. */
export const descriptor = {
  schemes: ["opsgenie"] as const,
  factory: (): OpsgenieService => new OpsgenieService(),
};
