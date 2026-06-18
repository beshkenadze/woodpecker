/**
 * `verify` command.
 *
 * Faithful port of `shoutrrr/cmd/verify/verify.go`. Parses the URL into a
 * service config and prints the resolved config tree, without sending.
 */

import { Command } from "commander";

import { colorFormatTree, getConfigFormat } from "../core/format.js";
import { ServiceRouter } from "../core/router.js";
import type { ServiceConfig } from "../core/types.js";

/**
 * Core verify logic, decoupled from commander for testability.
 *
 * Returns the rendered config tree string. Throws on an unresolvable URL.
 *
 * Services that expose CLI-style config introspection (`getConfig()` returning
 * a config with `configFields()`) render the full field tree. Services that do
 * not (the externally-ported services, pending the core-fold cleanup) report a
 * successful-validation line — `locate()` succeeding already proves the URL
 * parsed into a valid config.
 */
export function runVerify(rawURL: string): string {
  const router = new ServiceRouter();
  const service = router.locate(rawURL);
  const introspectable = service as unknown as { getConfig?: () => unknown };
  const config =
    typeof introspectable.getConfig === "function"
      ? introspectable.getConfig()
      : undefined;
  // The full config tree requires CLI-style introspection: a config exposing
  // `configFields()`. Services that expose neither `getConfig()` nor a config
  // with `configFields()` (the externally-ported services, pending the
  // core-fold cleanup) report a successful-validation line instead — `locate()`
  // succeeding already proves the URL parsed into a valid config.
  const fielded = config as { configFields?: () => unknown } | undefined;
  if (fielded === undefined || typeof fielded.configFields !== "function") {
    // Normalize the scheme the way the router does (strip any "+suffix").
    const scheme = (
      new URL(rawURL).protocol.replace(/:$/, "").split("+")[0] ?? ""
    ).toLowerCase();
    return `Service '${scheme}' URL is valid.\n`;
  }
  const fields = getConfigFormat(config as ServiceConfig);
  return colorFormatTree(fields);
}

/** Builds the commander `verify` subcommand. */
export function createVerifyCommand(): Command {
  const cmd = new Command("verify");
  cmd
    .description("Verify the validity of a notification service URL")
    .requiredOption("-u, --url <url>", "The notification url")
    .action((opts: { url: string }) => {
      let tree: string;
      try {
        tree = runVerify(opts.url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stdout.write(`error verifying URL: ${message}\n`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write(tree);
    });
  return cmd;
}
