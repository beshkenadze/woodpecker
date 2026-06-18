import { DiscordService } from "./discord.js";

export { Config, DISCORD_SCHEMA, SCHEME } from "./config.js";
export {
  createAPIURLFromConfig,
  createItemsFromPlain,
  DiscordService,
} from "./discord.js";
export {
  createPayloadFromItems,
  type EmbedFooter,
  type EmbedItem,
  type WebhookPayload,
} from "./payload.js";

/** Service descriptor for registration with the shoutrrr router. */
export const descriptor = {
  schemes: ["discord"] as const,
  factory: (): DiscordService => new DiscordService(),
};
