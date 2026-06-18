import type { Params } from "@woodpecker-js/core";
import type { Config } from "./config.js";

/** JsonPayload is the actual notification payload, ported from ifttt_json.go. */
export interface JsonPayload {
  value1: string;
  value2: string;
  value3: string;
}

/**
 * createJSONToSend builds the JSON payload for the IFTTT webhook API, ported
 * from ifttt_json.go.
 *
 * Resolution order matches Go:
 *   1. Start from config value1/2/3.
 *   2. Apply value1/2/3 param overrides if present.
 *   3. Route the message into the field selected by useMessageAsValue (1-3).
 */
export function createJSONToSend(
  config: Config,
  message: string,
  params?: Params,
): JsonPayload {
  const payload: JsonPayload = {
    value1: config.value1,
    value2: config.value2,
    value3: config.value3,
  };

  if (params) {
    if (params.value1 !== undefined) {
      payload.value1 = params.value1;
    }
    if (params.value2 !== undefined) {
      payload.value2 = params.value2;
    }
    if (params.value3 !== undefined) {
      payload.value3 = params.value3;
    }
  }

  switch (config.useMessageAsValue) {
    case 1:
      payload.value1 = message;
      break;
    case 2:
      payload.value2 = message;
      break;
    case 3:
      payload.value3 = message;
      break;
    default:
      break;
  }

  return payload;
}
