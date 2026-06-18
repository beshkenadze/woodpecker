import { afterEach, describe, expect, it } from "bun:test";

type Server = ReturnType<typeof Bun.serve>;

import { PropKeyResolver } from "@woodpecker/core";
import { fields } from "../src/config.js";
import {
  APIKeyMissing,
  Config,
  DevicesMissing,
  descriptor,
  JoinService,
} from "../src/index.js";

// createURL mirrors the Go test helper: User=Token:token, Host=username, query devices.
function createURL(username: string, token: string, devices: string): URL {
  return new URL(
    `join://Token:${encodeURIComponent(token)}@${username}?devices=${devices}`,
  );
}

describe("the join config", () => {
  describe("updating it using a url", () => {
    it("should update the API key using the password part of the url", () => {
      const config = new Config();
      config.setURL(createURL("dummy", "TestToken", "testDevice"));
      expect(config.apiKey).toBe("TestToken");
    });

    it("should error if supplied with an empty token", () => {
      const config = new Config();
      expect(() => config.setURL(createURL("user", "", "testDevice"))).toThrow(
        APIKeyMissing,
      );
    });

    it("should error if supplied with no devices query param", () => {
      const config = new Config();
      // No devices key at all -> empty slice -> DevicesMissing.
      expect(() =>
        config.setURL(new URL("join://Token:TestToken@host?title=x")),
      ).toThrow(DevicesMissing);
    });

    it("should decode a percent-encoded API key from the password", () => {
      const config = new Config();
      config.setURL(new URL("join://Token:my%40key@join?devices=dev1"));
      expect(config.apiKey).toBe("my@key");
    });
  });

  describe("getting the current config", () => {
    it("should return the config that is currently set as a url", () => {
      const config = new Config();
      config.apiKey = "test-token";
      config.devices = ["dev1"];

      const url = config.getURL();
      expect(url.password).toBe(config.apiKey);
      expect(url.protocol).toBe("join:");
    });
  });

  describe("setting a config key", () => {
    it("should split it by commas if the key is devices", () => {
      const config = new Config();
      const pkr = new PropKeyResolver(config, fields);
      pkr.set("devices", "a,b,c,d");
      expect(config.devices).toEqual(["a", "b", "c", "d"]);
    });

    it("should update icon when an icon is supplied", () => {
      const config = new Config();
      const pkr = new PropKeyResolver(config, fields);
      pkr.set("icon", "https://example.com/icon.png");
      expect(config.icon).toBe("https://example.com/icon.png");
    });

    it("should update the title when it is supplied", () => {
      const config = new Config();
      const pkr = new PropKeyResolver(config, fields);
      pkr.set("title", "new title");
      expect(config.title).toBe("new title");
    });

    it("should throw an error if the key is not recognized", () => {
      const config = new Config();
      const pkr = new PropKeyResolver(config, fields);
      expect(() => pkr.set("devicey", "a,b,c,d")).toThrow();
    });
  });

  describe("getting a config key", () => {
    it("should join it with commas if the key is devices", () => {
      const config = new Config();
      config.devices = ["a", "b", "c"];
      const pkr = new PropKeyResolver(config, fields);
      expect(pkr.get("devices")).toBe("a,b,c");
    });

    it("should throw an error if the key is not recognized", () => {
      const config = new Config();
      const pkr = new PropKeyResolver(config, fields);
      expect(() => pkr.get("devicey")).toThrow();
    });
  });

  describe("listing the query fields", () => {
    it('should return the keys "devices", "icon", "title" in alphabetical order', () => {
      const config = new Config();
      const pkr = new PropKeyResolver(config, fields);
      expect(pkr.queryFields()).toEqual(["devices", "icon", "title"]);
    });
  });

  describe("parsing the configuration URL", () => {
    it("should be identical after de-/serialization", () => {
      const input =
        "join://Token:apikey@join?devices=dev1%2Cdev2&icon=warning&title=hey";
      const config = new Config();
      config.setURL(new URL(input));
      expect(config.getURLString()).toBe(input);
    });

    it("should round-trip a percent-encoded API key", () => {
      const input = "join://Token:my%40key@join?devices=dev1";
      const config = new Config();
      config.setURL(new URL(input));
      expect(config.apiKey).toBe("my@key");
      expect(config.getURLString()).toBe(input);
    });

    it("should round-trip semantically through getURL()", () => {
      const input =
        "join://Token:apikey@join?devices=dev1%2Cdev2&icon=warning&title=hey";
      const config = new Config();
      config.setURL(new URL(input));
      const out = config.getURL();
      expect(out.password).toBe("apikey");
      expect(out.searchParams.get("devices")).toBe("dev1,dev2");
      expect(out.searchParams.get("icon")).toBe("warning");
      expect(out.searchParams.get("title")).toBe("hey");
    });
  });
});

