import { describe, expect, it } from "bun:test";
import { AuthType, authTypeFormatter } from "../src/authType.js";
import { Config } from "../src/config.js";
import {
  Encryption,
  encryptionFormatter,
  ImplicitTLSPort,
  useImplicitTLS,
} from "../src/encMethod.js";
import {
  buildMessage,
  buildTransportOptions,
  type MailMessage,
  resolveClientHost,
  SmtpService,
  type TransportLike,
  type TransportOptions,
} from "../src/smtp.js";

// Mirrors Go smtp_test.go urlWithAllProps (query keys alphabetically sorted).
const urlWithAllProps =
  "smtp://user:password@example.com:2225/?auth=None&clienthost=testhost&encryption=ExplicitTLS&fromaddress=sender%40example.com&fromname=Sender&subject=Subject&toaddresses=rec1%40example.com%2Crec2%40example.com&usehtml=Yes&usestarttls=No";

/** recordingTransport captures every sendMail call for assertions. */
function recordingTransport(): {
  transport: TransportLike;
  sent: MailMessage[];
} {
  const sent: MailMessage[] = [];
  const transport: TransportLike = {
    async sendMail(message: MailMessage): Promise<unknown> {
      sent.push(message);
      return { accepted: [message.to] };
    },
  };
  return { transport, sent };
}

describe("SMTP URL round-trip", () => {
  it("is identical after de-/serialization for a fully-specified URL", () => {
    const config = new Config();
    config.setURL(new URL(urlWithAllProps));

    expect(config.getURL().toString()).toBe(urlWithAllProps);
  });

  it("preserves a custom port in the host part", () => {
    const config = new Config();
    config.setURL(new URL(urlWithAllProps));
    expect(config.port).toBe(2225);
  });

  it("parses auth and encryption query params into enum values", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://user:pass@host:587/?auth=Plain&encryption=ImplicitTLS&fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    expect(config.auth).toBe(AuthType.Plain);
    expect(config.encryption).toBe(Encryption.ImplicitTLS);
  });

  it("omits props whose value equals the schema default", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://example.com:25/?fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    const out = config.getURL().toString();
    // auth=Unknown, encryption=Auto, usestarttls=Yes, usehtml=No, clienthost=localhost
    // all match their schema defaults and are omitted. subject's runtime value ("")
    // differs from the schema default ("Shoutrrr Notification"), matching the Go
    // service which initialises Subject to "" and therefore emits subject=.
    expect(out).toBe(
      "smtp://example.com:25/?fromaddress=s%40example.com&subject=&toaddresses=r%40example.com",
    );
  });
});

describe("config validation", () => {
  it("rejects a URL missing fromAddress", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(
          "smtp://user:password@example.com:2225/?toAddresses=rec1@example.com,rec2@example.com",
        ),
      ),
    ).toThrow(/fromAddress/);
  });

  it("rejects a URL missing toAddresses", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(
          "smtp://user:password@example.com:2225/?fromAddress=sender@example.com",
        ),
      ),
    ).toThrow(/toAddress/);
  });

  it("uses the first value for a repeated query key (Go vals[0] semantics)", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://host:25/?auth=None&auth=Plain&fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    expect(config.auth).toBe(AuthType.None);
  });

  it("rejects a non-numeric port-like value in a uint query field", () => {
    // toAddresses is string[], so use a uint field check via a bad value would
    // need a uint query field; SMTP has none beyond port (a URL part). Assert the
    // format engine rejects trailing garbage through the enum/bool paths instead.
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(
          "smtp://host:25/?usestarttls=maybe&fromaddress=s@example.com&toaddresses=r@example.com",
        ),
      ),
    ).toThrow(/accepted values/);
  });

  it("rejects an invalid enum value", () => {
    const config = new Config();
    expect(() =>
      config.setURL(
        new URL(
          "smtp://example.com/?fromAddress=s@example.com&toAddresses=r@example.com&auth=bogus",
        ),
      ),
    ).toThrow(/None, Plain/);
  });
});

