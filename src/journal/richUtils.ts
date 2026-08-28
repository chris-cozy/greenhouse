// Portable date and video helpers adapted from Diwa. No desktop dependencies.
export type DateMention = {
  datetime: string;
  label: string;
  hasTime: boolean;
};

export type TagCatalogItem = {
  label: string;
  count: number;
};

export type YouTubeReference = {
  originalUrl: string;
  videoId: string;
  startSeconds: number;
};

const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/;
const maximumYouTubeStart = 7 * 24 * 60 * 60;

/** Parses YouTube timestamps without altering the URL that will be stored. */
export function parseYouTubeStart(value: string | null): number | null {
  if (!value) return 0;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds <= maximumYouTubeStart ? seconds : null;
  }

  const match = value.toLocaleLowerCase().match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match.slice(1).some(Boolean)) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(seconds) && seconds <= maximumYouTubeStart ? seconds : null;
}

/** Recognizes only the portable, video-specific HTTPS YouTube URL forms Diwa enhances. */
export function parseYouTubeUrl(value: string): YouTubeReference | null {
  const originalUrl = value.trim();
  if (!originalUrl || /\s/.test(originalUrl)) return null;
  let url: URL;
  try {
    url = new URL(originalUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;

  const host = url.hostname.toLocaleLowerCase();
  const path = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = path.length === 1 ? path[0] : null;
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(host)) {
    if (url.pathname === "/watch") videoId = url.searchParams.get("v");
    else if (path.length === 2 && ["shorts", "live", "embed"].includes(path[0])) videoId = path[1];
  }
  if (!videoId || !youtubeVideoId.test(videoId)) return null;

  const timestamp = url.searchParams.get("t") ?? url.searchParams.get("start");
  const startSeconds = parseYouTubeStart(timestamp);
  if (startSeconds === null) return null;
  return { originalUrl, videoId, startSeconds };
}

/** A URL is enhanced only when it occupies an entire top-level Markdown line. */
export function parseStandaloneYouTubeLine(line: string): YouTubeReference | null {
  const trimmed = line.trim();
  return trimmed && !trimmed.includes("\n") ? parseYouTubeUrl(trimmed) : null;
}

const monthNames = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may", "may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseTime(value: string | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase();
  const twelveHour = normalized.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/);

  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    if (hour < 1 || hour > 12) return null;
    if (twelveHour[3] === "am" && hour === 12) hour = 0;
    if (twelveHour[3] === "pm" && hour !== 12) hour += 12;
    return { hour, minute: Number(twelveHour[2] ?? 0) };
  }

  const twentyFourHour = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!twentyFourHour) return null;
  return { hour: Number(twentyFourHour[1]), minute: Number(twentyFourHour[2]) };
}

function mentionFromDate(date: Date, hasTime: boolean): DateMention {
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const dateValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  if (!hasTime) return { datetime: dateValue, label: dateLabel, hasTime: false };

  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return {
    datetime: `${dateValue}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
    label: `${dateLabel} at ${timeLabel}`,
    hasTime: true,
  };
}

/** Parses Diwa's intentionally small, deterministic natural-date grammar. */
export function parseDateMention(query: string, now = new Date()): DateMention | null {
  const normalized = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!normalized) return null;

  const relative = normalized.match(/^(today|tomorrow|yesterday)(?:\s+(?:at\s+)?(.+))?$/);
  if (relative) {
    const date = new Date(now);
    date.setSeconds(0, 0);
    if (relative[1] === "tomorrow") date.setDate(date.getDate() + 1);
    if (relative[1] === "yesterday") date.setDate(date.getDate() - 1);
    const time = parseTime(relative[2]);
    if (relative[2] && !time) return null;
    if (time) date.setHours(time.hour, time.minute, 0, 0);
    return mentionFromDate(date, Boolean(time));
  }

  const absolute = normalized.match(
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?:\s+(?:at\s+)?(.+))?$/,
  );
  if (!absolute) return null;

  const month = monthNames.findIndex((aliases) => aliases.includes(absolute[1] as never));
  if (month < 0) return null;
  const day = Number(absolute[2]);
  const year = Number(absolute[3] ?? now.getFullYear());
  const time = parseTime(absolute[4]);
  if (absolute[4] && !time) return null;

  const date = new Date(year, month, day, time?.hour ?? 0, time?.minute ?? 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return mentionFromDate(date, Boolean(time));
}

/** Returns deterministic date completions for the editor's inline mention menu. */
export function dateMentionSuggestions(query: string, now = new Date()): DateMention[] {
  const normalized = query.trim().toLocaleLowerCase();
  const suggestions: DateMention[] = [];
  const relativeLabels = ["today", "tomorrow", "yesterday"];

  for (const label of relativeLabels) {
    if (!normalized || label.startsWith(normalized)) {
      const parsed = parseDateMention(label, now);
      if (parsed) suggestions.push(parsed);
    }
  }

  const parsed = parseDateMention(query, now);
  if (parsed && !suggestions.some((item) => item.datetime === parsed.datetime)) {
    suggestions.unshift(parsed);
  }
  return suggestions;
}

/** Escapes the characters that would otherwise terminate Markdown image alt text. */
export function escapeMarkdownAlt(value: string): string {
  return value.replace(/[\\\[\]]/g, (character) => `\\${character}`).trim() || "Journal image";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

/** Stores a resolved date as portable semantic HTML that Markdown preserves. */
export function semanticTimeMarkdown(datetime: string, label: string): string {
  return `<time datetime="${escapeHtml(datetime)}">${escapeHtml(label)}</time>`;
}

/** Builds the relative Markdown reference used for an entry-owned local image. */
export function imageMarkdown(alt: string, source: string): string {
  return `![${escapeMarkdownAlt(alt)}](${source})`;
}

