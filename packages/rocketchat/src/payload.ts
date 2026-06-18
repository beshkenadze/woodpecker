import type { Params } from "@woodpecker-js/core";
import type { Config } from "./config.js";

// RocketchatPayload is the JSON body accepted by the Rocket.Chat webhook API.
// username/channel are omitted when empty (Go `omitempty`).
export interface RocketchatPayload {
  text: string;
  username?: string;
  channel?: string;
}

// createJSONPayload builds the webhook payload, applying params overrides for
// username and channel. Faithful port of rocketchat_json.go.
export function createJSONPayload(
  config: Config,
  message: string,
  params?: Params,
): RocketchatPayload {
  let userName = config.userName;
  let channel = config.channel;

  if (params) {
    if (params.username !== undefined) {
      userName = params.username;
    }
    if (params.channel !== undefined) {
      channel = params.channel;
    }
  }

  const payload: RocketchatPayload = { text: message };
  if (userName !== "") {
    payload.username = userName;
  }
  if (channel !== "") {
    payload.channel = channel;
  }
  return payload;
}
