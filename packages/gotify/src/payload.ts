// Port of Go pkg/services/gotify/gotify_json.go payload types.

/** messageRequest is the payload sent to the Gotify API. */
export interface MessageRequest {
  message: string;
  title: string;
  priority: number;
}

/** messageResponse is the success response from the Gotify API. */
export interface MessageResponse extends MessageRequest {
  id: number;
  appid: number;
  date: string;
}

/** errorResponse is the error body returned by the Gotify API. */
export interface ErrorResponse {
  error: string;
  errorCode: number;
  errorDescription: string;
}

/**
 * isErrorResponse reports whether a parsed body can be read as a Gotify error
 * response. Mirrors Go client.ErrorResponse, which json.Unmarshal-s the body into
 * errorResponse and succeeds for ANY JSON object — missing fields stay zero-valued.
 */
export function isErrorResponse(body: unknown): body is Partial<ErrorResponse> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

/**
 * formatErrorResponse mirrors Go errorResponse.Error(), including the original
 * "respondend" typo and Go's zero-value defaults for absent fields.
 */
export function formatErrorResponse(er: Partial<ErrorResponse>): string {
  const name = er.error ?? "";
  const code = er.errorCode ?? 0;
  const description = er.errorDescription ?? "";
  return `server respondend with ${name} (${code}): ${description}`;
}
