import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  Config,
  PushoverService,
  TokenMissing,
  UserMissing,
} from "../src/index.js";

/** createURL mirrors the Go test helper: username "Token", host=user, pass=token. */
function createURL(user: string, token: string): URL {
  return new URL(`pushover://Token:${encodeURIComponent(token)}@${user}`);
}

describe("the pushover config", () => {
  let config: Config;

  beforeEach(() => {
    config = new Config();
  });

  describe("updating it using a url", () => {
    it("should update the user using the host part of the url", () => {
      config.setURL(createURL("simme", "dummy"));
      expect(config.user).toBe("simme");
    });

    it("should update the token using the password part of the url", () => {
      config.setURL(createURL("dummy", "TestToken"));
      expect(config.token).toBe("TestToken");
    });

    it("should error if supplied with an empty username", () => {
      // Empty host + userinfo is not a parseable WHATWG URL, so represent the
      // missing-user case with an empty authority (host "", password "").
      expect(() => config.setURL(new URL("pushover:///"))).toThrow(UserMissing);
    });

    it("should error if supplied with an empty token", () => {
      // host present, empty password -> TokenMissing.
      expect(() => config.setURL(new URL("pushover://Token:@user"))).toThrow(
        TokenMissing,
      );
    });
  });

  describe("getting the current config as an url", () => {
    it("should return the user as the host and the token as the password", () => {
      config.user = "theUser";
      config.token = "theToken";
      const url = config.getURL();
      expect(url.host).toBe("theUser"); // Non-special scheme preserves host case.
      expect(url.password).toBe("theToken");
      expect(url.protocol).toBe("pushover:");
    });

    it("should round-trip user and token through setURL/getURL", () => {
      config.setURL(createURL("usertoken", "apptoken"));
      const url = config.getURL();
      const reparsed = new Config();
      reparsed.setURL(url);
      expect(reparsed.user).toBe("usertoken");
      expect(reparsed.token).toBe("apptoken");
    });
  });

  describe("setting a config key", () => {
    it("should split devices by commas", () => {
      const resolver = config.newResolver();
      resolver.set("devices", "a,b,c,d");
      expect(config.devices).toEqual(["a", "b", "c", "d"]);
    });

    it("should update priority when a valid number is supplied", () => {
      const resolver = config.newResolver();
      resolver.set("priority", "1");
      expect(config.priority).toBe(1);
    });

    it("should update priority when a negative number is supplied", () => {
      const resolver = config.newResolver();
      resolver.set("priority", "-1");
      expect(config.priority).toBe(-1);
      resolver.set("priority", "-2");
      expect(config.priority).toBe(-2);
    });

    it("should update the title when it is supplied", () => {
      const resolver = config.newResolver();
      resolver.set("title", "new title");
      expect(config.title).toBe("new title");
    });

    it("should error if priority is not a number", () => {
      const resolver = config.newResolver();
      expect(() => resolver.set("priority", "super-duper")).toThrow();
    });

    it("should error if priority is outside the int8 range", () => {
      const resolver = config.newResolver();
      expect(() => resolver.set("priority", "200")).toThrow();
      expect(() => resolver.set("priority", "-200")).toThrow();
    });

    it("should error if the key is not recognized", () => {
      const resolver = config.newResolver();
      expect(() => resolver.set("devicey", "a,b,c,d")).toThrow();
    });
  });

  describe("getting a config key", () => {
    it("should join devices with commas", () => {
      config.devices = ["a", "b", "c"];
      const resolver = config.newResolver();
      expect(resolver.get("devices")).toBe("a,b,c");
    });

    it("should error if the key is not recognized", () => {
      const resolver = config.newResolver();
      expect(() => resolver.get("devicey")).toThrow();
    });
  });

  describe("listing the query fields", () => {
    it("should return the keys devices, priority, title", () => {
      const resolver = config.newResolver();
      expect(resolver.queryFields()).toEqual(["devices", "priority", "title"]);
    });
  });
});

describe("sending the payload", () => {
  // Bun ships a built-in `undici` that shadows the npm package, so its MockAgent
  // is a non-functional stub. We instead spin up a real local capture server
  // (Bun.serve) and point the service's endpoint at it via the hookURL seam,
  // asserting the request method, path, content type, and form body.
  interface Captured {
    method: string;
    path: string;
    contentType: string | null;
    body: string;
  }

  let server: ReturnType<typeof Bun.serve>;
  let captured: Captured | null;
  let responseStatus = 200;
  let responseBody = "";

  const endpoint = () => `http://localhost:${server.port}/1/messages.json`;

  beforeEach(() => {
    captured = null;
    responseStatus = 200;
    responseBody = "";
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        captured = {
          method: req.method,
          path: new URL(req.url).pathname,
          contentType: req.headers.get("content-type"),
          body: await req.text(),
        };
        return new Response(responseBody, { status: responseStatus });
      },
    });
  });

  afterEach(() => {
    server.stop(true);
  });

  it("should not report an error if the server accepts the payload", async () => {
    const service = new PushoverService({ hookURL: endpoint() });
    service.initialize(new URL("pushover://:apptoken@usertoken"));
    await service.send("Message");

    expect(captured).not.toBeNull();
    if (!captured) throw new Error("expected a captured request");
    expect(captured.method).toBe("POST");
    expect(captured.path).toBe("/1/messages.json");
    expect(captured.contentType).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(captured.body);
    expect(params.get("user")).toBe("usertoken");
    expect(params.get("token")).toBe("apptoken");
    expect(params.get("message")).toBe("Message");
    expect(params.get("priority")).toBe("0");
  });

  it("should include title and devices when configured", async () => {
    const service = new PushoverService({ hookURL: endpoint() });
    service.initialize(
      new URL("pushover://:apptoken@usertoken?devices=a,b&priority=1&title=Hi"),
    );
    await service.send("Message");

    if (!captured) throw new Error("expected a captured request");
    const params = new URLSearchParams(captured.body);
    expect(params.get("device")).toBe("a,b");
    expect(params.get("title")).toBe("Hi");
    expect(params.get("priority")).toBe("1");
  });

  it("should override config via runtime params", async () => {
    const service = new PushoverService({ hookURL: endpoint() });
    service.initialize(new URL("pushover://:apptoken@usertoken"));
    await service.send("Message", { title: "Override", devices: "x,y" });

    if (!captured) throw new Error("expected a captured request");
    const params = new URLSearchParams(captured.body);
    expect(params.get("title")).toBe("Override");
    expect(params.get("device")).toBe("x,y");
  });

  it("should reject if the server returns an error status", async () => {
    responseStatus = 500;
    responseBody = "oops";
    const service = new PushoverService({ hookURL: endpoint() });
    service.initialize(new URL("pushover://:apptoken@usertoken"));
    await expect(service.send("Message")).rejects.toThrow(/response status/);
  });

  it("should reject on a non-200 success status (Go accepts only 200)", async () => {
    responseStatus = 202;
    const service = new PushoverService({ hookURL: endpoint() });
    service.initialize(new URL("pushover://:apptoken@usertoken"));
    await expect(service.send("Message")).rejects.toThrow(/response status/);
  });
});
