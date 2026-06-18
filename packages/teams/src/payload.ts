/**
 * MessageCard payload types and builder, ported from Go's teams_json.go and the
 * payload assembly in teams.go (doSend).
 */

export interface Fact {
  key: string;
  value: string;
}

export interface Section {
  text?: string;
  activityText?: string;
  startGroup: boolean;
  facts?: Fact[];
}

export interface MessageCard {
  "@type": string;
  "@context": string;
  markdown: boolean;
  text?: string;
  title?: string;
  summary?: string;
  sections?: Section[];
  themeColor?: string;
}

const CARD_TYPE = "MessageCard";
const CONTEXT = "http://schema.org/extensions";

/**
 * buildPayload assembles a MessageCard from a message, title and color, mirroring
 * Go's doSend: one section per line, summary derived from title or the (truncated)
 * first line, and omitempty fields dropped from the JSON.
 */
export function buildPayload(
  message: string,
  title: string,
  color: string,
): MessageCard {
  const sections: Section[] = message
    .split("\n")
    .map((line) => ({ text: line, startGroup: false }));

  // Teams needs a summary for the webhook; use the title or the (truncated) first line.
  let summary = title;
  if (summary === "" && sections.length > 0) {
    summary = sections[0]?.text ?? "";
    if (summary.length > 20) {
      // Go: summary[:21] keeps the first 21 bytes.
      summary = summary.slice(0, 21);
    }
  }

  const card: MessageCard = {
    "@type": CARD_TYPE,
    "@context": CONTEXT,
    markdown: true,
  };

  // Faithful to Go json omitempty: only emit non-empty optional fields.
  if (title !== "") {
    card.title = title;
  }
  if (color !== "") {
    card.themeColor = color;
  }
  if (summary !== "") {
    card.summary = summary;
  }
  if (sections.length > 0) {
    card.sections = sections;
  }

  return card;
}
