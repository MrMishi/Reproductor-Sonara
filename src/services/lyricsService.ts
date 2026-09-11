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

import { SyncedLyricLine, Track } from "../types";

/**
 * URL base del backend oficial de Sonora
 */
export const BACKEND_BASE_URL = "https://sonara-backend-zpjn.onrender.com";

/**
 * Endpoint de la API de transcripción para convertir texto japonés (Kanji/Kana) a Romaji
 */
export const TRANSCRIBE_API_URL = `${BACKEND_BASE_URL}/api/transcribe`;

/**
 * Estructura de respuesta devuelta por la API /api/transcribe
 */
export interface TranscribeApiResponse {
  original: string;
  romaji: string;
  detail?: string;
}

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
  /** Transcripción completa en texto plano de las letras a Romaji */
  romajiPlain?: string;
  /** Líneas de texto plano emparejadas con su fonética Romaji */
  pairedPlainLines?: { original: string; romaji?: string }[];
  /** Bandera booleana que indica si contiene caracteres japoneses */
  hasJapanese?: boolean;
  instrumental?: boolean;
  message?: string;
}

/**
 * Expresión regular para detectar caracteres japoneses nativos:
 * - Hiragana (\u3040-\u309F)
 * - Katakana (\u30A0-\u30FF)
 * - Kanji (\u4E00-\u9FAF)
 * - Extensiones Kanji y Katakana de medio ancho (\u3400-\u4DBF, \uFF66-\uFF9F)
 */
export const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\uFF66-\uFF9F]/;

/**
 * Caché en memoria para evitar peticiones duplicadas de transcripción para la misma línea o verso.
 */
const romajiMemoryCache = new Map<string, string>();

/**
 * Expresión regular para detectar encabezados de bloques comunes que dividen canciones en dos mitades:
 * Ejemplos: "**[Kanji / Kana]**", "**[Romaji]**", "[Kanji]", "[Romaji]", "[Kana]", "**[Kanji]**", "**[Rōmaji]**"
 */
export const BLOCK_HEADER_REGEX = /^\s*(\*{0,2}\[?(?:kanji(?:\s*[\/|\\]\s*kana)?|kana|romaji|rōmaji|original|pronunciaci[oó]n|jap[oó]n[eé]s)\]?\*{0,2})\s*$/i;

/**
 * Función: normalizeInterlinearLyrics
 * Propósito: Detecta y elimina concatenaciones en bloques tipo "**[Kanji / Kana]**" o "**[Romaji]**".
 * Si la letra viene dividida en dos bloques (una mitad en Kanji y otra en Romaji),
 * extrae ambas secciones y las empareja línea por línea de forma interlineal ({ original, romaji }),
 * evitando que la canción quede dividida en dos mitades separadas.
 */
export function normalizeInterlinearLyrics(text: string): {
  normalizedPlain: string;
  pairedLines: { original: string; romaji?: string }[];
  detectedBlocks: boolean;
} {
  if (!text) {
    return { normalizedPlain: "", pairedLines: [], detectedBlocks: false };
  }

  const rawLines = text.split(/\r?\n/);

  // Buscar índices de división de bloques
  let kanjiHeaderIndex = -1;
  let romajiHeaderIndex = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (/^\s*\*{0,2}\[?(?:kanji(?:\s*[\/|\\]\s*kana)?|kana|original|jap[oó]n[eé]s)\]?\*{0,2}\s*$/i.test(line)) {
      kanjiHeaderIndex = i;
    } else if (/^\s*\*{0,2}\[?(?:romaji|rōmaji|pronunciaci[oó]n)\]?\*{0,2}\s*$/i.test(line)) {
      romajiHeaderIndex = i;
    }
  }

  // Si se detectaron ambos bloques (primero Kanji y luego Romaji)
  if (romajiHeaderIndex > -1 && romajiHeaderIndex > kanjiHeaderIndex) {
    const block1Lines = rawLines
      .slice(kanjiHeaderIndex >= 0 ? kanjiHeaderIndex + 1 : 0, romajiHeaderIndex)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !BLOCK_HEADER_REGEX.test(l));

    const block2Lines = rawLines
      .slice(romajiHeaderIndex + 1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !BLOCK_HEADER_REGEX.test(l));

    const maxLen = Math.max(block1Lines.length, block2Lines.length);
    const paired: { original: string; romaji?: string }[] = [];
    const plainCombined: string[] = [];

    for (let i = 0; i < maxLen; i++) {
      const orig = block1Lines[i] || "";
      const rom = block2Lines[i] || "";
      if (orig || rom) {
        paired.push({ original: orig || rom, romaji: orig && rom ? rom : undefined });
        if (orig) plainCombined.push(orig);
        if (rom && orig !== rom) plainCombined.push(rom);
        plainCombined.push("");
      }
    }

    return {
      normalizedPlain: plainCombined.join("\n").trim(),
      pairedLines: paired,
      detectedBlocks: true,
    };
  }

  // Si no hay división en bloques, limpiamos cualquier encabezado aislado
  const cleanedLines = rawLines.filter((l) => !BLOCK_HEADER_REGEX.test(l));
  const paired: { original: string; romaji?: string }[] = cleanedLines.map((l) => ({ original: l }));

  return {
    normalizedPlain: cleanedLines.join("\n"),
    pairedLines: paired,
    detectedBlocks: false,
  };
}

