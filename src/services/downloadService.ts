import { Track } from "../types";
import { saveTracksToDB } from "./db";
import { generateCoverArt } from "./metadataParser";

export interface YouTubeAudioResolution {
  streamUrl: string;
  format: "mp3" | "m4a" | "wav" | "webm";
  bitrate?: string;
  title?: string;
  artist?: string;
  duration?: number;
  coverUrl?: string;
}

export interface MediaMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string | null;
  source: "youtube" | "direct_audio" | "direct_video" | "web";
  isDirectMedia: boolean;
  videoId?: string;
}

export const ERROR_YOUTUBE_EXTRACTION_FAILED =
  "No se pudo extraer el audio de YouTube. Verifica el enlace o prueba con un enlace directo de audio";

export const ERROR_INVALID_AUDIO_STREAM =
  "El servidor no entregó un archivo de audio válido";

export const MIN_VALID_AUDIO_BYTES = 100 * 1024; // 100 KB mínimo para considerar un archivo de audio funcional

/**
 * Servidor Privado de Descargas en Render (FastAPI / yt-dlp backend):
 * Endpoint: https://sonara-backend-zpjn.onrender.com/api/download?url=...
 */
export const RENDER_DOWNLOAD_API_BASE = "https://sonara-backend-zpjn.onrender.com/api/download";

export function getRenderDownloadUrl(youtubeUrl: string): string {
  return `${RENDER_DOWNLOAD_API_BASE}?url=${encodeURIComponent(youtubeUrl.trim())}`;
}

export interface RenderDownloadResult {
  downloadUrl: string;
  title?: string;
  artist?: string;
  duration?: number;
  coverUrl?: string;
}

/**
 * 1. Rotación Dinámica de Instancias (Load Balancing):
 * Arreglos con al menos 4-5 instancias públicas activas de Piped e Invidious.
 * Se rotan dinámicamente o seleccionan al azar para cada nueva descarga
 * para evitar el Rate Limiting (bloqueo por peticiones consecutivas).
 */
export const PIPED_INSTANCES: string[] = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.privacydev.net",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.drgns.space",
  "https://api.piped.yt",
];

export const INVIDIOUS_INSTANCES: string[] = [
  "https://invidious.nerdvpn.de",
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.projectsegfau.lt",
  "https://invidious.private.coffee",
  "https://inv.tux.pizza",
  "https://invidious.asir.dev",
];

/**
 * Rota / baraja la lista de instancias para balanceo de carga
 */
