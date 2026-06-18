/**
 * Registers all remaining notification services into the CLI's service
 * registry, so `send` (and `verify`) resolve every scheme.
 *
 * The built-in `logger://` service is registered separately (see
 * ./core/services/logger.ts) and remains authoritative for the CLI, so it is
 * intentionally NOT re-registered here.
 *
 * Each `@woodpecker-js/<service>` package vendors its own structurally-identical
 * `Service` type (pending the core-fold cleanup), so factories are accepted as
 * opaque thunks and cast to the CLI's `ServiceFactory`.
 */

import { descriptor as bark } from "@woodpecker-js/bark";
import { descriptor as discord } from "@woodpecker-js/discord";
import { descriptor as generic } from "@woodpecker-js/generic";
import { descriptor as googlechat } from "@woodpecker-js/googlechat";
import { descriptor as gotify } from "@woodpecker-js/gotify";
import { descriptor as ifttt } from "@woodpecker-js/ifttt";
import { descriptor as join } from "@woodpecker-js/join";
import { descriptor as matrix } from "@woodpecker-js/matrix";
import { descriptor as mattermost } from "@woodpecker-js/mattermost";
import { descriptor as ntfy } from "@woodpecker-js/ntfy";
import { descriptor as opsgenie } from "@woodpecker-js/opsgenie";
import { descriptor as pushbullet } from "@woodpecker-js/pushbullet";
import { descriptor as pushover } from "@woodpecker-js/pushover";
import { descriptor as rocketchat } from "@woodpecker-js/rocketchat";
import { descriptor as slack } from "@woodpecker-js/slack";
import { descriptor as smtp } from "@woodpecker-js/smtp";
import { descriptor as teams } from "@woodpecker-js/teams";
import { descriptor as telegram } from "@woodpecker-js/telegram";
import { descriptor as zulip } from "@woodpecker-js/zulip";
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
