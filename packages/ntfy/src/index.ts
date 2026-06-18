// Public entry point for @woodpecker-js/ntfy.

export type {
  Logger,
  Params,
  Service,
  ServiceConfig,
} from "@woodpecker-js/core";
export { Config, fieldSchema, Scheme } from "./config.js";
export { NtfyService, type NtfyServiceOptions } from "./ntfy.js";
export { type ApiResponse, formatApiError } from "./payload.js";
export { Priority, type PriorityValue, priorityEnum } from "./priority.js";

import { NtfyService } from "./ntfy.js";

/** descriptor registers this service's schemes and factory. */
export const descriptor = {
  schemes: ["ntfy"] as const,
  factory: (): NtfyService => new NtfyService(),
};
