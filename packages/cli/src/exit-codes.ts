/**
 * CLI exit codes and Result helper.
 *
 * Faithful port of `shoutrrr/cmd/exit_codes.go`.
 */

/** ExSuccess signals that everything went as expected. */
export const EX_SUCCESS = 0;
/** ExUsage signals that the app was not started with the correct arguments. */
export const EX_USAGE = 64;
/** ExUnavailable signals that the app failed to perform the intended task. */
export const EX_UNAVAILABLE = 69;
/** ExConfig signals that the task failed due to a configuration error. */
export const EX_CONFIG = 78;

/** Result carries the final exit message and code for a CLI session. */
export class Result extends Error {
  readonly exitCode: number;

  constructor(exitCode: number, message: string) {
    super(message);
    this.name = "Result";
    this.exitCode = exitCode;
  }
}

/** Port of cmd.InvalidUsage. */
export function invalidUsage(message: string): Result {
  return new Result(EX_USAGE, message);
}

/** Port of cmd.TaskUnavailable. */
export function taskUnavailable(message: string): Result {
  return new Result(EX_UNAVAILABLE, message);
}

/** Port of cmd.ConfigurationError. */
export function configurationError(message: string): Result {
  return new Result(EX_CONFIG, message);
}
