// Port of Go pkg/services/smtp/smtp_encmethod.go.

import type { EnumFormatter } from "@woodpecker/core";
import { createEnumFormatter } from "@woodpecker/core";

/** Encryption is the transport encryption method (Go: encMethod). */
export enum Encryption {
  /** No encryption. */
  None = 0,
  /** TLS initiated via StartTLS. */
  ExplicitTLS = 1,
  /** TLS used for the whole session. */
  ImplicitTLS = 2,
  /** ImplicitTLS for port 465, otherwise explicit if supported. */
  Auto = 3,
}

/** encryptionFormatter is the EnumFormatter for Encryption (Go: EncMethods.Enum). */
export const encryptionFormatter: EnumFormatter = createEnumFormatter([
  "None",
  "ExplicitTLS",
  "ImplicitTLS",
  "Auto",
]);

/** ImplicitTLSPort is the de facto standard SMTPS port (Go: ImplicitTLSPort). */
export const ImplicitTLSPort = 465;

/** useImplicitTLS mirrors Go smtp.useImplicitTLS. */
export function useImplicitTLS(encryption: Encryption, port: number): boolean {
  switch (encryption) {
    case Encryption.ImplicitTLS:
      return true;
    case Encryption.Auto:
      return port === ImplicitTLSPort;
    default:
      return false;
  }
}
