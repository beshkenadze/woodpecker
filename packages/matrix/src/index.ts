import type { Service } from "@woodpecker-js/core";
import { MatrixService } from "./matrix.js";

export type {
  Logger,
  Params,
  Service,
  ServiceConfig,
} from "@woodpecker-js/core";
export { MatrixClient } from "./client.js";
export { Config, Scheme } from "./config.js";
export { MatrixService } from "./matrix.js";

// ServiceDescriptor is matrix-local (core has no equivalent): a scheme list
// plus a factory that produces the service.
export interface ServiceDescriptor {
  schemes: string[];
  factory: () => Service;
}

export const descriptor: ServiceDescriptor = {
  schemes: ["matrix"],
  factory: () => new MatrixService(),
};