export function getRotatedInstances(instances: string[]): string[] {
  const arr = [...instances];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 2. Bypass de Caché (Fresh Stream Fetch):
 * Añade un parámetro único de tiempo (timestamp ?t=Date.now() o &t=Date.now())
 * a cada petición de stream para forzar al navegador o proxy a solicitar un stream
 * fresco y evitar errores con URLs expiradas o en caché.
 */
export function appendCacheBuster(url: string): string {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

/**
 * Combina señal de aborto del usuario con timeout para peticiones individuales
 */
function createCombinedSignal(userSignal?: AbortSignal, timeoutMs = 4000): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return timeoutSignal;
  if ("any" in AbortSignal && typeof (AbortSignal as any).any === "function") {
    return (AbortSignal as any).any([userSignal, timeoutSignal]);
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (userSignal.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  userSignal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

/**
 * Consulta la API del Servidor Privado de Render:
 * "https://sonara-backend-zpjn.onrender.com/api/download?url=" + encodeURIComponent(youtubeUrl)
 * Muestra el mensaje "Conectando con servidor privado..." mientras el contenedor de Render despierta.
 */
export async function fetchFromRenderPrivateServer(
  youtubeUrl: string,
  options?: {
    signal?: AbortSignal;
    onStatus?: (statusText: string, progress?: number) => void;
  }
): Promise<RenderDownloadResult | null> {
  const targetUrl = getRenderDownloadUrl(youtubeUrl);
  options?.onStatus?.("Conectando con servidor privado...", 20);

  // Render spins down on free tier; wait up to 75 seconds for container wake-up
  const renderTimeoutSignal = AbortSignal.timeout(75000);
  let effectiveSignal: AbortSignal = renderTimeoutSignal;

  if (options?.signal) {
    if ("any" in AbortSignal && typeof (AbortSignal as any).any === "function") {
      effectiveSignal = (AbortSignal as any).any([options.signal, renderTimeoutSignal]);
    } else {
      const ctrl = new AbortController();
      options.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
      renderTimeoutSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
      effectiveSignal = ctrl.signal;
    }
  }

  try {
    let response: Response | null = null;

    try {
      response = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: effectiveSignal,
      });
    } catch (directErr: any) {
      if (options?.signal?.aborted) {
        throw new DOMException("Operación cancelada", "AbortError");
      }
      // If browser CORS or direct request fails, use our backend proxy
      const proxyUrl = `/api/download/proxy-json?url=${encodeURIComponent(targetUrl)}`;
      response = await fetch(proxyUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: effectiveSignal,
      }).catch(() => null);
    }

    if (response && response.ok) {
      const data = await response.json();
      const rawDownloadUrl = data?.download_url || data?.downloadUrl || data?.url;

      if (rawDownloadUrl && typeof rawDownloadUrl === "string") {
        const fullDownloadUrl = rawDownloadUrl.startsWith("http")
          ? rawDownloadUrl
          : `https://sonara-backend-zpjn.onrender.com${rawDownloadUrl.startsWith("/") ? "" : "/"}${rawDownloadUrl}`;

        return {
          downloadUrl: fullDownloadUrl,
          title: data.title,
          artist: data.artist || data.uploader,
          duration: data.duration,
          coverUrl: data.thumbnail || data.coverUrl,
        };
      }
    }
    return null;
  } catch (err: any) {
    if (err?.name === "AbortError" && options?.signal?.aborted) {
      throw err;
    }
    console.warn("Notice: Render private server connection:", err?.message || err);
    return null;
  }
}

/**
 * 1. Detección de enlaces de YouTube:
 * Determina si la URL ingresada pertenece a YouTube (youtube.com, youtu.be, etc.)
 */
export function isYouTubeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim().toLowerCase();
  return (
    trimmed.includes("youtube.com") ||
    trimmed.includes("youtu.be") ||
    trimmed.includes("music.youtube.com") ||
    trimmed.includes("m.youtube.com")
  );
}

/**
 * Extrae el ID del video de YouTube (11 caracteres alfanuméricos)
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();

  // Pattern covering standard watch?v=, youtu.be/, shorts/, embed/, v/, live/
  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v|shorts|live)\/))([a-zA-Z0-9_-]{11})/i
  );

  return match && match[1] ? match[1] : null;
}

/**
 * Obtiene el enlace de miniatura en alta resolución (maxresdefault) con fallback (hqdefault)
 */
export function getYouTubeHighResThumbnail(videoId: string): { maxRes: string; hq: string } {
  return {
    maxRes: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    hq: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/**
 * Limpia títulos de YouTube removiendo etiquetas publicitarias o de video
 * ej: "Queen - Bohemian Rhapsody (Official Video) [4K Remastered]" -> "Queen - Bohemian Rhapsody"
 */
export function cleanYouTubeTitle(rawTitle: string, channelName?: string): { title: string; artist: string } {
  let cleaned = rawTitle || "";

  // Remove common YouTube video suffixes and clutter
  cleaned = cleaned
    .replace(
      /\s*[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer)|video\s*oficial|audio\s*oficial|video\s*con\s*letra|letra|remastered(?:\s*\d{4})?|4k|hd|hq|live|en\s*vivo|clip\s*officiel|official\s*hd)[\)\]]/gi,
      ""
    )
    .replace(/["“”]/g, "")
    .trim();

  let artist = (channelName || "YouTube Music").replace(/ - Topic$/i, "").trim();
  let title = cleaned;

  // If title contains "Artist - Song Title"
  if (cleaned.includes(" - ")) {
    const parts = cleaned.split(" - ");
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }
  }

  return {
    title: title || rawTitle || "Canción de YouTube",
    artist: artist || "YouTube Music",
  };
}

