import { afterEach, describe, expect, it } from "bun:test";
import { ApiError, JsonClient } from "@woodpecker-js/core";
import { createConfigFromURL, MattermostConfig } from "../src/config.js";
import { buildURL, descriptor, MattermostService } from "../src/index.js";
import {
  createJSONPayload,
  type MattermostJSON,
  serializePayload,
  setIcon,
} from "../src/payload.js";

interface CapturedRequest {
  method?: string;
  url?: string;
  body?: string;
  contentType?: string | undefined;
}

/**
 * Installs a `globalThis.fetch` override that records the request and replies
 * 200 for `/hooks/*` paths and 500 otherwise (mirroring the Go suite's
 * jarcoal/httpmock). The service's default transport routes through the core
 * `JsonClient`, whose default fetch is `globalThis.fetch` — so overriding it
 * intercepts the real call without a network round-trip.
 *
 * Pass `forceStatus` to reply that status for every path (used to drive the
 * non-2xx error path even on a `/hooks/` URL).
 *
 * Returns the captured request plus a `restore()` to reinstate global fetch.
 */
function mockFetch(opts: { forceStatus?: number } = {}): {
  captured: CapturedRequest;
  restore: () => void;
} {
  const captured: CapturedRequest = {};
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers = new Headers(init?.headers);
    captured.method = init?.method;
    captured.url = url;
    captured.body = typeof init?.body === "string" ? init.body : undefined;
    captured.contentType = headers.get("content-type") ?? undefined;
    if (opts.forceStatus !== undefined) {
      return new Response("boom", { status: opts.forceStatus });
    }
    if (new URL(url).pathname.startsWith("/hooks/")) {
      return new Response("", { status: 200 });
    }
    return new Response("boom", { status: 500 });
  }) as unknown as typeof globalThis.fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("the mattermost config", () => {
  describe("creating configurations", () => {
    it("parses a url with channel field", () => {
      const config = createConfigFromURL(
        new URL("mattermost://user@mockserver/atoken/achannel"),
      );
      expect(config.token).toBe("atoken");
      expect(config.channel).toBe("achannel");
      expect(config.userName).toBe("user");
    });

    it("parses a url with title prop", () => {
      expect(() =>
        createConfigFromURL(
          new URL(
            "mattermost://user@mockserver/atoken?icon=https%3A%2F%2Fexample%2Fsomething.png",
          ),
        ),
      ).not.toThrow();
    });

    it("parses a url with all fields and props", () => {
      const config = createConfigFromURL(
        new URL(
          "mattermost://user@mockserver/atoken/achannel?icon=https%3A%2F%2Fexample%2Fsomething.png",
        ),
      );
      expect(config.token).toBe("atoken");
      expect(config.channel).toBe("achannel");
      expect(config.icon).toBe("https://example/something.png");
    });

    it("returns an error for a url with invalid props", () => {
      expect(() =>
        createConfigFromURL(
          new URL("mattermost://user@mockserver/atoken?foo=bar"),
        ),
      ).toThrow();
    });
  });

  describe("URL round-trip", () => {
    it("is identical after de-/serialization (icon prop)", () => {
      const input =
        "mattermost://user@mockserver/atoken/achannel?icon=something";
      const config = new MattermostConfig();
      config.setURL(new URL(input));
      expect(config.getURL().toString()).toBe(input);
    });

    it("is identical after de-/serialization (user/token/channel)", () => {
      const input = "mattermost://bot@mattermost.host/token/channel";
      const config = new MattermostConfig();
      config.setURL(new URL(input));
      expect(config.getURL().toString()).toBe(input);
    });
  });

  describe("port preservation", () => {
    const portURL =
      "mattermost://mattermost.my-domain.com:8065/thisshouldbeanapitoken";

    it("preserves the port on the host", () => {
      const config = new MattermostConfig();
      config.setURL(new URL(portURL));
      expect(config.host).toBe("mattermost.my-domain.com:8065");
    });

    it("preserves the port in the generated URL", () => {
      const config = new MattermostConfig();
      config.setURL(new URL(portURL));
      expect(config.getURL().toString()).toBe(portURL);
    });

    it("preserves the port in the built webhook URL", () => {
      const config = new MattermostConfig();
      config.setURL(new URL(portURL));
      expect(buildURL(config)).toBe(
        "https://mattermost.my-domain.com:8065/hooks/thisshouldbeanapitoken",
      );
    });
  });

  describe("error handling", () => {
    it("throws NotEnoughArguments when path is missing", () => {
      expect(() =>
        createConfigFromURL(new URL("mattermost://mattermost.my-domain.com")),
      ).toThrow();
    });

    it("does not crash on a username with malformed percent-encoding", () => {
      // Go's url.User.Username() tolerates this; the port must not throw URIError.
      const config = createConfigFromURL(
        new URL("mattermost://ab%cd@mattermost.host/token"),
      );
      expect(config.userName).toBe("ab%cd");
      expect(config.token).toBe("token");
    });

    it("decodes a percent-encoded username like Go", () => {
      const config = createConfigFromURL(
        new URL("mattermost://a%2Bb@mattermost.host/token"),
      );
      expect(config.userName).toBe("a+b");
    });
  });
});

