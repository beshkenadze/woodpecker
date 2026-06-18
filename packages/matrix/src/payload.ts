// Matrix client-server API payload types and constants — port of Go matrix_api.go.

export const apiLogin = "/_matrix/client/r0/login";
export const apiRoomJoin = "/_matrix/client/r0/join/%s";
export const apiSendMessage =
  "/_matrix/client/r0/rooms/%s/send/m.room.message/%s";
export const apiJoinedRooms = "/_matrix/client/r0/joined_rooms";

export const contentType = "application/json";
export const accessTokenKey = "access_token";

export const msgTypeText = "m.text";
export const flowLoginPassword = "m.login.password";
export const idTypeUser = "m.id.user";

export interface Flow {
  type: string;
}

export interface ApiResLoginFlows {
  flows: Flow[];
}

export interface Identifier {
  type: string;
  user?: string;
}

export interface ApiReqLogin {
  type: string;
  identifier: Identifier;
  password?: string;
  token?: string;
  device_id?: string;
}

export interface ApiResLogin {
  access_token: string;
  home_server: string;
  user_id: string;
  device_id: string;
}

export interface ApiReqSend {
  msgtype: string;
  body: string;
}

export interface ApiResRoom {
  room_id: string;
}

export interface ApiResJoinedRooms {
  joined_rooms: string[];
}

export interface ApiResEvent {
  event_id: string;
}

export interface ApiResError {
  error: string;
  errcode: string;
}

export function newUserIdentifier(user: string): Identifier {
  return { type: idTypeUser, user };
}
