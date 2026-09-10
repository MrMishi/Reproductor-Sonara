/**
 * ============================================================================
 * SONARA MUSIC - PARSER DE METADATOS Y PORTADAS (metadataParser.ts)
 * ============================================================================
 * Propósito y función del archivo:
 * Este módulo extrae información estructurada de archivos de audio locales:
 * etiquetas ID3v2 (título, artista, álbum, año, carátula incrustada), cálculo
 * de duración en segundos y generación de portadas vectoriales deterministas.
 *
 * ¿Cómo funciona?:
 * 1. `generateCoverArt(title, artist)`: Para pistas sin carátula en los metadatos,
 *    genera un SVG vectorial colorido y determinista (mediante hashing de título y artista)
 *    con efecto de vinilo discográfico e iniciales, codificado en Data URI.
 * 2. `parseID3v2(buffer)`: Lee los primeros 128 KB del archivo en un `ArrayBuffer`.
 *    Analiza cabeceras ID3v2.3 e ID3v2.4 para extraer campos clave (TIT2, TPE1, TALB, APIC)
 *    y decodifica texto en UTF-8, UTF-16 con BOM e ISO-8859-1.
 * 3. `cleanFilename(fileName)`: Limpia el nombre del archivo eliminando extensiones
 *    y separando patrones comunes ("Artista - Canción", "01. Pista", etc.).
 * 4. `getAudioDuration(url, fileSize)`: Carga el audio con `preload="metadata"`
 *    y un temporizador de seguridad de 800 ms con estimación por tasa de bits
 *    si la lectura del DOM falla o es lenta.
 * 5. `parseAudioFile(file, ...)`: Orquesta todo el proceso y crea el objeto `Track`
 *    completo con su URL en memoria y atributos de biblioteca.
 *
 * Guía para futuras actualizaciones:
 * - Para soportar otros formatos con metadatos específicos (Vorbis comments de OGG/FLAC),
 *   añadir lectores de cabeceras complementarios aquí.
 */

import { Track } from "../types";

/**
 * Función: generateCoverArt
 * Propósito: Genera una portada en formato SVG vectorial determinista para pistas sin carátula incrustada.
 * ¿Cómo funciona?:
 * 1. Calcula un hash numérico basado en los caracteres de `title` y `artist`.
 * 2. Deriva dos tonalidades HSL complementarias para el degradado de fondo.
 * 3. Dibuja un disco de vinilo estilizado con surcos radiales concéntricos y centro oscuro.
 * 4. Coloca las iniciales en tipografía sans-serif y retorna un data URI (`data:image/svg+xml;...`).
 */
