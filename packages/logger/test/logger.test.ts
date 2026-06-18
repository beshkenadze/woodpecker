import { describe, expect, test } from "bun:test";
import type { Logger, Params } from "@woodpecker-js/core";
import { Config } from "../src/config.js";
import { descriptor, LoggerService } from "../src/index.js";

/** Capturing logger that records every formatted line. */
function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger: Logger = {
    logf(format: string, ...args: unknown[]): void {
      let i = 0;
      const line = format.replace(/%s/g, () => String(args[i++]));
      lines.push(line);
    },
  };
  return { logger, lines };
}

describe("Config URL round-trip", () => {
  for (const u of ["logger://"]) {
    test(`round-trips ${u}`, () => {
      const config = new Config();
      config.setURL(new URL(u));
      expect(config.getURL().toString()).toBe(u);
    });
  }

  test("default getURL is the bare scheme", () => {
    expect(new Config().getURL().toString()).toBe("logger://");
  });

  test("enums() is empty", () => {
    expect(new Config().enums()).toEqual({});
  });
});

describe("the logger service", () => {
  test("should output the message to the log", async () => {
    const { logger, lines } = captureLogger();
    const service = new LoggerService();
    service.initialize(new URL("logger://"), logger);

    await service.send("Failed - Requires Toaster Repair Level 10");

    expect(lines.join("\n")).toContain(
      "Failed - Requires Toaster Repair Level 10",
    );
  });

  test("should not mutate the passed params", async () => {
    const service = new LoggerService();
    service.initialize(new URL("logger://"));
    const params: Params = {};
    await service.send("Failed - Requires Toaster Repair Level 10", params);

    expect(params).toEqual({});
  });

  test("should render template with params", async () => {
    const { logger, lines } = captureLogger();
    const service = new LoggerService();
    service.initialize(new URL("logger://"), logger);
    service.setTemplateString("message", "{{.level}}: {{.message}}");

    const params: Params = { level: "warning" };
    await service.send("Requires Toaster Repair Level 10", params);

    expect(lines).toEqual(["warning: Requires Toaster Repair Level 10"]);
    // params untouched
    expect(params).toEqual({ level: "warning" });
  });

  test("renders missing template field as Go <no value> sentinel", async () => {
    const { logger, lines } = captureLogger();
    const service = new LoggerService();
    service.initialize(new URL("logger://"), logger);
    service.setTemplateString("message", "{{.level}}: {{.message}}");

    await service.send("msg"); // no "level" param

    expect(lines).toEqual(["<no value>: msg"]);
  });

  test("does not leak inherited object keys into template output", async () => {
    const { logger, lines } = captureLogger();
    const service = new LoggerService();
    service.initialize(new URL("logger://"), logger);
    service.setTemplateString("message", "[{{.toString}}]");

    await service.send("hi");

    expect(lines).toEqual(["[<no value>]"]);
  });

  test("re-initialize resets a previously set template", async () => {
    const { logger, lines } = captureLogger();
    const service = new LoggerService();
    service.initialize(new URL("logger://"), logger);
    service.setTemplateString("message", "{{.level}}: {{.message}}");

    service.initialize(new URL("logger://"), logger);
    await service.send("plain");

    expect(lines).toEqual(["plain"]);
  });

  test("discards output when no logger is set", async () => {
    const service = new LoggerService();
    service.initialize(new URL("logger://"));
    // Should not throw despite no logger.
    await expect(service.send("hello")).resolves.toBeUndefined();
  });
});

describe("descriptor", () => {
  test("exposes logger scheme and factory", () => {
    expect(descriptor.schemes).toContain("logger");
    expect(descriptor.factory()).toBeInstanceOf(LoggerService);
  });
});
