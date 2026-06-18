import { afterEach, describe, expect, it } from "bun:test";
import { Config } from "../src/config.js";
import { ParseMode, parseModeEnum } from "../src/parseMode.js";
import { createSendMessagePayload } from "../src/payload.js";
import { TelegramService } from "../src/telegram.js";

const TOKEN = "12345:mock-token";

function parseURL(raw: string): URL {
  return new URL(raw);
}

describe("telegram config", () => {
  describe("creating configurations", () => {
    it("errors if no arguments were supplied", () => {
      const service = new TelegramService();
      expect(() => service.initialize(parseURL("telegram://"))).toThrow();
    });

    it("errors if the token has an invalid format", () => {
      const service = new TelegramService();
      expect(() =>
        service.initialize(parseURL("telegram://invalid-token")),
      ).toThrow();
    });

    it("errors if only the api token was supplied (no chats)", () => {
      const service = new TelegramService();
      expect(() =>
        service.initialize(parseURL("telegram://12345:mock-token@telegram")),
      ).toThrow("no channels defined");
    });

    describe("when the url is valid", () => {
      const service = new TelegramService();
      service.initialize(
        parseURL(
          "telegram://12345:mock-token@telegram/?chats=channel-1,channel-2,channel-3",
        ),
      );
      const config = service.getConfig();

      it("creates a config object containing the API token", () => {
        expect(config.token).toBe("12345:mock-token");
      });

      it("adds every chats query field as a chat ID", () => {
        expect(config.chats).toEqual(["channel-1", "channel-2", "channel-3"]);
      });
    });
  });

  describe("URL round-trip (setURL -> getURL)", () => {
    const cases = [
      "telegram://12345:mock-token@telegram/?chats=channel-1,channel-2,channel-3",
      "telegram://12345:mock-token@telegram/?chats=channel-1&parsemode=HTML",
      "telegram://12345:mock-token@telegram/?chats=channel-1&notification=No&preview=No",
      "telegram://12345:mock-token@telegram/?chats=channel-1&title=hello",
    ];

    for (const raw of cases) {
      it(`round-trips ${raw}`, () => {
        const config = new Config();
        config.setURL(parseURL(raw));
        const out = config.getURL();

        // Token preserved.
        expect(`${out.username}:${out.password}`).toBe(TOKEN);
        expect(out.protocol).toBe("telegram:");
        expect(out.host).toBe("telegram");

        // Re-parsing the produced URL yields an equivalent config.
        const reparsed = new Config();
        reparsed.setURL(out);
        expect(reparsed.token).toBe(config.token);
        expect(reparsed.chats).toEqual(config.chats);
        expect(reparsed.parseMode).toBe(config.parseMode);
        expect(reparsed.preview).toBe(config.preview);
        expect(reparsed.notification).toBe(config.notification);
        expect(reparsed.title).toBe(config.title);
      });
    }

    it("omits default-valued fields from the query", () => {
      const config = new Config();
      config.setURL(parseURL("telegram://12345:mock-token@telegram/?chats=c1"));
      const out = config.getURL();
      // preview/notification default Yes, parsemode default None, title default "" -> not serialized
      expect(out.search).not.toContain("preview");
      expect(out.search).not.toContain("notification");
      expect(out.search).not.toContain("parsemode");
      expect(out.search).not.toContain("title");
      expect(out.search).toContain("chats=c1");
    });

    it("channels alias maps to chats", () => {
      const config = new Config();
      config.setURL(
        parseURL("telegram://12345:mock-token@telegram/?channels=ch1,ch2"),
      );
      expect(config.chats).toEqual(["ch1", "ch2"]);
    });
  });
});

describe("ParseMode enum", () => {
  it("parses case-insensitively", () => {
    expect(parseModeEnum.parse("None")).toBe(ParseMode.None);
    expect(parseModeEnum.parse("markdown")).toBe(ParseMode.Markdown);
    expect(parseModeEnum.parse("HTML")).toBe(ParseMode.HTML);
    expect(parseModeEnum.parse("markdownv2")).toBe(ParseMode.MarkdownV2);
  });

  it("returns -1 for unknown values", () => {
    expect(parseModeEnum.parse("bogus")).toBe(-1);
  });

  it("prints enum values", () => {
    expect(parseModeEnum.print(ParseMode.None)).toBe("None");
    expect(parseModeEnum.print(ParseMode.HTML)).toBe("HTML");
    expect(parseModeEnum.print(ParseMode.MarkdownV2)).toBe("MarkdownV2");
  });

  it("exposes names without the empty offset", () => {
    expect(parseModeEnum.names()).toEqual([
      "None",
      "Markdown",
      "HTML",
      "MarkdownV2",
    ]);
  });

  it("rejects an invalid parsemode in the URL", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        parseURL(
          "telegram://12345:mock-token@telegram/?chats=c1&parsemode=bogus",
        ),
      ),
    ).toThrow();
  });
});

