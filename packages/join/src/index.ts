// Public entrypoint for @woodpecker/join.

import { JoinService } from "./join.js";

export { APIKeyMissing, Config, DevicesMissing, Scheme } from "./config.js";
export type { JoinServiceOptions } from "./join.js";
export { JoinService } from "./join.js";

/** descriptor registers the join scheme with a factory for the service. */
export const descriptor = {
  schemes: ["join"],
  factory: (): JoinService => new JoinService(),
};