/**
 * 3. Extracción de Metadatos y Carátula:
 * Extrae título, artista y thumbnail en alta resolución de YouTube
 */
export async function fetchMediaMetadata(targetUrl: string): Promise<MediaMetadata> {
  const cleanUrl = targetUrl.trim();
  const isYt = isYouTubeUrl(cleanUrl);
  const videoId = isYt ? extractYouTubeVideoId(cleanUrl) : null;

  try {
    const res = await fetch("/api/download/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: cleanUrl }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        // Ensure best thumbnail quality for YouTube
        let coverUrl = data.coverUrl;
        if (videoId) {
          const { maxRes } = getYouTubeHighResThumbnail(videoId);
          coverUrl = maxRes || data.coverUrl;
        }

        return {
          title: data.title || "Pista de Audio",
          artist: data.artist || (isYt ? "YouTube Music" : "Artista Web"),
          album: data.album || (isYt ? "YouTube Music" : "Descargas Directas"),
          duration: data.duration || 210,
          coverUrl: coverUrl || null,
          source: data.source || (isYt ? "youtube" : "web"),
          isDirectMedia: Boolean(data.isDirectMedia),
          videoId: videoId || undefined,
        };
      }
    }
  } catch (err) {
    console.warn("API metadata extraction notice:", err);
  }

  // Fallback metadata extraction
  if (videoId) {
    const { maxRes } = getYouTubeHighResThumbnail(videoId);
    return {
      title: "Audio de YouTube",
      artist: "YouTube Music",
      album: "YouTube Music",
      duration: 215,
      coverUrl: maxRes,
      source: "youtube",
      isDirectMedia: false,
      videoId,
    };
  }

  // Direct media filename extraction
  const pathname = new URL(cleanUrl).pathname;
  const filename = decodeURIComponent(pathname.split("/").pop() || "audio.mp3");
  const withoutExt = filename.replace(/\.[^/.]+$/, "");

  return {
    title: withoutExt || "Pista Descargada",
    artist: "Descargas Directas",
    album: "Descargas Web",
    duration: 195,
    coverUrl: null,
    source: "direct_audio",
    isDirectMedia: true,
  };
}

/**
 * 2. Procesamiento de Audio de YouTube:
 * Fallback Multi-API de Extracción:
 * - Intenta primero con Cobalt API (https://api.cobalt.tools).
 * - Si Cobalt falla o devuelve error de red/CORS, conmuta a Piped API (ej. https://pipedapi.kavin.rocks).
 * - Si Piped falla, conmuta a Invidious API (ej. https://inv.riverside.rocks).
 * - Filtra audioStreams seleccionando el de mayor calidad/bitrate.
 */
