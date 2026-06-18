import type { Service } from "@woodpecker/core";
import { GoogleChatService } from "./googlechat.ts";

export type { Logger, Params, Service } from "@woodpecker/core";
export { GoogleChatConfig, Scheme } from "./config.ts";
export { GoogleChatService } from "./googlechat.ts";

export interface ServiceDescriptor {
  schemes: string[];
  factory: () => Service;
}

export const descriptor: ServiceDescriptor = {
  schemes: ["googlechat", "hangouts"],
  factory: (): Service => new GoogleChatService(),
};
