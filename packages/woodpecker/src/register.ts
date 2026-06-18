/**
 * Registers every notification service into the shared `@woodpecker/core`
 * registry. Importing this module (or the package barrel) populates the router
 * so `send`/`createSender`/`newSender` resolve all 20 services.
 *
 * This is the integration-pass equivalent of Go's `pkg/router/servicemap.go`,
 * which statically maps every scheme to its service at package init.
 */

import { descriptor as bark } from "@woodpecker/bark";
import { registerService, type ServiceFactory } from "@woodpecker/core";
import { descriptor as discord } from "@woodpecker/discord";
import { descriptor as generic } from "@woodpecker/generic";
import { descriptor as googlechat } from "@woodpecker/googlechat";
import { descriptor as gotify } from "@woodpecker/gotify";
import { descriptor as ifttt } from "@woodpecker/ifttt";
import { descriptor as join } from "@woodpecker/join";
import { descriptor as logger } from "@woodpecker/logger";
import { descriptor as matrix } from "@woodpecker/matrix";
import { descriptor as mattermost } from "@woodpecker/mattermost";
import { descriptor as ntfy } from "@woodpecker/ntfy";
import { descriptor as opsgenie } from "@woodpecker/opsgenie";
import { descriptor as pushbullet } from "@woodpecker/pushbullet";
import { descriptor as pushover } from "@woodpecker/pushover";
import { descriptor as rocketchat } from "@woodpecker/rocketchat";
import { descriptor as slack } from "@woodpecker/slack";
import { descriptor as smtp } from "@woodpecker/smtp";
import { descriptor as teams } from "@woodpecker/teams";
import { descriptor as telegram } from "@woodpecker/telegram";
import { descriptor as zulip } from "@woodpecker/zulip";

/**
 * A service descriptor as exported by each `@woodpecker/<service>` package.
 *
 * Each package vendors its own structurally-identical `Service` type (pending
 * the core-fold cleanup), so the factory is accepted as an opaque thunk and
 * cast to the core `ServiceFactory` — they are structurally compatible
 * (`initialize` / `setLogger` / `send`).
 */
interface ServiceDescriptor {
  schemes: readonly string[];
  factory: () => unknown;
}

const descriptors: ServiceDescriptor[] = [
  bark,
  discord,
  generic,
  googlechat,
  gotify,
  ifttt,
  join,
  logger,
  matrix,
  mattermost,
  ntfy,
  opsgenie,
  pushbullet,
  pushover,
  rocketchat,
  slack,
  smtp,
  teams,
  telegram,
  zulip,
];

let registered = false;

/** Registers all services into the core registry. Idempotent. */
export function registerAll(): void {
  if (registered) {
    return;
  }
  for (const descriptor of descriptors) {
    for (const scheme of descriptor.schemes) {
      registerService(scheme, descriptor.factory as ServiceFactory);
    }
  }
  registered = true;
}

registerAll();