export async function resolveYouTubeAudioStream(
  youtubeUrl: string,
  options?: {
    format?: "mp3" | "m4a";
    quality?: string;
    signal?: AbortSignal;
    onBackendChange?: (statusText: string, progress?: number) => void;
  }
): Promise<YouTubeAudioResolution> {
  if (options?.signal?.aborted) {
    throw new DOMException("Operación cancelada", "AbortError");
  }

  if (!isYouTubeUrl(youtubeUrl)) {
    throw new Error(ERROR_YOUTUBE_EXTRACTION_FAILED);
  }

  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error(ERROR_YOUTUBE_EXTRACTION_FAILED);
  }

  const format = options?.format || "mp3";
  const quality = options?.quality || "320k";
  const userSignal = options?.signal;
  const onBackend = options?.onBackendChange;

  // --- 1. INTENTAR COBALT ---
  onBackend?.("Intentando vía Cobalt...", 25);

  let cobaltSuccess: YouTubeAudioResolution | null = null;
  try {
    // Try direct public Cobalt API first
    const directCobalt = await fetch("https://api.cobalt.tools", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: youtubeUrl,
        downloadMode: "audio",
        audioFormat: format === "m4a" ? "m4a" : "mp3",
        audioBitrate: quality === "128k" ? "128" : quality === "192k" ? "192" : "320",
      }),
      signal: createCombinedSignal(userSignal, 5000),
    }).catch(() => null);

    if (directCobalt && directCobalt.ok) {
      const data = await directCobalt.json();
      const streamUrl = data?.url || data?.stream;
      if (streamUrl && typeof streamUrl === "string") {
        cobaltSuccess = {
          streamUrl: appendCacheBuster(streamUrl),
          format: format === "m4a" ? "m4a" : "mp3",
          bitrate: quality,
        };
      }
    }

    // If direct cobalt was blocked by CORS or failed, try server-side Cobalt proxy
    if (!cobaltSuccess && !userSignal?.aborted) {
      const srvCobalt = await fetch("/api/download/youtube-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          videoId,
          format,
          quality,
          provider: "cobalt",
        }),
        signal: createCombinedSignal(userSignal, 6000),
      }).catch(() => null);

      if (srvCobalt && srvCobalt.ok) {
        const data = await srvCobalt.json();
        if (data && data.success && data.streamUrl) {
          cobaltSuccess = {
            streamUrl: appendCacheBuster(data.streamUrl),
            format: data.format || format,
            bitrate: data.bitrate || quality,
            title: data.title,
            artist: data.artist,
          };
        }
      }
    }
  } catch (cobaltErr: any) {
    if (cobaltErr?.name === "AbortError" && userSignal?.aborted) {
      throw cobaltErr;
    }
    console.warn("Cobalt attempt encountered error:", cobaltErr);
  }

  if (cobaltSuccess) {
    return cobaltSuccess;
  }

  if (userSignal?.aborted) {
    throw new DOMException("Operación cancelada", "AbortError");
  }

  // --- 2. FALLBACK A PIPED API (CON ROTACIÓN DINÁMICA & FRESH STREAM) ---
  onBackend?.("Cambiando a servidor Piped (balanceo dinámico)...", 40);

  // Rotación aleatoria de instancias para evitar Rate Limiting
  const rotatedPiped = getRotatedInstances(PIPED_INSTANCES);

  for (const host of rotatedPiped) {
    if (userSignal?.aborted) {
      throw new DOMException("Operación cancelada", "AbortError");
    }

    try {
      // Fresh Stream Fetch: timestamp único para bypass de caché
      const pipedUrl = appendCacheBuster(`${host}/streams/${videoId}`);
      const pipedRes = await fetch(pipedUrl, {
        headers: { Accept: "application/json" },
        signal: createCombinedSignal(userSignal, 4000),
      }).catch(() => null);

      if (pipedRes && pipedRes.ok) {
        const cType = pipedRes.headers.get("content-type") || "";
        if (cType.includes("application/json")) {
          const data = await pipedRes.json().catch(() => null);
          if (data) {
            const audioStreams: any[] = data.audioStreams || [];

            if (audioStreams.length > 0) {
              // Sort by bitrate descending to select highest quality
              const sorted = [...audioStreams].sort(
                (a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
              );
              const best = sorted[0];
              if (best && best.url) {
                const bestFormat =
                  best.format?.toLowerCase().includes("m4a") || best.mimeType?.includes("mp4")
                    ? "m4a"
                    : "mp3";
                const bitrateLabel =
                  best.quality || (best.bitrate ? `${Math.round(best.bitrate / 1000)}k` : "160k");

                return {
                  streamUrl: appendCacheBuster(best.url),
                  format: bestFormat,
                  bitrate: bitrateLabel,
                  title: data.title,
                  artist: data.uploader,
                  duration: data.duration,
                };
              }
            }

            // Progressive stream with AAC audio fallback
            const videoStreams: any[] = data.videoStreams || [];
            const progressiveAudio = videoStreams.find(
              (s: any) => !s.videoOnly && s.url && (s.itag === 18 || s.mimeType?.includes("mp4"))
            );
            if (progressiveAudio && progressiveAudio.url) {
              return {
                streamUrl: appendCacheBuster(progressiveAudio.url),
                format: "m4a",
                bitrate: "128k",
                title: data.title,
                artist: data.uploader,
                duration: data.duration,
              };
            }
          }
        }
      }
    } catch (pipedErr: any) {
      if (pipedErr?.name === "AbortError" && userSignal?.aborted) {
        throw pipedErr;
      }
      // Fallback silently to next mirror
    }
  }

  // Also query server-side Piped proxy in case browser CORS blocked all direct Piped requests
  if (!userSignal?.aborted) {
    try {
      const srvPiped = await fetch("/api/download/youtube-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          videoId,
          format,
          quality,
          provider: "piped",
        }),
        signal: createCombinedSignal(userSignal, 5000),
      }).catch(() => null);
      if (srvPiped && srvPiped.ok) {
        const data = await srvPiped.json().catch(() => null);
        if (data && data.success && data.streamUrl) {
          return {
            streamUrl: appendCacheBuster(data.streamUrl),
            format: data.format || "m4a",
            bitrate: data.bitrate || "160k",
            title: data.title,
            artist: data.artist,
            duration: data.duration,
          };
        }
      }
    } catch (proxyPipedErr: any) {
      if (proxyPipedErr?.name === "AbortError" && userSignal?.aborted) {
        throw proxyPipedErr;
      }
      // Continue to Invidious
    }
  }

  if (userSignal?.aborted) {
    throw new DOMException("Operación cancelada", "AbortError");
  }

  // --- 3. FALLBACK A INVIDIOUS API (CON ROTACIÓN DINÁMICA & FRESH STREAM) ---
  onBackend?.("Cambiando a servidor Invidious (balanceo dinámico)...", 48);

  // Rotación aleatoria de instancias de Invidious
  const rotatedInvidious = getRotatedInstances(INVIDIOUS_INSTANCES);

  for (const invHost of rotatedInvidious) {
    if (userSignal?.aborted) {
      throw new DOMException("Operación cancelada", "AbortError");
    }

    try {
      // Fresh Stream Fetch: timestamp único para bypass de caché
      const invUrl = appendCacheBuster(`${invHost}/api/v1/videos/${videoId}`);
      const invRes = await fetch(invUrl, {
        headers: { Accept: "application/json" },
        signal: createCombinedSignal(userSignal, 3500),
      }).catch(() => null);

      if (invRes && invRes.ok) {
        const cType = invRes.headers.get("content-type") || "";
        if (cType.includes("application/json")) {
          const invData = await invRes.json().catch(() => null);
          if (invData) {
            const adaptive: any[] = invData?.adaptiveFormats || [];
            const audioFormats = adaptive.filter((f: any) => f.type?.includes("audio") && f.url);
            if (audioFormats.length > 0) {
              audioFormats.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
              const best = audioFormats[0];
              const fmt = best.container === "m4a" || best.type?.includes("mp4") ? "m4a" : "mp3";
              return {
                streamUrl: appendCacheBuster(best.url),
                format: fmt,
                bitrate: best.bitrate ? `${Math.round(best.bitrate / 1000)}k` : "128k",
                title: invData.title,
                artist: invData.author,
                duration: invData.lengthSeconds,
              };
            }
          }
        }
      }
    } catch (invErr: any) {
      if (invErr?.name === "AbortError" && userSignal?.aborted) {
        throw invErr;
      }
      // Fallback silently to next mirror
    }
  }

  // Final attempt: general server fallback
  if (!userSignal?.aborted) {
    try {
      const srvAuto = await fetch("/api/download/youtube-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          videoId,
          format,
          quality,
          provider: "auto",
        }),
        signal: createCombinedSignal(userSignal, 6000),
      });
      if (srvAuto.ok) {
        const data = await srvAuto.json();
        if (data && data.success && data.streamUrl) {
          return {
            streamUrl: appendCacheBuster(data.streamUrl),
            format: data.format || format,
            bitrate: data.bitrate || quality,
            title: data.title,
            artist: data.artist,
            duration: data.duration,
          };
        }
      }
    } catch (autoErr: any) {
      if (autoErr?.name === "AbortError" && userSignal?.aborted) {
        throw autoErr;
      }
      console.warn("Auto resolver failed:", autoErr);
    }
  }

  if (userSignal?.aborted) {
    throw new DOMException("Operación cancelada", "AbortError");
  }

  // If all failed, throw specific user-friendly error
  throw new Error(ERROR_YOUTUBE_EXTRACTION_FAILED);
}

