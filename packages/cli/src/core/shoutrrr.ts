/**
 * Public top-level API.
 *
 * Faithful port of `shoutrrr.go` (Send, CreateSender, NewSender, SetLogger).
 */

import { ServiceRouter } from "./router.js";
import type { Logger } from "./types.js";

const defaultRouter = new ServiceRouter();

/** Port of shoutrrr.SetLogger. */
export function setLogger(logger: Logger): void {
  defaultRouter.setLogger(logger);
}

/** Port of shoutrrr.Send — sends a single message to a single service URL. */
export async function send(rawURL: string, message: string): Promise<void> {
  const service = defaultRouter.locate(rawURL);
  await service.send(message, {});
}

/** Port of shoutrrr.CreateSender — a router configured for the given URLs. */
export function createSender(...rawURLs: string[]): ServiceRouter {
  const router = new ServiceRouter();
  for (const url of rawURLs) {
    router.addService(url);
  }
  return router;
}

/** Port of shoutrrr.NewSender — like createSender but with a logger. */
export function newSender(
  logger: Logger | undefined,
  ...serviceURLs: string[]
): ServiceRouter {
  const router = new ServiceRouter(logger);
  for (const url of serviceURLs) {
    router.addService(url);
  }
  return router;
}
