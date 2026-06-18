import { afterEach, describe, expect, test } from "bun:test";
import { Config } from "../src/config.ts";
import { OpsgenieService } from "../src/opsgenie.ts";
import { Entity, serializeAlertPayload } from "../src/payload.ts";

const mockAPIKey = "eb243592-faa2-4ba2-a551q-1afdf565c889";
const mockHost = "api.opsgenie.com";

// ---------------------------------------------------------------------------
// Config struct: URL round-trips (ported from opsgenie_test.go)
// ---------------------------------------------------------------------------

describe("the OpsGenie Config struct", () => {
  test("populates host and apikey from a simple URL", () => {
    const config = new Config();
    config.setURL(new URL(`opsgenie://${mockHost}/${mockAPIKey}`));
    expect(config.apiKey).toBe(mockAPIKey);
    expect(config.host).toBe(mockHost);
    expect(config.port).toBe(443);
  });

  test("populates the port field from a URL with a port", () => {
    const config = new Config();
    config.setURL(new URL(`opsgenie://${mockHost}:12345/${mockAPIKey}`));
    expect(config.port).toBe(12345);
  });

  test("populates config fields from query parameters", () => {
    const queryParams =
      "alias=Life+is+too+short+for+no+alias&description=Every+alert+needs+a+description&actions=An+action&tags=tag1,tag2&details=key:value,key2:value2&entity=An+example+entity&source=The+source&priority=P1&user=Dracula&note=Here+is+a+note&responders=user:Test,team:NOC&visibleTo=user:A+User";
    const config = new Config();
    config.setURL(
      new URL(`opsgenie://${mockHost}:12345/${mockAPIKey}?${queryParams}`),
    );

    expect(config.alias).toBe("Life is too short for no alias");
    expect(config.description).toBe("Every alert needs a description");
    expect(config.responders).toEqual([
      new Entity({ type: "user", username: "Test" }),
      new Entity({ type: "team", name: "NOC" }),
    ]);
    expect(config.visibleTo).toEqual([
      new Entity({ type: "user", username: "A User" }),
    ]);
    expect(config.actions).toEqual(["An action"]);
    expect(config.tags).toEqual(["tag1", "tag2"]);
    expect(config.details).toEqual({ key: "value", key2: "value2" });
    expect(config.entity).toBe("An example entity");
    expect(config.source).toBe("The source");
    expect(config.priority).toBe("P1");
    expect(config.user).toBe("Dracula");
    expect(config.note).toBe("Here is a note");
  });

  test("parses differently escaped spaces", () => {
    // Mixes '+', '%20' and a literal space.
    const queryParams = "alias=Life is+too%20short+for+no+alias";
    const config = new Config();
    config.setURL(
      new URL(`opsgenie://${mockHost}:12345/${mockAPIKey}?${queryParams}`),
    );
    expect(config.alias).toBe("Life is too short for no alias");
  });

  test("generates a URL from a simple config", () => {
    const config = new Config();
    config.host = "api.opsgenie.com";
    config.apiKey = "eb243592-faa2-4ba2-a551q-1afdf565c889";
    expect(config.getURL().toString()).toBe(
      "opsgenie://api.opsgenie.com/eb243592-faa2-4ba2-a551q-1afdf565c889",
    );
  });

  test("generates a URL with a port", () => {
    const config = new Config();
    config.host = "api.opsgenie.com";
    config.apiKey = "eb243592-faa2-4ba2-a551q-1afdf565c889";
    config.port = 12345;
    expect(config.getURL().toString()).toBe(
      "opsgenie://api.opsgenie.com:12345/eb243592-faa2-4ba2-a551q-1afdf565c889",
    );
  });

  test("generates a URL with all optional config fields", () => {
    const config = new Config();
    config.host = "api.opsgenie.com";
    config.apiKey = "eb243592-faa2-4ba2-a551q-1afdf565c889";
    config.alias = "Life is too short for no alias";
    config.description = "Every alert needs a description";
    config.responders = [
      new Entity({ type: "user", username: "Test" }),
      new Entity({ type: "team", name: "NOC" }),
      new Entity({ type: "team", id: "4513b7ea-3b91-438f-b7e4-e3e54af9147c" }),
    ];
    config.visibleTo = [new Entity({ type: "user", username: "A User" })];
    config.actions = ["action1", "action2"];
    config.tags = ["tag1", "tag2"];
    config.details = { key: "value" };
    config.entity = "An example entity";
    config.source = "The source";
    config.priority = "P1";
    config.user = "Dracula";
    config.note = "Here is a note";

    expect(config.getURL().toString()).toBe(
      "opsgenie://api.opsgenie.com/eb243592-faa2-4ba2-a551q-1afdf565c889?actions=action1%2Caction2&alias=Life+is+too+short+for+no+alias&description=Every+alert+needs+a+description&details=key%3Avalue&entity=An+example+entity&note=Here+is+a+note&priority=P1&responders=user%3ATest%2Cteam%3ANOC%2Cteam%3A4513b7ea-3b91-438f-b7e4-e3e54af9147c&source=The+source&tags=tag1%2Ctag2&user=Dracula&visibleto=user%3AA+User",
    );
  });
});

