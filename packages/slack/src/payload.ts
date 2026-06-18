// Port of pkg/services/slack/slack_json.go

import type { Config } from "./config.js";

const iconURLPattern = /https?:\/\//;

export interface BlockText {
  type: string;
  text: string;
}

export interface Block {
  type: string;
  text: BlockText;
}

export interface LegacyField {
  title: string;
  value: string;
  short?: boolean;
}

export interface Attachment {
  title?: string;
  fallback?: string;
  text: string;
  color?: string;
  fields?: LegacyField[];
  footer?: string;
  ts?: number;
}

/** APIResponse is the default generic response message sent from the API. */
export interface APIResponse {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: {
    warnings?: string[];
  };
}

/** MessagePayload used within the Slack service. */
export class MessagePayload {
  text = "";
  username?: string;
  blocks?: Block[];
  attachments?: Attachment[];
  thread_ts?: string;
  channel?: string;
  icon_emoji?: string;
  icon_url?: string;

  /** SetIcon sets icon_url or icon_emoji based on whether the input looks like a URL. */
  setIcon(icon: string): void {
    this.icon_url = "";
    this.icon_emoji = "";

    if (icon !== "") {
      if (iconURLPattern.test(icon)) {
        this.icon_url = icon;
      } else {
        this.icon_emoji = icon;
      }
    }
  }

  /** toJSON mirrors the Go struct tags (omitempty semantics). */
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { text: this.text };
    if (this.username) {
      out.username = this.username;
    }
    if (this.blocks && this.blocks.length > 0) {
      out.blocks = this.blocks;
    }
    if (this.attachments && this.attachments.length > 0) {
      out.attachments = this.attachments.map(serializeAttachment);
    }
    if (this.thread_ts) {
      out.thread_ts = this.thread_ts;
    }
    if (this.channel) {
      out.channel = this.channel;
    }
    if (this.icon_emoji) {
      out.icon_emoji = this.icon_emoji;
    }
    if (this.icon_url) {
      out.icon_url = this.icon_url;
    }
    return out;
  }
}

function serializeAttachment(att: Attachment): Record<string, unknown> {
  // `text` has no omitempty in Go; everything else does.
  const out: Record<string, unknown> = { text: att.text };
  if (att.title) {
    out.title = att.title;
  }
  if (att.fallback) {
    out.fallback = att.fallback;
  }
  if (att.color) {
    out.color = att.color;
  }
  if (att.fields && att.fields.length > 0) {
    out.fields = att.fields;
  }
  if (att.footer) {
    out.footer = att.footer;
  }
  if (att.ts) {
    out.ts = att.ts;
  }
  return out;
}

/** CreateJSONPayload compatible with the slack post message API. */
export function createJSONPayload(
  config: Config,
  message: string,
): MessagePayload {
  const atts: Attachment[] = [];
  const lines = message.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    // When 100 attachments have been reached, append the remaining line to the
    // last attachment to prevent reaching the slack API limit.
    if (i >= 100) {
      const last = atts[atts.length - 1] as Attachment;
      last.text += `\n${line}`;
      continue;
    }
    atts.push({ text: line, color: config.color });
  }

  // Remove last attachment if empty.
  if ((atts[atts.length - 1] as Attachment).text === "") {
    atts.pop();
  }

  const payload = new MessagePayload();
  payload.thread_ts = config.threadTS;
  payload.text = config.title;
  payload.username = config.botName;
  payload.attachments = atts;

  payload.setIcon(config.icon);

  if (config.channel !== "webhook") {
    payload.channel = config.channel;
  }

  return payload;
}