/**
 * Función: transcribeTextToRomaji
 * Propósito: Envía una petición POST a 'https://sonara-backend-zpjn.onrender.com/api/transcribe'
 * con el texto en formato JSON: { "text": "letra_en_japones" } para obtener la pronunciación en Romaji.
 * 
 * PRESERVACIÓN RIGUROSA DE ETIQUETAS DE TIEMPO [mm:ss.xx]:
 * - Separa cualquier marca de tiempo previa del texto en japonés.
 * - Envía ÚNICAMENTE el texto puro en japonés a 'https://sonara-backend-zpjn.onrender.com/api/transcribe'.
 * - Retorna la transcripción en Romaji limpia.
 */
export async function transcribeTextToRomaji(text: string): Promise<string> {
  const trimmed = (text || "").trim();
  if (!trimmed) return "";

  // 1. SEPARAR la marca de tiempo (ej. '[00:12.34]') del texto en japonés
  const timestampRegex = /^(\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/;
  const timestampMatch = trimmed.match(timestampRegex);
  const pureJapaneseText = (timestampMatch ? trimmed.slice(timestampMatch[0].length) : trimmed).trim();

  // Si no contiene caracteres japoneses (Kanji/Kana), no es necesario transcribir
  if (!hasJapaneseText(pureJapaneseText)) {
    return pureJapaneseText;
  }

  // Verificar si el texto ya se encuentra en la caché en memoria
  if (romajiMemoryCache.has(pureJapaneseText)) {
    return romajiMemoryCache.get(pureJapaneseText)!;
  }

  try {
    // 2. Envía ÚNICAMENTE el texto en japonés a 'https://sonara-backend-zpjn.onrender.com/api/transcribe'
    const response = await fetch(TRANSCRIBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ text: pureJapaneseText }),
    });

    if (!response.ok) {
      console.warn(`[Transcribe API] Error HTTP ${response.status} transcribiendo texto: "${pureJapaneseText.slice(0, 25)}..."`);
      return pureJapaneseText;
    }

    const data: TranscribeApiResponse = await response.json();
    if (data && typeof data.romaji === "string" && data.romaji.trim().length > 0) {
      // Limpiar cualquier residuo de etiquetas para devolver únicamente el Romaji puro
      const romajiResult = data.romaji.replace(timestampRegex, "").trim();
      romajiMemoryCache.set(pureJapaneseText, romajiResult);
      return romajiResult;
    }
  } catch (err) {
    console.warn(`[Transcribe API] Error conectando con ${TRANSCRIBE_API_URL}:`, err);
  }

  return pureJapaneseText;
}

