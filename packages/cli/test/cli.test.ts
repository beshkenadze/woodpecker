import { describe, expect, test } from "bun:test";

import "../src/core/index.js";
import { runSend, type SendResult } from "../src/commands/send.js";
import { runVerify } from "../src/commands/verify.js";
import { colorFormatTree, isNumber } from "../src/core/format.js";
import { listServices, ServiceRouter } from "../src/core/router.js";
import type { FieldInfo } from "../src/core/types.js";
import { EX_UNAVAILABLE } from "../src/exit-codes.js";
import { ellipsis, removeDuplicates } from "../src/util.js";

// Strip ANSI color codes so assertions are stable regardless of TTY.
function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape stripping
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("core router", () => {
  test("registers the built-in logger service", () => {
    expect(listServices()).toContain("logger");
  });

  test("locate parses scheme from the URL protocol", () => {
    const router = new ServiceRouter();
    const service = router.locate("logger://");
    expect(service.getConfig().getURL().protocol).toBe("logger:");
  });

  test("locate throws for an unknown scheme", () => {
    const router = new ServiceRouter();
    expect(() => router.locate("doesnotexist://")).toThrow(/unknown service/);
  });
});

describe("send command", () => {
  test("sends to a logger url and reports success", async () => {
    const lines: string[] = [];
    const results = await runSend({
      urls: ["logger://"],
      message: "hello from test",
      verbose: false,
      logf: (line) => lines.push(line),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("logger://");
    expect(results[0]?.error).toBeUndefined();
    // The logger service routes the message through the verbose logger only
    // when verbose; without a logger it writes to console. The "Notification
    // sent" progress line is always emitted on success.
    expect(lines).toContain("Notification sent");
  });

  test("collects results for multiple urls and deduplicates", async () => {
    const lines: string[] = [];
    const results = await runSend({
      urls: ["logger://", "logger://"],
      message: "dedup test",
      verbose: false,
      logf: (line) => lines.push(line),
    });
    // Duplicate URLs are removed (dedupe.RemoveDuplicates).
    expect(results).toHaveLength(1);
  });

  test("reports failure with a non-zero exit code for an unknown service", async () => {
    const results: SendResult[] = await runSend({
      urls: ["unknownsvc://"],
      message: "boom",
      verbose: false,
      logf: () => {},
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.error).toBeDefined();
    // Go double-wraps the router-init error; match that message shape.
    expect(results[0]?.error?.message).toBe(
      'error invoking send: error initializing router services: unknown service "unknownsvc"',
    );
  });

  test("reads the message from stdin when message is '-'", async () => {
    const lines: string[] = [];
    const results = await runSend({
      urls: ["logger://"],
      message: "-",
      verbose: false,
      stdin: async () => "piped message",
      logf: (line) => lines.push(line),
    });
    expect(results[0]?.error).toBeUndefined();
    expect(lines).toContain("Reading from STDIN...");
    expect(lines.some((l) => l.startsWith("Read "))).toBe(true);
  });

  test("emits verbose diagnostics when verbose is set", async () => {
    const lines: string[] = [];
    await runSend({
      urls: ["logger://"],
      message: "verbose msg",
      title: "T",
      verbose: true,
      logf: (line) => lines.push(line),
    });
    expect(lines.some((l) => l.includes("URLs: logger://"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Message: "))).toBe(true);
    expect(lines.some((l) => l.startsWith("Title: "))).toBe(true);
  });

  test("a failing service result carries the ExUnavailable exit code", async () => {
    // Register a throwing service for this test.
    const { registerService } = await import("../src/core/router.js");
    registerService("boom", () => ({
      initialize() {},
      setLogger() {},
      async send() {
        throw new Error("send failed");
      },
      getConfig() {
        return {
          getURL: () => new URL("boom://"),
          setURL: () => {},
          enums: () => ({}),
          configFields: () => [],
        };
      },
    }));

    const results = await runSend({
      urls: ["boom://"],
      message: "x",
      verbose: false,
      logf: () => {},
    });
    const err = results[0]?.error as { exitCode?: number } | undefined;
    expect(err?.exitCode).toBe(EX_UNAVAILABLE);
  });
});

describe("verify command", () => {
  test("renders an empty config tree for logger:// (no fields)", () => {
    const tree = runVerify("logger://");
    // The logger config exposes no fields, so the rendered tree is empty.
    expect(tree).toBe("");
  });

  test("renders fields for a config that exposes them", async () => {
    const { registerService } = await import("../src/core/router.js");
    registerService("fielded", () => ({
      initialize() {},
      setLogger() {},
      async send() {},
      getConfig() {
        return {
          getURL: () => new URL("fielded://"),
          setURL: () => {},
          enums: () => ({}),
          configFields: () => [
            {
              name: "Host",
              typeName: "string",
              description: "the target host",
              defaultValue: "",
              template: "",
              required: true,
              keys: ["host"],
              value: "example.com",
            },
            {
              name: "Port",
              typeName: "int",
              description: "the target port",
              defaultValue: "443",
              template: "",
              required: false,
              keys: ["port"],
              value: "8080",
            },
          ],
        };
      },
    }));

    const tree = stripAnsi(runVerify("fielded://"));
    expect(tree).toContain("Host");
    expect(tree).toContain("the target host");
    expect(tree).toContain("Required");
    expect(tree).toContain("Port");
    expect(tree).toContain("Default: 443");
    // verify renders with values (ColorFormatTree withValues=true).
    expect(tree).toContain("example.com");
    expect(tree).toContain("8080");
    // Sorted alphabetically: Host before Port.
    expect(tree.indexOf("Host")).toBeLessThan(tree.indexOf("Port"));
  });

  test("validates (does not crash on) a service exposing getConfig() but no configFields()", async () => {
    // Regression: TelegramService defines getConfig(), but its Config has no
    // CLI-style configFields(). Guarding only on getConfig() would call
    // getConfigFormat() and throw "config.configFields is not a function".
    const { registerService } = await import("../src/core/router.js");
    const { descriptor } = await import("@woodpecker-js/telegram");
    for (const scheme of descriptor.schemes) {
      registerService(
        scheme,
        descriptor.factory as unknown as Parameters<typeof registerService>[1],
      );
    }
    const url =
      "telegram://110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw@telegram?chats=@chan";
    expect(() => runVerify(url)).not.toThrow();
    expect(runVerify(url)).toBe("Service 'telegram' URL is valid.\n");
  });

  test("throws for an unknown service scheme", () => {
    expect(() => runVerify("nope://")).toThrow(/unknown service/);
  });
});

describe("util.ellipsis", () => {
  test("returns the text unchanged when within the limit", () => {
    expect(ellipsis("hello", 10)).toBe("hello");
    expect(ellipsis("hello", 5)).toBe("hello");
  });

  test("truncates and appends an ellipsis, never exceeding maxLength", () => {
    expect(ellipsis("abcdef", 5)).toBe("ab...");
    expect(ellipsis("abcdef", 5).length).toBe(5);
  });

  test("never returns longer than maxLength even when maxLength < 3", () => {
    // Go would panic here; the port clamps instead of overrunning.
    expect(ellipsis("abcdef", 2).length).toBeLessThanOrEqual(2);
    expect(ellipsis("abcdef", 0)).toBe("");
  });
});

describe("util.removeDuplicates", () => {
  test("preserves first-seen order and drops repeats", () => {
    expect(removeDuplicates(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
    expect(removeDuplicates(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("format.isNumber (strconv.ParseFloat parity)", () => {
  test("accepts decimal, signed, scientific, and Inf/NaN", () => {
    for (const v of [
      "12",
      "-3.14",
      "+5",
      ".5",
      "1e3",
      "Inf",
      "NaN",
      "-Infinity",
    ]) {
      expect(isNumber(v)).toBe(true);
    }
  });

  test("rejects radix prefixes, underscores, whitespace, and empty", () => {
    for (const v of ["0x1F", "0b101", "0o17", "12_000", " 12 ", "", "abc"]) {
      expect(isNumber(v)).toBe(false);
    }
  });
});

describe("format.colorFormatTree withValues", () => {
  const field: FieldInfo = {
    name: "Token",
    typeName: "string",
    description: "api token",
    defaultValue: "",
    template: "",
    required: false,
    keys: ["token"],
    value: "secret-val",
  };

  function strip(s: string): string {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape stripping
    return s.replace(/\x1b\[[0-9;]*m/g, "");
  }

  test("withValues=true renders the field value (verify default)", () => {
    expect(strip(colorFormatTree([field]))).toContain("secret-val");
  });

  test("withValues=false renders the type name instead of the value", () => {
    const out = strip(colorFormatTree([field], false));
    expect(out).toContain("string");
    expect(out).not.toContain("secret-val");
  });
});
