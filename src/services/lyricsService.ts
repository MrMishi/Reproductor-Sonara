/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE LETRAS Y SINCRONIZACIÓN LRC (lyricsService.ts)
 * ============================================================================
 * Propósito y función del archivo:
 * Este servicio proporciona las capacidades de obtención, análisis sintáctico (parsing)
 * y sincronización temporal de letras musicales, tanto en texto plano como en formato .LRC.
 *
 * ¿Cómo funciona?:
 * 1. Búsqueda directa a LRCLIB: Consulta en primer lugar la API pública https://lrclib.net/api/search?q=
 *    con los nombres normalizados de pista y artista.
 * 2. Endpoint de respaldo: Si falla o hay restricciones de CORS, acude al backend local `/api/lyrics/search`.
 * 3. Parser LRC avanzado (`parseLrc`): Convierte timestamps con precisión de centésimas/milisegundos
 *    ([mm:ss.xx] o [mm:ss.xxx]) a segundos flotantes y ordena cronológicamente los versos.
 * 4. Soporte Bilingüe y Japonés (`parseBilingualLine`): Detecta caracteres Kanji, Hiragana y Katakana
 *    y extrae automáticamente transliteraciones a Romaji cuando vienen en formatos tipo "漢字 (Romaji)".
 * 5. Resaltado temporal (`getActiveLyricIndex`): Calcula con un anticipo de 200 ms qué línea debe
 *    destacarse en pantalla durante la reproducción en vivo.
 *
 * Guía para futuras actualizaciones:
 * - Si se añade un nuevo proveedor de letras (Genius, Musixmatch, etc.), integrarlo en `searchLyricsOnline()`.
 */

import { SyncedLyricLine } from "../types";

/**
 * Estructura de respuesta devuelta por la API pública de LRCLIB.
 */
export interface LrclibSearchItem {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

/**
 * Resultado procesado y normalizado para el reproductor Sonora.
 */
export interface LyricsResult {
  source: string;
  track: string;
  artist: string;
  album?: string;
  plainLyrics: string;
  syncedLyrics: SyncedLyricLine[] | null;
  rawLrc?: string | null;
  instrumental?: boolean;
  message?: string;
}

/**
 * Expresión regular para detectar caracteres japoneses nativos:
 * - Hiragana (\u3040-\u309F)
 * - Katakana (\u30A0-\u30FF)
 * - Kanji (\u4E00-\u9FAF)
 */
export const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;

/**
 * Función: hasJapaneseText
 * Propósito: Determina si una cadena de texto contiene caracteres de la escritura japonesa.
 * Retorna: boolean
 */
export function hasJapaneseText(text: string): boolean {
  if (!text) return false;
  return JAPANESE_CHAR_REGEX.test(text);
}

/**
 * Función: parseBilingualLine
 * Propósito: Separa una línea que contiene texto original japonés junto con su fonética romanizada (Romaji).
 * ¿Cómo funciona?:
 * 1. Evalúa si el texto contiene caracteres japoneses.
 * 2. Busca separadores por barra ("日本語 / Romaji") o por paréntesis/corchetes ("日本語 (Romaji)").
 * 3. Si coincide, devuelve un objeto separando `nativeText` y `romaji`.
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

  // Patrón con barra inclinada: "日本語 / Romaji"
  const slashMatch = text.match(/^([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s\d\p{P}]+?)\s*[\/|\\]\s*([a-zA-Z\s\d\p{P}]+)$/u);
  if (slashMatch) {
    return {
      nativeText: slashMatch[1].trim(),
      romaji: slashMatch[2].trim(),
      hasJapanese: true,
    };
  }

  // Patrón con paréntesis o corchetes: "日本語 (Romaji)"
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
 * Función: parseLrc
 * Propósito: Analiza sintácticamente el texto plano de un archivo `.lrc` y lo transforma en versos ordenados.
 * ¿Cómo funciona?:
 * 1. Aplica normalización canónica Unicode NFC para preservar diacríticos y caracteres internacionales.
 * 2. Comprueba si existe la etiqueta de desfase temporal global `[offset: +/-ms]`.
 * 3. Ignora encabezados de metadatos como `[ti:...]` o `[ar:...]`.
 * 4. Extrae etiquetas de tiempo `[mm:ss.xx]` o `[mm:ss.xxx]` y calcula el segundo exacto en número flotante.
 * 5. Ordena cronológicamente todas las líneas por marca de tiempo ascendente.
 */
export function parseLrc(lrcText: string): SyncedLyricLine[] {
  if (!lrcText) return [];

  // Garantizar normalización canónica Unicode NFC en UTF-8
  const normalized = typeof lrcText === "string" ? lrcText.normalize("NFC") : "";
  const lines = normalized.split(/\r?\n/);
  const result: SyncedLyricLine[] = [];

  // Detectar desplazamiento global de tiempo [offset:+/-ms]
  let globalOffsetSeconds = 0;
  const offsetRegex = /\[offset:\s*([+-]?\d+)\s*\]/i;
  for (const line of lines) {
    const offsetMatch = line.match(offsetRegex);
    if (offsetMatch) {
      const offsetMs = parseInt(offsetMatch[1], 10);
      if (!isNaN(offsetMs)) {
        globalOffsetSeconds = offsetMs / 1000;
      }
      break;
    }
  }

  // Regex flexible para timestamps: [mm:ss], [mm:ss.xx], [mm:ss.xxx], [mm:ss:xx], [mm:ss:xxx]
  const tagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Omitir metadatos como [ti:...], [ar:...], [al:...], [offset:...]
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) {
      continue;
    }

