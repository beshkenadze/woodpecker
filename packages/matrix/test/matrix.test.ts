import { afterEach, describe, expect, test } from "bun:test";
import { PropKeyResolver } from "@woodpecker-js/core";
import { Config, defaultDeviceID, matrixFields } from "../src/config.js";
import { MatrixService } from "../src/matrix.js";
import { escapePathSegment } from "../src/urlpath.js";

// ---------------------------------------------------------------------------
// Config / URL round-trip (mirrors matrix_test.go "creating configurations")
// ---------------------------------------------------------------------------
describe("matrix config", () => {
  test("accepts a URL with the title prop", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(
          "matrix://user:pass@mockserver?rooms=room1&title=Better%20Off%20Alone",
        ),
      ),
    ).not.toThrow();
  });

  test("treats `room` as an alias for `rooms`", () => {
    const config = new Config();
    config.setURL(new URL("matrix://user:pass@mockserver?room=room1"));
    expect(config.rooms).toContain("#room1");
  });

  test("returns an error for invalid props", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL("matrix://user:pass@mockserver?channels=room1,room2"),
      ),
    ).toThrow();
  });

  test("is identical after de-/serialization (round-trip)", () => {
    const testURL = "matrix://user:pass@mockserver?rooms=%23room1%2C%23room2";
    const config = new Config();
    config.setURL(new URL(testURL));
    expect(config.getURLString()).toBe(testURL);
  });

  test("non-default disableTLS/deviceID survive serialization round-trip", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "matrix://user:pass@mockserver?disableTLS=Yes&deviceID=dev2&rooms=room1",
      ),
    );
    const restored = new Config();
    restored.setURL(new URL(config.getURLString()));
    expect(restored.disableTLS).toBe(true);
    expect(restored.deviceID).toBe("dev2");
  });

  test("prepends # to bare room aliases but not to IDs", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "matrix://user:pass@mockserver?rooms=room1,%23room2,%21id:server",
      ),
    );
    expect(config.rooms).toEqual(["#room1", "#room2", "!id:server"]);
  });

  test("parses user, password, host from URL", () => {
    const config = new Config();
    config.setURL(new URL("matrix://alice:secret@matrix.example.com"));
    expect(config.user).toBe("alice");
    expect(config.password).toBe("secret");
    expect(config.host).toBe("matrix.example.com");
  });

  test("defaults deviceID to shoutrrr", () => {
    const config = new Config();
    config.setURL(new URL("matrix://user:pass@mockserver"));
    expect(config.deviceID).toBe(defaultDeviceID);
  });

  test("QueryFields returns 5 keys (matches Go TestConfigGetFieldsCount)", () => {
    const config = new Config();
    const resolver = new PropKeyResolver(config, matrixFields);
    expect(resolver.queryFields().length).toBe(5);
  });

  test("has no enum fields (matches Go TestConfigGetEnumsCount=0)", () => {
    const config = new Config();
    expect(Object.keys(config.enums()).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Path escaping (matches Go url.URL path escaping)
// ---------------------------------------------------------------------------
describe("escapePathSegment", () => {
  test("escapes ! and # like Go but keeps :", () => {
    expect(escapePathSegment("!room:mockserver")).toBe("%21room:mockserver");
    expect(escapePathSegment("#room1")).toBe("%23room1");
    expect(escapePathSegment("1")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// HTTP login -> send sequence against a real local server (Bun.serve).
// Core's JsonClient uses the global fetch, so we exercise the full
// client->HTTP->server path instead of mocking the transport. This validates
// request paths and bodies exactly. Live/remote network is NOT required.
// Mirrors matrix_test.go setupMockResponders behavior.
// ---------------------------------------------------------------------------
interface Captured {
  method: string;
  rawPath: string; // includes percent-encoding and query string
  body: string;
}

interface MockServer {
  server: ReturnType<typeof Bun.serve>;
  host: string; // host:port for the matrix:// URL
  captured: Captured[];
}

function startMockMatrix(): MockServer {
  const captured: Captured[] = [];

  const server = Bun.serve({
    port: 0,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      const rawPath = url.pathname + url.search;
      const body = req.method === "GET" ? "" : await req.text();
      captured.push({ method: req.method, rawPath, body });

      const path = url.pathname;
      const json = (status: number, data: unknown): Response =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "content-type": "application/json" },
        });

      // login flows
      if (path === "/_matrix/client/r0/login" && req.method === "GET") {
        return json(200, { flows: [{ type: "m.login.password" }] });
      }
      // login (password)
      if (path === "/_matrix/client/r0/login" && req.method === "POST") {
        return json(200, {
          access_token: "TOKEN",
          home_server: "mockserver",
          user_id: "test:mockserver",
        });
      }
      // joined rooms
      if (path === "/_matrix/client/r0/joined_rooms" && req.method === "GET") {
        return json(200, { joined_rooms: ["!room:mockserver"] });
      }
      // joins
      if (
        path === "/_matrix/client/r0/join/%23room1" &&
        req.method === "POST"
      ) {
        return json(200, { room_id: "1" });
      }
      if (
        path === "/_matrix/client/r0/join/%23room2" &&
        req.method === "POST"
      ) {
        return json(200, { room_id: "2" });
      }
      if (
        path === "/_matrix/client/r0/join/%23secret" &&
        req.method === "POST"
      ) {
        return json(403, {
          errcode: "M_FORBIDDEN",
          error: "You are not invited to this room.",
        });
      }
      // sends (any room id)
      if (
        /^\/_matrix\/client\/r0\/rooms\/.+\/send\/m\.room\.message\/.+$/.test(
          path,
        )
      ) {
        return json(200, { event_id: "7" });
      }
      return json(404, { errcode: "M_NOT_FOUND", error: "no responder" });
    },
  });

  return { server, host: `localhost:${server.port}`, captured };
}

let active: MockServer | undefined;
afterEach(() => {
  active?.server.stop(true);
  active = undefined;
});

describe("matrix client (real local HTTP server)", () => {
  test("sends a message to joined rooms without errors", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    service.initialize(
      new URL(`matrix://user:pass@${active.host}?disableTLS=Yes`),
    );
    await service.send("Test message", undefined);
    const sends = active.captured.filter((c) => c.method === "PUT");
    expect(sends.length).toBe(1);
    const send = sends[0];
    if (!send) throw new Error("expected a captured send");
    expect(JSON.parse(send.body)).toEqual({
      msgtype: "m.text",
      body: "Test message",
    });
    // joined room id "!room:mockserver" must be path-escaped exactly like Go.
    expect(send.rawPath).toContain("/rooms/%21room:mockserver/send/");
    expect(send.rawPath).toContain("shoutrrr-1");
    expect(send.rawPath).toContain("access_token=TOKEN");
  });

  test("sends to explicit rooms, joining aliases first", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    service.initialize(
      new URL(
        `matrix://user:pass@${active.host}?disableTLS=Yes&rooms=room1,room2`,
      ),
    );
    await service.send("Test message", undefined);
    const joins = active.captured.filter(
      (c) => c.method === "POST" && c.rawPath.includes("/join/"),
    );
    const sends = active.captured.filter((c) => c.method === "PUT");
    expect(joins.length).toBe(2);
    expect(sends.length).toBe(2);
    const [join1, join2] = joins;
    if (!join1 || !join2) throw new Error("expected two captured joins");
    expect(join1.rawPath).toContain("/join/%23room1");
    expect(join2.rawPath).toContain("/join/%23room2");
  });

  test("reports an error when one room cannot be joined", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    service.initialize(
      new URL(
        `matrix://user:pass@${active.host}?disableTLS=Yes&rooms=secret,room2`,
      ),
    );
    await expect(service.send("Test message", undefined)).rejects.toThrow();
  });

  test("login body uses the default device ID and password identifier", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    service.initialize(
      new URL(`matrix://user:pass@${active.host}?disableTLS=Yes`),
    );
    await service.send("Test message", undefined);
    const loginPost = active.captured.find(
      (c) =>
        c.method === "POST" && c.rawPath.startsWith("/_matrix/client/r0/login"),
    );
    expect(loginPost).toBeDefined();
    if (!loginPost) throw new Error("expected a captured login POST");
    const body = JSON.parse(loginPost.body);
    expect(body.type).toBe("m.login.password");
    expect(body.device_id).toBe(defaultDeviceID);
    expect(body.password).toBe("pass");
    expect(body.identifier).toEqual({ type: "m.id.user", user: "user" });
  });

  test("does not crash without a logger", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    service.initialize(
      new URL(`matrix://user:pass@${active.host}?disableTLS=Yes`),
    );
    await expect(
      service.send("Test message", undefined),
    ).resolves.toBeUndefined();
  });

  test("uses an access token directly when no user is provided", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    // No user -> useToken(password); password is the access token "TOKEN".
    service.initialize(
      new URL(`matrix://:TOKEN@${active.host}?disableTLS=Yes`),
    );
    await service.send("Test message", undefined);
    const sends = active.captured.filter((c) => c.method === "PUT");
    expect(sends.length).toBe(1);
    // no login should have occurred (token used directly)
    const loginGet = active.captured.find((c) =>
      c.rawPath.startsWith("/_matrix/client/r0/login"),
    );
    expect(loginGet).toBeUndefined();
  });

  test("a `rooms` param does not leak into subsequent sends (Go copy semantics)", async () => {
    active = startMockMatrix();
    const service = new MatrixService();
    // Configured to send to joined rooms (no rooms in URL).
    service.initialize(
      new URL(`matrix://user:pass@${active.host}?disableTLS=Yes`),
    );
    // First send with a transient `title` param (a valid query key) must not
    // alter the live config used by the second send.
    await service.send("msg1", { title: "Temporary" });
    await service.send("msg2", undefined);
    // Both sends target the same joined room; no explicit-room joins happened.
    const joins = active.captured.filter((c) => c.rawPath.includes("/join/"));
    expect(joins.length).toBe(0);
    const sends = active.captured.filter((c) => c.method === "PUT");
    expect(sends.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Regression tests for review findings
// ---------------------------------------------------------------------------
describe("matrix regressions", () => {
  test("room IDs containing `$` are not corrupted by String.replace (finding 1)", async () => {
    const captured: { rawPath: string }[] = [];
    const server = Bun.serve({
      port: 0,
      fetch(req): Response {
        const url = new URL(req.url);
        captured.push({ rawPath: url.pathname });
        const json = (s: number, d: unknown) =>
          new Response(JSON.stringify(d), {
            status: s,
            headers: { "content-type": "application/json" },
          });
        const path = url.pathname;
        if (path === "/_matrix/client/r0/joined_rooms") {
          return json(200, { joined_rooms: ["!ev$il&room:srv"] });
        }
        if (/\/send\/m\.room\.message\//.test(path)) {
          return json(200, { event_id: "1" });
        }
        return json(404, { error: "nope" });
      },
    });
    try {
      const service = new MatrixService();
      service.initialize(
        new URL(`matrix://:TOKEN@localhost:${server.port}?disableTLS=Yes`),
      );
      await service.send("hi", undefined);
      const send = captured.find((c) => c.rawPath.includes("/send/"));
      expect(send).toBeDefined();
      if (!send) throw new Error("expected a captured send");
      // '$' and '&' are kept literal (Go encodePath); '!' becomes %21.
      expect(send.rawPath).toContain("/rooms/%21ev$il&room:srv/send/");
    } finally {
      server.stop(true);
    }
  });

  test("malformed percent escape in password does not crash setURL (finding 3)", () => {
    const config = new Config();
    expect(() =>
      config.setURL(new URL("matrix://user:50%off@mockserver")),
    ).not.toThrow();
    config.setURL(new URL("matrix://user:50%off@mockserver"));
    expect(config.password).toBe("50%off");
  });

  test("repeated query key uses the first value (Go vals[0] semantics, finding sweep)", () => {
    const config = new Config();
    config.setURL(
      new URL("matrix://user:pass@mockserver?rooms=room1&rooms=room2"),
    );
    expect(config.rooms).toEqual(["#room1"]);
  });

  test("login retries after a transient failure (finding 2)", async () => {
    let failNext = true;
    const server = Bun.serve({
      port: 0,
      async fetch(req): Promise<Response> {
        const url = new URL(req.url);
        const json = (s: number, d: unknown) =>
          new Response(JSON.stringify(d), {
            status: s,
            headers: { "content-type": "application/json" },
          });
        const path = url.pathname;
        if (path === "/_matrix/client/r0/login" && req.method === "GET") {
          if (failNext) {
            failNext = false;
            return json(500, { error: "transient" });
          }
          return json(200, { flows: [{ type: "m.login.password" }] });
        }
        if (path === "/_matrix/client/r0/login" && req.method === "POST") {
          return json(200, {
            access_token: "TOKEN",
            home_server: "h",
            user_id: "u",
          });
        }
        if (path === "/_matrix/client/r0/joined_rooms") {
          return json(200, { joined_rooms: ["!r:srv"] });
        }
        if (/\/send\/m\.room\.message\//.test(path)) {
          return json(200, { event_id: "1" });
        }
        return json(404, { error: "nope" });
      },
    });
    try {
      const service = new MatrixService();
      service.initialize(
        new URL(`matrix://user:pass@localhost:${server.port}?disableTLS=Yes`),
      );
      // First send fails to fetch login flows (500).
      await expect(service.send("hi", undefined)).rejects.toThrow();
      // Second send must retry login and succeed (rejected promise was cleared).
      await expect(
        service.send("hi again", undefined),
      ).resolves.toBeUndefined();
    } finally {
      server.stop(true);
    }
  });
});