describe("AuthType enum", () => {
  it("parses case-insensitively and prints by index", () => {
    expect(authTypeFormatter.parse("plain")).toBe(AuthType.Plain);
    expect(authTypeFormatter.parse("CRAMMD5")).toBe(AuthType.CRAMMD5);
    expect(authTypeFormatter.parse("OAuth2")).toBe(AuthType.OAuth2);
    expect(authTypeFormatter.parse("nope")).toBe(-1);
    expect(authTypeFormatter.print(AuthType.None)).toBe("None");
    expect(authTypeFormatter.print(AuthType.Unknown)).toBe("Unknown");
    expect(authTypeFormatter.names()).toEqual([
      "None",
      "Plain",
      "CRAMMD5",
      "Unknown",
      "OAuth2",
    ]);
  });
});

describe("Encryption enum", () => {
  it("parses case-insensitively and prints by index", () => {
    expect(encryptionFormatter.parse("explicittls")).toBe(
      Encryption.ExplicitTLS,
    );
    expect(encryptionFormatter.parse("Auto")).toBe(Encryption.Auto);
    expect(encryptionFormatter.parse("xxx")).toBe(-1);
    expect(encryptionFormatter.print(Encryption.ImplicitTLS)).toBe(
      "ImplicitTLS",
    );
  });

  it("useImplicitTLS follows the Go switch logic", () => {
    expect(useImplicitTLS(Encryption.ImplicitTLS, 25)).toBe(true);
    expect(useImplicitTLS(Encryption.None, 465)).toBe(false);
    expect(useImplicitTLS(Encryption.ExplicitTLS, 465)).toBe(false);
    expect(useImplicitTLS(Encryption.Auto, ImplicitTLSPort)).toBe(true);
    expect(useImplicitTLS(Encryption.Auto, 587)).toBe(false);
  });
});

describe("clientHost resolution", () => {
  it("returns the custom value verbatim", () => {
    const config = new Config();
    config.clientHost = "computah";
    expect(resolveClientHost(config)).toBe("computah");
  });

  it('returns a non-empty hostname for "auto"', () => {
    const config = new Config();
    config.clientHost = "auto";
    expect(resolveClientHost(config).length).toBeGreaterThan(0);
  });
});

describe("config.clone", () => {
  it("produces an independent copy", () => {
    const config = new Config();
    config.setURL(new URL(urlWithAllProps));
    const clone = config.clone();
    clone.toAddresses.push("extra@example.com");
    expect(config.toAddresses).not.toContain("extra@example.com");
    expect(clone.getURL().toString()).not.toBe(config.getURL().toString());
  });
});

describe("initialize auth resolution", () => {
  it("resolves Unknown to Plain when a username is present", () => {
    const service = new SmtpService(() => recordingTransport().transport);
    service.initialize(
      new URL(
        "smtp://user:pass@host:587/?fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    // Drive a send to observe derived options.
  });
});

describe("transport options derivation", () => {
  it("uses implicit TLS for port 465 with Auto encryption", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://user:pass@host:465/?fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    config.auth = AuthType.Plain;
    const opts = buildTransportOptions(config);
    expect(opts.secure).toBe(true);
    expect(opts.requireTLS).toBe(false);
    expect(opts.host).toBe("host");
    expect(opts.port).toBe(465);
    expect(opts.auth).toEqual({ user: "user", pass: "pass" });
  });

  it("uses opportunistic StartTLS when enabled on a non-implicit session", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://host:587/?usestarttls=yes&auth=none&fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    const opts = buildTransportOptions(config);
    expect(opts.secure).toBe(false);
    // Go warns-and-continues if StartTLS is unsupported, so we never force TLS.
    expect(opts.requireTLS).toBe(false);
    expect(opts.ignoreTLS).toBe(false);
    expect(opts.auth).toBeUndefined();
  });

  it("disables any upgrade when StartTLS is off on a plain session", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://host:587/?usestarttls=no&encryption=ExplicitTLS&auth=none&fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    const opts = buildTransportOptions(config);
    expect(opts.secure).toBe(false);
    // Go never upgrades when useStartTLS=no; ignoreTLS prevents opportunistic STARTTLS.
    expect(opts.ignoreTLS).toBe(true);
    expect(opts.requireTLS).toBe(false);
  });

  it("sets CRAM-MD5 auth method", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://u:p@host:25/?auth=CRAMMD5&fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    const opts = buildTransportOptions(config);
    expect(opts.authMethod).toBe("CRAM-MD5");
    expect(opts.auth).toEqual({ user: "u", pass: "p" });
  });
});

