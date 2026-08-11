const QUOTE_MARKERS = [
  /^On .+ wrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^From:\s*.+$/im,
  /^>{1,}\s/m,
  /^Glory Goat Milk Soap wrote:\s*$/im,
];

export function extractReplyBody(raw) {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match?.index != null && match.index > 0) {
      text = text.slice(0, match.index).trim();
    }
  }

  const lines = text.split("\n");
  const kept = [];
  for (const line of lines) {
    if (line.startsWith(">")) break;
    kept.push(line);
  }

  return kept.join("\n").trim();
}

export function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseInboundBody(input) {
  const source = input.text?.trim() || (input.html ? htmlToPlainText(input.html) : "");
  return extractReplyBody(source);
}
