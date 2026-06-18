/**
 * @woodpecker-js/shoutrrr — the umbrella package.
 *
 * Importing this module registers all 20 notification services into the shared
 * `@woodpecker-js/core` router (side effect of `./register.ts`) and re-exports the
 * public API. This is the package end users install.
 *
 *   import { send } from '@woodpecker-js/shoutrrr';
 *   await send('slack://token-a/token-b/token-c@channel', 'Hello');
 */

import "./register.ts";

export type {
  EnumFormatter,
  Logger,
  Params,
  Service,
  ServiceConfig,
  ServiceFactory,
} from "@woodpecker-js/core";

export {
  createSender,
  extractScheme,
  getServiceFactory,
  newSender,
  registerService,
  ServiceRouter,
  send,
  setLogger,
} from "@woodpecker-js/core";
export { registerAll } from "./register.ts";