describe("the join descriptor", () => {
  it("should register the join scheme with a factory", () => {
    expect(descriptor.schemes).toEqual(["join"]);
    expect(descriptor.factory()).toBeInstanceOf(JoinService);
  });
});

// HTTP is exercised against a real local Bun.serve with the service's baseURL
// override, so the JsonClient request flows through the default global fetch
// transport. This performs an actual request, asserting the endpoint, method,
// content-type and query params (apikey + deviceIds + text), mirroring the Go
// httpmock test (200 resolves, error rejects).
describe("sending the payload", () => {
  interface Captured {
    method: string;
    path: string;
    contentType: string | null;
    query: URLSearchParams;
  }

  let server: Server | undefined;

  function startServer(status: number, captured: { value?: Captured }): string {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        captured.value = {
          method: req.method,
          path: url.pathname,
          contentType: req.headers.get("content-type"),
          query: url.searchParams,
        };
        return new Response("", { status });
      },
    });
    return `http://localhost:${server.port}/_ah/api/messaging/v1/sendPush`;
  }

  afterEach(() => {
    server?.stop(true);
    server = undefined;
  });

  it("should not report an error if the server accepts the payload", async () => {
    const captured: { value?: Captured } = {};
    const baseURL = startServer(200, captured);

    const config = new Config();
    config.apiKey = "apikey";
    config.devices = ["dev1"];

    const service = new JoinService({ baseURL });
    service.initialize(config.getURL());

    await expect(service.send("Message")).resolves.toBeUndefined();
    expect(captured.value?.method).toBe("POST");
    expect(captured.value?.path).toBe("/_ah/api/messaging/v1/sendPush");
    expect(captured.value?.contentType).toBe("text/plain");
  });

  it("should send the apikey, deviceIds and text query params", async () => {
    const captured: { value?: Captured } = {};
    const baseURL = startServer(200, captured);

    const config = new Config();
    config.apiKey = "apikey";
    config.devices = ["dev1", "dev2"];
    config.title = "a title";
    config.icon = "an icon";

    const service = new JoinService({ baseURL });
    service.initialize(config.getURL());
    await service.send("Hello");

    if (!captured.value) throw new Error("expected a captured request");
    const query = captured.value.query;
    expect(query.get("apikey")).toBe("apikey");
    expect(query.get("deviceIds")).toBe("dev1,dev2");
    expect(query.get("text")).toBe("Hello");
    expect(query.get("title")).toBe("a title");
    expect(query.get("icon")).toBe("an icon");
  });

  it("should report an error if the server rejects the payload", async () => {
    const captured: { value?: Captured } = {};
    const baseURL = startServer(400, captured);

    const config = new Config();
    config.apiKey = "apikey";
    config.devices = ["dev1"];

    const service = new JoinService({ baseURL });
    service.initialize(config.getURL());

    await expect(service.send("Message")).rejects.toThrow(/response status/);
  });

  it("should override title and icon from params", async () => {
    const captured: { value?: Captured } = {};
    const baseURL = startServer(200, captured);

    const config = new Config();
    config.apiKey = "apikey";
    config.devices = ["dev1"];
    config.title = "config title";

    const service = new JoinService({ baseURL });
    service.initialize(config.getURL());
    await service.send("Hello", { title: "param title", icon: "param icon" });

    if (!captured.value) throw new Error("expected a captured request");
    const query = captured.value.query;
    expect(query.get("title")).toBe("param title");
    expect(query.get("icon")).toBe("param icon");
  });
});
