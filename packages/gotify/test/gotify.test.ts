import { afterEach, describe, expect, it } from "bun:test";
import { Config } from "../src/config.js";
import { buildURL, GotifyService, isTokenValid } from "../src/gotify.js";

type MockServer = ReturnType<typeof Bun.serve>;

describe("the Gotify plugin URL building and token validation", () => {
  it("should build a valid gotify URL", () => {
    const config = new Config();
    config.Token = "Aaa.bbb.ccc.ddd";
    config.Host = "my.gotify.tld";
    expect(buildURL(config)).toBe(
      "https://my.gotify.tld/message?token=Aaa.bbb.ccc.ddd",
    );
  });

  it("should use http schema when TLS is disabled", () => {
    const config = new Config();
    config.Token = "Aaa.bbb.ccc.ddd";
    config.Host = "my.gotify.tld";
    config.DisableTLS = true;
    expect(buildURL(config)).toBe(
      "http://my.gotify.tld/message?token=Aaa.bbb.ccc.ddd",
    );
  });

  it("should add a custom path to the URL", () => {
    const config = new Config();
    config.Token = "Aaa.bbb.ccc.ddd";
    config.Host = "my.gotify.tld";
    config.Path = "/gotify";
    expect(buildURL(config)).toBe(
      "https://my.gotify.tld/gotify/message?token=Aaa.bbb.ccc.ddd",
    );
  });

  it("should return true for a valid token", () => {
    expect(isTokenValid("Ahwbsdyhwwgarxd")).toBe(true);
  });

  it("should return false for a token with an invalid prefix", () => {
    expect(isTokenValid("Chwbsdyhwwgarxd")).toBe(false);
  });

  it("should return false for a token with an invalid length", () => {
    expect(isTokenValid("Chwbsdyhwwga")).toBe(false);
  });

  it("should throw when the token is invalid", () => {
    const config = new Config();
    config.Token = "invalid";
    expect(() => buildURL(config)).toThrow();
  });
});

describe("creating a config", () => {
  it("should be identical after de-/serialization (with path)", () => {
    const testURL =
      "gotify://my.gotify.tld/gotify/Aaa.bbb.ccc.ddd?title=Test+title";
    const config = new Config();
    config.setURL(new URL(testURL));
    expect(config.getURL().toString()).toBe(testURL);
  });

  it("should be identical after de-/serialization (without path)", () => {
    const testURL =
      "gotify://my.gotify.tld/Aaa.bbb.ccc.ddd?disabletls=Yes&priority=1&title=Test+title";
    const config = new Config();
    config.setURL(new URL(testURL));
    expect(config.getURL().toString()).toBe(testURL);
  });

  it("should parse host, token and path from the URL", () => {
    const config = new Config();
    config.setURL(new URL("gotify://my.gotify.tld/gotify/Aaa.bbb.ccc.ddd"));
    expect(config.Host).toBe("my.gotify.tld");
    expect(config.Token).toBe("Aaa.bbb.ccc.ddd");
    expect(config.Path).toBe("/gotify/");
  });

  it("should reject a non-integer priority (Go strconv.ParseInt parity)", () => {
    const config = new Config();
    // "5x" must be rejected, not silently truncated to 5.
    expect(() =>
      config.setURL(
        new URL("gotify://my.gotify.tld/Aaa.bbb.ccc.ddd?priority=5x"),
      ),
    ).toThrow();
  });
});

interface CapturedRequest {
  method: string;
  path: string;
  contentType: string | null;
  body: unknown;
}

/**
 * Spins up an ephemeral local HTTP server so the real JsonClient.post runs over
 * genuine HTTP. (Bun ships a non-functional undici MockAgent stub, so a real
 * server is the faithful way to assert the request and exercise the 200/error paths.)
 */
function startMockGotify(
  status: number,
  responseBody: unknown,
): {
  server: MockServer;
  host: string;
  getCaptured: () => CapturedRequest | undefined;
} {
  let captured: CapturedRequest | undefined;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const text = await req.text();
      captured = {
        method: req.method,
        path: url.pathname + url.search,
        contentType: req.headers.get("content-type"),
        body: text.length > 0 ? JSON.parse(text) : undefined,
      };
      return Response.json(responseBody, { status });
    },
  });
  return {
    server,
    host: `localhost:${server.port}`,
    getCaptured: () => captured,
  };
}

describe("sending the payload", () => {
  let server: MockServer | undefined;

  afterEach(() => {
    server?.stop(true);
    server = undefined;
  });

  it("should POST the JSON payload to /message and resolve on 200", async () => {
    const mock = startMockGotify(200, {});
    server = mock.server;

    const service = new GotifyService();
    // disabletls=Yes -> http; host points at the local mock server.
    service.initialize(
      new URL(`gotify://${mock.host}/Aaa.bbb.ccc.ddd?disabletls=Yes`),
    );

    await expect(service.send("Message")).resolves.toBeUndefined();

    const captured = mock.getCaptured();
    expect(captured?.method).toBe("POST");
    expect(captured?.path).toBe("/message?token=Aaa.bbb.ccc.ddd");
    expect(captured?.contentType).toBe("application/json");
    expect(captured?.body).toEqual({
      message: "Message",
      title: "Shoutrrr notification",
      priority: 0,
    });
  });

  it("should send title and priority from params/config in the body", async () => {
    const mock = startMockGotify(200, {});
    server = mock.server;

    const service = new GotifyService();
    service.initialize(
      new URL(
        `gotify://${mock.host}/Aaa.bbb.ccc.ddd?disabletls=Yes&priority=5&title=Hello`,
      ),
    );

    await service.send("Body text");

    expect(mock.getCaptured()?.body).toEqual({
      message: "Body text",
      title: "Hello",
      priority: 5,
    });
  });

  it("should reject with a clear error if the server rejects the payload", async () => {
    const mock = startMockGotify(401, {
      error: "Unauthorized",
      errorCode: 401,
      errorDescription:
        "you need to provide a valid access token or user credentials to access this api",
    });
    server = mock.server;

    const service = new GotifyService();
    service.initialize(
      new URL(`gotify://${mock.host}/Aaa.bbb.ccc.ddd?disabletls=Yes`),
    );

    await expect(service.send("Message")).rejects.toThrow("Unauthorized");
  });

  it("should surface a partial JSON error body (Go ErrorResponse parity)", async () => {
    // Go json.Unmarshal accepts any JSON object; missing fields default to zero.
    const mock = startMockGotify(403, { error: "Forbidden" });
    server = mock.server;

    const service = new GotifyService();
    service.initialize(
      new URL(`gotify://${mock.host}/Aaa.bbb.ccc.ddd?disabletls=Yes`),
    );

    await expect(service.send("Message")).rejects.toThrow(
      "server respondend with Forbidden (0):",
    );
  });

  it("should reject when a 2xx response carries a non-JSON body (Go parseResponse parity)", async () => {
    const mock = startMockGotify(200, "not json");
    server = mock.server;
    // Override the JSON content negotiation by returning text directly.
    server.stop(true);
    let captured = false;
    server = Bun.serve({
      port: 0,
      fetch() {
        captured = true;
        return new Response("totally not json", { status: 200 });
      },
    });

    const service = new GotifyService();
    service.initialize(
      new URL(
        `gotify://localhost:${server.port}/Aaa.bbb.ccc.ddd?disabletls=Yes`,
      ),
    );

    await expect(service.send("Message")).rejects.toThrow();
    expect(captured).toBe(true);
  });
});
