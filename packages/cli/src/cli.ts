#!/usr/bin/env bun
/**
 * shoutrrr CLI entrypoint.
 *
 * Faithful port of `shoutrrr/main.go`. Wires the `send` and `verify`
 * subcommands. `generate` and `docs` are deferred.
 */

import { Command } from "commander";

// Importing the core barrel registers the built-in `logger://` service.
import "./core/index.js";
// Register the remaining 19 services so every scheme resolves.
import "./register-services.js";
import { createSendCommand } from "./commands/send.js";
import { createVerifyCommand } from "./commands/verify.js";
import { EX_USAGE, Result } from "./exit-codes.js";

const VERSION = "0.0.0";

/** Builds the top-level commander program. */
export function createProgram(): Command {
  const program = new Command("woodpecker");
  program.description("Woodpecker CLI — notification sender").version(VERSION);
  program.addCommand(createSendCommand());
  program.addCommand(createVerifyCommand());
  return program;
}

// Run only when executed directly (not when imported by tests).
if (import.meta.main) {
  createProgram()
    .parseAsync(process.argv)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${message}\n`);
      // Honor a Result's exit code; otherwise default to ExUsage (matches main.go).
      process.exitCode = err instanceof Result ? err.exitCode : EX_USAGE;
    });
}
