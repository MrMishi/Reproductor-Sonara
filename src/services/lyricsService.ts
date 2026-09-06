import { SyncedLyricLine } from "../types";

export interface LyricsResult {
  source: string;
  track: string;
  artist: string;
  plainLyrics: string;
  syncedLyrics: SyncedLyricLine[] | null;
  rawLrc?: string | null;
  instrumental?: boolean;
  message?: string;
}

/**
 * Regular expression matching native Japanese characters (Hiragana, Katakana, Kanji)
 */
export const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

/**
 * Checks if a string contains Japanese characters (Hiragana, Katakana, or Kanji)
 */
export function hasJapaneseText(text: string): boolean {
  if (!text) return false;
  return JAPANESE_CHAR_REGEX.test(text);
}

/**
 * Extracts native Japanese text and Romaji transliteration if present in a single line
 * Examples:
 * "夜に駆ける (Yoru ni kakeru)" -> native: "夜に駆ける", romaji: "Yoru ni kakeru"
 * "沈むように溶けてゆくように / shizumu you ni tokete yuku you ni"
 */
export function parseBilingualLine(text: string): {
  nativeText?: string;
  romaji?: string;
  hasJapanese: boolean;
} {
  if (!text) return { hasJapanese: false };
  const hasJap = hasJapaneseText(text);

  if (!hasJap) {
    return { hasJapanese: false };
  }

  // Check pattern with slash: "日本語 / Romaji"
  const slashMatch = text.match(/^([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s\d\p{P}]+?)\s*[\/|\\]\s*([a-zA-Z\s\d\p{P}]+)$/u);
  if (slashMatch) {
    return {
      nativeText: slashMatch[1].trim(),
      romaji: slashMatch[2].trim(),
      hasJapanese: true,
    };
  }

  // Check pattern with parentheses/brackets: "日本語 (Romaji)" or "日本語 [Romaji]"
  const parenMatch = text.match(/^([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s\d\p{P}]+?)\s*[\(\[\{]([a-zA-Z\s\d\p{P}]+)[\)\]\}]$/u);
  if (parenMatch) {
    return {
      nativeText: parenMatch[1].trim(),
      romaji: parenMatch[2].trim(),
      hasJapanese: true,
    };
  }

  return {
    nativeText: text,
    hasJapanese: true,
  };
}

/**
 * Parses LRC raw text into an array of sorted timestamped lines,
 * with strict UTF-8 Unicode normalization (NFC) to preserve native Hiragana/Kanji/Katakana.
 */
export function parseLrc(lrcText: string): SyncedLyricLine[] {
  if (!lrcText) return [];

  // Guarantee UTF-8 Unicode canonical decomposition/composition
  const normalized = typeof lrcText === "string" ? lrcText.normalize("NFC") : "";
  const lines = normalized.split(/\r?\n/);
  const result: SyncedLyricLine[] = [];
  const tagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Collect all timestamps on this line
    const matches = Array.from(trimmed.matchAll(tagRegex));
    if (matches.length > 0) {
      const text = trimmed.replace(tagRegex, "").trim();
      const parsedInfo = parseBilingualLine(text);

      for (const match of matches) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const msStr = match[3] || "0";
        const ms = msStr.length === 3 ? parseInt(msStr, 10) : parseInt(msStr.padEnd(3, "0"), 10);
        const totalSec = min * 60 + sec + ms / 1000;

        result.push({
          time: totalSec,
          text: text || "♪ ♪",
          nativeText: parsedInfo.nativeText,
          romaji: parsedInfo.romaji,
          hasJapanese: parsedInfo.hasJapanese,
        });
      }
    }
  }

  // Sort by timestamp ascending
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Finds the active synchronized line given current audio playback time in seconds
 */
export function getActiveLyricIndex(syncedLyrics: SyncedLyricLine[] | null | undefined, currentTime: number): number {
  if (!syncedLyrics || syncedLyrics.length === 0) return -1;

  let activeIndex = -1;
  for (let i = 0; i < syncedLyrics.length; i++) {
    if (currentTime >= syncedLyrics[i].time - 0.2) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
}

/**
 * Search lyrics online via our backend API
 */
export async function searchLyricsOnline(
  track: string,
  artist?: string,
  album?: string,
  duration?: number
): Promise<LyricsResult> {
  try {
    const response = await fetch("/api/lyrics/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        track,
        artist,
        album,
        duration,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error en servidor: ${response.status}`);
    }

    const data = await response.json();
    const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : null;

    return {
      source: data.source || "web",
      track: data.track || track,
      artist: data.artist || artist || "",
      plainLyrics: data.plainLyrics || "",
      syncedLyrics: synced && synced.length > 0 ? synced : null,
      rawLrc: data.syncedLyrics || null,
      instrumental: data.instrumental || false,
      message: data.message,
    };
  } catch (error: any) {
    console.warn("Notice: Lyrics search error:", error?.message || error);
    return {
      source: "error",
      track,
      artist: artist || "",
      plainLyrics: "",
      syncedLyrics: null,
      instrumental: false,
      message: "No se pudieron obtener letras en este momento. Puedes redactarlas o pegarlas manualmente.",
    };
  }
}
