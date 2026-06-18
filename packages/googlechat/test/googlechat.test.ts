import { afterEach, describe, expect, it } from "bun:test";
import { GoogleChatConfig } from "../src/config.ts";
import { GoogleChatService } from "../src/googlechat.ts";
import { descriptor } from "../src/index.ts";

const realFetch = globalThis.fetch;

interface CapturedRequest {
  url: string;
  method?: string;
  body?: string;
}

/**
 * Installs a fake `fetch` that records the request and returns `response`.
 * Bun's built-in `undici` shim ignores custom dispatchers, so the service tests
 * exercise core's default `fetch` transport via a global override instead of a
 * MockAgent — same assertions (POST to the reconstructed webhook URL + JSON
 * body; 200 resolves, error rejects). Restored in `afterEach`.
 */
function stubFetch(response: { status: number; body: string }): {
  captured?: CapturedRequest;
} {
  const slot: { captured?: CapturedRequest } = {};
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    slot.captured = {
      url: String(input),
      method: init?.method,
      body: init?.body === undefined ? undefined : String(init.body),
    };
    return new Response(response.body, { status: response.status });
  }) as typeof fetch;
  return slot;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Google Chat Service", () => {
  it("should build a valid Google Chat Incoming Webhook URL", () => {
    const config = new GoogleChatConfig();
    config.setURL(
      new URL(
        "googlechat://chat.googleapis.com/v1/spaces/FOO/messages?key=bar&token=baz",
      ),
    );

    const expected =
      "https://chat.googleapis.com/v1/spaces/FOO/messages?key=bar&token=baz";
    expect(config.getAPIURL().toString()).toBe(expected);
  });

  describe("parsing the configuration URL", () => {
    it("should be identical after de-/serialization", () => {
      const testURL =
        "googlechat://chat.googleapis.com/v1/spaces/FOO/messages?key=bar&token=baz";

      const config = new GoogleChatConfig();
      config.setURL(new URL(testURL));

      expect(config.getURL().toString()).toBe(testURL);
    });
  });

  describe("setURL validation", () => {
    it("should error when 'key' is missing", () => {
      const config = new GoogleChatConfig();
      expect(() =>
        config.setURL(
          new URL(
            "googlechat://chat.googleapis.com/v1/spaces/FOO/messages?token=baz",
          ),
        ),
      ).toThrow("missing field 'key'");
    });

    it("should error when 'token' is missing", () => {
      const config = new GoogleChatConfig();
      expect(() =>
        config.setURL(
          new URL(
            "googlechat://chat.googleapis.com/v1/spaces/FOO/messages?key=bar",
          ),
        ),
      ).toThrow("missing field 'token'");
    });
  });

  describe("descriptor", () => {
    it("should expose both googlechat and hangouts schemes", () => {
      expect(descriptor.schemes).toContain("googlechat");
      expect(descriptor.schemes).toContain("hangouts");
      expect(descriptor.schemes).toEqual(["googlechat", "hangouts"]);
    });
  });

  describe("sending the payload", () => {
    const expectedURL =
      "https://chat.googleapis.com/v1/spaces/FOO/messages?key=bar&token=baz";

    it("should POST the message to the reconstructed webhook URL", async () => {
      const slot = stubFetch({ status: 200, body: "" });

      const service = new GoogleChatService();
      service.initialize(
        new URL(
          "googlechat://chat.googleapis.com/v1/spaces/FOO/messages?key=bar&token=baz",
        ),
      );

      await expect(service.send("Message")).resolves.toBeUndefined();
      expect(slot.captured?.method).toBe("POST");
      expect(slot.captured?.url).toBe(expectedURL);
      expect(slot.captured?.body).toBe(JSON.stringify({ text: "Message" }));
    });

    it("should reject when the server returns an error status", async () => {
      stubFetch({ status: 400, body: "bad request" });

      const service = new GoogleChatService();
      service.initialize(
        new URL(
          "googlechat://chat.googleapis.com/v1/spaces/FOO/messages?key=bar&token=baz",
        ),
      );

      await expect(service.send("Message")).rejects.toThrow(
        "Google Chat API notification returned 400 HTTP status code",
      );
    });
  });
});
