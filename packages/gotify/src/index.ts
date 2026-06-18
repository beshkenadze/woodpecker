export { Config, SCHEME } from "./config.js";
export type { GotifyServiceOptions } from "./gotify.js";
export { buildURL, GotifyService, isTokenValid } from "./gotify.js";
export type {
  ErrorResponse,
  MessageRequest,
  MessageResponse,
} from "./payload.js";

import { GotifyService } from "./gotify.js";

/** descriptor registers this service's URL schemes with a factory. */
export const descriptor = {
  schemes: ["gotify"] as const,
  factory: (): GotifyService => new GotifyService(),
};
