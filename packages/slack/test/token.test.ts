import { describe, expect, it } from "bun:test";
import {
  ErrorInvalidToken,
  ErrorMismatchedTokenSeparators,
} from "../src/errors.js";
import { parseToken, Token } from "../src/token.js";

describe("Token", () => {
  describe("parse / normalize", () => {
    it("normalizes a webhook-style token (no type) into hook:p1-p2-p3", () => {
      const token = parseToken("AAAAAAAAA/BBBBBBBBB/123456789123456789123456");
      expect(token.getPropValue()).toBe(
        "hook:AAAAAAAAA-BBBBBBBBB-123456789123456789123456",
      );
      expect(token.isAPIToken()).toBe(false);
    });

    it("normalizes an xoxb API token", () => {
      const token = parseToken(
        "xoxb:AAAAAAAAA-BBBBBBBBB-123456789123456789123456",
      );
      expect(token.typeIdentifier()).toBe("xoxb");
      expect(token.isAPIToken()).toBe(true);
    });

    it("throws ErrorInvalidToken when shorter than 3 chars", () => {
      expect(() => parseToken("ab")).toThrow(ErrorInvalidToken);
    });

    it("throws ErrorInvalidToken when part A is not at least 9 chars", () => {
      expect(() =>
        parseToken("12345678/123456789/123456789123456789123456"),
      ).toThrow(ErrorInvalidToken);
    });

    it("throws ErrorInvalidToken when part C is not at least 24 chars", () => {
      expect(() =>
        parseToken("123456789/123456789/12345678912345678912345"),
      ).toThrow(ErrorInvalidToken);
    });

    it("throws ErrorMismatchedTokenSeparators when separators differ", () => {
      expect(() =>
        parseToken("AAAAAAAAA/BBBBBBBBB-123456789123456789123456"),
      ).toThrow(ErrorMismatchedTokenSeparators);
    });
  });

  describe("credentials", () => {
    it("returns a valid webhook URL for the given token", () => {
      const tokenPath = "AAAAAAAAA/BBBBBBBBB/123456789123456789123456";
      const token = parseToken(tokenPath);
      expect(token.webhookURL()).toBe(
        `https://hooks.slack.com/services/${tokenPath}`,
      );
    });

    it("returns a valid authorization header value for the given token", () => {
      const token = parseToken(
        "xoxb:AAAAAAAAA-BBBBBBBBB-123456789123456789123456",
      );
      expect(token.authorization()).toBe(
        "Bearer xoxb-AAAAAAAAA-BBBBBBBBB-123456789123456789123456",
      );
    });

    it("userInfo splits into 4-char identifier and remainder", () => {
      const token = parseToken(
        "xoxb:AAAAAAAAA-BBBBBBBBB-123456789123456789123456",
      );
      expect(token.userInfo()).toEqual({
        username: "xoxb",
        password: "AAAAAAAAA-BBBBBBBBB-123456789123456789123456",
      });
    });
  });

  it("an empty Token has empty prop value", () => {
    const token = new Token();
    expect(token.getPropValue()).toBe("");
  });
});
