// escapePathSegment escapes a string for use as a URL path segment, matching
// Go's net/url url.URL.String() path escaping (encodePath mode).
// Kept unescaped: ALPHA / DIGIT / "$" "&" "+" "," "-" "." "/" ":" ";" "=" "@" "_" "~"
// Everything else is percent-encoded (notably "!", "#", "*", "(", ")", "'", space).
const KEEP = new Set(
  "$&+,-./:;=@_~"
    .split("")
    .concat(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
        "",
      ),
    ),
);

export function escapePathSegment(segment: string): string {
  let out = "";
  for (const ch of segment) {
    if (KEEP.has(ch)) {
      out += ch;
      continue;
    }
    const bytes = new TextEncoder().encode(ch);
    for (const b of bytes) {
      out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}
