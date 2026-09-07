/**
 * ============================================================================
 * SONARA MUSIC - MODAL DE DESCARGA DESDE URL (DownloadModal.tsx)
 * ============================================================================
 * Responsabilidad:
 * Permite descargar música y audio directamente desde YouTube y enlaces web:
 * - Extracción mediante API pública Cobalt con fallback automático a Piped e Invidious.
 * - Guardado de audio Blob e IndexedDB local.
 * - Búsqueda automática e integración de letras sincronizadas .LRC (LRCLIB).
 * - Guardado del archivo .LRC en IndexedDB.
 * - Validación rigurosa de integridad de audio (tamaño > 100 KB y duración > 0).
 */

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Download,
  Link2,
  Music,
  Video,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Clipboard,
  FileCheck,
  Play,
  Layers,
  Settings2,
  FileText,
  Image as ImageIcon,
  Check,
  Radio,
} from "lucide-react";
import { Track } from "../types";
import { generateCoverArt } from "../services/metadataParser";
import { searchLyricsOnline } from "../services/lyricsService";
import {
  isYouTubeUrl,
  extractYouTubeVideoId,
  fetchMediaMetadata,
  resolveYouTubeAudioStream,
  downloadYouTubeThumbnailBlob,
  downloadAudioBlob,
  verifyAudioIntegrity,
  saveDownloadedTrackToLibrary,
  fetchFromRenderPrivateServer,
  RENDER_DOWNLOAD_API_BASE,
  ERROR_YOUTUBE_EXTRACTION_FAILED,
  ERROR_INVALID_AUDIO_STREAM,
  MIN_VALID_AUDIO_BYTES,
} from "../services/downloadService";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackDownloaded: (track: Track, shouldPlayNow?: boolean) => void;
}

type FormatType = "audio" | "video";
type AudioFormat = "MP3" | "M4A" | "FLAC";
type VideoFormat = "MP4" | "WEBM";

const AUDIO_QUALITIES = [
  { id: "320k", label: "320 kbps" },
  { id: "192k", label: "192 kbps" },
  { id: "128k", label: "128 kbps" },
  { id: "lossless", label: "Sin Pérdida (FLAC)" },
];

const VIDEO_QUALITIES = [
  { id: "1080p", label: "1080p (Full HD)" },
  { id: "720p", label: "720p (HD)" },
  { id: "480p", label: "480p (SD)" },
  { id: "360p", label: "360p" },
];

