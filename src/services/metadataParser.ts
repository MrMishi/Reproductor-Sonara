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
 * Extensiones de contenedores de video compatibles para extraer y reproducir su pista de audio local
 */
export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".3gp"];

/**
 * Límite máximo de duración para archivos de video permitidos: 480 segundos (8 minutos).
 * Cualquier video con duración mayor a 480 segundos se descarta automáticamente para evitar
 * películas o capítulos largos en la biblioteca de música.
 */
export const MAX_VIDEO_DURATION_SECONDS = 480;

/**
 * Función: isVideoFilename
 * Determina si el nombre de un archivo corresponde a un contenedor de video soportado (.mp4, .mkv, .webm, .3gp).
 */
export function isVideoFilename(fileName: string): boolean {
  if (!fileName || typeof fileName !== "string") return false;
  const lower = fileName.trim().toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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
 * Corrige el error común de etiquetas donde texto en español/latino guardado en UTF-16
 * fue invertido de endianness (Big/Little Endian) haciendo que parezca caracteres chinos.
 */
export function unswapMojibake(str: string): string {
  if (!str || str.length === 0) return str;
  let swappedCount = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code & 0xff) === 0 && (code >> 8) >= 0x20 && (code >> 8) <= 0xff) {
      swappedCount++;
    }
  }
  // Si la mitad o más de los caracteres tienen el byte bajo en 0x00 y el alto en rango imprimible, desinvertir
  if (swappedCount > 0 && swappedCount >= Math.floor(str.length * 0.5)) {
    let unswapped = "";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if ((code & 0xff) === 0 && (code >> 8) >= 0x20) {
        unswapped += String.fromCharCode(code >> 8);
      } else {
        unswapped += str[i];
      }
    }
    return unswapped.replace(/\0/g, "").trim();
  }
  return str;
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
function parseID3v2(
  buffer: ArrayBuffer,
  extractCover: boolean = true
): {
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
  const decoderUtf16Le = new TextDecoder("utf-16le");
  const decoderUtf16Be = new TextDecoder("utf-16be");

  function decodeText(data: Uint8Array): string {
    if (data.length <= 1) return "";
    const encoding = data[0];
    const textBytes = data.slice(1);
    let decoded = "";

    try {
      if (encoding === 1) {
        // UTF-16 con BOM
        if (textBytes.length >= 2 && textBytes[0] === 0xfe && textBytes[1] === 0xff) {
          // Big Endian explícito (0xFE 0xFF)
          decoded = decoderUtf16Be.decode(textBytes.slice(2));
        } else if (textBytes.length >= 2 && textBytes[0] === 0xff && textBytes[1] === 0xfe) {
          // Little Endian explícito (0xFF 0xFE)
          decoded = decoderUtf16Le.decode(textBytes.slice(2));
        } else {
          // Sin BOM: analizar alineación de bytes nulos para evitar caracteres chinos espurios
          if (textBytes.length >= 2 && textBytes[0] === 0x00 && textBytes[1] !== 0x00) {
            decoded = decoderUtf16Be.decode(textBytes);
          } else {
            decoded = decoderUtf16Le.decode(textBytes);
          }
        }
      } else if (encoding === 2) {
        // UTF-16BE sin BOM
        decoded = decoderUtf16Be.decode(textBytes);
      } else if (encoding === 3) {
        // UTF-8
        decoded = decoderUtf8.decode(textBytes);
      } else {
        // Encoding 0: ISO-8859-1 (Latin-1)
        // Muchos programas guardan UTF-16 o UTF-8 aunque marquen encoding 0
        if (textBytes.length >= 4) {
          if (textBytes[0] === 0x00 && textBytes[2] === 0x00) {
            decoded = decoderUtf16Be.decode(textBytes);
          } else if (textBytes[1] === 0x00 && textBytes[3] === 0x00) {
            decoded = decoderUtf16Le.decode(textBytes);
          }
        }
        if (!decoded) {
          try {
            decoded = decoderUtf8Strict.decode(textBytes);
          } catch {
            decoded = decoderLatin1.decode(textBytes);
          }
        }
      }
    } catch {
      decoded = decoderLatin1.decode(textBytes);
    }

    decoded = decoded.replace(/\0/g, "").trim();
    // Reparar mojibake por inversión de bytes si ocurrió
    decoded = unswapMojibake(decoded);

    return decoded;
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
      const decoded = decodeText(frameData);
      if (decoded && !/^[\s\-_.,;:]+$/.test(decoded)) {
        result.title = decoded;
      }
    } else if ((frameId === "TPE1" || frameId === "TPE2") && !result.artist) {
      const decoded = decodeText(frameData);
      if (decoded && !/^[\s\-_.,;:]+$/.test(decoded)) {
        result.artist = decoded;
      }
    } else if (frameId === "TALB" && !result.album) {
      const decoded = decodeText(frameData);
      if (decoded && !/^[\s\-_.,;:]+$/.test(decoded)) {
        result.album = decoded;
      }
    } else if ((frameId === "TYER" || frameId === "TDRC") && !result.year) {
      const decoded = decodeText(frameData);
      const matchYear = decoded.match(/\b(19\d\d|20\d\d)\b/);
      result.year = matchYear ? matchYear[1] : decoded.slice(0, 4);
    } else if (frameId === "APIC" && extractCover && !result.coverUrl) {
      // Extracción infalible de carátula buscando encabezados binarios reales de imagen (JPEG, PNG, GIF, WEBP)
      try {
        let imageOffset = -1;
        let detectedMime = "image/jpeg";

        for (let i = 1; i < frameData.length - 4; i++) {
          // JPEG: FF D8 FF
          if (frameData[i] === 0xff && frameData[i + 1] === 0xd8 && frameData[i + 2] === 0xff) {
            imageOffset = i;
            detectedMime = "image/jpeg";
            break;
          }
          // PNG: 89 50 4E 47
          if (frameData[i] === 0x89 && frameData[i + 1] === 0x50 && frameData[i + 2] === 0x4e && frameData[i + 3] === 0x47) {
            imageOffset = i;
            detectedMime = "image/png";
            break;
          }
          // GIF: 47 49 46 38
          if (frameData[i] === 0x47 && frameData[i + 1] === 0x49 && frameData[i + 2] === 0x46 && frameData[i + 3] === 0x38) {
            imageOffset = i;
            detectedMime = "image/gif";
            break;
          }
          // WEBP: RIFF....WEBP
          if (
            frameData[i] === 0x52 && frameData[i + 1] === 0x49 && frameData[i + 2] === 0x46 && frameData[i + 3] === 0x46 &&
            i + 11 < frameData.length &&
            frameData[i + 8] === 0x57 && frameData[i + 9] === 0x45 && frameData[i + 10] === 0x42 && frameData[i + 11] === 0x50
          ) {
            imageOffset = i;
            detectedMime = "image/webp";
            break;
          }
        }

        if (imageOffset >= 0 && frameData.length - imageOffset > 200) {
          const imgBytes = frameData.slice(imageOffset);
          const blob = new Blob([imgBytes], { type: detectedMime });
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
 * 2. Reconoce separadores estándar de la industria: "Artista - Título" o "01 - Artista - Título".
 * 3. Remueve números de pista y prefijos de índice (ej: "01. ", "02_").
 * 4. Devuelve un objeto `{ title, artist }` asignando el nombre de la música a 'title' y el cantante a 'artist'.
 */
export function cleanFilename(fileName: string): { title: string; artist: string } {
  let decodedName = fileName || "";
  try {
    if (fileName && fileName.includes("%")) {
      decodedName = decodeURIComponent(fileName);
    }
  } catch {
    // ignore
  }

  // Remove extension
  const nameWithoutExt = decodedName.replace(/\.[^/.]+$/, "");

  // Limpiar prefijos comunes de descargadores web (ej. "[SPOTIFY-DOWNLOADER.COM]", "y2mate.com - ", etc.)
  const cleanedPrefix = nameWithoutExt
    .replace(/^\[[^\]]+\]\s*/i, "")
    .replace(/^(?:y2mate\.com|snaptube|ytmp3|convert2mp3|youtube)\s*[-_]\s*/i, "");

  // Formato estándar en archivos de audio: "Artista - Título", "01 - Artista - Título", "01. Artista - Título"
  // Normalizar guiones bajos dobles o simples entre palabras clave si aplica
  const normalized = cleanedPrefix.replace(/_+/g, " ");
  const splitDash = normalized.split(/\s+-\s+/);

  if (splitDash.length >= 2) {
    // Caso 1: Comienza con número de pista (ej: "01 - Artista - Título")
    if (/^\d+$/.test(splitDash[0].trim())) {
      if (splitDash.length >= 3) {
        return {
          artist: splitDash[1].trim() || "Artista Desconocido",
          title: splitDash.slice(2).join(" - ").trim() || cleanedPrefix,
        };
      }
      // Caso 2: Solo número y título sin artista (ej: "01 - Título")
      return {
        title: splitDash[1].trim() || cleanedPrefix,
        artist: "Artista Desconocido",
      };
    }

    // Caso 3: "Artista - Título" o "01. Artista - Título"
    // El primer segmento es el Artista / Cantante (limpiando números de prefijo si los hay)
    // El segundo segmento (y sucesivos) es el Título de la Canción / Música
    const parsedArtist = splitDash[0].replace(/^\d+[\s._-]+/, "").trim();
    const parsedTitle = splitDash.slice(1).join(" - ").trim();

    return {
      artist: parsedArtist || "Artista Desconocido",
      title: parsedTitle || cleanedPrefix,
    };
  }

  // Sin guion divisor: "01 Título" o "01. Título" o "Título"
  const cleanTitle = normalized.replace(/^\d+[\s._-]+/, "").trim();
  return {
    title: cleanTitle || cleanedPrefix || "Canción",
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
        audio.removeAttribute("src");
        audio.load();
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
 * 3. Lee los primeros 128 KB para extraer metadatos ID3v2 de texto ligero (título, artista, año).
 * 4. OPTIMIZACIÓN DE RENDIMIENTO: Desactiva por defecto la extracción masiva de portadas en escaneo inicial
 *    (extractCover = false) para no saturar memoria/CPU. Utiliza Lazy Loading al reproducir la pista.
 * 5. Obtiene la duración en segundos con `getAudioDuration()`.
 * 6. Asigna carátula vectorial ultraligera personalizada mediante `generateCoverArt()`.
 * 7. Extrae la jerarquía de carpetas relativas si el usuario subió una carpeta completa (`webkitRelativePath`).
 * 8. Retorna la pista instanciada con identificador único.
 */
export async function parseAudioFile(
  file: File,
  filterShortAudios: boolean = false,
  minDurationSeconds: number = 60,
  extractCover: boolean = false
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
    id3 = parseID3v2(buffer, extractCover);
  } catch (err) {
    console.warn("Failed reading ID3 tags:", err);
  }

  const duration = await getAudioDuration(url, file.size);

  // Soporte de contenedores de video ('.mp4', '.mkv', '.webm', '.3gp'):
  // Descarta automáticamente cualquier video con duración mayor a 480 segundos (8 minutos)
  // para evitar películas o capítulos largos. Los videos permitidos se vinculan al elemento
  // de audio para reproducir solo su pista de fondo local.
  const isVideo = isVideoFilename(file.name) || (file.type && file.type.toLowerCase().startsWith("video/"));
  if (isVideo && duration > MAX_VIDEO_DURATION_SECONDS) {
    console.log(
      `[Parser] Archivo de video descartado por superar los 8 minutos (${Math.round(duration)}s > ${MAX_VIDEO_DURATION_SECONDS}s): ${file.name}`
    );
    return null;
  }

  // Filtro de notas de voz / audios cortos:
  // NO descarta canciones si el metadato de tiempo aún no se ha terminado de leer (duration <= 0).
  if (filterShortAudios && duration && duration > 0 && duration < minDurationSeconds) {
    return null;
  }

  // Validación de título y artista: descarta metadatos corruptos o vacíos
  const isSuspiciousText = (t?: string) => {
    if (!t || !t.trim()) return true;
    const clean = t.trim();
    if (/[\uFFFD\u0000-\u001F]/.test(clean)) return true;
    if (/^[\s\-_.,;:]+$/.test(clean)) return true;
    return false;
  };

  let finalTitle = !isSuspiciousText(id3.title) ? id3.title!.trim() : fallbackTitle;
  let finalArtist = id3.artist && id3.artist.trim() && !isSuspiciousText(id3.artist)
    ? id3.artist.trim()
    : fallbackArtist;

  // Si el título contiene separador de guion (" - ") y el artista quedó como desconocido o vacío,
  // descomponer el título en Artista (cantante) y Título (canción)
  if ((!finalArtist || finalArtist === "Artista Desconocido") && finalTitle.includes(" - ")) {
    const parsed = cleanFilename(finalTitle);
    if (parsed.artist && parsed.artist !== "Artista Desconocido") {
      finalArtist = parsed.artist;
      finalTitle = parsed.title;
    }
  }

  const coverUrl = id3.coverUrl || generateCoverArt(finalTitle, finalArtist);

  // Extraer estructura de carpeta de origen
  let folderPath = "Música del Dispositivo";
  if ((file as any).webkitRelativePath) {
    const parts = (file as any).webkitRelativePath.split("/");
    if (parts.length > 1) {
      folderPath = parts.slice(0, -1).join(" / ");
    }
  }

  const extFormat = file.name.split(".").pop()?.toUpperCase() || "AUDIO";
  const displayFormat = isVideo ? `${extFormat} (Audio)` : (file.type || extFormat);

  return {
    id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: finalTitle,
    artist: finalArtist,
    album: id3.album || (isVideo ? "Videos (Audio)" : "Álbum del dispositivo"),
    year: id3.year,
    duration,
    url,
    file,
    coverUrl,
    format: displayFormat,
    size: file.size,
    addedAt: Date.now(),
    isFavorite: false,
    folderPath,
  };
}

/**
 * Función: extractCoverArtFromFile
 * Propósito: Extrae bajo demanda (Lazy Loading) la carátula ID3 incrustada completa de un archivo File o Blob de audio.
 * Lee dinámicamente el tamaño real del bloque ID3v2 para no truncar portadas de alta resolución (>128 KB).
 */
export async function extractCoverArtFromFile(file: File | Blob): Promise<string | undefined> {
  try {
    // 1. Leer los primeros 10 bytes para determinar el tamaño exacto del bloque ID3v2
    const headerSlice = file.slice(0, 10);
    const headerBuf = await headerSlice.arrayBuffer();
    const hBytes = new Uint8Array(headerBuf);

    let readSize = 262144; // 256KB mínimo
    if (hBytes.length >= 10 && hBytes[0] === 0x49 && hBytes[1] === 0x44 && hBytes[2] === 0x33) {
      const tagSize =
        ((hBytes[6] & 0x7f) << 21) |
        ((hBytes[7] & 0x7f) << 14) |
        ((hBytes[8] & 0x7f) << 7) |
        (hBytes[9] & 0x7f);
      // El bloque completo abarca 10 + tagSize bytes. Cappeamos a 8MB para seguridad
      readSize = Math.max(131072, Math.min(8388608, 10 + tagSize));
    }

    const slice = file.slice(0, readSize);
    const buffer = await slice.arrayBuffer();
    const parsed = parseID3v2(buffer, true);
    return parsed.coverUrl;
  } catch (err) {
    console.warn("Failed lazy extracting cover art from file:", err);
    return undefined;
  }
}

/**
 * Función: extractCoverArtFromTrack
 * Propósito: Extrae bajo demanda (Lazy Loading) la portada real de una pista activa (desde `file` o desde su URL nativa)
 * solo cuando se reproduce, manteniendo la base de datos IndexedDB ligera y sin cadenas Base64.
 */
export async function extractCoverArtFromTrack(track: { file?: File | Blob; url?: string }): Promise<string | undefined> {
  if (track.file) {
    return extractCoverArtFromFile(track.file);
  }
  if (track.url) {
    try {
      let readBytes = 524288;
      try {
        const headRes = await fetch(track.url, {
          headers: { Range: "bytes=0-9" },
        });
        if (headRes.ok) {
          const headBuf = await headRes.arrayBuffer();
          const hb = new Uint8Array(headBuf);
          if (hb.length >= 10 && hb[0] === 0x49 && hb[1] === 0x44 && hb[2] === 0x33) {
            const tagSize =
              ((hb[6] & 0x7f) << 21) |
              ((hb[7] & 0x7f) << 14) |
              ((hb[8] & 0x7f) << 7) |
              (hb[9] & 0x7f);
            readBytes = Math.max(131072, Math.min(8388608, 10 + tagSize));
          }
        }
      } catch {
        // use default 512KB
      }

      const res = await fetch(track.url, {
        headers: { Range: `bytes=0-${readBytes - 1}` },
      });
      const blob = await res.blob();
      return extractCoverArtFromFile(blob);
    } catch {
      // Fallback limpio y silencioso sin interrumpir la reproducción
      return undefined;
    }
  }
  return undefined;
}