describe("createSendMessagePayload", () => {
  function configWith(overrides: Partial<Config> = {}): Config {
    const c = new Config();
    return Object.assign(c, overrides);
  }

  it("sets chat_id and disables preview/notification per config", () => {
    const config = configWith({ preview: false, notification: false });
    const payload = createSendMessagePayload("hi", "chan", config);
    expect(payload.chat_id).toBe("chan");
    expect(payload.disable_web_page_preview).toBe(true);
    expect(payload.disable_notification).toBe(true);
    expect(payload.text).toBe("hi");
  });

  it("parses a thread id from chat:thread", () => {
    const config = configWith();
    const payload = createSendMessagePayload("hi", "12345:42", config);
    expect(payload.chat_id).toBe("12345");
    expect(payload.message_thread_id).toBe(42);
  });

  it("omits thread id when the suffix is not a strict integer (matches Go Atoi)", () => {
    const config = configWith();
    for (const channel of [
      "12345:42abc",
      "12345:4:2",
      "12345:0x10",
      "12345:",
    ]) {
      const payload = createSendMessagePayload("hi", channel, config);
      expect(payload.chat_id).toBe("12345");
      expect(payload.message_thread_id).toBeUndefined();
    }
  });

  it("keeps the full chat id when there is no colon", () => {
    const config = configWith();
    const payload = createSendMessagePayload("hi", "channel-1", config);
    expect(payload.chat_id).toBe("channel-1");
    expect(payload.message_thread_id).toBeUndefined();
  });

  it("treats None+title as escaped HTML with a bold title", () => {
    const config = configWith({ title: "A & B" });
    const payload = createSendMessagePayload("x < y", "chan", config);
    expect(payload.parse_mode).toBe("HTML");
    expect(payload.text).toBe("<b>A &amp; B</b>\nx &lt; y");
  });

  it("sets parse_mode for non-None modes", () => {
    const config = configWith({ parseMode: ParseMode.Markdown });
    const payload = createSendMessagePayload("x", "chan", config);
    expect(payload.parse_mode).toBe("Markdown");
  });
});

describe("sending the payload (mocked HTTP)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const okResponse = () =>
    new Response(
      JSON.stringify({ ok: true, result: { message_id: 1, text: "Message" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  /** Asserts the request is a POST to bot<token>/sendMessage. */
  function expectSendMessageRequest(
    input: string | URL,
    init?: RequestInit,
  ): void {
    const url = typeof input === "string" ? input : input.toString();
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe("POST");
  }

  it("does not error if the server accepts the payload (per chat)", async () => {
    const chats = ["channel-1", "channel-2", "channel-3"];
    const seen: string[] = [];
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      expectSendMessageRequest(input, init);
      const body = JSON.parse(init?.body as string) as { chat_id: string };
      seen.push(body.chat_id);
      return okResponse();
    }) as typeof fetch;

    const service = new TelegramService();
    service.initialize(
      parseURL(
        "telegram://12345:mock-token@telegram/?chats=channel-1,channel-2,channel-3",
      ),
    );
    await service.send("Message");
    expect(seen).toEqual(chats);
  });

  it("reports transport errors", async () => {
    globalThis.fetch = (async () => {
      throw new Error("dummy transport error");
    }) as unknown as typeof fetch;

    const service = new TelegramService();
    service.initialize(
      parseURL("telegram://12345:mock-token@telegram/?chats=channel-1"),
    );
    await expect(service.send("Message")).rejects.toThrow(
      "dummy transport error",
    );
  });

  it("reports Telegram API errors via description", async () => {
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      expectSendMessageRequest(input, init);
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: 401,
          description: "Unauthorized",
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const service = new TelegramService();
    service.initialize(
      parseURL("telegram://12345:mock-token@telegram/?chats=channel-1"),
    );
    await expect(service.send("Message")).rejects.toThrow("Unauthorized");
  });

  it("rejects an unknown send param (matches Go UpdateConfigFromParams)", async () => {
    const service = new TelegramService();
    service.initialize(
      parseURL("telegram://12345:mock-token@telegram/?chats=channel-1"),
    );
    await expect(service.send("Message", { notAKey: "x" })).rejects.toThrow();
  });

  it("applies a param override without mutating the stored config", async () => {
    let seenParseMode: string | undefined;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      expectSendMessageRequest(input, init);
      const body = JSON.parse(init?.body as string) as { parse_mode?: string };
      seenParseMode = body.parse_mode;
      return okResponse();
    }) as typeof fetch;

    const service = new TelegramService();
    service.initialize(
      parseURL("telegram://12345:mock-token@telegram/?chats=channel-1"),
    );
    await service.send("Message", { parsemode: "HTML" });
    expect(seenParseMode).toBe("HTML");
    // Stored config remains at its default ParseMode.None.
    expect(service.getConfig().parseMode).toBe(ParseMode.None);
  });
});

describe("message length limit", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("rejects a message longer than 4096 bytes", async () => {
    const service = new TelegramService();
    service.initialize(
      parseURL("telegram://12345:mock-token@telegram/?chats=channel-1"),
    );
    const tooLong = "a".repeat(4097);
    await expect(service.send(tooLong)).rejects.toThrow(
      "Message exceeds the max length",
    );
  });

  it("accepts a message of exactly 4096 bytes (boundary passes the guard)", async () => {
    let sent = false;
    globalThis.fetch = (async () => {
      sent = true;
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 1, text: "m" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const service = new TelegramService();
    service.initialize(
      parseURL("telegram://12345:mock-token@telegram/?chats=channel-1"),
    );
    // Exactly at the limit must pass the guard and reach the HTTP call.
    await service.send("a".repeat(4096));
    expect(sent).toBe(true);
  });
});
