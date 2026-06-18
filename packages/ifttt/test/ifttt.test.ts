import { afterEach, describe, expect, it } from "bun:test";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Config } from "../src/config.js";
import { IftttService } from "../src/ifttt.js";
import { createJSONToSend } from "../src/payload.js";

interface CapturedRequest {
  method: string;
  path: string;
  body: string;
}

/**
 * startMockServer spins up an ephemeral HTTP server that records the request
 * and replies with the given status. undici's MockAgent does not work under
 * Bun (it crashes on a missing webidl internal), so a real local server is the
 * Bun-compatible equivalent of the Go httpmock responder. The service's apiBase
 * is pointed here, exercising the exact POST path and JSON body.
 */
async function startMockServer(
  status: number,
): Promise<{ server: Server; base: string; captured: CapturedRequest[] }> {
  const captured: CapturedRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured.push({
        method: req.method ?? "",
        path: req.url ?? "",
        body,
      });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end("");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { server, base: `http://127.0.0.1:${port}`, captured };
}

describe("the ifttt package", () => {
  describe("creating a config", () => {
    it("should error if no arguments were supplied", () => {
      const service = new IftttService();
      expect(() => service.initialize(new URL("ifttt://"))).toThrow();
    });

    it("should error if no webhook ID is given", () => {
      const service = new IftttService();
      expect(() =>
        service.initialize(new URL("ifttt:///?events=event1")),
      ).toThrow();
    });

    it("should error if no events are given", () => {
      const service = new IftttService();
      expect(() => service.initialize(new URL("ifttt://dummyID"))).toThrow();
    });

    it("should error if an explicitly empty events value is given", () => {
      const service = new IftttService();
      expect(() =>
        service.initialize(new URL("ifttt://dummyID/?events=")),
      ).toThrow();
    });

    it("should error when an invalid query key is given", () => {
      const service = new IftttService();
      expect(() =>
        service.initialize(
          new URL("ifttt://dummyID/?events=event1&badquery=foo"),
        ),
      ).toThrow();
    });

    it("should error if message value is above 3", () => {
      const config = new Config();
      expect(() =>
        config.setURL(new URL("ifttt://dummyID/?events=event1&messagevalue=8")),
      ).toThrow();
    });

    it("should reject a non-integer message value (strict parse, like Go ParseUint)", () => {
      const config = new Config();
      expect(() =>
        config.setURL(
          new URL("ifttt://dummyID/?events=event1&messagevalue=2.5"),
        ),
      ).toThrow();
    });

    it("should reject a negative title value (strict uint parse, like Go ParseUint)", () => {
      const config = new Config();
      expect(() =>
        config.setURL(new URL("ifttt://dummyID/?events=event1&titlevalue=-1")),
      ).toThrow();
    });

    it("should not error if webhook ID and at least one event is given", () => {
      const service = new IftttService();
      expect(() =>
        service.initialize(new URL("ifttt://dummyID/?events=event1")),
      ).not.toThrow();
    });

    it("should set value1, value2 and value3", () => {
      const config = new Config();
      config.setURL(
        new URL(
          "ifttt://dummyID/?events=dummyevent&value3=three&value2=two&value1=one",
        ),
      );
      expect(config.value1).toBe("one");
      expect(config.value2).toBe("two");
      expect(config.value3).toBe("three");
    });

    describe("given values", () => {
      it("should return a URL with all the values", () => {
        const expectedURL =
          "ifttt://dummyID/?messagevalue=0&value1=v1&value2=v2&value3=v3";
        const config = new Config();
        config.webHookID = "dummyID";
        config.value1 = "v1";
        config.value2 = "v2";
        config.value3 = "v3";
        config.useMessageAsValue = 0;
        expect(config.getURL().toString()).toBe(expectedURL);
      });

      it("should serialize the events array into the query (comma-encoded)", () => {
        const config = new Config();
        config.setURL(
          new URL("ifttt://dummyID/?events=foo,bar,baz&messagevalue=1"),
        );
        const out = config.getURL().toString();
        expect(out).toContain("events=foo%2Cbar%2Cbaz");
        expect(out).toContain("messagevalue=1");
        // re-parsing the produced URL yields the same events
        const round = new Config();
        round.setURL(new URL(out));
        expect(round.events).toEqual(["foo", "bar", "baz"]);
      });
    });
  });

  describe("sending a message", () => {
    let server: Server | undefined;

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server?.close(() => resolve()));
        server = undefined;
      }
    });

    it("should error if the response code is not 204 no content", async () => {
      const mock = await startMockServer(404);
      server = mock.server;

      const service = new IftttService({ apiBase: mock.base });
      service.initialize(new URL("ifttt://dummy/?events=foo"));
      await expect(service.send("hello")).rejects.toThrow();
    });

    it("should not error if the response code is 204", async () => {
      const mock = await startMockServer(204);
      server = mock.server;

      const service = new IftttService({ apiBase: mock.base });
      service.initialize(new URL("ifttt://dummy/?events=foo"));
      await expect(service.send("hello")).resolves.toBeUndefined();

      expect(mock.captured).toHaveLength(1);
      const req = mock.captured[0];
      expect(req?.method).toBe("POST");
      // POSTs to maker.ifttt.com/trigger/<event>/with/key/<id>
      expect(req?.path).toBe("/trigger/foo/with/key/dummy");

      const parsed = JSON.parse(req?.body ?? "{}");
      expect(parsed).toHaveProperty("value1");
      expect(parsed).toHaveProperty("value2");
      expect(parsed).toHaveProperty("value3");
      // default messagevalue is 2 -> message routed into value2
      expect(parsed.value2).toBe("hello");
    });

    it("should POST to every configured event", async () => {
      const mock = await startMockServer(204);
      server = mock.server;

      const service = new IftttService({ apiBase: mock.base });
      service.initialize(new URL("ifttt://dummy/?events=foo,bar"));
      await expect(service.send("hello")).resolves.toBeUndefined();

      expect(mock.captured.map((r) => r.path).sort()).toEqual([
        "/trigger/bar/with/key/dummy",
        "/trigger/foo/with/key/dummy",
      ]);
    });
  });

  describe("creating a json payload", () => {
    it('should return a valid payload with values "a", "b" and "c"', () => {
      const config = new Config();
      config.value1 = "a";
      config.value2 = "b";
      config.value3 = "c";
      config.useMessageAsValue = 0;
      const payload = createJSONToSend(config, "d");
      expect(payload.value1).toBe("a");
      expect(payload.value2).toBe("b");
      expect(payload.value3).toBe("c");
    });

    it("should route the message into the value selected by messagevalue", () => {
      const config = new Config();
      config.value1 = "a";
      config.value2 = "b";
      config.value3 = "c";
      for (let i = 1; i <= 3; i++) {
        config.useMessageAsValue = i;
        const payload = createJSONToSend(config, "d");
        if (i === 1) {
          expect(payload.value1).toBe("d");
        } else if (i === 2) {
          expect(payload.value2).toBe("d");
        } else if (i === 3) {
          expect(payload.value3).toBe("d");
        }
      }
    });

    it("should override value1, value2 and value3 from params", () => {
      const config = new Config();
      config.value1 = "a";
      config.value2 = "b";
      config.value3 = "c";
      config.useMessageAsValue = 0;
      const payload = createJSONToSend(config, "d", {
        value1: "e",
        value2: "f",
        value3: "g",
      });
      expect(payload.value1).toBe("e");
      expect(payload.value2).toBe("f");
      expect(payload.value3).toBe("g");
    });
  });
});
