// Port of Go pkg/services/smtp/smtp_authtype.go.

import type { EnumFormatter } from "@woodpecker-js/core";
import { createEnumFormatter } from "@woodpecker-js/core";

/** AuthType is the SMTP authentication method (Go: authType). */
export enum AuthType {
  None = 0,
  Plain = 1,
  CRAMMD5 = 2,
  Unknown = 3,
  OAuth2 = 4,
}

/** authTypeFormatter is the EnumFormatter for AuthType (Go: AuthTypes.Enum). */
export const authTypeFormatter: EnumFormatter = createEnumFormatter([
  "None",
  "Plain",
  "CRAMMD5",
  "Unknown",
  "OAuth2",
]);
