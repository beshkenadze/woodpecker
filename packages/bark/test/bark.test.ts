import { afterEach, describe, expect, test } from "bun:test";
import { BarkService } from "../src/bark.js";
import { Config } from "../src/config.js";
import type { ApiResponse, PushPayload } from "../src/payload.js";

describe("bark config", () => {
  describe("getAPIURL", () => {
    const getAPIForPath = (path: string): string => {
      const c = new Config();
      c.host = "host";
      c.path = path;
      c.scheme = "https";
      return c.getAPIURL("endpoint");
    };

    test("returns the expected URL for various paths", () => {
      expect(getAPIForPath("path")).toBe("https://host/path/endpoint");
      expect(getAPIForPath("/path")).toBe("https://host/path/endpoint");
      expect(getAPIForPath("/path/")).toBe("https://host/path/endpoint");
      expect(getAPIForPath("path/")).toBe("https://host/path/endpoint");
      expect(getAPIForPath("/")).toBe("https://host/endpoint");
      expect(getAPIForPath("")).toBe("https://host/endpoint");
    });
  });

  describe("defaults", () => {
    test("only required fields set leaves optional fields at defaults", () => {
      const service = new BarkService();
      service.initialize(new URL("bark://:devicekey@hostname"));
      const config = service.getConfigForTest();
      expect(config.host).toBe("hostname");
      expect(config.deviceKey).toBe("devicekey");
      expect(config.scheme).toBe("https");
      // Go's setURL copies url.Path verbatim; with no trailing slash it is empty.
      expect(config.path).toBe("");
      expect(config.badge).toBe(0);
      expect(config.title).toBe("");
    });
  });

  describe("validation", () => {
    test("rejects a non-numeric badge value (strict int parse)", () => {
      const config = new Config();
      expect(() =>
        config.setURL(new URL("bark://:k@host/?badge=5abc")),
      ).toThrow();
    });

    test("rejects an unknown query key", () => {
      const config = new Config();
      expect(() => config.setURL(new URL("bark://:k@host/?foo=bar"))).toThrow();
    });

    test("accepts a valid numeric badge", () => {
      const config = new Config();
      config.setURL(new URL("bark://:k@host/?badge=7"));
      expect(config.badge).toBe(7);
    });
  });

  describe("URL round-trip", () => {
    test("is identical after de-/serialization", () => {
      const testURL =
        "bark://:device-key@example.com:2225/?badge=5&category=CAT&group=GROUP&scheme=http&title=TITLE&url=URL";
      const config = new Config();
      config.setURL(new URL(testURL));
      expect(config.getURL().toString()).toBe(testURL);
    });

    test('minimal URL round-trips with ForceQuery trailing "?"', () => {
      const testURL = "bark://:devicekey@hostname/?";
      const config = new Config();
      config.setURL(new URL(testURL));
      expect(config.getURL().toString()).toBe("bark://:devicekey@hostname/?");
    });
  });
});

describe("bark send (mocked HTTP)", () => {
  // The service sends via @woodpecker-js/core's fetch-based JsonClient. We drive a
  // real local server and point the service at it via an http:// bark URL so we
  // can capture and assert the wire request (method, path, content type, body).
  let server: ReturnType<typeof Bun.serve> | undefined;

  afterEach(() => {
    server?.stop(true);
    server = undefined;
  });

  interface Captured {
    method?: string;
    path?: string;
    contentType?: string | null;
    body?: PushPayload;
  }

  const startServer = (
    status: number,
    responseBody: ApiResponse,
    captured: Captured,
  ): URL => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        captured.method = req.method;
        captured.path = url.pathname;
        captured.contentType = req.headers.get("content-type");
        captured.body = (await req.json()) as PushPayload;
        return new Response(JSON.stringify(responseBody), {
          status,
          headers: { "content-type": "application/json" },
        });
      },
    });
    return new URL(`bark://:devicekey@127.0.0.1:${server.port}/?scheme=http`);
  };

  const makeService = (configURL: URL): BarkService => {
    const service = new BarkService();
    service.initialize(configURL);
    return service;
  };

  test("POSTs the push payload to /push and resolves on 200", async () => {
    const captured: Captured = {};
    const configURL = startServer(200, { code: 200, message: "OK" }, captured);
    const service = makeService(configURL);

    await expect(service.send("Message")).resolves.toBeUndefined();

    expect(captured.method).toBe("POST");
    expect(captured.path).toBe("/push");
    expect(captured.contentType).toBe("application/json");
    expect(captured.body?.body).toBe("Message");
    expect(captured.body?.device_key).toBe("devicekey");
    // badge:0 is falsy but must still be serialized (Go sends a non-nil pointer).
    expect(captured.body?.badge).toBe(0);
    expect(captured.body?.title).toBe("");
    // omitempty: empty optional string fields are omitted from the wire payload.
    expect(captured.body).not.toHaveProperty("sound");
    expect(captured.body).not.toHaveProperty("icon");
    expect(captured.body).not.toHaveProperty("group");
    expect(captured.body).not.toHaveProperty("url");
    expect(captured.body).not.toHaveProperty("category");
    expect(captured.body).not.toHaveProperty("copy");
  });

  test("includes non-empty optional fields in the payload", async () => {
    const captured: Captured = {};
    const base = startServer(200, { code: 200, message: "OK" }, captured);
    const configURL = new URL(base.toString());
    configURL.searchParams.set("sound", "alarm");
    configURL.searchParams.set("group", "G1");
    const service = makeService(configURL);

    await expect(service.send("Message")).resolves.toBeUndefined();
    expect(captured.body?.sound).toBe("alarm");
    expect(captured.body?.group).toBe("G1");
    expect(captured.body).not.toHaveProperty("icon");
  });

  test("rejects with the server message on a non-2xx status", async () => {
    const captured: Captured = {};
    const configURL = startServer(
      500,
      { code: 500, message: "someone turned off the internet" },
      captured,
    );
    const service = makeService(configURL);

    await expect(service.send("Message")).rejects.toThrow(
      "server response: someone turned off the internet",
    );
  });

  test('rejects with "unknown error" on HTTP 200 but body code != 200', async () => {
    const captured: Captured = {};
    const configURL = startServer(
      200,
      { code: 500, message: "response code differs from HTTP code" },
      captured,
    );
    const service = makeService(configURL);

    await expect(service.send("Message")).rejects.toThrow("unknown error");
  });

  test("rejects on a communication error (unreachable host)", async () => {
    const service = makeService(
      // Reserved TEST-NET-1 address + closed port: connection fails fast.
      new URL("bark://:devicekey@127.0.0.1:1/?scheme=http"),
    );
    await expect(service.send("Message")).rejects.toThrow();
  });

  test("forwards params (e.g. title) into the payload", async () => {
    const captured: Captured = {};
    const configURL = startServer(200, { code: 200, message: "OK" }, captured);
    const service = makeService(configURL);

    await expect(
      service.send("Hi", { title: "Custom" }),
    ).resolves.toBeUndefined();
    expect(captured.body?.title).toBe("Custom");
  });
});
