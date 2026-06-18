// Port of telegram_client.go
import { ApiError, JsonClient } from "@woodpecker-js/core";
import type {
  ErrorResponse,
  Message,
  MessageResponse,
  SendMessagePayload,
} from "./payload.js";

const API_FORMAT = "https://api.telegram.org/bot%s/%s";

/** Client for the Telegram Bot API. */
export class Client {
  private readonly token: string;
  private readonly json: JsonClient;

  constructor(token: string, json: JsonClient = new JsonClient()) {
    this.token = token;
    this.json = json;
  }

  private apiURL(endpoint: string): string {
    return API_FORMAT.replace("%s", this.token).replace("%s", endpoint);
  }

  /** SendMessage sends the specified message and returns the created Message. */
  async sendMessage(message: SendMessagePayload): Promise<Message | undefined> {
    let response: MessageResponse | undefined;
    try {
      response = await this.json.post<MessageResponse>(
        this.apiURL("sendMessage"),
        message,
      );
    } catch (err) {
      // Non-2xx (incl. Telegram API errors) surface here as ApiError.
      throw getResponseError(err);
    }

    // A 2xx response carrying ok:false has no transport error to fall back on;
    // Go's GetResponseError(nil) returns nil in that case, so we resolve too.
    // core's JsonClient returns undefined for an empty 2xx body, so guard the
    // deref to keep resolving cleanly instead of throwing a TypeError.
    return response?.result;
  }
}

/**
 * getResponseError preserves Telegram API errors (the `description` field),
 * falling back to the transport error. Mirrors Go GetResponseError.
 */
export function getResponseError(err: unknown): Error {
  if (err instanceof ApiError) {
    const body = err.body;
    if (isErrorResponse(body)) {
      return new Error(body.description);
    }
    return err;
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error("unknown telegram API error");
}

function isErrorResponse(body: unknown): body is ErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    "description" in body &&
    typeof (body as { description: unknown }).description === "string"
  );
}
