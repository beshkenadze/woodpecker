import { describe, expect, it } from "bun:test";

import { getServiceFactory, type Logger, newSender } from "../src/index.ts";

const EXPECTED_SCHEMES = [
  "bark",
  "discord",
  "generic",
  "googlechat",
  "hangouts", // googlechat alias
  "gotify",
  "ifttt",
  "join",
  "logger",
  "matrix",
  "mattermost",
  "ntfy",
  "opsgenie",
  "pushbullet",
  "pushover",
  "rocketchat",
  "slack",
  "smtp",
  "teams",
  "telegram",
  "zulip",
];

describe("umbrella registry", () => {
  it("registers every service scheme into the core router", () => {
    for (const scheme of EXPECTED_SCHEMES) {
      const factory = getServiceFactory(scheme);
      expect(factory, `scheme "${scheme}" should be registered`).toBeDefined();
    }
  });

  it("each factory produces a usable Service (initialize + send)", () => {
    for (const scheme of EXPECTED_SCHEMES) {
      const factory = getServiceFactory(scheme);
      const service = factory?.();
      expect(typeof service?.initialize, scheme).toBe("function");
      expect(typeof service?.send, scheme).toBe("function");
    }
  });

  it("routes and delivers a logger:// message end-to-end via the public API", async () => {
    const lines: string[] = [];
    const capture: Logger = {
      logf: (format: string, ...args: unknown[]) => {
        lines.push([format, ...args.map(String)].join("|"));
      },
    };
    const router = newSender(capture, "logger://");
    const errors = await router.send("hello from the umbrella");
    expect(errors).toEqual([]);
    expect(lines.join("\n")).toContain("hello from the umbrella");
  });
});