// ---------------------------------------------------------------------------
// Payload building (mirrors the JSON expected by the Go send tests)
// ---------------------------------------------------------------------------

describe("AlertPayload serialization", () => {
  test("serializes a minimal payload", () => {
    expect(serializeAlertPayload({ message: "hello world" })).toBe(
      '{"message":"hello world"}',
    );
  });

  test("serializes responders/tags/details in Go field order", () => {
    const json = serializeAlertPayload({
      message: "1",
      alias: "1",
      description: "1",
      responders: [new Entity({ type: "team", name: "1" })],
      visibleTo: [new Entity({ type: "team", name: "1" })],
      actions: ["action1", "action2"],
      tags: ["tag1", "tag2"],
      details: { key1: "value1", key2: "value2" },
      entity: "1",
      source: "1",
      priority: "P1",
      user: "1",
      note: "1",
    });
    expect(json).toBe(
      '{"message":"1","alias":"1","description":"1","responders":[{"type":"team","name":"1"}],"visibleTo":[{"type":"team","name":"1"}],"actions":["action1","action2"],"tags":["tag1","tag2"],"details":{"key1":"value1","key2":"value2"},"entity":"1","source":"1","priority":"P1","user":"1","note":"1"}',
    );
  });

  test("rejects details whose value contains a colon (Go parity)", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(`opsgenie://${mockHost}/${mockAPIKey}?details=key:a:b`),
      ),
    ).toThrow();
  });

  test("rejects an unknown query key (Go resolver.Set parity)", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(`opsgenie://${mockHost}/${mockAPIKey}?bogus=value`),
      ),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Service.send via globalThis.fetch override (asserts GenieKey auth + JSON body).
// Bun's undici MockAgent is a non-functional stub, so the core JsonClient (built
// on fetch) is exercised by swapping in a capturing fetch stub.
// ---------------------------------------------------------------------------

interface CapturedRequest {
  method: string;
  path: string;
  auth: string | null;
  contentType: string | null;
  body: string;
}

const realFetch = globalThis.fetch;

/**
 * Installs a fetch stub that captures each request and replies with `status`.
 * Returns the captured requests in call order. Restored via afterEach.
 */
function installFetch(status: number): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = new Headers(init?.headers);
    captured.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      auth: headers.get("authorization"),
      contentType: headers.get("content-type"),
      body: (init?.body as string | undefined) ?? "",
    });
    return new Response("", { status });
  }) as typeof fetch;
  return captured;
}

