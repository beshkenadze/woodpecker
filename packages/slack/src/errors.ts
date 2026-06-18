// Port of pkg/services/slack/slack_errors.go

/** Returned whenever the specified token does not match any known formats. */
export const ErrorInvalidToken = new Error("invalid slack token format");

/** Returned if the token uses different separators between parts (of the recognized `/-,`). */
export const ErrorMismatchedTokenSeparators = new Error(
  "invalid webhook token format",
);
