/**
 * `send` command.
 *
 * Faithful port of `shoutrrr/cmd/send/send.go`. Sends a notification to one or
 * more service URLs concurrently, reporting per-URL success/failure, and exits
 * non-zero if any send fails.
 */

import { Command } from "commander";

import { ServiceRouter } from "../core/router.js";
import type { Logger, Params } from "../core/types.js";
import { configurationError, taskUnavailable } from "../exit-codes.js";
import { ellipsis, removeDuplicates } from "../util.js";

/** Options resolved from the command-line flags. */
export interface SendOptions {
  urls: string[];
  message: string;
  title?: string;
  verbose: boolean;
  /** Where to read the message from when `message === "-"`. Defaults to process.stdin. */
  stdin?: () => Promise<string>;
  /** Where progress/diagnostic logs are written. Defaults to process.stderr. */
  logf?: (line: string) => void;
}

/** The outcome for a single URL. */
export interface SendResult {
  url: string;
  error?: Error;
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Uint8Array);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Core send logic, decoupled from commander for testability.
 *
 * Returns the per-URL results. Throws a {@link Result} (via taskUnavailable /
 * configurationError) on a fatal error, mirroring the Go `run` function.
 */
export async function runSend(options: SendOptions): Promise<SendResult[]> {
  const logf =
    options.logf ??
    ((line: string): void => void process.stderr.write(`${line}\n`));
  const readMessage = options.stdin ?? readStdin;

  const urls = removeDuplicates(options.urls);
  let message = options.message;
  const title = options.title ?? "";

  if (message === "-") {
    logf("Reading from STDIN...");
    message = await readMessage();
    logf(`Read ${Buffer.byteLength(message, "utf8")} byte(s)`);
  }

  let logger: Logger | undefined;
  if (options.verbose) {
    let urlsPrefix = "URLs:";
    for (const url of urls) {
      logf(`${urlsPrefix} ${url}`);
      // Only display the "URLs:" prefix for the first line; indent the rest.
      urlsPrefix = " ".repeat("URLs:".length);
    }
    logf(`Message: ${ellipsis(message, 100)}`);
    if (title !== "") {
      logf(`Title: ${title}`);
    }
    logger = {
      logf: (format: string, ...args: unknown[]): void =>
        logf(simpleFormat(format, args)),
    };
  }

  const params: Params = {};
  if (title !== "") {
    params.title = title;
  }

  // Build a router per URL so each result maps back to its URL (the Go CLI
  // uses a single router; we track per-URL outcomes for clearer reporting).
  const results: SendResult[] = await Promise.all(
    urls.map(async (url): Promise<SendResult> => {
      let router: ServiceRouter;
      try {
        router = new ServiceRouter(logger);
        router.addService(url);
      } catch (err) {
        // A bad URL/unknown service is a configuration error. Go double-wraps:
        // router.New -> "error initializing router services: <err>", then send
        // -> "error invoking send: <that>".
        const wrapped = `error initializing router services: ${errMessage(err)}`;
        return {
          url,
          error: configurationError(`error invoking send: ${wrapped}`),
        };
      }
      const errs = await router.sendAsync(message, params);
      if (errs.length > 0) {
        return { url, error: taskUnavailable(errMessage(errs[0])) };
      }
      logf("Notification sent");
      return { url };
    }),
  );

  return results;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Minimal printf-style %s/%v/%d substitution for the verbose logger. */
function simpleFormat(format: string, args: unknown[]): string {
  let i = 0;
  return format.replace(/%[svd]/g, () =>
    i < args.length ? String(args[i++]) : "",
  );
}

/** Builds the commander `send` subcommand. */
export function createSendCommand(): Command {
  const cmd = new Command("send");
  cmd
    .description("Send a notification using a service url")
    .requiredOption("-u, --url <url...>", "The notification url (repeatable)")
    .requiredOption(
      "-m, --message <message>",
      "The message to send to the notification url, or - to read message from stdin",
    )
    .option(
      "-t, --title <title>",
      "The title used for services that support it",
    )
    .option("-v, --verbose", "Verbose output", false)
    .action(
      async (opts: {
        url: string[];
        message: string;
        title?: string;
        verbose?: boolean;
      }) => {
        const results = await runSend({
          urls: opts.url,
          message: opts.message,
          title: opts.title,
          verbose: opts.verbose ?? false,
        });

        const failed = results.find((r) => r.error !== undefined);
        if (failed?.error !== undefined) {
          process.stderr.write(`${failed.error.message}\n`);
          const exitCode =
            "exitCode" in failed.error
              ? (failed.error as { exitCode: number }).exitCode
              : 1;
          process.exitCode = exitCode;
        }
      },
    );
  return cmd;
}
