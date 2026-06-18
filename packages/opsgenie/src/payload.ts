import type { ConfigProp } from "@woodpecker/core";

const OPSGENIE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Detects OpsGenie IDs in the form 4513b7ea-3b91-438f-b7e4-e3e54af9147c. */
export function isOpsGenieID(str: string): boolean {
  return OPSGENIE_ID.test(str);
}

/**
 * Entity represents either a user or a team. The different variations are:
 *
 *   { "id":"4513b7ea-3b91-438f-b7e4-e3e54af9147c", "type":"team" }
 *   { "name":"rocket_team", "type":"team" }
 *   { "id":"bb4d9938-c3c2-455d-aaab-727aa701c0d8", "type":"user" }
 *   { "username":"trinity@opsgenie.com", "type":"user" }
 *
 * Port of Go pkg/services/opsgenie Entity (implements ConfigProp).
 */
export class Entity implements ConfigProp {
  type = "";
  id = "";
  name = "";
  username = "";

  constructor(init?: {
    type?: string;
    id?: string;
    name?: string;
    username?: string;
  }) {
    if (init) {
      this.type = init.type ?? "";
      this.id = init.id ?? "";
      this.name = init.name ?? "";
      this.username = init.username ?? "";
    }
  }

  /** SetFromProp deserializes an entity from a "type:identifier" string. */
  setFromProp(propValue: string): void {
    const elements = propValue.split(":");
    if (elements.length !== 2) {
      throw new Error(
        `invalid entity, should have two elments separated by colon: "${propValue}"`,
      );
    }
    this.type = elements[0] as string;
    const identifier = elements[1] as string;

    if (isOpsGenieID(identifier)) {
      this.id = identifier;
    } else if (this.type === "team") {
      this.name = identifier;
    } else if (this.type === "user") {
      this.username = identifier;
    } else {
      throw new Error(`invalid entity, unexpected entity type: "${this.type}"`);
    }
  }

  /** GetPropValue serializes an entity to a "type:identifier" string. */
  getPropValue(): string {
    let identifier: string;
    if (this.id !== "") {
      identifier = this.id;
    } else if (this.name !== "") {
      identifier = this.name;
    } else if (this.username !== "") {
      identifier = this.username;
    } else {
      throw new Error(
        "invalid entity, should have either ID, name or username",
      );
    }
    return `${this.type}:${identifier}`;
  }

  /**
   * toJSON emits keys in Go struct order with omitempty semantics:
   * type (always), then id, name, username (only when non-empty).
   */
  toJSON(): Record<string, string> {
    const obj: Record<string, string> = { type: this.type };
    if (this.id !== "") obj.id = this.id;
    if (this.name !== "") obj.name = this.name;
    if (this.username !== "") obj.username = this.username;
    return obj;
  }
}

/**
 * AlertPayload represents the payload sent to the OpsGenie create-alert API.
 * See: https://docs.opsgenie.com/docs/alert-api#create-alert
 *
 * Field order and omitempty semantics mirror the Go AlertPayload struct so the
 * serialized JSON byte-for-byte matches the Go service.
 */
export interface AlertPayload {
  message: string;
  alias?: string;
  description?: string;
  responders?: Entity[];
  visibleTo?: Entity[];
  actions?: string[];
  tags?: string[];
  details?: Record<string, string>;
  entity?: string;
  source?: string;
  priority?: string;
  user?: string;
  note?: string;
}

/**
 * serializeAlertPayload produces the JSON string for an AlertPayload, preserving
 * Go field order and dropping empty optional fields (omitempty).
 */
export function serializeAlertPayload(p: AlertPayload): string {
  const parts: string[] = [`"message":${JSON.stringify(p.message)}`];

  const addString = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== "") {
      parts.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
    }
  };
  const addArray = (key: string, value: unknown[] | undefined): void => {
    if (value !== undefined && value.length > 0) {
      parts.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
    }
  };

  addString("alias", p.alias);
  addString("description", p.description);
  addArray("responders", p.responders);
  addArray("visibleTo", p.visibleTo);
  addArray("actions", p.actions);
  addArray("tags", p.tags);
  if (p.details !== undefined && Object.keys(p.details).length > 0) {
    parts.push(`"details":${JSON.stringify(p.details)}`);
  }
  addString("entity", p.entity);
  addString("source", p.source);
  addString("priority", p.priority);
  addString("user", p.user);
  addString("note", p.note);

  return `{${parts.join(",")}}`;
}