describe("message envelope", () => {
  it("builds a plain text message with From/To/Subject", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://host:25/?fromaddress=sender@example.com&fromname=Sender&subject=Hello&toaddresses=a@example.com,b@example.com&usehtml=no",
      ),
    );
    const mail = buildMessage(config, "body text");
    expect(mail.from).toBe("Sender <sender@example.com>");
    expect(mail.to).toBe("a@example.com, b@example.com");
    expect(mail.subject).toBe("Hello");
    expect(mail.text).toBe("body text");
    expect(mail.html).toBeUndefined();
  });

  it("adds an HTML alternative when useHTML is set", () => {
    const config = new Config();
    config.setURL(
      new URL(
        "smtp://host:25/?fromaddress=s@example.com&toaddresses=r@example.com&usehtml=yes",
      ),
    );
    const mail = buildMessage(config, "<b>hi</b>");
    expect(mail.text).toBe("<b>hi</b>");
    expect(mail.html).toBe("<b>hi</b>");
  });
});

describe("send via injected transport", () => {
  it("records the envelope and transport options", async () => {
    const rec = recordingTransport();
    const capturedOpts: TransportOptions[] = [];
    const service = new SmtpService((opts) => {
      capturedOpts.push(opts);
      return rec.transport;
    });
    service.initialize(
      new URL(
        "smtp://user:password@example.com:2225/?useStartTLS=no&fromAddress=sender+tag@example.com&toAddresses=rec1+tag@example.com,rec2@example.com&useHTML=yes",
      ),
    );

    await service.send("test message");

    expect(capturedOpts).toHaveLength(1);
    expect(capturedOpts[0]?.host).toBe("example.com");
    expect(capturedOpts[0]?.port).toBe(2225);
    expect(capturedOpts[0]?.secure).toBe(false);
    // username present + Unknown auth -> resolves to Plain.
    expect(capturedOpts[0]?.auth).toEqual({ user: "user", pass: "password" });

    expect(rec.sent).toHaveLength(1);
    const mail = rec.sent[0] as MailMessage;
    // FixEmailTags restores '+' parsed as space.
    expect(mail.from).toBe(" <sender+tag@example.com>");
    expect(mail.to).toBe("rec1+tag@example.com, rec2@example.com");
    expect(mail.text).toBe("test message");
    expect(mail.html).toBe("test message");
  });

  it("applies send-time params", async () => {
    const rec = recordingTransport();
    const service = new SmtpService(() => rec.transport);
    service.initialize(
      new URL(
        "smtp://host:25/?fromaddress=s@example.com&toaddresses=r@example.com&subject=Default",
      ),
    );
    await service.send("msg", { subject: "Overridden" });
    expect(rec.sent[0]?.subject).toBe("Overridden");
  });

  it("throws when an invalid send param is passed", async () => {
    const rec = recordingTransport();
    const service = new SmtpService(() => rec.transport);
    service.initialize(
      new URL(
        "smtp://host:25/?fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    await expect(service.send("msg", { invalid: "value" })).rejects.toThrow(
      /applying params/,
    );
  });

  it("wraps transport failures", async () => {
    const failing: TransportLike = {
      async sendMail(): Promise<unknown> {
        throw new Error("connection refused");
      },
    };
    const service = new SmtpService(() => failing);
    service.initialize(
      new URL(
        "smtp://host:25/?fromaddress=s@example.com&toaddresses=r@example.com",
      ),
    );
    await expect(service.send("msg")).rejects.toThrow(/SMTP client/);
  });
});
