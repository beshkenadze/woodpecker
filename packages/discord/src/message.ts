// Message item shapes and level helpers used by the Discord payload/chunking.
// These mirror Go pkg/types message structures that @woodpecker/core does not
// (yet) expose; they live here as service-local message helpers.
import { MessageLevel } from "@woodpecker/core";

/** Number of known message levels (used to size color arrays). */
export const MessageLevelCount = 5;

const messageLevelStrings: Record<MessageLevel, string> = {
  [MessageLevel.Unknown]: "Unknown",
  [MessageLevel.Error]: "Error",
  [MessageLevel.Warning]: "Warning",
  [MessageLevel.Info]: "Info",
  [MessageLevel.Debug]: "Debug",
};

/** levelString returns the human-readable name for a message level. */
export function levelString(level: MessageLevel): string {
  return (
    messageLevelStrings[level] ?? messageLevelStrings[MessageLevel.Unknown]
  );
}

/** Field is a key/value pair attached to a message item. */
export interface Field {
  key: string;
  value: string;
}

/** MessageItem is an entry in a notification being sent by a service. */
export interface MessageItem {
  text: string;
  timestamp?: Date;
  level?: MessageLevel;
  fields?: Field[];
}

/** MessageLimit bounds how a plain message is chunked into items. */
export interface MessageLimit {
  chunkSize: number;
  totalChunkSize: number;
  chunkCount: number;
}
