// Which study step a lecture material ticks when it's opened (shared by the lecture and course pages).
export function materialKind(title = "", kind = "") {
  if (/record|video|watch/i.test(title)) return "recording";
  if (/assign|homework|problem set|exercise/i.test(title)) return "assignment";
  if (kind === "reading" || kind === "paper" || /book|paper|reading|chapter|article|case/i.test(title)) return "reading";
  return "slides";
}
