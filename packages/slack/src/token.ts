// Port of pkg/services/slack/slack_token.go

import type { ConfigProp } from "@woodpecker/core";
import { ErrorInvalidToken, ErrorMismatchedTokenSeparators } from "./errors.js";

const hookTokenIdentifier = "hook";

const webhookBase = "https://hooks.slack.com/services/";

// (?:(?P<type>xox.|hook)[-:]|:?)(?P<p1>[A-Z0-9]{9,})(?P<s1>[-/,])(?P<p2>[A-Z0-9]{9,})(?P<s2>[-/,])(?P<p3>[A-Za-z0-9]{24,})
const tokenPattern =
  /(?:(xox.|hook)[-:]|:?)([A-Z0-9]{9,})([-/,])([A-Z0-9]{9,})([-/,])([A-Za-z0-9]{24,})/;

/**
 * Token is a Slack API token or a Slack webhook token.
 * Implements ConfigProp (spans url:"user,pass").
 */
export class Token implements ConfigProp {
  private raw = "";

  /** SetFromProp updates the token state from the passed string. */
  setFromProp(propValue: string): void {
    if (propValue.length < 3) {
      throw ErrorInvalidToken;
    }

    const match = tokenPattern.exec(propValue);
    if (match === null) {
      throw ErrorInvalidToken;
    }

    let typeIdentifier = match[1] ?? "";
    if (typeIdentifier === "") {
      typeIdentifier = hookTokenIdentifier;
    }

    const part1 = match[2] as string;
    const sep1 = match[3] as string;
    const part2 = match[4] as string;
    const sep2 = match[5] as string;
    const part3 = match[6] as string;

    this.raw = `${typeIdentifier}:${part1}-${part2}-${part3}`;

    if (sep1 !== sep2) {
      throw ErrorMismatchedTokenSeparators;
    }
  }

  /** GetPropValue returns a deserializable string representation of the token. */
  getPropValue(): string {
    return this.raw;
  }

  /** TypeIdentifier returns the type identifier of the token (first 4 chars). */
  typeIdentifier(): string {
    return this.raw.slice(0, 4);
  }

  /** String returns the token in normalized format with dashes (-) as separator. */
  toString(): string {
    return this.raw;
  }

  /** userInfo returns the {username, password} populated from the token. */
  userInfo(): { username: string; password: string } {
    return { username: this.raw.slice(0, 4), password: this.raw.slice(5) };
  }

  /** IsAPIToken returns whether the identifier is anything but the webhook identifier (`hook`). */
  isAPIToken(): boolean {
    return this.typeIdentifier() !== hookTokenIdentifier;
  }

  /** WebhookURL returns the corresponding Webhook URL for the Token. */
  webhookURL(): string {
    let out = webhookBase;
    for (let i = 5; i < this.raw.length; i++) {
      const c = this.raw[i];
      out += c === "-" ? "/" : c;
    }
    return out;
  }

  /** Authorization returns the `Authorization` HTTP header value for the Token. */
  authorization(): string {
    return `Bearer ${this.raw.slice(0, 4)}-${this.raw.slice(5)}`;
  }
}

/** ParseToken parses and normalizes a token string. */
export function parseToken(str: string): Token {
  const token = new Token();
  token.setFromProp(str);
  return token;
}
