import type { MessageItem, MessageLimit } from "./message.ts";

const ELLIPSIS = " [...]";

function min(a: number, b: number): number {
  return a < b ? a : b;
}

/**
 * partitionMessage splits a string into chunks of at most chunkSize runes,
 * searching the last `distance` runes for whitespace to make the split nicer.
 * It keeps adding chunks until reaching chunkCount-1 chunks or totalChunkSize
 * runes. Returns the chunk items and the number of omitted (overflow) runes.
 * Faithful port of Go util.PartitionMessage (operates on Unicode code points).
 */
export function partitionMessage(
  input: string,
  limits: MessageLimit,
  distance: number,
): { items: MessageItem[]; omitted: number } {
  const runes = [...input];
  const items: MessageItem[] = [];
  let chunkOffset = 0;
  const maxTotal = min(runes.length, limits.totalChunkSize);
  const maxCount = limits.chunkCount - 1;

  if (input.length === 0) {
    return { items, omitted: 0 };
  }

  for (let i = 0; i < maxCount; i++) {
    let chunkEnd = chunkOffset + limits.chunkSize;
    let nextChunkStart = chunkEnd;
    if (chunkEnd >= maxTotal) {
      chunkEnd = maxTotal;
      nextChunkStart = maxTotal;
    } else {
      for (let r = 0; r < distance; r++) {
        const rp = chunkEnd - r;
        if (runes[rp] === "\n" || runes[rp] === " ") {
          chunkEnd = rp;
          nextChunkStart = chunkEnd + 1;
          break;
        }
      }
    }

    items.push({ text: runes.slice(chunkOffset, chunkEnd).join("") });

    chunkOffset = nextChunkStart;
    if (chunkOffset >= maxTotal) {
      break;
    }
  }

  return { items, omitted: runes.length - chunkOffset };
}

/**
 * messageItemsFromLines creates batches of MessageItems split by line, trimming
 * over-long lines with an ellipsis. Faithful port of Go util.MessageItemsFromLines.
 */
export function messageItemsFromLines(
  plain: string,
  limits: MessageLimit,
): MessageItem[][] {
  const maxCount = limits.chunkCount;
  const lines = plain.split("\n");
  const batches: MessageItem[][] = [];
  let items: MessageItem[] = [];
  let totalLength = 0;

  for (let line of lines) {
    const maxLen = limits.chunkSize;

    if (
      items.length === maxCount ||
      totalLength + maxLen > limits.totalChunkSize
    ) {
      batches.push(items);
      items = [];
    }

    let runes = [...line];
    if (runes.length > maxLen) {
      runes = runes.slice(0, maxLen - ELLIPSIS.length);
      line = runes.join("") + ELLIPSIS;
    }

    if (runes.length < 1) {
      continue;
    }

    items.push({ text: line });
    totalLength += runes.length;
  }

  if (items.length > 0) {
    batches.push(items);
  }

  return batches;
}
