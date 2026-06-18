// Public entry point for @woodpecker-js/telegram

export { Client, getResponseError } from "./client.js";
export { Config, fields, isTokenValid, Scheme } from "./config.js";
export { ParseMode, parseModeEnum, parseModeString } from "./parseMode.js";
export type {
  Chat,
  ErrorResponse,
  Message,
  MessageResponse,
  SendMessagePayload,
  User,
} from "./payload.js";
export { createSendMessagePayload } from "./payload.js";
export { TelegramService } from "./telegram.js";

import { TelegramService } from "./telegram.js";

/** Service descriptor for registration with the core router. */
export const descriptor = {
  schemes: ["telegram"] as const,
  factory: (): TelegramService => new TelegramService(),
};
