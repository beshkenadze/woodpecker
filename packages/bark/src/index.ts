import { BarkService } from "./bark.js";

export { BarkService } from "./bark.js";
export { Config, Scheme } from "./config.js";
export type { ApiResponse, PushPayload } from "./payload.js";

export const descriptor = {
  schemes: ["bark"],
  factory: (): BarkService => new BarkService(),
};