/**
 * Función: transcribeSyncedLyricLines
 * Propósito: Detecta automáticamente si las líneas sincronizadas (.lrc) contienen caracteres japoneses (Kanji/Kana).
 * 
 * PRESERVACIÓN RIGUROSA DE ETIQUETAS DE TIEMPO [mm:ss.xx]:
 * 1. SEPARA la marca de tiempo (ej. '[00:12.34]') del texto en japonés de cada verso.
 * 2. Envía ÚNICAMENTE el texto en japonés a 'https://sonara-backend-zpjn.onrender.com/api/transcribe'.
 * 3. Al recibir la respuesta en Romaji, vuelve a vincular la marca de tiempo original al objeto de la línea:
 *    { time: 12.34, original: "...", romaji: "..." }
 */
export async function transcribeSyncedLyricLines(
  lines: SyncedLyricLine[]
): Promise<SyncedLyricLine[]> {
  if (!lines || lines.length === 0) return [];

  const timestampRegex = /^(\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/;

  // Filtrar posibles encabezados de bloques residuales
  const filteredLines = lines.filter((l) => !BLOCK_HEADER_REGEX.test(l.text || l.original || ""));

  // 1. Separar rigurosamente las marcas de tiempo del texto original para cada línea
  const preparedLines = filteredLines.map((line) => {
    const rawText = (line.original || line.nativeText || line.text || "").trim();
    const pureText = rawText.replace(timestampRegex, "").trim();
    const isJap = line.hasJapanese || hasJapaneseText(pureText);

    return {
      sourceLine: line,
      time: line.time,
      pureOriginal: pureText,
      hasJapanese: isJap,
    };
  });

  // Comprobar si al menos una línea contiene caracteres japoneses
  const anyJapanese = preparedLines.some((p) => p.hasJapanese);

  if (!anyJapanese) {
    return preparedLines.map(({ sourceLine, time, pureOriginal }) => ({
      ...sourceLine,
      time,
      original: pureOriginal,
      text: pureOriginal,
    }));
  }

  // 2. Identificar y recolectar ÚNICAMENTE el texto en japonés sin marcas de tiempo
  const uniqueTexts = new Set<string>();
  for (const item of preparedLines) {
    if (item.hasJapanese && item.pureOriginal && (!item.sourceLine.romaji || item.sourceLine.romaji.trim().length === 0)) {
      uniqueTexts.add(item.pureOriginal);
    }
  }

  if (uniqueTexts.size > 0) {
    // Procesar en lotes concurrentes enviando ÚNICAMENTE el texto en japonés
    const uniqueArray = Array.from(uniqueTexts);
    const BATCH_SIZE = 6;
    for (let i = 0; i < uniqueArray.length; i += BATCH_SIZE) {
      const batch = uniqueArray.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((japaneseText) => transcribeTextToRomaji(japaneseText)));
    }
  }

  // 3. Al recibir la respuesta en Romaji, vuelve a vincular la marca de tiempo original al objeto de la línea:
  //    { time: 12.34, original: "...", romaji: "..." }
  return preparedLines.map(({ sourceLine, time, pureOriginal, hasJapanese: isJap }) => {
    let romaji = sourceLine.romaji;
    if (isJap && (!romaji || romaji.trim().length === 0)) {
      romaji = romajiMemoryCache.get(pureOriginal);
    }

    return {
      ...sourceLine,
      time, // Marca de tiempo [mm:ss.xx] intacta en segundos
      original: pureOriginal, // Texto en japonés limpio
      romaji: romaji || undefined, // Pronunciación Romaji vinculada
      text: pureOriginal,
      nativeText: isJap ? pureOriginal : sourceLine.nativeText,
      hasJapanese: isJap,
    };
  });
}

/**
 * Función: transcribePlainLyrics
 * Propósito: Detecta si la letra en texto plano contiene caracteres japoneses o bloques separados,
 * elimina la división en bloques y obtiene la pronunciación en Romaji para cada línea/verso,
 * devolviendo líneas emparejadas interlinealmente ({ original, romaji }).
 */
