// Matrix service configuration — port of Go matrix_config.go.
import {
  EnumlessConfig,
  type FieldSchema,
  PropKeyResolver,
} from "@woodpecker-js/core";

export const Scheme = "matrix";
export const defaultDeviceID = "shoutrrr";

// decodeURIComponentSafe tolerates malformed percent-escapes (e.g. a literal
// "%" in a password/token) by returning the raw value instead of throwing.
function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Query (key-tagged) fields. Order and aliases mirror the Go struct.
// QueryFields count = 5: disabletls, deviceid, rooms, room (alias), title.
// Keys are lower-cased (as Go's PropKeyResolver lower-cases every key tag), so
// buildQuery emits them and case-insensitive URL reads in setURLWith resolve.
export const matrixFields: FieldSchema[] = [
  { name: "disableTLS", type: "bool", key: ["disabletls"], default: "No" },
  {
    name: "deviceID",
    type: "string",
    key: ["deviceid"],
    default: defaultDeviceID,
    desc: "Device ID for password login; keeps Matrix homeservers from creating a new device for each login",
  },
  {
    name: "rooms",
    type: "string[]",
    key: ["rooms", "room"],
    desc: "Room aliases, or with ! prefix, room IDs",
  },
  { name: "title", type: "string", key: ["title"], default: "" },
];

export class Config extends EnumlessConfig {
  user = "";
  password = "";
  disableTLS = false;
  deviceID = defaultDeviceID;
  host = "";
  rooms: string[] = [];
  title = "";

  newResolver(): PropKeyResolver {
    return new PropKeyResolver(this, matrixFields);
  }

  // cloneForParams returns a resolver bound to a shallow copy of this config.
  // Applying params through it validates them (surfacing errors) without
  // mutating the live config — mirroring Go's `config := *s.config`.
  cloneForParams(): PropKeyResolver {
    const copy: Config = Object.assign(
      Object.create(Config.prototype) as Config,
      this,
    );
    copy.rooms = [...this.rooms];
    return new PropKeyResolver(copy, matrixFields);
  }

  getURL(): URL {
    return new URL(this.getURLString());
  }

  setURL(url: URL): void {
    this.setURLWith(this.newResolver(), url);
  }

  // getURLString builds the canonical URL string, matching Go's url.URL with
  // ForceQuery=true and an empty path (no trailing slash before "?").
  getURLString(): string {
    const query = this.newResolver().buildQuery();
    const userInfo =
      this.user !== "" || this.password !== ""
        ? `${encodeURIComponent(this.user)}:${encodeURIComponent(this.password)}@`
        : "";
    return `${Scheme}://${userInfo}${this.host}?${query}`;
  }

  setURLWith(resolver: PropKeyResolver, url: URL): void {
    this.deviceID = defaultDeviceID;
    this.user = decodeURIComponentSafe(url.username);
    this.password = decodeURIComponentSafe(url.password);
    this.host = url.host;

    // Read each distinct query key (case preserved from the URL) and apply its
    // FIRST value, mirroring Go's `resolver.Set(key, vals[0])`. core's
    // PropKeyResolver.set lower-cases on lookup, so mixed-case URL keys like
    // `disableTLS`/`deviceID` resolve correctly; an unknown key throws.
    const seen = new Set<string>();
    for (const key of url.searchParams.keys()) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const value = url.searchParams.get(key);
      if (value !== null) {
        resolver.set(key, value);
      }
    }

    this.rooms = this.rooms.map((room) => {
      if (room.length === 0) {
        return room;
      }
      const first = room[0];
      if (first !== "#" && first !== "!") {
        return `#${room}`;
      }
      return room;
    });
  }
}
