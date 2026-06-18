import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Server } from "bun";
import { Config, createConfigFromURL, ErrorMessage } from "../src/config.ts";
import { ZulipService } from "../src/zulip.ts";

describe("the zulip config", () => {
  describe("given a service url with missing parts", () => {
    it("should error if bot mail is missing", () => {
      const url = new URL("zulip://example.zulipchat.com?stream=foo&topic=bar");
      expect(() => createConfigFromURL(url)).toThrow(
        ErrorMessage.MissingBotMail,
      );
    });

    it("should error if api key is missing", () => {
      const url = new URL(
        "zulip://bot-name%40zulipchat.com@example.zulipchat.com?stream=foo&topic=bar",
      );
      expect(() => createConfigFromURL(url)).toThrow(
        ErrorMessage.MissingAPIKey,
      );
    });

    it("should error if host is missing", () => {
      // No host between '@' and '?': WHATWG URL rejects this outright, which is
      // equivalent to the host being absent in the Go implementation.
      expect(() =>
        createConfigFromURL(
          new URL(
            "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@?stream=foo",
          ),
        ),
      ).toThrow();
    });
  });

  describe("cloning a config object", () => {
    it("the clone should have equal values but not be the same instance", () => {
      const c1 = new Config();
      c1.botMail = "bot-name@zulipchat.com";
      c1.botKey = "correcthorsebatterystable";
      c1.host = "example.zulipchat.com";
      c1.stream = "foo";
      c1.topic = "bar";

      const c2 = c1.clone();
      expect(c2).toEqual(c1);
      expect(c2).not.toBe(c1);
    });
  });

  describe("parsing a valid service url", () => {
    it("should map all fields", () => {
      const config = createConfigFromURL(
        new URL(
          "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com?stream=foo&topic=bar",
        ),
      );
      expect(config.botMail).toBe("bot-name@zulipchat.com");
      expect(config.botKey).toBe("correcthorsebatterystable");
      expect(config.host).toBe("example.zulipchat.com");
      expect(config.stream).toBe("foo");
      expect(config.topic).toBe("bar");
    });
  });

  describe("building a service url", () => {
    it("should build the correct url with stream and topic", () => {
      const config = new Config();
      config.botMail = "bot-name@zulipchat.com";
      config.botKey = "correcthorsebatterystable";
      config.host = "example.zulipchat.com";
      config.stream = "foo";
      config.topic = "bar";
      expect(config.toURLString()).toBe(
        "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com?stream=foo&topic=bar",
      );
    });

    it("should build the correct url with stream but no topic", () => {
      const config = new Config();
      config.botMail = "bot-name@zulipchat.com";
      config.botKey = "correcthorsebatterystable";
      config.host = "example.zulipchat.com";
      config.stream = "foo";
      expect(config.toURLString()).toBe(
        "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com?stream=foo",
      );
    });

    it("should preserve a non-standard port through a round-trip (fix #495)", () => {
      const config = createConfigFromURL(
        new URL(
          "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com:8443?stream=foo&topic=bar",
        ),
      );
      expect(config.host).toBe("example.zulipchat.com:8443");
      expect(config.toURLString()).toBe(
        "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com:8443?stream=foo&topic=bar",
      );
    });
  });
});

describe("sending messages", () => {
  const BASE_URL =
    "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com?stream=foo&topic=bar";

  interface CapturedRequest {
    method: string;
    pathname: string;
    authorization: string | null;
    contentType: string | null;
    body: string;
  }

  let server: Server<unknown>;
  let origin: string;
  let captured: CapturedRequest | undefined;
  let nextStatus = 200;

  beforeEach(() => {
    captured = undefined;
    nextStatus = 200;
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        captured = {
          method: req.method,
          pathname: url.pathname,
          authorization: req.headers.get("authorization"),
          contentType: req.headers.get("content-type"),
          body: await req.text(),
        };
        return new Response(nextStatus === 200 ? "" : "bad payload", {
          status: nextStatus,
        });
      },
    });
    origin = `http://localhost:${server.port}`;
  });

  afterEach(() => {
    server.stop(true);
  });

  function newService(): ZulipService {
    const service = new ZulipService({ apiOrigin: origin });
    service.initialize(new URL(BASE_URL));
    return service;
  }

  it("should return an error before posting when the topic is too long", async () => {
    const url = new URL(
      "zulip://bot-name%40zulipchat.com:correcthorsebatterystable@example.zulipchat.com?stream=foo&topic=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghi",
    );
    const service = new ZulipService({ apiOrigin: origin });
    service.initialize(url);
    await expect(service.send("This is a message")).rejects.toThrow(
      "topic exceeds max length (60 characters): was 61 characters",
    );
    expect(captured).toBeUndefined();
  });

  it("should return an error before posting when the message is too large", async () => {
    const service = newService();
    const big = "a".repeat(10001);
    await expect(service.send(big)).rejects.toThrow(
      "message exceeds max size (10000 bytes): was 10001 bytes",
    );
    expect(captured).toBeUndefined();
  });

  it("should POST form values to /api/v1/messages with basic auth", async () => {
    const service = newService();
    const params = { stream: "overridden-stream", topic: "overridden-topic" };
    await service.send("This is a message", params);

    expect(captured).toBeDefined();
    expect(captured?.method).toBe("POST");
    expect(captured?.pathname).toBe("/api/v1/messages");

    const expectedAuth =
      "Basic " +
      Buffer.from("bot-name@zulipchat.com:correcthorsebatterystable").toString(
        "base64",
      );
    expect(captured?.authorization).toBe(expectedAuth);
    expect(captured?.contentType).toBe("application/x-www-form-urlencoded");

    const form = new URLSearchParams(captured?.body ?? "");
    expect(form.get("type")).toBe("stream");
    expect(form.get("to")).toBe("overridden-stream");
    expect(form.get("topic")).toBe("overridden-topic");
    expect(form.get("content")).toBe("This is a message");
  });

  it("should report the response status when the API rejects the notification", async () => {
    nextStatus = 400;
    const service = newService();
    await expect(service.send("This is a message")).rejects.toThrow(
      "failed to send zulip message: response status code 400 Bad Request",
    );
  });

  it("should report the transport error when the API cannot be reached", async () => {
    // Point at a closed port so the connection is refused (no HTTP response).
    server.stop(true);
    const service = new ZulipService({ apiOrigin: origin });
    service.initialize(new URL(BASE_URL));
    await expect(service.send("This is a message")).rejects.toThrow(
      /failed to send zulip message/,
    );
  });
});