/**
 * 3. Detección y Descarga de Portada:
 * Descarga directamente la miniatura oficial desde https://img.youtube.com/vi/ID_DEL_VIDEO/maxresdefault.jpg
 * y la convierte a Blob para asignarla como carátula de la canción en la biblioteca.
 */
export async function downloadYouTubeThumbnailBlob(
  videoId: string
): Promise<{ blob: Blob; url: string } | null> {
  const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  for (const thumbUrl of [maxResUrl, hqUrl]) {
    try {
      // 1. Try direct fetch with clean headers
      let res: Response | null = await fetch(thumbUrl, {
        headers: { Accept: "image/jpeg,image/*" },
      }).catch(() => null);

      // 2. If blocked by CORS or network, use proxy
      if (!res || !res.ok) {
        res = await fetch(`/api/download/proxy?url=${encodeURIComponent(thumbUrl)}`).catch(() => null);
      }

      if (res && res.ok) {
        const blob = await res.blob();
        // maxresdefault returns a tiny ~1097 byte placeholder when not available
        if (blob.size > 2000 && (blob.type.startsWith("image") || blob.type === "application/octet-stream")) {
          const imageBlob = new Blob([blob], { type: "image/jpeg" });
          // Convert to Data URL so it permanently persists in IndexedDB across reloads
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(URL.createObjectURL(imageBlob));
            reader.readAsDataURL(imageBlob);
          });

          return { blob: imageBlob, url: dataUrl };
        }
      }
    } catch (err) {
      console.warn(`Error downloading thumbnail ${thumbUrl}:`, err);
    }
  }

  return null;
}