describe("the OpsGenie service send", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("sends a simple alert without query params", async () => {
    const captured = installFetch(202);

    const service = new OpsgenieService();
    service.initialize(new URL(`opsgenie://${mockHost}/${mockAPIKey}`));
    await service.send("hello world", {});

    const req = captured[0];
    expect(req).toBeDefined();
    expect(req?.method).toBe("POST");
    expect(req?.path).toBe("/v2/alerts");
    expect(req?.auth).toBe(`GenieKey ${mockAPIKey}`);
    expect(req?.contentType).toBe("application/json");
    expect(req?.body).toBe('{"message":"hello world"}');
  });

  test("populates all fields from runtime parameters", async () => {
    const captured = installFetch(200);

    const service = new OpsgenieService();
    service.initialize(new URL(`opsgenie://${mockHost}/${mockAPIKey}`));
    await service.send("An example alert message", {
      alias: "Life is too short for no alias",
      description: "Every alert needs a description",
      responders:
        "team:4513b7ea-3b91-438f-b7e4-e3e54af9147c,team:NOC,user:Donald,user:696f0759-3b0f-4a15-b8c8-19d3dfca33f2",
      visibleTo: "team:rocket",
      actions: "action1,action2",
      tags: "tag1,tag2",
      details: "key1:value1,key2:value2",
      entity: "An example entity",
      source: "The source",
      priority: "P1",
      user: "Dracula",
      note: "Here is a note",
    });

    expect(captured[0]?.auth).toBe(`GenieKey ${mockAPIKey}`);
    expect(captured[0]?.body).toBe(
      '{"message":"An example alert message",' +
        '"alias":"Life is too short for no alias",' +
        '"description":"Every alert needs a description",' +
        '"responders":[{"type":"team","id":"4513b7ea-3b91-438f-b7e4-e3e54af9147c"},{"type":"team","name":"NOC"},{"type":"user","username":"Donald"},{"type":"user","id":"696f0759-3b0f-4a15-b8c8-19d3dfca33f2"}],' +
        '"visibleTo":[{"type":"team","name":"rocket"}],' +
        '"actions":["action1","action2"],' +
        '"tags":["tag1","tag2"],' +
        '"details":{"key1":"value1","key2":"value2"},' +
        '"entity":"An example entity",' +
        '"source":"The source",' +
        '"priority":"P1",' +
        '"user":"Dracula",' +
        '"note":"Here is a note"}',
    );
  });

  test("populates all fields from query parameters", async () => {
    const captured = installFetch(200);

    const service = new OpsgenieService();
    service.initialize(
      new URL(
        `opsgenie://${mockHost}/${mockAPIKey}?alias=query-alias&description=query-description&responders=team:query_team&visibleTo=user:query_user&actions=queryAction1,queryAction2&tags=queryTag1,queryTag2&details=queryKey1:queryValue1,queryKey2:queryValue2&entity=query-entity&source=query-source&priority=P2&user=query-user&note=query-note`,
      ),
    );
    await service.send("An example alert message", {});

    expect(captured[0]?.body).toBe(
      '{"message":"An example alert message",' +
        '"alias":"query-alias",' +
        '"description":"query-description",' +
        '"responders":[{"type":"team","name":"query_team"}],' +
        '"visibleTo":[{"type":"user","username":"query_user"}],' +
        '"actions":["queryAction1","queryAction2"],' +
        '"tags":["queryTag1","queryTag2"],' +
        '"details":{"queryKey1":"queryValue1","queryKey2":"queryValue2"},' +
        '"entity":"query-entity",' +
        '"source":"query-source",' +
        '"priority":"P2",' +
        '"user":"query-user",' +
        '"note":"query-note"}',
    );
  });

  test("does not mix up runtime params and query params across sends", async () => {
    const captured = installFetch(200);

    const service = new OpsgenieService();
    service.initialize(
      new URL(
        `opsgenie://${mockHost}/${mockAPIKey}?alias=query-alias&description=query-description&responders=team:query_team&visibleTo=user:query_user&actions=queryAction1,queryAction2&tags=queryTag1,queryTag2&details=queryKey1:queryValue1,queryKey2:queryValue2&entity=query-entity&source=query-source&priority=P2&user=query-user&note=query-note`,
      ),
    );

    await service.send("1", {
      alias: "1",
      description: "1",
      responders: "team:1",
      visibleTo: "team:1",
      actions: "action1,action2",
      tags: "tag1,tag2",
      details: "key1:value1,key2:value2",
      entity: "1",
      source: "1",
      priority: "P1",
      user: "1",
      note: "1",
    });

    await service.send("2");

    expect(captured[0]?.body).toBe(
      '{"message":"1","alias":"1","description":"1",' +
        '"responders":[{"type":"team","name":"1"}],' +
        '"visibleTo":[{"type":"team","name":"1"}],' +
        '"actions":["action1","action2"],' +
        '"tags":["tag1","tag2"],' +
        '"details":{"key1":"value1","key2":"value2"},' +
        '"entity":"1","source":"1","priority":"P1","user":"1","note":"1"}',
    );
    expect(captured[1]?.body).toBe(
      '{"message":"2","alias":"query-alias","description":"query-description",' +
        '"responders":[{"type":"team","name":"query_team"}],' +
        '"visibleTo":[{"type":"user","username":"query_user"}],' +
        '"actions":["queryAction1","queryAction2"],' +
        '"tags":["queryTag1","queryTag2"],' +
        '"details":{"queryKey1":"queryValue1","queryKey2":"queryValue2"},' +
        '"entity":"query-entity","source":"query-source","priority":"P2",' +
        '"user":"query-user","note":"query-note"}',
    );
  });

  test("splits long messages into title/description on a UTF-8 byte boundary", async () => {
    const captured = installFetch(202);

    const service = new OpsgenieService();
    service.initialize(new URL(`opsgenie://${mockHost}/${mockAPIKey}`));

    // 140 'あ' = 420 UTF-8 bytes; Go would cut the title at 130 bytes.
    const message = "あ".repeat(140);
    await service.send(message, {});

    const parsed = JSON.parse(captured[0]?.body ?? "") as {
      message: string;
      description: string;
    };
    const titleBytes = new TextEncoder().encode(parsed.message).length;
    expect(titleBytes).toBeLessThanOrEqual(130);
    expect(/^あ+$/.test(parsed.message)).toBe(true); // no split multibyte char
    expect(parsed.description).toBe(message); // full message kept as description
  });

  test("rejects on a non-2xx response", async () => {
    installFetch(422);

    const service = new OpsgenieService();
    service.initialize(new URL(`opsgenie://${mockHost}/${mockAPIKey}`));
    await expect(service.send("boom", {})).rejects.toThrow();
  });
});
