export const MAX_CHAT_LENGTH = 240;
export const MAX_CHAT_EMOJI = 5;

const CONTROL_CHARACTERS = /\p{Cc}/gu;
const URLS =
  /(?:\bhttps?:\/\/|\bwww\.)[^\s<>{}]+|\b(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:\/[^\s<>{}]*)?/giu;
const COMBINING_MARK = /\p{M}/u;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

export interface SanitizedChatMessage {
  message: string;
  blocked: boolean;
}

export function sanitizeChatMessage(
  message: string,
  blockedWords: readonly string[] = [],
): SanitizedChatMessage {
  const withoutControls = message.replace(CONTROL_CHARACTERS, " ");
  const withoutUrls = withoutControls
    .replace(URLS, " ")
    .replace(/\s{2,}/gu, " ");
  const withoutZalgo = stripZalgoMarks(withoutUrls).normalize("NFC");
  const limitedEmoji = limitEmoji(withoutZalgo);
  const cleaned = limitedEmoji.trim();

  if (containsBlockedWord(cleaned, blockedWords)) {
    return { message: "", blocked: true };
  }

  return {
    message: truncateGraphemes(cleaned, MAX_CHAT_LENGTH),
    blocked: false,
  };
}

function stripZalgoMarks(message: string): string {
  let consecutiveMarks = 0;
  let result = "";
  for (const character of message.normalize("NFD")) {
    if (COMBINING_MARK.test(character)) {
      consecutiveMarks += 1;
      if (consecutiveMarks <= 2) result += character;
    } else {
      consecutiveMarks = 0;
      result += character;
    }
  }
  return result;
}

function limitEmoji(message: string): string {
  const segments = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(message);
  let emojiCount = 0;
  let result = "";
  for (const { segment } of segments) {
    if (EMOJI.test(segment)) {
      emojiCount += 1;
      if (emojiCount > MAX_CHAT_EMOJI) continue;
    }
    result += segment;
  }
  return result;
}

function truncateGraphemes(message: string, maximum: number): string {
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(message),
    ({ segment }) => segment,
  );
  if (segments.length <= maximum) return message;
  return `${segments
    .slice(0, maximum - 1)
    .join("")
    .trimEnd()}…`;
}

function containsBlockedWord(
  message: string,
  blockedWords: readonly string[],
): boolean {
  return blockedWords.some((word) => {
    const normalizedWord = word.trim();
    if (!normalizedWord) return false;
    const expression = normalizedWord
      .split(/\s+/u)
      .map(escapeRegExp)
      .join("\\s+");
    return new RegExp(
      `(?<![\\p{L}\\p{N}_])${expression}(?![\\p{L}\\p{N}_])`,
      "iu",
    ).test(message);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
