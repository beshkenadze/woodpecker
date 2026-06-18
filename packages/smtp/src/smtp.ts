// Port of Go pkg/services/smtp/smtp.go, using nodemailer for transport.
import { hostname } from "node:os";
import type { Logger, Params, Service } from "@woodpecker/core";
import { Standard } from "@woodpecker/core";
import nodemailer from "nodemailer";
import { AuthType } from "./authType.js";
import { Config } from "./config.js";
import { useImplicitTLS } from "./encMethod.js";

/**
 * MailMessage is the message envelope handed to a transport (subset of
 * nodemailer SendMailOptions that this service populates).
 */
export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** TransportLike is the minimal transport contract (subset of nodemailer.Transporter). */
export interface TransportLike {
  sendMail(message: MailMessage): Promise<unknown>;
}

/**
 * TransportOptions mirrors the nodemailer createTransport options this service
 * derives from the config. Kept explicit so tests can assert them.
 */
export interface TransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  ignoreTLS: boolean;
  name: string;
  tls: { servername: string };
  auth?: {
    user: string;
    pass: string;
    type?: "OAuth2";
    accessToken?: string;
  };
  authMethod?: string;
}

/** TransportFactory builds a transport from derived options (injectable for tests). */
export type TransportFactory = (options: TransportOptions) => TransportLike;

const defaultTransportFactory: TransportFactory = (options) =>
  nodemailer.createTransport(options) as unknown as TransportLike;

/** SmtpService sends notifications to e-mail addresses via SMTP (Go: smtp.Service). */
export class SmtpService implements Service {
  private readonly standard = new Standard();
  private readonly transportFactory: TransportFactory;
  private config: Config | undefined;

  constructor(transportFactory: TransportFactory = defaultTransportFactory) {
    this.transportFactory = transportFactory;
  }

  setLogger(logger: Logger): void {
    this.standard.setLogger(logger);
  }

  /** initialize loads the config from the URL (Go: Service.Initialize). */
  initialize(url: URL, logger?: Logger): void {
    if (logger) {
      this.standard.setLogger(logger);
    }

    const config = new Config();
    config.setURL(url);

    // Resolve Unknown auth: Plain when a username is present, else None.
    if (config.auth === AuthType.Unknown) {
      config.auth = config.username !== "" ? AuthType.Plain : AuthType.None;
    }

    this.config = config;
  }

  /** send delivers the message to all recipients (Go: Service.Send). */
  async send(message: string, params?: Params): Promise<void> {
    if (!this.config) {
      throw new Error("service not initialized");
    }

    const config = this.config.clone();
    const err = config.updateFromParams(params);
    if (err) {
      throw new Error(`error applying params to send config: ${err.message}`);
    }

    config.fixEmailTags();

    const transport = this.transportFactory(buildTransportOptions(config));
    const mail = buildMessage(config, message);

    try {
      await transport.sendMail(mail);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`error getting SMTP client: ${reason}`);
    }

    this.standard.logf(
      'Mail successfully sent to "%s"!\n',
      config.toAddresses.join(", "),
    );
  }
}

/**
 * resolveClientHost mirrors Go Service.resolveClientHost. "auto" maps to the
 * OS hostname; otherwise the configured value is returned verbatim.
 */
export function resolveClientHost(config: Config): string {
  if (config.clientHost !== "auto") {
    return config.clientHost;
  }
  try {
    return hostname();
  } catch {
    return "localhost";
  }
}

/** buildTransportOptions derives nodemailer options from the config. */
export function buildTransportOptions(config: Config): TransportOptions {
  const secure = useImplicitTLS(config.encryption, config.port);
  // Go gates ALL StartTLS logic behind `if UseStartTLS && !implicit`, and when
  // the server does not advertise StartTLS it only warns and continues in plain
  // text (never errors). So we do NOT force TLS-or-fail (requireTLS stays false)
  // and rely on opportunistic STARTTLS; when StartTLS is disabled on a non-secure
  // session we tell nodemailer to never upgrade (ignoreTLS), matching Go's guard.
  const requireTLS = false;
  const ignoreTLS = !config.useStartTLS && !secure;

  const options: TransportOptions = {
    host: config.host,
    port: config.port,
    secure,
    requireTLS,
    ignoreTLS,
    name: resolveClientHost(config),
    tls: { servername: config.host },
  };

  switch (config.auth) {
    case AuthType.None:
      break;
    case AuthType.Plain:
      options.auth = { user: config.username, pass: config.password };
      break;
    case AuthType.CRAMMD5:
      options.auth = { user: config.username, pass: config.password };
      options.authMethod = "CRAM-MD5";
      break;
    case AuthType.OAuth2:
      options.auth = {
        type: "OAuth2",
        user: config.username,
        pass: config.password,
        accessToken: config.password,
      };
      break;
    default:
      throw new Error(`unknown auth type: ${config.auth}`);
  }

  return options;
}

/** buildMessage derives the mail envelope/body from the config (Go: getHeaders + body). */
export function buildMessage(config: Config, message: string): MailMessage {
  const mail: MailMessage = {
    from: `${config.fromName} <${config.fromAddress}>`,
    to: config.toAddresses.join(", "),
    subject: config.subject,
    text: message,
  };

  if (config.useHTML) {
    // multipart/alternative: nodemailer emits both parts when text + html set.
    mail.html = message;
  }

  return mail;
}
