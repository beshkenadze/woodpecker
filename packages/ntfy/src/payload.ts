// Ported from Go pkg/services/ntfy/ntfy_json.go.

/** ApiResponse is the JSON shape ntfy returns; `error` maps to the message. */
export interface ApiResponse {
  code?: number;
  /** Go tags this as json:"error". */
  error?: string;
  link?: string;
}

/** formatApiError mirrors Go apiResponse.Error(): "server response: <msg> (<code>)". */
export function formatApiError(response: ApiResponse): string {
  const msg = `server response: ${response.error ?? ""} (${response.code ?? 0})`;
  if (response.link && response.link !== "") {
    return `${msg}, see: ${response.link}`;
  }
  return msg;
}
