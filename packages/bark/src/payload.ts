/**
 * PushPayload is the notification payload for the bark notification service,
 * mirroring Go's bark.PushPayload (bark_json.go). Fields tagged omitempty in Go
 * are optional here and omitted from the serialized JSON when empty.
 *
 * Note: in Go, Badge is sent as a pointer that is always non-nil (`&config.Badge`),
 * so it is always serialized despite the `omitempty` tag.
 */
export interface PushPayload {
  body: string;
  device_key: string;
  title: string;
  sound?: string;
  badge?: number;
  icon?: string;
  group?: string;
  url?: string;
  category?: string;
  copy?: string;
}

/**
 * apiResponse mirrors Go's bark.apiResponse — the JSON body returned by the
 * bark /push endpoint.
 */
export interface ApiResponse {
  code: number;
  message: string;
  timestamp?: number;
}

interface PushPayloadFields {
  body: string;
  device_key: string;
  title: string;
  sound: string;
  badge: number;
  icon: string;
  group: string;
  url: string;
  category: string;
  copy: string;
}

/**
 * buildPushPayload constructs the wire payload, mirroring Go's `omitempty` JSON
 * tags: body, device_key, title and badge are always present; the remaining
 * string fields are omitted when empty. Badge is always serialized because Go
 * sends it via an always-non-nil pointer.
 */
export function buildPushPayload(fields: PushPayloadFields): PushPayload {
  const payload: PushPayload = {
    body: fields.body,
    device_key: fields.device_key,
    title: fields.title,
    badge: fields.badge,
  };
  if (fields.sound !== "") payload.sound = fields.sound;
  if (fields.icon !== "") payload.icon = fields.icon;
  if (fields.group !== "") payload.group = fields.group;
  if (fields.url !== "") payload.url = fields.url;
  if (fields.category !== "") payload.category = fields.category;
  if (fields.copy !== "") payload.copy = fields.copy;
  return payload;
}