/**
 * Descarga el stream de audio limpio usando fetch con encabezados limpios,
 * validación estricta de HTTP 200, Content-Length y tamaño mínimo de 100 KB.
 * Si el servidor devuelve un código distinto a 200 o el tamaño es menor a 100 KB,
 * aborta la descarga con el error explícito requerido.
 */
export async function downloadAudioBlob(
  streamUrl: string,
  onProgress?: (percent: number, speedText: string) => void,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) {
    throw new DOMException("Descarga cancelada por el usuario", "AbortError");
  }

  // Bypass de Caché (Fresh Stream Fetch)
  const freshStreamUrl = appendCacheBuster(streamUrl);

  const cleanHeaders: Record<string, string> = {
    Accept: "*/*",
  };

  const startTime = Date.now();
  let response: Response;

  try {
    // Direct clean fetch con bypass de caché y señal de cancelación
    response = await fetch(freshStreamUrl, {
      method: "GET",
      headers: cleanHeaders,
      signal,
    });
    if (!response.ok || response.status !== 200) {
      throw new Error(`Direct fetch failed with status ${response.status}`);
    }
  } catch (directErr: any) {
    if (directErr?.name === "AbortError" || signal?.aborted) {
      throw new DOMException("Descarga cancelada", "AbortError");
    }

    // Si la descarga directa falla o está bloqueada por CORS, recurrir al proxy del servidor
    const proxyUrl = `/api/download/proxy?url=${encodeURIComponent(freshStreamUrl)}&t=${Date.now()}`;
    response = await fetch(proxyUrl, {
      method: "GET",
      headers: cleanHeaders,
      signal,
    });
    if (!response.ok || response.status !== 200) {
      throw new Error(ERROR_INVALID_AUDIO_STREAM);
    }
  }

  if (signal?.aborted) {
    throw new DOMException("Descarga cancelada", "AbortError");
  }

  // 1. Verificación estricta de código HTTP 200
  if (response.status !== 200) {
    throw new Error(ERROR_INVALID_AUDIO_STREAM);
  }

  // Verificar tipo de contenido: si es HTML o JSON de error, rechazar de inmediato
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error(ERROR_INVALID_AUDIO_STREAM);
  }

  // Validar Content-Length previo si está disponible
  const contentLengthHeader = response.headers.get("Content-Length");
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
  if (totalBytes > 0 && totalBytes < MIN_VALID_AUDIO_BYTES) {
    throw new Error(ERROR_INVALID_AUDIO_STREAM);
  }

  let finalBlob: Blob;

  if (!response.body) {
    finalBlob = await response.blob();
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        if (signal?.aborted) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          throw new DOMException("Descarga cancelada por el usuario", "AbortError");
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          chunks.push(value);
          receivedBytes += value.length;

          const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
          const kbps = Math.round(receivedBytes / 1024 / elapsedSec);
          const speedStr = `${kbps.toLocaleString()} KB/s`;

          if (totalBytes > 0) {
            const percent = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
            onProgress?.(percent, speedStr);
          } else {
            const approxPercent = Math.min(95, Math.round(Math.log10(receivedBytes / 1000 + 1) * 30));
            onProgress?.(approxPercent, speedStr);
          }
        }
      }
    } catch (readErr: any) {
      if (readErr?.name === "AbortError" || signal?.aborted) {
        throw new DOMException("Descarga cancelada", "AbortError");
      }
      throw readErr;
    }

    finalBlob = new Blob(chunks, { type: contentType || "audio/mpeg" });
  }

  // 1. Verificación de tamaño del Blob: Si es menor a 100 KB, ABORTAR
  if (!finalBlob || finalBlob.size < MIN_VALID_AUDIO_BYTES) {
    throw new Error(ERROR_INVALID_AUDIO_STREAM);
  }

  onProgress?.(100, "Audio descargado correctamente");
  return finalBlob;
}

