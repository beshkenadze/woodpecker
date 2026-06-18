import { afterEach, describe, expect, it } from "bun:test";
import { Config } from "../src/config.js";
import { descriptor } from "../src/index.js";
import { createJSONPayload } from "../src/payload.js";
import { buildURL, RocketchatService } from "../src/rocketchat.js";

describe("the rocketchat config", () => {
  it("parses host, tokenA and tokenB", () => {
    const config = new Config();
    config.setURL(
      new URL("rocketchat://rocketchat.my-domain.com/tokenA/tokenB"),
    );
    expect(config.host).toBe("rocketchat.my-domain.com");
    expect(config.tokenA).toBe("tokenA");
    expect(config.tokenB).toBe("tokenB");
    expect(config.channel).toBe("");
    expect(config.userName).toBe("");
  });

  it("generates a URL without an empty port", () => {
    const config = new Config();
    config.setURL(
      new URL("rocketchat://rocketchat.my-domain.com/tokenA/tokenB"),
    );
    expect(config.getURL().toString()).toBe(
      "rocketchat://rocketchat.my-domain.com/tokenA/tokenB",
    );
  });

  it("preserves the port in the generated URL (#495)", () => {
    const config = new Config();
    config.setURL(
      new URL("rocketchat://rocketchat.my-domain.com:5055/tokenA/tokenB"),
    );
    expect(config.getURL().toString()).toBe(
      "rocketchat://rocketchat.my-domain.com:5055/tokenA/tokenB",
    );
  });

  it("returns an error when there is no token", () => {
    const config = new Config();
    expect(() =>
      config.setURL(new URL("rocketchat://rocketchat.my-domain.com")),
    ).toThrow();
  });

  it("sets username only", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com/tokenA/tokenB",
      ),
    );
    expect(config.userName).toBe("testUserName");
    expect(config.channel).toBe("");
  });

  it("sets channel only with a leading #", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://rocketchat.my-domain.com/tokenA/tokenB/testChannel",
      ),
    );
    expect(config.channel).toBe("#testChannel");
  });

  it("parses a badly syntaxed #channel name (many leading #)", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com:5055/tokenA/tokenB/###########################testChannel",
      ),
    );
    expect(config.channel).toContain("###########################testChannel");
  });

  it("parses a #channel fragment", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com:5055/tokenA/tokenB/#testChannel",
      ),
    );
    expect(config.channel).toContain("#testChannel");
  });
});

describe("buildURL", () => {
  it("builds the webhook URL without a port", () => {
    const config = new Config();
    config.setURL(
      new URL("rocketchat://rocketchat.my-domain.com/tokenA/tokenB"),
    );
    expect(buildURL(config)).toBe(
      "https://rocketchat.my-domain.com/hooks/tokenA/tokenB",
    );
  });

  it("preserves HOST:PORT in the hook URL", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com:5055/tokenA/tokenB/testChannel",
      ),
    );
    expect(buildURL(config)).toContain("my-domain.com:5055");
    expect(buildURL(config)).toBe(
      "https://rocketchat.my-domain.com:5055/hooks/tokenA/tokenB",
    );
  });
});

describe("createJSONPayload", () => {
  it("produces text only when no username/channel", () => {
    const config = new Config();
    config.setURL(
      new URL("rocketchat://rocketchat.my-domain.com/tokenA/tokenB"),
    );
    expect(JSON.stringify(createJSONPayload(config, "this is a message"))).toBe(
      '{"text":"this is a message"}',
    );
  });

  it("includes preset username and channel", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com/tokenA/tokenB/testChannel",
      ),
    );
    expect(JSON.stringify(createJSONPayload(config, "this is a message"))).toBe(
      '{"text":"this is a message","username":"testUserName","channel":"#testChannel"}',
    );
  });

  it("lets params override username and channel", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com/tokenA/tokenB/testChannel",
      ),
    );
    const payload = createJSONPayload(config, "this is a message", {
      username: "overwriteUserName",
      channel: "overwriteChannel",
    });
    expect(JSON.stringify(payload)).toBe(
      '{"text":"this is a message","username":"overwriteUserName","channel":"overwriteChannel"}',
    );
  });
});

describe("descriptor", () => {
  it("declares the rocketchat scheme and a factory", () => {
    expect(descriptor.schemes).toContain("rocketchat");
    expect(descriptor.factory()).toBeInstanceOf(RocketchatService);
  });
});

describe("Sending messages", () => {
  // Bun's undici MockAgent does not intercept the global fetch the core
  // JsonClient uses, so the transport is exercised by overriding
  // globalThis.fetch and restoring it after each test.
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("posts the expected JSON payload and resolves on 200", async () => {
    let capturedURL = "";
    let capturedMethod = "";
    let capturedContentType = "";
    let capturedBody = "";

    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      capturedURL = String(input);
      capturedMethod = init?.method ?? "";
      const headers = new Headers(init?.headers);
      capturedContentType = headers.get("Content-Type") ?? "";
      capturedBody = String(init?.body ?? "");
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const service = new RocketchatService();
    service.initialize(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com/tokenA/tokenB/testChannel",
      ),
    );

    await service.send("this is a message");

    expect(capturedMethod).toBe("POST");
    expect(capturedURL).toBe(
      "https://rocketchat.my-domain.com/hooks/tokenA/tokenB",
    );
    expect(capturedContentType).toBe("application/json");
    expect(JSON.parse(capturedBody)).toEqual({
      text: "this is a message",
      username: "testUserName",
      channel: "#testChannel",
    });
  });

  it("posts to the host:port webhook when a port is set", async () => {
    let capturedURL = "";

    globalThis.fetch = (async (input: string | URL) => {
      capturedURL = String(input);
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const service = new RocketchatService();
    service.initialize(
      new URL(
        "rocketchat://testUserName@rocketchat.my-domain.com:5055/tokenA/tokenB/testChannel",
      ),
    );

    await service.send("this is a message");
    // The port is preserved in the webhook URL (#495).
    expect(capturedURL).toBe(
      "https://rocketchat.my-domain.com:5055/hooks/tokenA/tokenB",
    );
  });

  it("includes the response body in the error on non-200", async () => {
    globalThis.fetch = (async () =>
      new Response("bad payload", { status: 400 })) as unknown as typeof fetch;

    const service = new RocketchatService();
    service.initialize(
      new URL("rocketchat://rocketchat.my-domain.com/tokenA/tokenB"),
    );

    await expect(service.send("this is a message")).rejects.toThrow(
      "notification failed: 400 bad payload",
    );
  });

  it("reports the transport error with host and port context", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const service = new RocketchatService();
    service.initialize(
      new URL("rocketchat://rocketchat.my-domain.com:5055/tokenA/tokenB"),
    );

    let message = "";
    try {
      await service.send("this is a message");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("network down");
    expect(message).toContain("HOST: rocketchat.my-domain.com");
    expect(message).toContain("PORT: 5055");
  });
});
