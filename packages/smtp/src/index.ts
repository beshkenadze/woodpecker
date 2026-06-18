// @woodpecker/smtp public API.

export type {
  EnumFormatter,
  Logger,
  Params,
  Service,
  ServiceConfig,
} from "@woodpecker/core";
export { AuthType, authTypeFormatter } from "./authType.js";
export { Config, DefaultPort, Scheme, smtpFieldSchema } from "./config.js";
export {
  Encryption,
  encryptionFormatter,
  ImplicitTLSPort,
  useImplicitTLS,
} from "./encMethod.js";
export type {
  MailMessage,
  TransportFactory,
  TransportLike,
  TransportOptions,
} from "./smtp.js";
export {
  buildMessage,
  buildTransportOptions,
  resolveClientHost,
  SmtpService,
} from "./smtp.js";

import type { Service } from "@woodpecker/core";
import { SmtpService } from "./smtp.js";

/** descriptor registers this service with the scheme registry. */
export const descriptor: { schemes: string[]; factory: () => Service } = {
  schemes: ["smtp"],
  factory: (): Service => new SmtpService(),
};