export async function transcribePlainLyrics(
  plainLyrics: string
): Promise<{
  plain: string;
  romajiPlain?: string;
  pairedLines?: { original: string; romaji?: string }[];
  hasJapanese?: boolean;
}> {
  if (!plainLyrics) {
    return { plain: "", hasJapanese: false };
  }

  // 1. Detectar y eliminar primero concatenaciones de bloques tipo "**[Kanji / Kana]**" o "**[Romaji]**"
  const normalized = normalizeInterlinearLyrics(plainLyrics);

  // Si se detectaron y unificaron bloques ya existentes con Romaji
  if (normalized.detectedBlocks && normalized.pairedLines.length > 0) {
    const hasJap = normalized.pairedLines.some((p) => hasJapaneseText(p.original));
    return {
      plain: normalized.normalizedPlain,
      romajiPlain: normalized.pairedLines.map((p) => p.romaji || p.original).join("\n"),
      pairedLines: normalized.pairedLines,
      hasJapanese: hasJap,
    };
  }

  if (!hasJapaneseText(normalized.normalizedPlain)) {
    return { plain: normalized.normalizedPlain, hasJapanese: false };
  }

  const rawLines = normalized.normalizedPlain.split(/\r?\n/);
  const uniqueJapaneseLines = new Set<string>();

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed && hasJapaneseText(trimmed)) {
      uniqueJapaneseLines.add(trimmed);
    }
  }

  if (uniqueJapaneseLines.size > 0) {
    const uniqueArray = Array.from(uniqueJapaneseLines);
    const BATCH_SIZE = 6;
    for (let i = 0; i < uniqueArray.length; i += BATCH_SIZE) {
      const batch = uniqueArray.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((text) => transcribeTextToRomaji(text)));
    }
  }

  const pairedLines: { original: string; romaji?: string }[] = [];
  const romajiLines: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      pairedLines.push({ original: line });
      romajiLines.push("");
      continue;
    }

    if (hasJapaneseText(trimmed)) {
      const romaji = romajiMemoryCache.get(trimmed) || "";
      pairedLines.push({ original: line, romaji: romaji || undefined });
      romajiLines.push(romaji || line);
    } else {
      pairedLines.push({ original: line });
      romajiLines.push(line);
    }
  }

  return {
    plain: normalized.normalizedPlain,
    romajiPlain: romajiLines.join("\n"),
    pairedLines,
    hasJapanese: true,
  };
}

/**
 * Función: clearLyricsMemoryCache
 * Propósito: Limpia la memoria caché interna de transliteraciones Romaji.
 */
export function clearLyricsMemoryCache(): void {
  romajiMemoryCache.clear();
}

/**
 * Función: enrichLyricsWithRomaji
 * Propósito: Inspecciona el objeto lyrics de una pista y, si contiene texto en japonés sin Romaji,
 * lo enriquece automáticamente mediante la API de transcripción.
 */
