import { afterEach, describe, expect, test } from "bun:test";
import { Config, Scheme } from "../src/config.js";
import { NtfyService } from "../src/ntfy.js";
import { formatApiError } from "../src/payload.js";
import { Priority, priorityEnum } from "../src/priority.js";

// @woodpecker-js/core's JsonClient is built on the standard fetch API. undici's
// MockAgent does not work under Bun, so the idiomatic Bun equivalent is to
// override globalThis.fetch and assert the endpoint, body, headers and status
// handling from the captured RequestInit.
interface CapturedRequest {
  url: string;
  method?: string;
  body?: string;
  headers: Record<string, string>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function headersToRecord(
  headers: RequestInit["headers"],
): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) {
    return record;
  }
  // @woodpecker-js/core's JsonClient always passes a plain Record headers object,
  // but normalize the Headers / array shapes too for robustness.
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key !== undefined) {
        record[key] = value ?? "";
      }
    }
  } else {
    Object.assign(record, headers);
  }
  return record;
}

function installFetchMock(
  responder: (req: CapturedRequest) => { statusCode: number; body: unknown },
): { calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const captured: CapturedRequest = {
      url: String(input),
      method: init?.method,
      body: init?.body as string | undefined,
      headers: headersToRecord(init?.headers),
    };
    calls.push(captured);
    const { statusCode, body } = responder(captured);
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status: statusCode,
    });
  }) as unknown as typeof fetch;
  return { calls };
}

function installFetchNetworkError(): void {
  globalThis.fetch = (async (): Promise<Response> => {
    throw new Error("Unable to connect to nonresolvablehostname");
  }) as unknown as typeof fetch;
}

describe("the ntfy config", () => {
  test("Scheme is ntfy", () => {
    expect(Scheme).toBe("ntfy");
  });

  test("getAPIURL builds the expected endpoint", () => {
    const config = new Config();
    config.host = "host:8080";
    config.scheme = "http";
    config.topic = "topic";
    expect(config.getAPIURL()).toBe("http://host:8080/topic");
  });

  test("only required fields set yields the documented defaults", () => {
    const config = new Config();
    config.setURL(new URL("ntfy://hostname/topic"));
    expect(config.host).toBe("hostname");
    expect(config.topic).toBe("topic");
    expect(config.scheme).toBe("https");
    expect(config.tags).toEqual([""]);
    expect(config.actions).toEqual([""]);
    expect(config.priority).toBe(Priority.Default);
    expect(config.firebase).toBe(true);
    expect(config.cache).toBe(true);
    expect(config.markdown).toBe(false);
  });

  test("URL round-trips identically after de-/serialization", () => {
    const testURL =
      "ntfy://user:pass@example.com:2225/topic?cache=No&click=CLICK&firebase=No&icon=ICON&markdown=No&priority=Max&scheme=http&title=TITLE";
    const config = new Config();
    config.setURL(new URL(testURL));
    expect(config.getURL().toString()).toBe(testURL);
  });

  test("non-default config keys (incl. capitalized defaults) are serialized like Go", () => {
    // Go IsDefault compares the lowercase tag ("default"/"yes"/"no") against the
    // capitalized Print output, so these never match and are always emitted.
    const config = new Config();
    config.setURL(new URL("ntfy://hostname/topic"));
    const query = config.getURL().search;
    expect(query).toBe("?cache=Yes&firebase=Yes&markdown=No&priority=Default");
  });

  test("query values are escaped with Go QueryEscape semantics", () => {
    // Go url.Values.Encode escapes * ( ) but leaves ~ literal and uses + for space.
    const config = new Config();
    config.setURL(
      new URL(`ntfy://hostname/topic?title=${encodeURIComponent("a*b(c)~d")}`),
    );
    expect(config.getURL().search).toContain("title=a%2Ab%28c%29~d");
  });

  test.each([
    ["priority=Max name", "ntfy://host/topic?priority=Max", Priority.Max],
    ["priority=Min name", "ntfy://host/topic?priority=Min", Priority.Min],
    ["priority=5 numeric", "ntfy://host/topic?priority=5", Priority.Max],
    [
      "priority=urgent alias",
      "ntfy://host/topic?priority=urgent",
      Priority.Max,
    ],
  ])("parses %s", (_label, url, expected) => {
    const config = new Config();
    config.setURL(new URL(url));
    expect(config.priority).toBe(expected);
  });

  test("invalid query key throws", () => {
    const config = new Config();
    expect(() => config.setURL(new URL("ntfy://host/topic?foo=bar"))).toThrow();
  });
});

describe("the priority enum", () => {
  test.each([
    [Priority.Min, "Min"],
    [Priority.Low, "Low"],
    [Priority.Default, "Default"],
    [Priority.High, "High"],
    [Priority.Max, "Max"],
  ])("prints %i as %s", (value, name) => {
    expect(priorityEnum.print(value)).toBe(name);
  });

  test.each([
    ["Max", Priority.Max],
    ["max", Priority.Max],
    ["urgent", Priority.Max],
    ["3", Priority.Default],
  ])("parses %s", (input, expected) => {
    expect(priorityEnum.parse(input)).toBe(expected);
  });

  test("parse returns -1 for unknown", () => {
    expect(priorityEnum.parse("nope")).toBe(-1);
  });

  test("print/parse round-trip for every name", () => {
    for (const value of [
      Priority.Min,
      Priority.Low,
      Priority.Default,
      Priority.High,
      Priority.Max,
    ]) {
      expect(priorityEnum.parse(priorityEnum.print(value))).toBe(value);
    }
  });
});

describe("formatApiError", () => {
  test("formats message and code", () => {
    expect(formatApiError({ code: 500, error: "boom" })).toBe(
      "server response: boom (500)",
    );
  });

  test("appends link when present", () => {
    expect(
      formatApiError({ code: 403, error: "forbidden", link: "https://x" }),
    ).toBe("server response: forbidden (403), see: https://x");
  });
});

describe("sending the push payload", () => {
  test("resolves and POSTs the message body to the topic endpoint", async () => {
    const { calls } = installFetchMock(() => ({
      statusCode: 200,
      body: { code: 200, error: "OK" },
    }));

    const service = new NtfyService();
    service.initialize(new URL("ntfy://:devicekey@hostname/mytopic"));
    await service.send("Message");

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected a captured call");
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://:devicekey@hostname/mytopic");
    expect(call.body).toBe("Message");
    // ntfy expects a raw body, not application/json.
    expect(call.headers["Content-Type"]).toBeUndefined();
  });

  test("rejects when the server returns an error", async () => {
    installFetchMock(() => ({
      statusCode: 500,
      body: { code: 500, error: "someone turned off the internet" },
    }));

    const service = new NtfyService();
    service.initialize(new URL("ntfy://:devicekey@hostname"));
    await expect(service.send("Message")).rejects.toThrow(
      /someone turned off the internet/,
    );
  });

  test("rejects on communication error", async () => {
    installFetchNetworkError();

    const service = new NtfyService();
    service.initialize(new URL("ntfy://:devicekey@nonresolvablehostname"));
    await expect(service.send("Message")).rejects.toThrow(/failed to send/);
  });

  test("applies priority header via params override", async () => {
    const { calls } = installFetchMock(() => ({
      statusCode: 200,
      body: { code: 200, error: "OK" },
    }));

    const service = new NtfyService();
    service.initialize(new URL("ntfy://:devicekey@hostname"));
    await service.send("Message", { priority: "Max" });

    const call = calls[0];
    if (!call) throw new Error("expected a captured call");
    expect(call.headers.Priority).toBe("Max");
  });
});
