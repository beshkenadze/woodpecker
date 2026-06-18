/**
 * @woodpecker/shoutrrr — the umbrella package.
 *
 * Importing this module registers all 20 notification services into the shared
 * `@woodpecker/core` router (side effect of `./register.ts`) and re-exports the
 * public API. This is the package end users install.
 *
 *   import { send } from '@woodpecker/shoutrrr';
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
} from "@woodpecker/core";

export {
  createSender,
  extractScheme,
  getServiceFactory,
  newSender,
  registerService,
  ServiceRouter,
  send,
  setLogger,
} from "@woodpecker/core";
export { registerAll } from "./register.ts";