export async function enrichLyricsWithRomaji(
  lyrics: Track["lyrics"]
): Promise<Track["lyrics"]> {
  if (!lyrics) return lyrics;

  let hasJap = false;
  let updatedSynced = lyrics.synced;
  let updatedPlain = lyrics.plain;
  let updatedRomajiPlain = lyrics.romajiPlain;
  let updatedPairedLines = lyrics.pairedPlainLines;

  // 1. Verificar y transcribir versos sincronizados
  if (updatedSynced && updatedSynced.length > 0) {
    const containsJapanese = updatedSynced.some(
      (l) => l.hasJapanese || hasJapaneseText(l.text) || hasJapaneseText(l.nativeText || "")
    );
    if (containsJapanese) {
      hasJap = true;
      updatedSynced = await transcribeSyncedLyricLines(updatedSynced);
    }
  }

  // 2. Verificar y transcribir texto plano
  if (updatedPlain && hasJapaneseText(updatedPlain)) {
    hasJap = true;
    if (!updatedPairedLines || updatedPairedLines.length === 0) {
      const plainResult = await transcribePlainLyrics(updatedPlain);
      updatedRomajiPlain = plainResult.romajiPlain;
      updatedPairedLines = plainResult.pairedLines;
    }
  }

  return {
    ...lyrics,
    synced: updatedSynced,
    plain: updatedPlain,
    romajiPlain: updatedRomajiPlain,
    pairedPlainLines: updatedPairedLines,
    hasJapanese: hasJap || lyrics.hasJapanese,
  };
}

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

    // Omitir metadatos como [ti:...], [ar:...], [al:...], [offset:...] y encabezados de bloque residuales
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed) || BLOCK_HEADER_REGEX.test(trimmed)) {
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
          original: text || "♪ ♪",
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
 * Función auxiliar: postProcessLyricsResult
 * Propósito: Detecta automáticamente si las letras obtenidas contienen caracteres japoneses (Kanji/Kana)
 * y realiza la transcripción fonética a Romaji mediante el endpoint '/api/transcribe'.
 */
async function postProcessLyricsResult(result: LyricsResult): Promise<LyricsResult> {
  try {
    let hasJap = false;
    let synced = result.syncedLyrics;
    let romajiPlain = result.romajiPlain;
    let pairedPlainLines = result.pairedPlainLines;

    // 1. Detectar y transcribir automáticamente versos sincronizados
    if (synced && synced.length > 0) {
      const anyJap = synced.some(
        (l) => l.hasJapanese || hasJapaneseText(l.text) || hasJapaneseText(l.nativeText || "")
      );
      if (anyJap) {
        hasJap = true;
        synced = await transcribeSyncedLyricLines(synced);
      }
    }

    // 2. Detectar y transcribir automáticamente texto plano
    if (result.plainLyrics && hasJapaneseText(result.plainLyrics)) {
      hasJap = true;
      if (!pairedPlainLines || pairedPlainLines.length === 0) {
        const plainResult = await transcribePlainLyrics(result.plainLyrics);
        romajiPlain = plainResult.romajiPlain;
        pairedPlainLines = plainResult.pairedLines;
      }
    }

    return {
      ...result,
      syncedLyrics: synced,
      romajiPlain,
      pairedPlainLines,
      hasJapanese: hasJap,
    };
  } catch (err) {
    console.warn("Aviso: Error procesando transcripción automática a Romaji:", err);
    return result;
  }
}

/**
 * Función: searchLyricsOnline
 * Propósito: Búsqueda automatizada de letras sincronizadas o planas en internet.
 * ¿Cómo funciona?:
 * 1. Limpia sufijos ruidosos del título (ej. "(Official Music Video)", "Remastered", etc.).
 * 2. Consulta en primer lugar la API pública de LRCLIB (GET https://lrclib.net/api/search?q=...).
 * 3. Si encuentra versos sincronizados (.syncedLyrics), los parsea con `parseLrc` y los retorna.
 * 4. Si falla o no hay conexión, recurre como respaldo al backend proxy `/api/lyrics/search`.
 * 5. Si detecta caracteres japoneses (Kanji/Kana), envía las líneas a 'https://sonara-backend-zpjn.onrender.com/api/transcribe'
 *    para obtener automáticamente la pronunciación en Romaji.
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
        // PRIORIZAR LETRAS SINCRONIZADAS (SYNCED LYRICS)
        // Priorizar estrictamente canciones con 'syncedLyrics' sobre 'plainLyrics'
        const best =
          results.find((item: LrclibSearchItem) => item.syncedLyrics && item.syncedLyrics.trim().length > 0) ||
          results.find((item: LrclibSearchItem) => item.plainLyrics && item.plainLyrics.trim().length > 0) ||
          results[0];

        if (best && (best.syncedLyrics || best.plainLyrics)) {
          const rawLrc = best.syncedLyrics || null;
          const parsed = rawLrc ? parseLrc(rawLrc) : null;
          return await postProcessLyricsResult({
            source: "lrclib-direct",
            track: best.trackName || cleanTrack,
            artist: best.artistName || cleanArtist,
            album: best.albumName || undefined,
            plainLyrics: best.plainLyrics || "",
            syncedLyrics: parsed && parsed.length > 0 ? parsed : null,
            rawLrc,
            instrumental: Boolean(best.instrumental),
          });
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

    return await postProcessLyricsResult({
      source: data.source || "lrclib",
      track: data.track || cleanTrack,
      artist: data.artist || cleanArtist,
      album: data.album || undefined,
      plainLyrics: data.plainLyrics || "",
      syncedLyrics: synced && synced.length > 0 ? synced : null,
      rawLrc,
      instrumental: data.instrumental || false,
      message: data.message,
    });
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
