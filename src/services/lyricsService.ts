import { SyncedLyricLine } from "../types";

export interface LyricsResult {
  source: string;
  track: string;
  artist: string;
  plainLyrics: string;
  syncedLyrics: SyncedLyricLine[] | null;
  rawLrc?: string | null;
  instrumental?: boolean;
}

/**
 * Parses LRC raw text into an array of sorted timestamped lines
 */
export function parseLrc(lrcText: string): SyncedLyricLine[] {
  if (!lrcText) return [];

  const lines = lrcText.split(/\r?\n/);
  const result: SyncedLyricLine[] = [];
  const tagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Collect all timestamps on this line
    const matches = Array.from(trimmed.matchAll(tagRegex));
    if (matches.length > 0) {
      const text = trimmed.replace(tagRegex, "").trim();
      for (const match of matches) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const msStr = match[3] || "0";
        const ms = msStr.length === 3 ? parseInt(msStr, 10) : parseInt(msStr.padEnd(3, "0"), 10);
        const totalSec = min * 60 + sec + ms / 1000;

        result.push({
          time: totalSec,
          text: text || "♪ ♪",
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
    };
  } catch (error: any) {
    console.error("Error buscando letras:", error);
    return {
      source: "error",
      track,
      artist: artist || "",
      plainLyrics: "",
      syncedLyrics: null,
      instrumental: false,
    };
  }
}
