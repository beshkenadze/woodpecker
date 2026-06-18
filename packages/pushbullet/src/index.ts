// @woodpecker-js/pushbullet — public entry point.

import { PushbulletService } from "./pushbullet.js";

export { Config, DEFAULT_TITLE, SCHEME } from "./config.js";
export {
  type ErrorResponse,
  newNotePush,
  type PushRequest,
  type PushResponse,
  setTarget,
} from "./payload.js";
export { PushbulletService } from "./pushbullet.js";

export const descriptor = {
  schemes: ["pushbullet"] as const,
  factory: (): PushbulletService => new PushbulletService(),
};
