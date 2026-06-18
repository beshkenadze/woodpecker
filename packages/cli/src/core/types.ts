/**
 * Core type definitions for the shoutrrr notification library.
 *
 * Faithful TypeScript port of `pkg/types` (service.go, service_config.go,
 * params.go, enum_formatter.go, std_logger.go).
 *
 * NOTE: This is the vendored subset required by the CLI. The full type set and
 * the complete service registry are wired up in the integration pass, where all
 * 20 services self-register via their descriptors.
 */

/** Params is a map of message parameters (e.g. "title"). Port of types.Params. */
export type Params = Record<string, string>;

/**
 * Logger is the minimal logging interface used by services to write progress
 * logs. Port of the relevant subset of types.StdLogger.
 */
export interface Logger {
  logf(format: string, ...args: unknown[]): void;
}

/**
 * EnumFormatter translates enums between strings and numbers.
 * Port of types.EnumFormatter.
 */
export interface EnumFormatter {
  print(e: number): string;
  parse(s: string): number;
  names(): string[];
}

/**
 * FieldInfo is the metadata about a single config field, used to render the
 * config tree in the `verify` command. Faithful port of the relevant subset of
 * format.FieldInfo. In Go these are derived from struct tags via reflection; in
 * this TS port a service config supplies them directly via `configFields()`.
 */
export interface FieldInfo {
  name: string;
  /** The displayed type name (e.g. "string", "int", "bool", "option"). */
  typeName: string;
  description: string;
  defaultValue: string;
  template: string;
  required: boolean;
  /** Field aliases. The first entry mirrors the field name (skipped on render). */
  keys: string[];
  /** Optional enum formatter; when present the type renders as a value list. */
  enumFormatter?: EnumFormatter;
  /**
   * The field's current serialized value, rendered by `verify`
   * (ColorFormatTree withValues=true). Defaults to "" when not supplied.
   */
  value?: string;
}

/**
 * ServiceConfig is the common interface for all service configurations.
 * Port of types.ServiceConfig (Enummer + GetURL + SetURL), extended with
 * `configFields()` which replaces Go's reflection-based field discovery.
 */
export interface ServiceConfig {
  getURL(): URL;
  setURL(url: URL): void;
  enums(): Record<string, EnumFormatter>;
  /** Returns the config field metadata used to render the verify config tree. */
  configFields(): FieldInfo[];
}

/**
 * Service is the public common interface for all notification services.
 * Port of types.Service (Sender + Templater + Initialize + SetLogger).
 */
export interface Service {
  initialize(url: URL, logger?: Logger): void;
  setLogger(logger: Logger): void;
  send(message: string, params?: Params): Promise<void>;
  /** Returns the resolved configuration of the service (used by `verify`). */
  getConfig(): ServiceConfig;
}
