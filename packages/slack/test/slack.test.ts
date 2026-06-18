import { describe, expect, it } from "bun:test";
import type { FetchLike } from "@woodpecker-js/core";
import { Config, createConfigFromURL } from "../src/config.js";
import { ErrorInvalidToken } from "../src/errors.js";
import { createJSONPayload, MessagePayload } from "../src/payload.js";
import { SlackService } from "../src/slack.js";

interface RecordedRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Builds a recording fetch mock that returns the given status/body. */
function mockFetch(
  status: number,
  body: string,
  recorder: RecordedRequest[],
): FetchLike {
  return async (input, init) => {
    const headers: Record<string, string> = {};
    const initHeaders = init?.headers;
    if (
      initHeaders &&
      typeof initHeaders === "object" &&
      !Array.isArray(initHeaders)
    ) {
      for (const [k, v] of Object.entries(
        initHeaders as Record<string, string>,
      )) {
        headers[k] = v;
      }
    }
    recorder.push({
      url: String(input),
      method: init?.method,
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** A fetch mock that rejects, mirroring a transport error. */
const erroringFetch: FetchLike = async () => {
  throw new Error("dummy error");
};

describe("the slack config", () => {
  describe("parsing the configuration URL", () => {
    it("converts the legacy format to the new format after de-/serialization", () => {
      const oldURL =
        "slack://testbot@AAAAAAAAA/BBBBBBBBB/123456789123456789123456?color=3f00fe&title=Test+title";
      const newURL =
        "slack://hook:AAAAAAAAA-BBBBBBBBB-123456789123456789123456@webhook?botname=testbot&color=3f00fe&title=Test+title";

      const config = new Config();
      config.setURL(new URL(oldURL));
      expect(config.getURL().toString()).toBe(newURL);
    });

    it("is identical after de-/serialization (new format)", () => {
      const testURL =
        "slack://hook:AAAAAAAAA-BBBBBBBBB-123456789123456789123456@webhook?botname=testbot&color=3f00fe&title=Test+title";

      const config = new Config();
      config.setURL(new URL(testURL));
      expect(config.getURL().toString()).toBe(testURL);
    });

    it("round-trips query values with Go-faithful escaping (* ( ) not WHATWG)", () => {
      // '*', '(', ')' are escaped by Go's url.QueryEscape (%2A, %28, %29) but
      // left literal by WHATWG URLSearchParams. The serialized URL must keep the
      // Go form so it matches the reference implementation.
      const testURL =
        "slack://hook:AAAAAAAAA-BBBBBBBBB-123456789123456789123456@webhook?title=a%2Ab%28c%29";

      const config = new Config();
      config.setURL(new URL(testURL));
      expect(config.getURL().toString()).toBe(testURL);
    });

    it("errors on an invalid property", () => {
      const testURL = new URL(
        "slack://hook:AAAAAAAAA-BBBBBBBBB-123456789123456789123456@webhook?bass=dirty",
      );
      expect(() => new Config().setURL(testURL)).toThrow();
    });
  });

  describe("generating a config object", () => {
    it("uses the default (empty) botname when no user is given", () => {
      const config = createConfigFromURL(
        new URL("slack://AAAAAAAAA/BBBBBBBBB/123456789123456789123456"),
      );
      expect(config.botName).toBe("");
    });

    it("sets the botname when given", () => {
      const config = createConfigFromURL(
        new URL("slack://testbot@AAAAAAAAA/BBBBBBBBB/123456789123456789123456"),
      );
      expect(config.botName).toBe("testbot");
    });

    it("errors when the token is too short", () => {
      expect(() => createConfigFromURL(new URL("slack://AAAAAAAA"))).toThrow();
    });
  });

  describe("malformed token via Initialize", () => {
    it("returns ErrorInvalidToken if part A is not 9 letters", () => {
      const service = new SlackService();
      expect(() =>
        service.initialize(
          new URL("slack://lol@12345678/123456789/123456789123456789123456"),
        ),
      ).toThrow(ErrorInvalidToken);
    });

    it("returns ErrorInvalidToken if part C is not 24 letters", () => {
      const service = new SlackService();
      expect(() =>
        service.initialize(
          new URL("slack://123456789/123456789/12345678912345678912345"),
        ),
      ).toThrow(ErrorInvalidToken);
    });
  });
});

describe("creating the payload", () => {
  describe("the icon fields", () => {
    it("sets icon_url when the configured icon looks like a URL", () => {
      const payload = new MessagePayload();
      payload.setIcon("https://example.com/logo.png");
      expect(payload.icon_url).toBe("https://example.com/logo.png");
      expect(payload.icon_emoji).toBe("");
    });

    it("sets icon_emoji when the configured icon does not look like a URL", () => {
      const payload = new MessagePayload();
      payload.setIcon("tanabata_tree");
      expect(payload.icon_emoji).toBe("tanabata_tree");
      expect(payload.icon_url).toBe("");
    });

    it("clears both fields when the icon is empty", () => {
      const payload = new MessagePayload();
      payload.setIcon("");
      expect(payload.icon_emoji).toBe("");
      expect(payload.icon_url).toBe("");
    });
  });

  describe("attachment chunking", () => {
    it("appends the exceeding lines to the last attachment when over 99 lines", () => {
      const config = new Config();
      let message = "";
      for (let i = 1; i <= 110; i++) {
        message += `Line ${i}\n`;
      }
      const payload = createJSONPayload(config, message);
      const atts = payload.attachments ?? [];

      expect(atts).toHaveLength(100);
      expect((atts[atts.length - 1] as { text: string }).text).toContain(
        "Line 110",
      );
    });

    it("does not send an empty attachment when the last line ends with a newline", () => {
      const payload = createJSONPayload(new Config(), "One\nTwo\nThree\n");
      const atts = payload.attachments ?? [];
      expect((atts[atts.length - 1] as { text: string }).text).not.toBe("");
    });

    it("applies the configured color to each attachment", () => {
      const config = new Config();
      config.color = "3f00fe";
      const payload = createJSONPayload(config, "hello");
      expect(payload.attachments?.[0]?.color).toBe("3f00fe");
    });
  });
});

describe("sending the payload", () => {
  describe("via webhook URL", () => {
    // The token path is kept out of the full webhook-URL literal so GitHub
    // push protection does not flag this synthetic fixture as a real secret.
    const tokenPath = "AAAAAAAAA/BBBBBBBBB/123456789123456789123456";
    const webhookURL = `slack://testbot@${tokenPath}`;
    const expectedTarget = `https://hooks.slack.com/services/${tokenPath}`;

    it("POSTs to the webhook URL and resolves on 200 with empty body", async () => {
      const recorder: RecordedRequest[] = [];
      const service = new SlackService();
      service.setFetch(mockFetch(200, "", recorder));
      service.initialize(new URL(webhookURL));

      await expect(service.send("Message")).resolves.toBeUndefined();

      expect(recorder).toHaveLength(1);
      expect(recorder[0]?.url).toBe(expectedTarget);
      expect(recorder[0]?.method).toBe("POST");
    });

    it('resolves when the server replies with the literal "ok" body', async () => {
      const recorder: RecordedRequest[] = [];
      const service = new SlackService();
      service.setFetch(mockFetch(200, "ok", recorder));
      service.initialize(new URL(webhookURL));

      await expect(service.send("Message")).resolves.toBeUndefined();
    });

    it("rejects if the server returns a non-ok body", async () => {
      const recorder: RecordedRequest[] = [];
      const service = new SlackService();
      service.setFetch(mockFetch(200, "invalid_payload", recorder));
      service.initialize(new URL(webhookURL));

      await expect(service.send("Message")).rejects.toThrow(
        "webhook response: invalid_payload",
      );
    });

    it("does not panic if a transport error occurs", async () => {
      const service = new SlackService();
      service.setFetch(erroringFetch);
      service.initialize(new URL(webhookURL));

      await expect(service.send("Message")).rejects.toThrow("dummy error");
    });
  });

  describe("via bot API", () => {
    const apiURL =
      "slack://xoxb:123456789012-1234567890123-4mt0t4l1YL3g1T5L4cK70k3N@C0123456789";

    it("POSTs to chat.postMessage with the Authorization header and resolves on ok:true", async () => {
      const recorder: RecordedRequest[] = [];
      const service = new SlackService();
      service.setFetch(mockFetch(200, JSON.stringify({ ok: true }), recorder));
      service.initialize(new URL(apiURL));

      await expect(service.send("Message")).resolves.toBeUndefined();

      expect(recorder).toHaveLength(1);
      expect(recorder[0]?.url).toBe("https://slack.com/api/chat.postMessage");
      expect(recorder[0]?.method).toBe("POST");
      expect(recorder[0]?.headers?.Authorization).toBe(
        // Fragmented so the synthetic xoxb token is not a contiguous literal.
        `Bearer xoxb-123456789012-1234567890123-${"4mt0t4l1YL3g1T5L4cK70k3N"}`,
      );
    });

    it("sets the channel from the URL host on the payload", async () => {
      const recorder: RecordedRequest[] = [];
      const service = new SlackService();
      service.setFetch(mockFetch(200, JSON.stringify({ ok: true }), recorder));
      service.initialize(new URL(apiURL));

      await service.send("Message");
      const sent = JSON.parse(recorder[0]?.body ?? "{}");
      // slack:// is a non-special scheme, so WHATWG URL preserves host case,
      // matching Go's url.Hostname().
      expect(sent.channel).toBe("C0123456789");
    });

    it("rejects when the API responds ok:false", async () => {
      const recorder: RecordedRequest[] = [];
      const service = new SlackService();
      service.setFetch(
        mockFetch(
          200,
          JSON.stringify({
            ok: false,
            error: "someone turned off the internet",
          }),
          recorder,
        ),
      );
      service.initialize(new URL(apiURL));

      await expect(service.send("Message")).rejects.toThrow(
        "api response: someone turned off the internet",
      );
    });
  });
});