    // Extraer todas las marcas de tiempo presentes en el verso
    const matches = Array.from(trimmed.matchAll(tagRegex));
    if (matches.length > 0) {
      const text = trimmed.replace(tagRegex, "").trim();
      const parsedInfo = parseBilingualLine(text);

      for (const match of matches) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const fracStr = match[3];
        let fracSeconds = 0;

        if (fracStr) {
          if (fracStr.length === 1) {
            fracSeconds = parseInt(fracStr, 10) / 10;
          } else if (fracStr.length === 2) {
            // Centésimas de segundo estándar (ej: .45 = 0.45s)
            fracSeconds = parseInt(fracStr, 10) / 100;
          } else {
            // Milisegundos (ej: .456 = 0.456s)
            fracSeconds = parseInt(fracStr, 10) / 1000;
          }
        }

        const totalSec = Math.max(0, min * 60 + sec + fracSeconds + globalOffsetSeconds);

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

  // Ordenar versos ascendentemente por tiempo de aparición
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Función: getActiveLyricIndex
 * Propósito: Determina el índice de la línea que debe resaltarse según el tiempo actual de la canción.
 * ¿Cómo funciona?:
 * Recorre la lista de líneas sincronizadas aplicando una pequeña anticipación de 200 milisegundos (-0.2s)
 * para compensar la latencia visual y permitir una lectura fluida antes de que suene la vocal.
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
 * Función: searchLyricsOnline
 * Propósito: Búsqueda automatizada de letras sincronizadas o planas en internet.
 * ¿Cómo funciona?:
 * 1. Limpia sufijos ruidosos del título (ej. "(Official Music Video)", "Remastered", etc.).
 * 2. Consulta en primer lugar la API pública de LRCLIB (GET https://lrclib.net/api/search?q=...).
 * 3. Si encuentra versos sincronizados (.syncedLyrics), los parsea con `parseLrc` y los retorna.
 * 4. Si falla o no hay conexión, recurre como respaldo al backend proxy `/api/lyrics/search`.
 */
export async function searchLyricsOnline(
  track: string,
  artist?: string,
  album?: string,
  duration?: number
): Promise<LyricsResult> {
  const cleanTrack = track
    .replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|webm)$/i, "")
    .replace(/\s*[\(\[](official\s*(music\s*)?video|official\s*audio|video\s*oficial|audio\s*oficial|remastered\s*\d*|lyrics\s*video|letra|4k|hd)[\)\]]/gi, "")
    .trim();
  const cleanArtist = (artist || "").trim();
  const searchQuery = `${cleanArtist} ${cleanTrack}`.trim();

  // 1. Intento directo a la API pública de LRCLIB
  try {
    const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;
    const lrcDirectRes = await fetch(lrclibUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "SonaraMusicPlayer/1.0",
      },
    }).catch(() => null);

    if (lrcDirectRes && lrcDirectRes.ok) {
      const results: LrclibSearchItem[] = await lrcDirectRes.json().catch(() => []);
      if (Array.isArray(results) && results.length > 0) {
        // Priorizar el resultado que contenga letras sincronizadas (.lrc)
        const best = results.find((item: LrclibSearchItem) => item.syncedLyrics) || results[0];
        if (best && (best.syncedLyrics || best.plainLyrics)) {
          const rawLrc = best.syncedLyrics || null;
          const parsed = rawLrc ? parseLrc(rawLrc) : null;
          return {
            source: "lrclib-direct",
            track: best.trackName || cleanTrack,
            artist: best.artistName || cleanArtist,
            album: best.albumName || undefined,
            plainLyrics: best.plainLyrics || "",
            syncedLyrics: parsed && parsed.length > 0 ? parsed : null,
            rawLrc,
            instrumental: Boolean(best.instrumental),
          };
        }
      }
    }
  } catch (directErr: unknown) {
    const errLog = directErr instanceof Error ? directErr.message : String(directErr);
    console.warn("Aviso en búsqueda directa de LRCLIB:", errLog);
  }

  // 2. Respaldo a través del servidor API (/api/lyrics/search)
  try {
    const response = await fetch("/api/lyrics/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        track: cleanTrack,
        artist: cleanArtist,
        album,
        duration,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error en servidor: ${response.status}`);
    }

    const data = await response.json();
    const rawLrc = data.syncedLyrics || null;
    const synced = rawLrc ? parseLrc(rawLrc) : null;

    return {
      source: data.source || "lrclib",
      track: data.track || cleanTrack,
      artist: data.artist || cleanArtist,
      album: data.album || undefined,
      plainLyrics: data.plainLyrics || "",
      syncedLyrics: synced && synced.length > 0 ? synced : null,
      rawLrc,
      instrumental: data.instrumental || false,
      message: data.message,
    };
  } catch (error: unknown) {
    const errLog = error instanceof Error ? error.message : String(error);
    console.warn("Aviso: Error en búsqueda de letras:", errLog);
    return {
      source: "error",
      track: cleanTrack,
      artist: cleanArtist,
      plainLyrics: "",
      syncedLyrics: null,
      rawLrc: null,
      instrumental: false,
      message: "No se pudieron obtener letras automáticas. Puedes añadirlas o editarlas manualmente.",
    };
  }
}