export function generateCoverArt(title: string, artist: string): string {
  const seed = `${title}-${artist}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 45 + (Math.abs(hash) % 70)) % 360;
  const initial1 = (title.trim()[0] || "M").toUpperCase();
  const initial2 = (artist.trim()[0] || "").toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="grad-${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 75%, 45%)" />
        <stop offset="100%" stop-color="hsl(${hue2}, 85%, 25%)" />
      </linearGradient>
      <radialGradient id="disc-${Math.abs(hash)}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.15)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.4)" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grad-${Math.abs(hash)})" />
    <circle cx="150" cy="150" r="110" fill="url(#disc-${Math.abs(hash)})" stroke="rgba(255,255,255,0.08)" stroke-width="6" />
    <circle cx="150" cy="150" r="40" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
    <circle cx="150" cy="150" r="14" fill="#111" />
    <text x="150" y="270" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${initial1}${initial2 ? " · " + initial2 : ""}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Función: parseID3v2
 * Propósito: Lee y extrae etiquetas ID3v2 (título, artista, álbum, año y carátula APIC) de los primeros 128 KB.
 * ¿Cómo funciona?:
 * 1. Verifica los 3 primeros bytes mágicos ('ID3'). Si no coinciden, retorna un objeto vacío.
 * 2. Determina el tamaño del bloque ID3 mediante codificación "syncsafe" de 7 bits por byte.
 * 3. Itera a través de los frames:
 *    - TIT2: Título de la pista.
 *    - TPE1 / TPE2: Artista o intérprete.
 *    - TALB: Nombre del álbum.
 *    - TYER / TDRC: Año o fecha de grabación.
 *    - APIC: Carátula incrustada (extrae el tipo MIME y genera un Blob URL con los bytes de imagen).
 * 4. Soporta decodificación de texto en UTF-8, UTF-16LE, UTF-16BE e ISO-8859-1.
 */
function parseID3v2(buffer: ArrayBuffer): {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  coverUrl?: string;
} {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return {};

  // Check header 'ID3'
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return {};
  }

  const version = bytes[3];
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);

  const maxLen = Math.min(bytes.length, 10 + size);
  let pos = 10;
  const result: {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    coverUrl?: string;
  } = {};

  const decoderUtf8 = new TextDecoder("utf-8");
  const decoderUtf8Strict = new TextDecoder("utf-8", { fatal: true });
  const decoderLatin1 = new TextDecoder("iso-8859-1");
  const decoderUtf16 = new TextDecoder("utf-16le");

  function decodeText(data: Uint8Array): string {
    if (data.length === 0) return "";
    const encoding = data[0];
    const textBytes = data.slice(1);
    try {
      if (encoding === 1 || encoding === 2) {
        return decoderUtf16.decode(textBytes).replace(/\0/g, "").trim();
      } else if (encoding === 3) {
        return decoderUtf8.decode(textBytes).replace(/\0/g, "").trim();
      } else {
        // Many Asian/Japanese MP3s store UTF-8 even when tag specifies encoding 0 (Latin1)
        try {
          const strictUtf8 = decoderUtf8Strict.decode(textBytes).replace(/\0/g, "").trim();
          if (strictUtf8 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(strictUtf8)) {
            return strictUtf8;
          }
          return strictUtf8 || decoderLatin1.decode(textBytes).replace(/\0/g, "").trim();
        } catch {
          return decoderLatin1.decode(textBytes).replace(/\0/g, "").trim();
        }
      }
    } catch {
      return decoderLatin1.decode(textBytes).replace(/\0/g, "").trim();
    }
  }

  while (pos + 10 < maxLen) {
    let frameId = "";
    let frameSize = 0;

    if (version === 3 || version === 4) {
      frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      if (version === 4) {
        frameSize =
          ((bytes[pos + 4] & 0x7f) << 21) |
          ((bytes[pos + 5] & 0x7f) << 14) |
          ((bytes[pos + 6] & 0x7f) << 7) |
          (bytes[pos + 7] & 0x7f);
      } else {
        frameSize =
          (bytes[pos + 4] << 24) |
          (bytes[pos + 5] << 16) |
          (bytes[pos + 6] << 8) |
          bytes[pos + 7];
      }
      pos += 10;
    } else {
      break;
    }

    if (frameSize <= 0 || pos + frameSize > maxLen || !/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameData = bytes.slice(pos, pos + frameSize);

    if (frameId === "TIT2" && !result.title) {
      result.title = decodeText(frameData);
    } else if ((frameId === "TPE1" || frameId === "TPE2") && !result.artist) {
      result.artist = decodeText(frameData);
    } else if (frameId === "TALB" && !result.album) {
      result.album = decodeText(frameData);
    } else if ((frameId === "TYER" || frameId === "TDRC") && !result.year) {
      result.year = decodeText(frameData);
    } else if (frameId === "APIC" && !result.coverUrl) {
      // Extract picture
      try {
        let p = 1;
        // Skip mime type
        let mime = "image/jpeg";
        const mimeEnd = frameData.indexOf(0, p);
        if (mimeEnd > p) {
          mime = decoderLatin1.decode(frameData.slice(p, mimeEnd)).trim();
          p = mimeEnd + 1;
        } else {
          p += 1;
        }
        // Skip picture type byte
        p += 1;
        // Skip description string
        const descEnd = frameData.indexOf(0, p);
        if (descEnd >= p) {
          p = descEnd + 1;
          // In some encodings, null is 2 bytes
          if (frameData[p] === 0) p += 1;
        }
        if (p < frameData.length) {
          const imgBytes = frameData.slice(p);
          const blob = new Blob([imgBytes], { type: mime || "image/jpeg" });
          result.coverUrl = URL.createObjectURL(blob);
        }
      } catch (e) {
        // cover parse fallback
      }
    }

    pos += frameSize;
  }

  return result;
}

/**
 * Función: cleanFilename
 * Propósito: Limpia y descompone el nombre del archivo en título y artista legibles cuando faltan etiquetas ID3.
 * ¿Cómo funciona?:
 * 1. Elimina la extensión del archivo (.mp3, .flac, etc.).
 * 2. Reconoce separadores tipo "Artista - Título" o "01 - Artista - Título".
 * 3. Remueve números de pista y prefijos de índice (ej: "01. ", "02_").
 * 4. Devuelve un objeto `{ title, artist }` con valores de respaldo claros.
 */
export function cleanFilename(fileName: string): { title: string; artist: string } {
  // Remove extension
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

  // Common patterns: "Artist - Title", "01 - Artist - Title", "01. Title", "Artist - 01 - Title"
  const splitDash = nameWithoutExt.split(/\s+-\s+/);
  if (splitDash.length >= 2) {
    // Check if first is track number
    if (/^\d+$/.test(splitDash[0].trim()) && splitDash.length >= 3) {
      return {
        artist: splitDash[1].trim(),
        title: splitDash.slice(2).join(" - ").trim(),
      };
    }
    return {
      artist: splitDash[0].replace(/^\d+[\s._-]+/, "").trim(),
      title: splitDash.slice(1).join(" - ").trim(),
    };
  }

  // "01 Title" or "01. Title"
  const cleanTitle = nameWithoutExt.replace(/^\d+[\s._-]+/, "").trim();
  return {
    title: cleanTitle || nameWithoutExt,
    artist: "Artista Desconocido",
  };
}

/**
 * Función: getAudioDuration
 * Propósito: Determina la duración exacta de un archivo de audio mediante la API de Audio de HTML5.
 * ¿Cómo funciona?:
 * 1. Instancia un elemento `new Audio()` efímero con `preload = "metadata"`.
 * 2. Escucha los eventos `onloadedmetadata` y `ondurationchange`.
 * 3. Incluye un temporizador de seguridad de 800 ms que calcula un tiempo estimado
 *    basado en el tamaño del archivo (~16 KB/s para 128 kbps) si el navegador tarda en responder.
 * 4. Limpia los eventos y resuelve la promesa de forma segura.
 */
export function getAudioDuration(url: string, fileSize?: number): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    let resolved = false;

    // Estimate duration based on file size (~128kbps = ~16KB/s) if metadata read is unavailable or slow
    const estimatedSec = fileSize && fileSize > 0
      ? Math.max(1, Math.min(900, Math.round(fileSize / (16 * 1024))))
      : 60;

    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.onerror = null;
      try {
        audio.src = "";
      } catch {
        // ignore
      }
    };

    const finish = (sec: number) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        cleanup();
        resolve(sec && !isNaN(sec) && isFinite(sec) && sec > 0 ? sec : estimatedSec);
      }
    };

    const timer = setTimeout(() => {
      finish(estimatedSec);
    }, 800);

    audio.onloadedmetadata = () => {
      finish(audio.duration);
    };

    audio.ondurationchange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        finish(audio.duration);
      }
    };

    audio.onerror = () => {
      finish(estimatedSec);
    };

    try {
      audio.src = url;
      audio.load();
    } catch {
      finish(estimatedSec);
    }
  });
}

/**
 * Función: parseAudioFile
 * Propósito: Convierte un objeto `File` seleccionado del sistema en una pista completa (`Track`) para la biblioteca.
 * ¿Cómo funciona?:
 * 1. Filtro estricto: Descarta notas de voz de WhatsApp si el nombre inicia con 'PTT-'.
 * 2. Genera una URL en memoria (`URL.createObjectURL(file)`).
 * 3. Lee los primeros 128 KB para extraer etiquetas ID3v2 (título, artista, año, carátula incrustada).
 * 4. Obtiene la duración en segundos con `getAudioDuration()`.
 * 5. Si no posee carátula en ID3, genera una vectorial personalizada mediante `generateCoverArt()`.
 * 6. Extrae la jerarquía de carpetas relativas si el usuario subió una carpeta completa (`webkitRelativePath`).
 * 7. Retorna la pista instanciada con identificador único.
 */
export async function parseAudioFile(
  file: File,
  filterShortAudios: boolean = false,
  minDurationSeconds: number = 30
): Promise<Track | null> {
  // Filtro de notas de voz: descarta si el nombre comienza por 'PTT-' (WhatsApp Push-To-Talk)
  // El prefijo 'AUD-' se admite para canciones legítimas
  if (/^PTT-/i.test(file.name)) {
    return null;
  }

  const url = URL.createObjectURL(file);
  const { title: fallbackTitle, artist: fallbackArtist } = cleanFilename(file.name);

  let id3: { title?: string; artist?: string; album?: string; year?: string; coverUrl?: string } = {};

  try {
    // Read first 128KB for ID3v2 tags
    const slice = file.slice(0, 131072);
    const buffer = await slice.arrayBuffer();
    id3 = parseID3v2(buffer);
  } catch (err) {
    console.warn("Failed reading ID3 tags:", err);
  }

  const duration = await getAudioDuration(url, file.size);

  // Filtro de notas de voz / audios cortos:
  // NO descarta canciones si el metadato de tiempo aún no se ha terminado de leer (duration <= 0).
  if (filterShortAudios && duration && duration > 0 && duration < minDurationSeconds) {
    return null;
  }

  const finalTitle = id3.title || fallbackTitle;
  const finalArtist = id3.artist || fallbackArtist;
  const coverUrl = id3.coverUrl || generateCoverArt(finalTitle, finalArtist);

  // Extraer estructura de carpeta de origen
  let folderPath = "Música del Dispositivo";
  if ((file as any).webkitRelativePath) {
    const parts = (file as any).webkitRelativePath.split("/");
    if (parts.length > 1) {
      folderPath = parts.slice(0, -1).join(" / ");
    }
  }

  return {
    id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: finalTitle,
    artist: finalArtist,
    album: id3.album || "Álbum del dispositivo",
    year: id3.year,
    duration,
    url,
    file,
    coverUrl,
    format: file.type || file.name.split(".").pop()?.toUpperCase() || "AUDIO",
    size: file.size,
    addedAt: Date.now(),
    isFavorite: false,
    folderPath,
  };
}