describe("building the webhook URL", () => {
  it("generates the correct url without a port", () => {
    const config = new MattermostConfig();
    config.setURL(
      new URL("mattermost://mattermost.my-domain.com/thisshouldbeanapitoken"),
    );
    expect(buildURL(config)).toBe(
      "https://mattermost.my-domain.com/hooks/thisshouldbeanapitoken",
    );
  });
});

describe("the icon fields", () => {
  it("sets icon_url when the icon looks like a URL", () => {
    const payload: MattermostJSON = { text: "" };
    setIcon(payload, "https://example.com/logo.png");
    expect(payload.icon_url).toBe("https://example.com/logo.png");
    expect(payload.icon_emoji).toBeUndefined();
  });

  it("sets icon_emoji when the icon is not a URL", () => {
    const payload: MattermostJSON = { text: "" };
    setIcon(payload, "tanabata_tree");
    expect(payload.icon_emoji).toBe("tanabata_tree");
    expect(payload.icon_url).toBeUndefined();
  });

  it("clears both fields when the icon is empty", () => {
    const payload: MattermostJSON = {
      text: "",
      icon_emoji: "x",
      icon_url: "y",
    };
    setIcon(payload, "");
    expect(payload.icon_emoji).toBeUndefined();
    expect(payload.icon_url).toBeUndefined();
  });
});

describe("creating the JSON payload", () => {
  it("generates the correct body without parameters", () => {
    const config = new MattermostConfig();
    config.setURL(
      new URL("mattermost://mattermost.my-domain.com/thisshouldbeanapitoken"),
    );
    const json = serializePayload(
      createJSONPayload(config, "this is a message"),
    );
    expect(json).toBe('{"text":"this is a message"}');
  });

  it("generates the correct body with preset username and channel", () => {
    const config = new MattermostConfig();
    config.setURL(
      new URL(
        "mattermost://testUserName@mattermost.my-domain.com/thisshouldbeanapitoken/testChannel",
      ),
    );
    const json = serializePayload(
      createJSONPayload(config, "this is a message"),
    );
    expect(json).toBe(
      '{"text":"this is a message","username":"testUserName","channel":"testChannel"}',
    );
  });

  it("overrides username and channel via parameters", () => {
    const config = new MattermostConfig();
    config.setURL(
      new URL(
        "mattermost://testUserName@mattermost.my-domain.com/thisshouldbeanapitoken/testChannel",
      ),
    );
    const json = serializePayload(
      createJSONPayload(config, "this is a message", {
        username: "overwriteUserName",
        channel: "overwriteChannel",
      }),
    );
    expect(json).toBe(
      '{"text":"this is a message","username":"overwriteUserName","channel":"overwriteChannel"}',
    );
  });

  it('omits empty username/channel like Go omitempty (param override to "")', () => {
    const config = new MattermostConfig();
    config.setURL(
      new URL(
        "mattermost://testUserName@mattermost.my-domain.com/thisshouldbeanapitoken/testChannel",
      ),
    );
    const json = serializePayload(
      createJSONPayload(config, "this is a message", {
        username: "",
        channel: "",
      }),
    );
    expect(json).toBe('{"text":"this is a message"}');
  });

  it("sets icon_url for a URL icon and icon_emoji otherwise", () => {
    const config = new MattermostConfig();
    config.setURL(
      new URL(
        "mattermost://mattermost.host/token?icon=https%3A%2F%2Fexample.com%2Fi.png",
      ),
    );
    expect(serializePayload(createJSONPayload(config, "m"))).toBe(
      '{"text":"m","icon_url":"https://example.com/i.png"}',
    );
    const config2 = new MattermostConfig();
    config2.setURL(
      new URL("mattermost://mattermost.host/token?icon=tanabata_tree"),
    );
    expect(serializePayload(createJSONPayload(config2, "m"))).toBe(
      '{"text":"m","icon_emoji":"tanabata_tree"}',
    );
  });
});

