/**
 * Config tree rendering for the `verify` command.
 *
 * Faithful port of `pkg/format`:
 *  - format.go        (ParseBool, PrintBool, IsNumber)
 *  - format_colorize.go (ANSI colorizers)
 *  - render_console.go  (ConsoleTreeRenderer.RenderTree)
 *  - format.go entry points GetConfigFormat / ColorFormatTree
 *
 * The Go implementation builds a ContainerNode tree via reflection over the
 * config struct. This port consumes the FieldInfo list a config exposes via
 * `configFields()`, which is the equivalent metadata, and renders it the same
 * way Go's ConsoleTreeRenderer.RenderTree does. The `verify` command renders
 * with values (ColorFormatTree(node, true)); type-only rendering is the
 * withValues=false branch.
 */

import type { FieldInfo, ServiceConfig } from "./types.js";

// --- ANSI colorizers (port of format_colorize.go using fatih/color codes) ---

const RESET = "\x1b[0m";

function wrap(code: string, value: string): string {
  return `${code}${value}${RESET}`;
}

// fatih/color FgHiX codes (high-intensity foreground colors).
export const colorizeDesc = (s: string): string => wrap("\x1b[90m", s); // FgHiBlack
export const colorizeTrue = (s: string): string => wrap("\x1b[92m", s); // FgHiGreen
export const colorizeFalse = (s: string): string => wrap("\x1b[91m", s); // FgHiRed
export const colorizeNumber = (s: string): string => wrap("\x1b[94m", s); // FgHiBlue
export const colorizeString = (s: string): string => wrap("\x1b[93m", s); // FgHiYellow
export const colorizeEnum = (s: string): string => wrap("\x1b[96m", s); // FgHiCyan
export const colorizeCyan = (s: string): string => wrap("\x1b[36m", s); // CyanString (type name)
// ColorizeContainer aliases ColorizeDesc in Go.
export const colorizeContainer = colorizeDesc;

// --- value helpers (port of format.go) ---

/** Port of format.ParseBool. Returns [parsedValue, ok]. */
export function parseBool(
  value: string,
  defaultValue: boolean,
): [boolean, boolean] {
  switch (value.toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "y":
      return [true, true];
    case "false":
    case "0":
    case "no":
    case "n":
      return [false, true];
    default:
      return [defaultValue, false];
  }
}

/**
 * Port of format.IsNumber (Go strconv.ParseFloat(value, 64) == nil).
 *
 * Go's ParseFloat accepts decimal and scientific notation, a leading sign,
 * and "Inf"/"NaN"; it rejects whitespace, JS-style 0x/0b/0o radix prefixes,
 * and underscore separators. JS `Number()` diverges on all of those, so this
 * uses an explicit pattern plus the Inf/NaN special cases instead.
 */
export function isNumber(value: string): boolean {
  if (value === "") {
    return false;
  }
  const lower = value.toLowerCase().replace(/^[+-]/, "");
  if (lower === "inf" || lower === "infinity" || lower === "nan") {
    return true;
  }
  // Decimal float with optional sign, fraction and exponent (no radix prefixes,
  // no underscores, no surrounding whitespace) — matches ParseFloat's grammar.
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
}

/** Port of format.ColorizeValue. */
export function colorizeValue(value: string, isEnum: boolean): string {
  if (isEnum) {
    return colorizeEnum(value);
  }
  const [isTrue, isType] = parseBool(value, false);
  if (isType) {
    return isTrue ? colorizeTrue(value) : colorizeFalse(value);
  }
  if (isNumber(value)) {
    return colorizeNumber(value);
  }
  return colorizeString(value);
}

/** Repeat a space `count` times, never fewer than `min`. */
function pad(count: number, min = 1): string {
  return " ".repeat(Math.max(count, min));
}

/**
 * Port of format.GetServiceConfig — returns the config exposed by a service.
 */
export function getServiceConfig(service: {
  getConfig(): ServiceConfig;
}): ServiceConfig {
  return service.getConfig();
}

/**
 * Port of format.GetConfigFormat — produces the sorted field list (the tree
 * root's items) for a config.
 */
export function getConfigFormat(config: ServiceConfig): FieldInfo[] {
  const fields = [...config.configFields()];
  // Go sorts node items by field name (sortNodeItems).
  fields.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return fields;
}

/**
 * Port of format.ColorFormatTree → ConsoleTreeRenderer.RenderTree.
 *
 * `withValues` mirrors Go's ColorFormatTree(node, withValues): the `verify`
 * command passes `true`, which uses preLen=30 and renders each field's current
 * value; `false` uses preLen=16 and substitutes the field type name.
 */
export function colorFormatTree(
  fields: FieldInfo[],
  withValues = true,
): string {
  let maxKeyLength = 0;
  for (const field of fields) {
    maxKeyLength = Math.max(field.name.length, maxKeyLength);
  }

  let out = "";

  for (const field of fields) {
    const fieldKey = field.name;
    out += fieldKey;
    // Go pads with spaces from len(fieldKey) up to and including maxKeyLength.
    for (let i = fieldKey.length; i <= maxKeyLength; i++) {
      out += " ";
    }

    let preLen = 16;
    let valueLen: number;

    if (withValues) {
      // Render the field's current value (port of writeNodeValue for a scalar).
      preLen = 30;
      const value = field.value ?? "";
      out += colorizeValue(value, field.enumFormatter !== undefined);
      valueLen = value.length;
    } else {
      // No values supplied: substitute the value with the type name.
      let typeName = field.typeName;
      if (field.enumFormatter !== undefined) {
        typeName = "option";
      }
      valueLen = typeName.length;
      out += colorizeCyan(typeName);
    }

    out += pad(preLen - valueLen);
    out += colorizeDesc(field.description);
    out += pad(60 - field.description.length);

    if (field.template.length > 0) {
      out += ` <Template: ${colorizeString(field.template)}>`;
    }

    if (field.defaultValue.length > 0) {
      out += ` <Default: ${colorizeValue(field.defaultValue, field.enumFormatter !== undefined)}>`;
    }

    if (field.required) {
      out += ` <${colorizeFalse("Required")}>`;
    }

    if (field.keys.length > 1) {
      out += " <Aliases: ";
      for (let i = 0; i < field.keys.length; i++) {
        // Skip primary alias (same as the field name).
        if (i === 0) {
          continue;
        }
        if (i > 1) {
          out += ", ";
        }
        out += colorizeString(field.keys[i] ?? "");
      }
      out += ">";
    }

    if (field.enumFormatter !== undefined) {
      out += colorizeContainer(" [");
      const names = field.enumFormatter.names();
      for (let i = 0; i < names.length; i++) {
        if (i !== 0) {
          out += ", ";
        }
        out += colorizeEnum(names[i] ?? "");
      }
      out += colorizeContainer("]");
    }

    out += "\n";
  }

  return out;
}
