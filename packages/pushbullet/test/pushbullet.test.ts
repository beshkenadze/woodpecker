// Mirror of Go pkg/services/pushbullet/pushbullet_test.go
//
// HTTP mocking note: @woodpecker/core's JsonClient is built on the global `fetch`
// API, so tests override `globalThis.fetch` to assert the real POST endpoint,
// Access-Token header and JSON body — and that 200 resolves while errors reject.
// This drives the real JsonClient and PushbulletService code paths end-to-end.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { Config } from "../src/config.js";
import { newNotePush, type PushRequest, setTarget } from "../src/payload.js";
import { PushbulletService } from "../src/pushbullet.js";

interface CapturedRequest {
  url: string;
  opts: {
    method: string;
    headers: Record<string, string>;
    body: string;
  };
}

const captured: CapturedRequest[] = [];

// Controls the mocked response for the next request(s).
let nextResponse: { statusCode: number; payload: unknown } = {
  statusCode: 200,
  payload: {},
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function installFetchMock(): void {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      // Header names are lower-cased by Headers; remap the ones we assert on.
      if (key === "access-token") headers["Access-Token"] = value;
      else if (key === "content-type") headers["Content-Type"] = value;
      else headers[key] = value;
    });
    captured.push({
      url,
      opts: {
        method: init?.method ?? "GET",
        headers,
        body:
          typeof init?.body === "string" ? init.body : String(init?.body ?? ""),
      },
    });
    return new Response(JSON.stringify(nextResponse.payload), {
      status: nextResponse.statusCode,
    });
  }) as typeof fetch;
}

const TOKEN = "tokentokentokentokentokentokentoke"; // 34 chars
const ENDPOINT = "https://api.pushbullet.com/v2/pushes";

describe("the pushbullet config", () => {
  describe("generating a config object", () => {
    it("should set token", () => {
      const config = new Config();
      config.setURL(new URL(`pushbullet://${TOKEN}`));
      expect(config.token).toBe(TOKEN);
    });

    it("should set the device from path", () => {
      const config = new Config();
      config.setURL(new URL(`pushbullet://${TOKEN}/test`));
      expect(config.targets).toHaveLength(1);
      expect(config.targets).toContain("test");
    });

    it("should set the channel from path", () => {
      const config = new Config();
      config.setURL(new URL(`pushbullet://${TOKEN}/foo#bar`));
      expect(config.targets).toHaveLength(2);
      expect(config.targets).toContain("foo");
      expect(config.targets).toContain("#bar");
    });

    it("should reject a token with the wrong size", () => {
      const config = new Config();
      expect(() => config.setURL(new URL("pushbullet://tooshort"))).toThrow(
        "token has incorrect size",
      );
    });

    it("should reject an unknown query key", () => {
      const config = new Config();
      expect(() =>
        config.setURL(new URL(`pushbullet://${TOKEN}/dev?bogus=x`)),
      ).toThrow("is not a valid config key");
    });

    it("should read a mixed-case title query key", () => {
      const config = new Config();
      config.setURL(new URL(`pushbullet://${TOKEN}/dev?Title=Custom`));
      expect(config.title).toBe("Custom");
    });
  });

  describe("parsing the configuration URL", () => {
    it("should be identical after de-/serialization", () => {
      const testURL = `pushbullet://${TOKEN}/device?title=Great+News`;
      const config = new Config();
      config.setURL(new URL(testURL));
      expect(config.getURL().toString()).toBe(testURL);
    });

    it("should omit the default title from the URL", () => {
      const testURL = `pushbullet://${TOKEN}/device`;
      const config = new Config();
      config.setURL(new URL(testURL));
      expect(config.getURL().toString()).toBe(testURL);
    });
  });
});

describe("building the payload", () => {
  it("email target should only populate the email field", () => {
    const push: PushRequest = newNotePush("", "");
    setTarget(push, "iam@email.com");
    expect(push.email).toBe("iam@email.com");
    expect(push.device_iden).toBe("");
    expect(push.channel_tag).toBe("");
  });

  it("channel target should only populate the channel field", () => {
    const push: PushRequest = newNotePush("", "");
    setTarget(push, "#channel");
    expect(push.email).toBe("");
    expect(push.device_iden).toBe("");
    expect(push.channel_tag).toBe("channel");
  });

  it("device target should only populate the device field", () => {
    const push: PushRequest = newNotePush("", "");
    setTarget(push, "mydevice");
    expect(push.email).toBe("");
    expect(push.channel_tag).toBe("");
    expect(push.device_iden).toBe("mydevice");
  });
});

describe("sending the payload", () => {
  beforeEach(() => {
    captured.length = 0;
    nextResponse = { statusCode: 200, payload: {} };
    installFetchMock();
  });

  function newService(rawURL: string): InstanceType<typeof PushbulletService> {
    const service = new PushbulletService();
    service.initialize(new URL(rawURL));
    return service;
  }

  it("should POST to the pushes endpoint with the Access-Token header and JSON body", async () => {
    const service = newService(`pushbullet://${TOKEN}/test`);
    await service.send("Message");

    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req).toBeDefined();
    if (!req) throw new Error("no request captured");
    expect(req.url).toBe(ENDPOINT);
    expect(req.opts.method).toBe("POST");
    expect(req.opts.headers["Access-Token"]).toBe(TOKEN);
    expect(req.opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(req.opts.body)).toEqual({
      type: "note",
      title: "Shoutrrr notification",
      body: "Message",
      device_iden: "test",
      email: "",
      channel_tag: "",
    });
  });

  it("should not report an error if the server accepts the payload", async () => {
    nextResponse = { statusCode: 200, payload: {} };
    const service = newService(`pushbullet://${TOKEN}/test`);
    await expect(service.send("Message")).resolves.toBeUndefined();
  });

  it("should report an error if the server rejects the payload", async () => {
    nextResponse = {
      statusCode: 401,
      payload: {
        error: { cat: ":(", message: "bad token", type: "invalid_request" },
      },
    };
    const service = newService(`pushbullet://${TOKEN}/test`);
    await expect(service.send("Message")).rejects.toThrow(
      "API error: bad token",
    );
  });

  it("should send one request per target", async () => {
    const service = newService(`pushbullet://${TOKEN}/foo#bar`);
    await service.send("Message");
    expect(captured).toHaveLength(2);
    const first = captured[0];
    const second = captured[1];
    if (!first || !second) throw new Error("expected two requests");
    expect(JSON.parse(first.opts.body).device_iden).toBe("foo");
    expect(JSON.parse(second.opts.body).channel_tag).toBe("bar");
  });

  it("should override the title from params", async () => {
    const service = newService(`pushbullet://${TOKEN}/test`);
    await service.send("Message", { title: "Custom" });
    const req = captured[0];
    if (!req) throw new Error("no request captured");
    expect(JSON.parse(req.opts.body).title).toBe("Custom");
  });

  it("should reject an unknown param key before sending", async () => {
    const service = newService(`pushbullet://${TOKEN}/test`);
    await expect(service.send("Message", { bogus: "x" })).rejects.toThrow(
      "is not a valid config key",
    );
    expect(captured).toHaveLength(0);
  });

  it("should report an API error even when the error body has no message", async () => {
    nextResponse = { statusCode: 400, payload: {} };
    const service = newService(`pushbullet://${TOKEN}/test`);
    await expect(service.send("Message")).rejects.toThrow("API error:");
  });
});