const SAMPLE_LINKS = [
  { label: "Queen - Bohemian Rhapsody (YouTube)", url: "https://www.youtube.com/watch?v=fJ9rUzIMcZQ" },
  { label: "The Weeknd - Blinding Lights (YouTube)", url: "https://www.youtube.com/watch?v=4NRXx6U8ABQ" },
  { label: "Kai Engel - Contention (Audio Directo MP3)", url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Kai_Engel/Sustains/Kai_Engel_-_08_-_Contention.mp3" },
  { label: "Broke For Free - As Colorful As Ever (MP3)", url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Broke_For_Free/Layers/Broke_For_Free_-_01_-_As_Colorful_As_Ever.mp3" },
];

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  onClose,
  onTrackDownloaded,
}) => {
  const [url, setUrl] = useState("");
  const [formatType, setFormatType] = useState<FormatType>("audio");
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("MP3");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("MP4");
  const [audioQuality, setAudioQuality] = useState("320k");
  const [videoQuality, setVideoQuality] = useState("720p");

  // Checkbox Options
  const [autoLyrics, setAutoLyrics] = useState(true);
  const [autoCover, setAutoCover] = useState(true);

  // Download Status & Progress
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completedTrack, setCompletedTrack] = useState<Track | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  // AbortController para soportar cancelaciones y descargas consecutivas sin bloqueo
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 3. Limpieza de Estado al Finalizar o Cancelar:
   * Resetea por completo los estados del componente (progress, abortController,
   * blob, url input, speed, statusMessage) para dejar la interfaz lista para la siguiente canción.
   */
  const resetDownloadState = (clearUrl = true) => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
      abortControllerRef.current = null;
    }

    if (clearUrl) {
      setUrl("");
    }
    setIsDownloading(false);
    setProgress(0);
    setDownloadSpeed("");
    setStatusMessage("");
    setError(null);
    setCompletedTrack(null);
  };

  // Limpieza al desmontar el componente
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetDownloadState(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        setUrl(text.trim());
        setError(null);
      }
    } catch {
      // clipboard access might be denied in some browsers
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    resetDownloadState(false);
    setStatusMessage("Descarga cancelada");
  };

  const handleCloseModal = () => {
    resetDownloadState(true);
    onClose();
  };

  const handleStartDownload = async () => {
    const targetUrl = url.trim();
    if (!targetUrl) {
      setError("Por favor, ingresa o pega un enlace válido para continuar.");
      return;
    }

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      setError("El enlace debe comenzar con http:// o https://");
      return;
    }

    // Aborta cualquier descarga previa pendiente para evitar colisiones
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
    }

    // Crea un nuevo AbortController para esta descarga
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const isYt = isYouTubeUrl(targetUrl);
    setError(null);
    setIsDownloading(true);
    setProgress(10);
    setDownloadSpeed("350 KB/s");

    try {
      let mediaInfo;
      let audioBlob: Blob;
      let finalDuration = 210;

      if (isYt) {
        // 1. Detección de enlaces de YouTube y validación de Video ID
        const videoId = extractYouTubeVideoId(targetUrl);
        if (!videoId) {
          throw new Error(ERROR_YOUTUBE_EXTRACTION_FAILED);
        }

        // Normalizamos la URL para que no contenga parámetros de playlist o timestamps que confundan al extractor
        const cleanYtUrl = `https://www.youtube.com/watch?v=${videoId}`;
        mediaInfo = await fetchMediaMetadata(targetUrl);

        // =========================================================================
        // 1. PROVEEDOR PRINCIPAL: COBALT API PÚBLICA DIRECTA
        // Endpoint: "https://api.cobalt.tools/api/json"
        // Body: { "url": youtubeUrl, "downloadMode": "audio", "audioFormat": "mp3" }
        // =========================================================================
        setStatusMessage("Conectando con Cobalt API (proveedor principal)...");
        setProgress(20);
        setDownloadSpeed("Conectando...");

        let streamUrl: string | null = null;
        let cobaltSuccess = false;

        const cobaltEndpoints = [
          "https://api.cobalt.tools/api/json",
          "https://api.cobalt.tools",
          "https://cobalt.tools/api/json",
          "https://cobalt-api.kwiatekm.com/api/json",
          "https://cobalt.canine.tools/api/json",
        ];

        for (const endpoint of cobaltEndpoints) {
          if (controller.signal.aborted) {
            resetDownloadState(false);
            return;
          }

          try {
            const cobaltFetch = await fetch(endpoint, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: cleanYtUrl,
                downloadMode: "audio",
                audioFormat: "mp3",
              }),
              signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
            }).catch(() => null);

            if (cobaltFetch && cobaltFetch.ok) {
              const data = await cobaltFetch.json().catch(() => null);
              const returnedUrl = data?.url || data?.stream;
              if (returnedUrl && typeof returnedUrl === "string" && !returnedUrl.includes("error")) {
                streamUrl = returnedUrl;
                cobaltSuccess = true;
                if (data.title && (!mediaInfo.title || mediaInfo.title === "Pista de YouTube")) {
                  mediaInfo.title = data.title;
                }
                if (data.artist && (!mediaInfo.artist || mediaInfo.artist === "YouTube Audio")) {
                  mediaInfo.artist = data.artist;
                }
                break;
              }
            }
          } catch {
            // Continúa probando los siguientes endpoints o fallback
          }
        }

        // Si el navegador bloqueó la conexión directa por CORS o fallaron las instancias públicas,
        // recurrir al proxy seguro del backend para Cobalt:
        if (!streamUrl && !controller.signal.aborted) {
          try {
            const srvCobalt = await fetch("/api/download/youtube-audio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: cleanYtUrl,
                videoId,
                format: "mp3",
                quality: audioQuality,
                provider: "cobalt",
              }),
              signal: controller.signal,
            }).catch(() => null);

            if (srvCobalt && srvCobalt.ok) {
              const data = await srvCobalt.json().catch(() => null);
              if (data && data.success && data.streamUrl) {
                streamUrl = data.streamUrl;
                cobaltSuccess = true;
                if (data.title && (!mediaInfo.title || mediaInfo.title === "Pista de YouTube")) {
                  mediaInfo.title = data.title;
                }
                if (data.artist && (!mediaInfo.artist || mediaInfo.artist === "YouTube Audio")) {
                  mediaInfo.artist = data.artist;
                }
              }
            }
          } catch (srvErr: any) {
            if (srvErr?.name === "AbortError" || controller.signal.aborted) {
              resetDownloadState(false);
              return;
            }
          }
        }

        // Si Cobalt obtuvo el enlace de stream, descargar el Blob de audio directamente:
        if (streamUrl) {
          setStatusMessage("Descargando stream de audio desde Cobalt...");
          setProgress(50);
          setDownloadSpeed("1,850 KB/s");

          try {
            audioBlob = await downloadAudioBlob(
              streamUrl,
              (pct, speed) => {
                setProgress(Math.max(50, Math.min(85, 50 + Math.round((pct / 100) * 35))));
                setDownloadSpeed(speed);
              },
              controller.signal
            );
          } catch (blobErr: any) {
            if (blobErr?.name === "AbortError" || controller.signal.aborted) {
              resetDownloadState(false);
              return;
            }
            console.warn("Fallo al descargar stream de Cobalt, conmutando a Piped fallback:", blobErr);
            streamUrl = null;
            cobaltSuccess = false;
          }
        }

        // =========================================================================
        // 2. RESPALDO AUTOMÁTICO: PIPED / INVIDIOUS API
        // Si Cobalt no responde o falla, conmuta automáticamente a Piped API
        // =========================================================================
        if (!audioBlob || !streamUrl) {
          if (controller.signal.aborted) {
            resetDownloadState(false);
            return;
          }

          setStatusMessage("Cobalt no disponible. Conmutando a respaldo automático Piped API...");
          setProgress(35);
          setDownloadSpeed("1,450 KB/s");

          let resolvedAudio: any = null;
          try {
            resolvedAudio = await resolveYouTubeAudioStream(cleanYtUrl, {
              format: audioFormat.toLowerCase() === "m4a" ? "m4a" : "mp3",
              quality: audioQuality,
              signal: controller.signal,
              onBackendChange: (statusText, prog) => {
                setStatusMessage(statusText);
                if (prog) setProgress(prog);
              },
            });
          } catch (ytErr: any) {
            if (ytErr?.name === "AbortError" || controller.signal.aborted) {
              resetDownloadState(false);
              return;
            }
            console.warn("Aviso en resolución Piped/Invidious de YouTube:", ytErr?.message || ytErr);
          }

          if (controller.signal.aborted) {
            resetDownloadState(false);
            return;
          }

          if (resolvedAudio?.streamUrl) {
            if (resolvedAudio.title && (!mediaInfo.title || mediaInfo.title === "Pista de YouTube")) {
              mediaInfo.title = resolvedAudio.title;
            }
            if (resolvedAudio.artist && (!mediaInfo.artist || mediaInfo.artist === "YouTube Audio")) {
              mediaInfo.artist = resolvedAudio.artist;
            }
            if (resolvedAudio.duration) {
              finalDuration = resolvedAudio.duration;
            }

            setStatusMessage("Descargando stream de audio desde Piped...");
            setProgress(55);

            audioBlob = await downloadAudioBlob(
              resolvedAudio.streamUrl,
              (pct, speed) => {
                setProgress(Math.max(55, Math.min(85, 55 + Math.round((pct / 100) * 30))));
                setDownloadSpeed(speed);
              },
              controller.signal
            );
          } else {
            throw new Error(
              "No se pudo extraer el audio a través de Cobalt ni de la red de respaldo Piped. Por favor, verifica el enlace o intenta con otro video."
            );
          }
        }

        if (controller.signal.aborted) {
          resetDownloadState(false);
          return;
        }

        // =========================================================================
        // 3. METADATOS Y CARÁTULA LIMPIA EN ALTA DEFINICIÓN (HD)
        // =========================================================================
        if (!mediaInfo.coverUrl || mediaInfo.coverUrl.includes("default_cover")) {
          setStatusMessage("Extrayendo portada oficial en alta definición...");
          setProgress(85);
          try {
            const thumbData = await downloadYouTubeThumbnailBlob(videoId);
            if (thumbData?.url) {
              mediaInfo.coverUrl = thumbData.url;
            }
          } catch (thumbErr) {
            console.warn("Could not download YouTube thumbnail blob:", thumbErr);
          }
        }

      } else {
        // Procesamiento de enlaces directos de audio / web
        setStatusMessage("Analizando enlace directo y resolviendo metadatos...");
        setProgress(25);
        mediaInfo = await fetchMediaMetadata(targetUrl);

        if (controller.signal.aborted) {
          resetDownloadState(false);
          return;
        }

        setStatusMessage(`Descargando audio directo en formato ${formatType === "audio" ? audioFormat : videoFormat}...`);
        setProgress(50);

        audioBlob = await downloadAudioBlob(
          targetUrl,
          (pct, speed) => {
            setProgress(Math.max(50, Math.min(88, 50 + Math.round((pct / 100) * 38))));
            setDownloadSpeed(speed);
          },
          controller.signal
        );
      }

      if (controller.signal.aborted) {
        resetDownloadState(false);
        return;
      }

      finalDuration = mediaInfo.duration || finalDuration;

      // Integración de letras sincronizadas (.lrc) con soporte multilingüe (incluyendo caracteres japoneses UTF-8)
      let lyricsData: Track["lyrics"] = undefined;
      let lrcBlob: Blob | undefined = undefined;
      let lrcFileName: string | undefined = undefined;
      let detectedAlbum: string | undefined = undefined;

      if (autoLyrics && !controller.signal.aborted) {
        setProgress(90);
        setStatusMessage("Buscando letras sincronizadas (LRCLIB)...");
        try {
          // Búsqueda directa en LRCLIB con fallback
          const lyricsResult = await searchLyricsOnline(
            mediaInfo.title,
            mediaInfo.artist,
            mediaInfo.album,
            finalDuration
          );

          if (lyricsResult) {
            if (lyricsResult.album) {
              detectedAlbum = lyricsResult.album;
            }

            if (lyricsResult.syncedLyrics || lyricsResult.plainLyrics) {
              let rawLrcString = lyricsResult.rawLrc || "";
              if (!rawLrcString && lyricsResult.syncedLyrics && lyricsResult.syncedLyrics.length > 0) {
                rawLrcString = lyricsResult.syncedLyrics
                  .map((l) => {
                    const min = Math.floor(l.time / 60).toString().padStart(2, "0");
                    const sec = Math.floor(l.time % 60).toString().padStart(2, "0");
                    const ms = Math.floor((l.time % 1) * 100).toString().padStart(2, "0");
                    return `[${min}:${sec}.${ms}]${l.text}`;
                  })
                  .join("\n");
              } else if (!rawLrcString && lyricsResult.plainLyrics) {
                rawLrcString = lyricsResult.plainLyrics;
              }

              lyricsData = {
                plain: lyricsResult.plainLyrics || "",
                synced: lyricsResult.syncedLyrics || undefined,
                source: lyricsResult.source || "LRCLIB",
                rawLrc: rawLrcString || undefined,
              };

              // Crear Blob UTF-8 para persistencia en IndexedDB
              if (rawLrcString) {
                lrcBlob = new Blob([rawLrcString], { type: "text/plain;charset=utf-8" });
                lrcFileName = `${mediaInfo.artist} - ${mediaInfo.title}.lrc`;
              }
            }
          }
        } catch (lrcErr: any) {
          if (lrcErr?.name !== "AbortError") {
            console.warn("No se pudieron obtener letras automáticas:", lrcErr);
          }
        }
      }

      if (controller.signal.aborted) {
        resetDownloadState(false);
        return;
      }

      // 2. Verificación de Integridad de Audio antes de Guardar:
      // Valida que blob.size > 0 y sea >= 100 KB
      if (!audioBlob || audioBlob.size < MIN_VALID_AUDIO_BYTES) {
        throw new Error(ERROR_INVALID_AUDIO_STREAM);
      }

      setStatusMessage("Verificando integridad y duración del archivo descargado...");
      setProgress(94);

      let verifiedDuration = finalDuration;
      try {
        const measuredDur = await verifyAudioIntegrity(audioBlob);
        if (measuredDur > 0) {
          verifiedDuration = Math.round(measuredDur);
        }
      } catch (integrityErr: any) {
        console.error("Fallo de verificación de integridad de audio:", integrityErr);
        throw new Error(integrityErr?.message || ERROR_INVALID_AUDIO_STREAM);
      }

      if (controller.signal.aborted) {
        resetDownloadState(false);
        return;
      }

      // Carátula en alta definición
      let coverUrl = mediaInfo.coverUrl;
      if (!coverUrl && autoCover) {
        coverUrl = generateCoverArt(mediaInfo.title, mediaInfo.artist);
      }

      setProgress(98);
      setStatusMessage("Guardando en la biblioteca local IndexedDB...");

      const ext = formatType === "audio" ? audioFormat.toLowerCase() : videoFormat.toLowerCase();
      const audioFile = new File([audioBlob], `${mediaInfo.artist} - ${mediaInfo.title}.${ext}`, {
        type: audioBlob.type || "audio/mpeg",
      });
      const objectUrl = URL.createObjectURL(audioFile);

      const qualityLabel =
        formatType === "audio"
          ? AUDIO_QUALITIES.find((q) => q.id === audioQuality)?.label || audioQuality
          : VIDEO_QUALITIES.find((q) => q.id === videoQuality)?.label || videoQuality;

      const newTrack: Track = {
        id: `dl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: mediaInfo.title || "Canción Descargada",
        artist: mediaInfo.artist || "Artista Web",
        album: detectedAlbum || mediaInfo.album || (isYt ? "YouTube Music" : "Descargas Web"),
        folderPath: "Descargas / Web",
        duration: verifiedDuration,
        url: objectUrl,
        file: audioFile,
        coverUrl: coverUrl || generateCoverArt(mediaInfo.title, mediaInfo.artist),
        format: `${formatType === "audio" ? audioFormat : videoFormat} (${qualityLabel})`,
        size: audioBlob.size,
        addedAt: Date.now(),
        isFavorite: false,
        lyrics: lyricsData,
        lrcBlob: lrcBlob,
        lrcFileName: lrcFileName,
        rawLrc: lyricsData?.rawLrc,
      };

      // Guardar en la base de datos IndexedDB local (canción y archivo de letras .lrc)
      await saveDownloadedTrackToLibrary(newTrack);

      setProgress(100);
      setDownloadSpeed("0 KB/s");
      setStatusMessage("Guardado en biblioteca");
      setCompletedTrack(newTrack);

      // Añadir inmediatamente a la biblioteca
      onTrackDownloaded(newTrack, false);
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        resetDownloadState(false);
        return;
      }
      console.warn("Aviso durante la descarga:", err?.message || err);
      // Manejo explícito de errores de servidor o stream inválido
      if (
        err?.message === ERROR_INVALID_AUDIO_STREAM ||
        err?.message?.includes("válido") ||
        err?.message?.includes("dañado")
      ) {
        setError(err.message);
      } else if (err?.message?.includes("restricciones") || err?.message?.includes("antibot")) {
        setError(err.message);
      } else if (isYt || err?.message === ERROR_YOUTUBE_EXTRACTION_FAILED || err?.message?.includes("YouTube")) {
        setError(ERROR_YOUTUBE_EXTRACTION_FAILED);
      } else {
        setError(err?.message || "Ocurrió un error al procesar y descargar el archivo.");
      }
      setIsDownloading(false);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePlayDownloaded = () => {
    if (completedTrack) {
      const trackToPlay = completedTrack;
      // Resetea el estado para dejar la interfaz lista
      resetDownloadState(true);
      onTrackDownloaded(trackToPlay, true);
      onClose();
    }
  };

  const handleResetForAnother = () => {
    // Resetea por completo los estados del componente (progress, abortController, blob, url input)
    resetDownloadState(true);
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  return (
    <div
      id="download-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCloseModal();
        }
      }}
    >
      <div
        id="download-modal-container"
        className="w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-all"
        style={{
          backgroundColor: "var(--color-surface, #13121d)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 30px rgba(124, 58, 237, 0.15)",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl shadow-inner flex items-center justify-center"
              style={{
                backgroundColor: "rgba(124, 58, 237, 0.15)",
                color: "var(--color-accent, #7c3aed)",
              }}
            >
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Descargar desde URL
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Hi-Fi Audio
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Descarga música o video desde YouTube y la web directo a tu reproductor
              </p>
            </div>
          </div>
          <button
            id="download-modal-close-btn"
            onClick={handleCloseModal}
            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Completed View */}
          {completedTrack ? (
            <div className="py-6 px-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">¡Descarga Completada!</h3>
                <p className="text-xs text-emerald-300/90">
                  La pista se ha añadido a tu biblioteca y está disponible sin conexión.
                </p>
              </div>

              {/* Track Card Preview */}
              <div
                className="flex items-center gap-3.5 p-3 rounded-xl max-w-md mx-auto text-left border"
                style={{
                  backgroundColor: "var(--color-bg, #0b0a14)",
                  borderColor: "rgba(255,255,255,0.1)",
                }}
              >
                <img
                  src={completedTrack.coverUrl}
                  alt={completedTrack.title}
                  className="w-14 h-14 rounded-lg object-cover shadow shrink-0 border border-white/10"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{completedTrack.title}</h4>
                  <p className="text-xs text-neutral-400 truncate">{completedTrack.artist}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-400">
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-medium">
                      {completedTrack.format}
                    </span>
                    {completedTrack.lyrics?.synced && (
                      <span className="text-purple-400 flex items-center gap-1 font-medium">
                        <FileText className="w-3 h-3" /> Letras LRC
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  id="download-modal-play-now-btn"
                  onClick={handlePlayDownloaded}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer hover:scale-105 active:scale-95"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Reproducir Ahora
                </button>
                <button
                  id="download-modal-download-more-btn"
                  onClick={handleResetForAnother}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-xs bg-white/10 hover:bg-white/15 text-neutral-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Descargar Otra Canción
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* URL Input Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span>Enlace de video o canción:</span>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="text-[11px] font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Clipboard className="w-3 h-3" />
                    Pegar del portapapeles
                  </button>
                </label>

                <div
                  className="relative flex items-center rounded-xl border px-3.5 py-2.5 transition-all focus-within:ring-2 focus-within:ring-purple-500/50"
                  style={{
                    backgroundColor: "var(--color-bg, #0b0a14)",
                    borderColor: "var(--color-border-subtle, rgba(255,255,255,0.15))",
                  }}
                >
                  <Link2 className="w-4 h-4 text-purple-400 shrink-0 mr-2.5 opacity-80" />
                  <input
                    ref={inputRef}
                    id="download-url-input"
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... o archivo mp3 directo"
                    disabled={isDownloading}
                    className="flex-1 bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none min-w-0"
                  />
                  {url && !isDownloading && (
                    <button
                      type="button"
                      onClick={() => setUrl("")}
                      className="text-neutral-400 hover:text-white p-1 rounded-full hover:bg-white/10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* YouTube Link Detection Badge */}
                {url.trim() && isYouTubeUrl(url.trim()) && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-medium animate-in fade-in duration-200">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="truncate">
                      Enlace de YouTube detectado · Extracción de audio Cobalt / Invidious en alta fidelidad
                    </span>
                  </div>
                )}

                {/* Quick Sample Links */}
                <div className="pt-1">
                  <div className="text-[10px] text-neutral-400 font-medium mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400" /> O prueba con un enlace de ejemplo:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_LINKS.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setUrl(sample.url)}
                        disabled={isDownloading}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 text-neutral-300 hover:text-purple-200 border border-white/5 hover:border-purple-500/30 transition-all cursor-pointer"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Format Type Selector (Audio vs Video) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  Tipo de Formato:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormatType("audio")}
                    disabled={isDownloading}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs ${
                      formatType === "audio"
                        ? "bg-purple-500/15 border-purple-500/50 text-white shadow-sm shadow-purple-500/10"
                        : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
                    }`}
                  >
                    <Music className="w-4 h-4 text-purple-400" />
                    <span>Solo Audio</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormatType("video")}
                    disabled={isDownloading}
                    className={`flex items-center justify-center gap-2.5 p-3 rounded-xl border text-center transition-all cursor-pointer font-semibold text-xs ${
                      formatType === "video"
                        ? "bg-purple-500/15 border-purple-500/50 text-white shadow-sm shadow-purple-500/10"
                        : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
                    }`}
                  >
                    <Video className="w-4 h-4 text-purple-400" />
                    <span>Video</span>
                  </button>
                </div>

                {/* Sub-format Pills */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-neutral-400 font-medium">Contenedor:</span>
                  {formatType === "audio" ? (
                    (["MP3", "M4A", "FLAC"] as AudioFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setAudioFormat(fmt)}
                        disabled={isDownloading}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          audioFormat === fmt
                            ? "bg-purple-600 text-white shadow-sm"
                            : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))
                  ) : (
                    (["MP4", "WEBM"] as VideoFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setVideoFormat(fmt)}
                        disabled={isDownloading}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          videoFormat === fmt
                            ? "bg-purple-600 text-white shadow-sm"
                            : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {fmt}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Dynamic Quality Selector - Clean Pills */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-purple-400" />
                    Calidad de {formatType === "audio" ? "Audio" : "Video"}:
                  </span>
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(formatType === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES).map((q) => {
                    const isSelected = formatType === "audio" ? audioQuality === q.id : videoQuality === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          if (isDownloading) return;
                          if (formatType === "audio") setAudioQuality(q.id);
                          else setVideoQuality(q.id);
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-purple-500/20 border-purple-500 text-white shadow-sm shadow-purple-500/20"
                            : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-300"
                        }`}
                      >
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opciones Adicionales simplificadas */}
              <div
                className="p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                {/* Opción 1: Letras LRC */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={autoLyrics}
                    onChange={(e) => setAutoLyrics(e.target.checked)}
                    disabled={isDownloading}
                    className="rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-0 bg-neutral-900 border-neutral-700 w-4 h-4 accent-purple-600 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-white group-hover:text-purple-300 transition-colors flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                    Letra sincronizada (.lrc)
                  </span>
                </label>

                {/* Opción 2: Carátula */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={autoCover}
                    onChange={(e) => setAutoCover(e.target.checked)}
                    disabled={isDownloading}
                    className="rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-0 bg-neutral-900 border-neutral-700 w-4 h-4 accent-purple-600 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-white group-hover:text-purple-300 transition-colors flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                    Carátula del álbum
                  </span>
                </label>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Real-time Progress Bar */}
              {isDownloading && (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
                      <span className="truncate">{statusMessage || "Procesando..."}</span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 font-mono text-[11px]">
                      {downloadSpeed && <span className="text-purple-300 font-bold hidden sm:inline">{downloadSpeed}</span>}
                      <span className="text-white font-bold">{progress}%</span>
                      <button
                        type="button"
                        onClick={handleCancelDownload}
                        className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors cursor-pointer font-sans"
                        title="Cancelar y reiniciar descarga"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 to-emerald-400 transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!completedTrack && (
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 border-t"
            style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))" }}
          >
            <button
              id="download-modal-cancel-btn"
              type="button"
              onClick={isDownloading ? handleCancelDownload : handleCloseModal}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                isDownloading
                  ? "text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {isDownloading ? "Cancelar Descarga" : "Cancelar"}
            </button>

            <button
              id="download-modal-start-btn"
              type="button"
              onClick={handleStartDownload}
              disabled={isDownloading || !url.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Descargando...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Iniciar Descarga</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