/**
 * 2. Verificación de Integridad de Audio antes de Guardar:
 * - Valida que blob.size > 0 y sea mayor a 100 KB.
 * - Crea un objeto Audio de prueba en segundo plano (testAudio = new Audio(URL.createObjectURL(blob)))
 *   para verificar que el evento loadedmetadata devuelva una duración mayor a 0 segundos (audio.duration > 0).
 * - Si falla, da error o la duración es <= 0, rechaza la operación antes de guardar en IndexedDB.
 */
export async function verifyAudioIntegrity(blob: Blob): Promise<number> {
  if (!blob || blob.size <= 0 || blob.size < MIN_VALID_AUDIO_BYTES) {
    throw new Error(ERROR_INVALID_AUDIO_STREAM);
  }

  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const objectUrl = URL.createObjectURL(blob);
    const testAudio = new Audio();

    const cleanup = () => {
      if (!settled) {
        settled = true;
        testAudio.removeEventListener("loadedmetadata", onLoadedMetadata);
        testAudio.removeEventListener("error", onError);
        testAudio.src = "";
        URL.revokeObjectURL(objectUrl);
      }
    };

    // Timeout de seguridad en caso de que el navegador no pueda analizar los metadatos
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("El archivo de audio está dañado o no se pudieron cargar sus metadatos (tiempo agotado)"));
    }, 7000);

    const onLoadedMetadata = () => {
      const dur = testAudio.duration;
      clearTimeout(timeout);
      cleanup();
      if (!dur || isNaN(dur) || dur <= 0) {
        reject(new Error("El archivo de audio está dañado o no contiene una duración válida (0:00)"));
      } else {
        resolve(dur);
      }
    };

    const onError = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Esta canción está dañada o no se pudo descargar el archivo de audio"));
    };

    testAudio.addEventListener("loadedmetadata", onLoadedMetadata);
    testAudio.addEventListener("error", onError);
    testAudio.preload = "metadata";
    testAudio.src = objectUrl;
    testAudio.load();
  });
}

/**
 * Guarda y registra la pista de audio descargada en la base de datos IndexedDB local
 */
export async function saveDownloadedTrackToLibrary(
  track: Track
): Promise<void> {
  // Validación de seguridad adicional antes de persistir
  if (!track.url || (track.size !== undefined && track.size < MIN_VALID_AUDIO_BYTES) || track.duration <= 0) {
    throw new Error(ERROR_INVALID_AUDIO_STREAM);
  }
  await saveTracksToDB([track]);
}