describe("the service descriptor", () => {
  it("exposes the mattermost scheme and a factory", () => {
    expect(descriptor.schemes).toEqual(["mattermost"]);
    expect(descriptor.factory()).toBeInstanceOf(MattermostService);
  });
});

describe("the JsonClient transport", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("posts the raw JSON body with content-type and resolves on 2xx", async () => {
    const mock = mockFetch();
    restore = mock.restore;
    const client = new JsonClient();
    // The service posts a pre-serialized JSON string via `request` (no re-encode).
    const res = await client.request(
      "POST",
      "https://mattermost.host/hooks/token",
      {
        body: '{"text":"Message"}',
        contentType: "application/json",
      },
    );
    expect(res.status).toBe(200);
    expect(mock.captured.method).toBe("POST");
    expect(mock.captured.url).toBe("https://mattermost.host/hooks/token");
    expect(mock.captured.body).toBe('{"text":"Message"}');
    expect(mock.captured.contentType).toBe("application/json");
  });

  it("rejects with ApiError on non-2xx", async () => {
    const mock = mockFetch();
    restore = mock.restore;
    const client = new JsonClient();
    let caught: unknown;
    try {
      await client.post("https://mattermost.host/wrong", { text: "x" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).statusCode).toBe(500);
  });
});

describe("sending the payload (end-to-end via fetch override)", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("posts the JSON body to the webhook URL and resolves on 2xx", async () => {
    const mock = mockFetch();
    restore = mock.restore;
    const service = new MattermostService();
    service.initialize(new URL("mattermost://mattermost.host/token"));
    await service.send("Message");
    expect(mock.captured.method).toBe("POST");
    expect(mock.captured.url).toBe("https://mattermost.host/hooks/token");
    expect(mock.captured.body).toBe('{"text":"Message"}');
    expect(mock.captured.contentType).toBe("application/json");
  });

  it("posts to the webhook URL derived from a URL with a port", async () => {
    const mock = mockFetch();
    restore = mock.restore;
    const service = new MattermostService();
    service.initialize(new URL("mattermost://mattermost.host:8065/token"));
    await service.send("Message");
    // Webhook URL preserves the port end-to-end.
    expect(mock.captured.url).toBe("https://mattermost.host:8065/hooks/token");
  });

  it("posts the JSON body with username and channel", async () => {
    const mock = mockFetch();
    restore = mock.restore;
    const service = new MattermostService();
    service.initialize(
      new URL("mattermost://bot@mattermost.host/token/general"),
    );
    await service.send("hello");
    expect(mock.captured.body).toBe(
      '{"text":"hello","username":"bot","channel":"general"}',
    );
  });

  it("rejects with ApiError when the server returns an error status", async () => {
    // Force 500 so the default transport's non-2xx path is exercised.
    const mock = mockFetch({ forceStatus: 500 });
    restore = mock.restore;
    const service = new MattermostService();
    service.initialize(new URL("mattermost://mattermost.host/token"));
    await expect(service.send("Message")).rejects.toBeInstanceOf(ApiError);
  });
});
