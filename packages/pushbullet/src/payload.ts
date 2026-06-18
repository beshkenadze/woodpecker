// Port of Go pkg/services/pushbullet/pushbullet_json.go

/** PushRequest is the body POSTed to the Pushbullet pushes endpoint. */
export interface PushRequest {
  type: string;
  title: string;
  body: string;
  email: string;
  channel_tag: string;
  device_iden: string;
}

/** PushResponse is the (mostly ignored) successful response from Pushbullet. */
export interface PushResponse {
  active: boolean;
  body: string;
  created: number;
  direction: string;
  dismissed: boolean;
  iden: string;
  modified: number;
  receiver_email: string;
  receiver_email_normalized: string;
  receiver_iden: string;
  sender_email: string;
  sender_email_normalized: string;
  sender_iden: string;
  sender_name: string;
  title: string;
  type: string;
}

/** ErrorResponse is the error body returned by the Pushbullet API. */
export interface ErrorResponse {
  error: {
    cat: string;
    message: string;
    type: string;
  };
}

const emailPattern = /.*@.*\..*/;

/**
 * NewNotePush creates a "note" push request with empty target fields.
 * Mirrors Go NewNotePush.
 */
export function newNotePush(message: string, title: string): PushRequest {
  return {
    type: "note",
    title,
    body: message,
    email: "",
    channel_tag: "",
    device_iden: "",
  };
}

/**
 * setTarget routes the target to the correct field, mirroring Go PushRequest.SetTarget:
 * an email-looking target sets `email`, a `#`-prefixed target sets `channel_tag`
 * (without the `#`), and anything else sets `device_iden`.
 */
export function setTarget(push: PushRequest, target: string): void {
  if (emailPattern.test(target)) {
    push.email = target;
    return;
  }

  if (target.length > 0 && target[0] === "#") {
    push.channel_tag = target.slice(1);
    return;
  }

  push.device_iden = target;
}
