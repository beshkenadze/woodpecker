/**
 * @woodpecker/cli public exports.
 *
 * The CLI is primarily a binary (see ./cli.ts), but the command builders and
 * core re-exports are exposed for programmatic use and testing.
 */

export { createProgram } from "./cli.js";
export type { SendOptions, SendResult } from "./commands/send.js";
export { createSendCommand, runSend } from "./commands/send.js";
export { createVerifyCommand, runVerify } from "./commands/verify.js";
export * from "./core/index.js";
export * from "./exit-codes.js";
