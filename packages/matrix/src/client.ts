// Matrix API client — port of Go matrix_client.go.

import { JsonClient, type Logger } from "@woodpecker-js/core";
import type { Dispatcher } from "undici";
import {
  type ApiReqLogin,
  type ApiReqSend,
  type ApiResEvent,
  type ApiResJoinedRooms,
  type ApiResLogin,
  type ApiResLoginFlows,
  type ApiResRoom,
  accessTokenKey,
  apiJoinedRooms,
  apiLogin,
  apiRoomJoin,
  apiSendMessage,
  flowLoginPassword,
  msgTypeText,
  newUserIdentifier,
} from "./payload.js";
import { escapePathSegment } from "./urlpath.js";

export interface MatrixClientOptions {
  dispatcher?: Dispatcher;
}

// No-op logger used when none is provided (core does not export one).
const discardLogger: Logger = {
  logf(): void {
    /* discard */
  },
};

export class MatrixClient {
  private readonly scheme: string;
  private readonly host: string;
  private accessToken = "";
  private txnID = 0;
  private readonly logger: Logger;
  private readonly json: JsonClient;

  constructor(
    host: string,
    disableTLS: boolean,
    logger?: Logger,
    options: MatrixClientOptions = {},
  ) {
    this.host = host;
    this.scheme = disableTLS ? "http" : "https";
    this.logger = logger ?? discardLogger;
    this.json = new JsonClient(
      options.dispatcher ? { dispatcher: options.dispatcher } : {},
    );
    this.logger.logf("Using server: %s\n", `${this.scheme}://${this.host}`);
  }

  // url builds the full request URL for a (pre-escaped) path, appending the
  // access_token query param exactly as Go's url.URL does.
  private url(path: string): string {
    let result = `${this.scheme}://${this.host}${path}`;
    if (this.accessToken !== "") {
      const query = new URLSearchParams();
      query.set(accessTokenKey, this.accessToken);
      result += `?${query.toString()}`;
    }
    return result;
  }

  useToken(token: string): void {
    this.accessToken = token;
  }

  async login(user: string, password: string, deviceID: string): Promise<void> {
    let resLogin: ApiResLoginFlows;
    try {
      resLogin = await this.json.get<ApiResLoginFlows>(this.url(apiLogin));
    } catch (err) {
      throw new Error(`failed to get login flows: ${errMessage(err)}`);
    }

    const flows: string[] = [];
    for (const flow of resLogin?.flows ?? []) {
      flows.push(flow.type);
      if (flow.type === flowLoginPassword) {
        this.logf("Using login flow '%s'", flow.type);
        await this.loginPassword(user, password, deviceID);
        return;
      }
    }

    throw new Error(
      `none of the server login flows are supported: ${flows.join(", ")}`,
    );
  }

  private async loginPassword(
    user: string,
    password: string,
    deviceID: string,
  ): Promise<void> {
    const req: ApiReqLogin = {
      type: flowLoginPassword,
      identifier: newUserIdentifier(user),
      password,
      device_id: deviceID,
    };

    let response: ApiResLogin;
    try {
      response = await this.json.post<ApiResLogin>(this.url(apiLogin), req);
    } catch (err) {
      throw new Error(`failed to log in: ${errMessage(err)}`);
    }

    const accessToken = response?.access_token ?? "";
    this.accessToken = accessToken;
    const tokenHint = accessToken.length > 3 ? accessToken.slice(0, 3) : "";
    this.logf("AccessToken: %s...\n", tokenHint);
    this.logf("HomeServer: %s\n", response?.home_server ?? "");
    this.logf("User: %s\n", response?.user_id ?? "");
  }

  // sendMessage sends to the explicit rooms when provided, else to all joined rooms.
  // Returns the list of accumulated errors (mirrors Go's []error return).
  async sendMessage(message: string, rooms: string[]): Promise<Error[]> {
    if (rooms.length > 0) {
      return this.sendToExplicitRooms(rooms, message);
    }
    return this.sendToJoinedRooms(message);
  }

  private async sendToExplicitRooms(
    rooms: string[],
    message: string,
  ): Promise<Error[]> {
    const errors: Error[] = [];

    for (const room of rooms) {
      this.logf("Sending message to '%s'...\n", room);

      let roomID = room;
      if (!room.startsWith("!")) {
        try {
          roomID = await this.joinRoom(room);
        } catch (err) {
          errors.push(
            new Error(`error joining room ${room}: ${errMessage(err)}`),
          );
          continue;
        }
        if (room !== roomID) {
          this.logf("Resolved room alias '%s' to ID '%s'", room, roomID);
        }
      }

      try {
        await this.sendMessageToRoom(message, roomID);
      } catch (err) {
        errors.push(
          new Error(
            `failed to send message to room '${roomID}': ${errMessage(err)}`,
          ),
        );
      }
    }

    return errors;
  }

  private async sendToJoinedRooms(message: string): Promise<Error[]> {
    const errors: Error[] = [];
    let joinedRooms: string[];
    try {
      joinedRooms = await this.getJoinedRooms();
    } catch (err) {
      errors.push(new Error(`failed to get joined rooms: ${errMessage(err)}`));
      return errors;
    }

    for (const roomID of joinedRooms) {
      this.logf("Sending message to '%s'...\n", roomID);
      try {
        await this.sendMessageToRoom(message, roomID);
      } catch (err) {
        errors.push(
          new Error(
            `failed to send message to room '${roomID}': ${errMessage(err)}`,
          ),
        );
      }
    }

    return errors;
  }

  private async joinRoom(room: string): Promise<string> {
    // Use a function replacer so '$' sequences in the escaped segment are not
    // treated as String.replace special patterns ($&, $$, $`, $').
    const path = apiRoomJoin.replace("%s", () => escapePathSegment(room));
    const resRoom = await this.json.post<ApiResRoom>(this.url(path), null);
    if (!resRoom || typeof resRoom.room_id !== "string") {
      throw new Error("join response missing room_id");
    }
    return resRoom.room_id;
  }

  private async sendMessageToRoom(
    message: string,
    roomID: string,
  ): Promise<void> {
    const roomSeg = escapePathSegment(roomID);
    const txnSeg = escapePathSegment(this.nextTransactionID());
    const path = apiSendMessage
      .replace("%s", () => roomSeg)
      .replace("%s", () => txnSeg);
    const req: ApiReqSend = { msgtype: msgTypeText, body: message };
    await this.json.put<ApiResEvent>(this.url(path), req);
  }

  private async getJoinedRooms(): Promise<string[]> {
    const response = await this.json.get<ApiResJoinedRooms>(
      this.url(apiJoinedRooms),
    );
    return response?.joined_rooms ?? [];
  }

  private nextTransactionID(): string {
    this.txnID += 1;
    return `shoutrrr-${this.txnID}`;
  }

  private logf(format: string, ...args: unknown[]): void {
    this.logger.logf(format, ...args);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
