/**
 * Registers all remaining notification services into the CLI's service
 * registry, so `send` (and `verify`) resolve every scheme.
 *
 * The built-in `logger://` service is registered separately (see
 * ./core/services/logger.ts) and remains authoritative for the CLI, so it is
 * intentionally NOT re-registered here.
 *
 * Each `@woodpecker/<service>` package vendors its own structurally-identical
 * `Service` type (pending the core-fold cleanup), so factories are accepted as
 * opaque thunks and cast to the CLI's `ServiceFactory`.
 */

import { descriptor as bark } from "@woodpecker/bark";
import { descriptor as discord } from "@woodpecker/discord";
import { descriptor as generic } from "@woodpecker/generic";
import { descriptor as googlechat } from "@woodpecker/googlechat";
import { descriptor as gotify } from "@woodpecker/gotify";
import { descriptor as ifttt } from "@woodpecker/ifttt";
import { descriptor as join } from "@woodpecker/join";
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
import { registerService, type ServiceFactory } from "./core/router.js";

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

for (const descriptor of descriptors) {
  for (const scheme of descriptor.schemes) {
    registerService(scheme, descriptor.factory as ServiceFactory);
  }
}
