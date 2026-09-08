/**
 * ============================================================================
 * SONARA MUSIC - NAVEGADOR DE DESCARGAS COBALT TOOLS (DownloadModal.tsx)
 * ============================================================================
 * Responsabilidad:
 * Permite descargar música directamente a la carpeta /Download del dispositivo
 * mediante la integración directa de Cobalt Tools ('https://cobalt.tools'):
 * - Navegador interno integrado con iframe y controles de navegación.
 * - Soporte para navegador nativo en Android con @capacitor/browser (Chrome Custom Tab).
 * - Descarga directa del archivo de audio a la carpeta /Download del sistema.
 * - Escaneo automático e inteligente de /Download al finalizar la descarga o regresar
 *   a la aplicación, refrescando la biblioteca en vivo sin intervención manual.
 * - Soporte de importación directa manual como respaldo para navegadores de escritorio.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Download,
  ExternalLink,
  RotateCw,
  FolderSync,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Music2,
  FileAudio,
  Play,
  Smartphone,
  Globe,
  Info,
} from "lucide-react";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Track } from "../types";
import { scanDownloadsFolderOnly } from "../services/nativeScanner";
import { parseAudioFile } from "../services/metadataParser";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTrackDownloaded?: (track: Track, shouldPlayNow?: boolean) => void;
  onTracksImported?: (tracks: Track[]) => void;
  existingTracks?: Track[];
  filterShortAudios?: boolean;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  isOpen,
  onClose,
  onTrackDownloaded,
  onTracksImported,
  existingTracks = [],
  filterShortAudios = true,
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [recentlyFoundTracks, setRecentlyFoundTracks] = useState<Track[]>([]);
  const [autoScanCount, setAutoScanCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isScanningRef = useRef(false);
  const knownTrackKeysRef = useRef<Set<string>>(new Set());

  // Actualizar conjunto de pistas ya existentes para detectar únicamente nuevas descargas
  useEffect(() => {
    const set = new Set<string>();
    existingTracks.forEach((t) => {
      set.add(t.url);
      set.add(`${t.title.toLowerCase().trim()}-${t.artist.toLowerCase().trim()}`);
      if (t.fileName) set.add(t.fileName.toLowerCase().trim());
    });
    knownTrackKeysRef.current = set;
  }, [existingTracks]);

  /**
   * Ejecuta el escáner sobre la carpeta /Download de Android y refresca la biblioteca
   */
  const handleScanDownloads = useCallback(
    async (isAutomatic = false): Promise<Track[]> => {
      if (isScanningRef.current) return [];
      isScanningRef.current = true;
      setIsScanning(true);
      if (!isAutomatic) {
        setScanMessage("Escaneando carpeta /Download del dispositivo...");
      }

      try {
        const result = await scanDownloadsFolderOnly(filterShortAudios);
        const newlyDiscovered: Track[] = [];

        if (result.tracks && result.tracks.length > 0) {
          for (const track of result.tracks) {
            const byUrl = track.url && knownTrackKeysRef.current.has(track.url);
            const byName = knownTrackKeysRef.current.has(
              `${track.title.toLowerCase().trim()}-${track.artist.toLowerCase().trim()}`
            );
            const byFile = track.fileName && knownTrackKeysRef.current.has(track.fileName.toLowerCase().trim());

            if (!byUrl && !byName && !byFile) {
              newlyDiscovered.push(track);
              // Registrar inmediatamente para evitar duplicados en escaneos continuos
              if (track.url) knownTrackKeysRef.current.add(track.url);
              knownTrackKeysRef.current.add(
                `${track.title.toLowerCase().trim()}-${track.artist.toLowerCase().trim()}`
              );
              if (track.fileName) knownTrackKeysRef.current.add(track.fileName.toLowerCase().trim());
            }
          }
        }

        if (newlyDiscovered.length > 0) {
          setRecentlyFoundTracks((prev) => [...newlyDiscovered, ...prev]);
          if (onTracksImported) {
            onTracksImported(newlyDiscovered);
          } else if (onTrackDownloaded && newlyDiscovered.length === 1) {
            onTrackDownloaded(newlyDiscovered[0], false);
          }

          setScanMessage(
            newlyDiscovered.length === 1
              ? `¡"${newlyDiscovered[0].title}" descargada e incorporada a la biblioteca!`
              : `¡${newlyDiscovered.length} nuevas canciones detectadas en /Download!`
          );
        } else if (!isAutomatic) {
          if (!Capacitor.isNativePlatform()) {
            setScanMessage(
              "En navegador web: si tu descarga terminó, usa 'Seleccionar archivo descargado' para integrarlo."
            );
          } else {
            setScanMessage("No se encontraron nuevos archivos en /Download en este momento.");
          }
        }

        return newlyDiscovered;
      } catch (err) {
        console.warn("Error escaneando carpeta /Download:", err);
        if (!isAutomatic) {
          setScanMessage("No se pudo acceder directamente a /Download. Usa la importación manual.");
        }
        return [];
      } finally {
        isScanningRef.current = false;
        setIsScanning(false);
      }
    },
    [filterShortAudios, onTracksImported, onTrackDownloaded]
  );

  /**
   * Abre Cobalt Tools en el navegador nativo (Chrome Custom Tab en Android)
   * garantizando que el archivo descargado se guarde en /Download.
   */
  const handleOpenInNativeBrowser = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        await Browser.open({
          url: "https://cobalt.tools",
          windowName: "_blank",
          presentationStyle: "popover",
        });
      } else {
        window.open("https://cobalt.tools", "_blank", "noopener,noreferrer");
      }
      setScanMessage(
        "Cobalt abierto. Tras descargar tu audio a /Download, regresa aquí y la biblioteca se refrescará automáticamente."
      );
    } catch (err) {
      console.warn("Error abriendo navegador interno:", err);
      window.open("https://cobalt.tools", "_blank");
    }
  };

  // Escucha el retorno del navegador interno nativo (@capacitor/browser)
  useEffect(() => {
    if (!isOpen) return;

    let removeListener: (() => void) | null = null;

    try {
      const subPromise = Browser.addListener("browserFinished", () => {
        // Al cerrar el navegador nativo o regresar, escanear inmediatamente /Download
        handleScanDownloads(true);
      });

      subPromise
        .then((handler) => {
          removeListener = () => handler.remove();
        })
        .catch(() => {});
    } catch {
      // Ignorar si no está en entorno Capacitor nativo
    }

    // Escuchar cuando la ventana o pestaña vuelve al frente (usuario cambió de app tras descargar)
    const handleVisibilityChange = () => {
      if (!document.hidden && isOpen) {
        setAutoScanCount((c) => c + 1);
        handleScanDownloads(true);
      }
    };

    const handleWindowFocus = () => {
      if (isOpen) {
        setAutoScanCount((c) => c + 1);
        handleScanDownloads(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      if (removeListener) removeListener();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isOpen, handleScanDownloads]);

  // Al abrir el modal, ejecutar un escaneo inicial no invasivo
  useEffect(() => {
    if (isOpen) {
      setIsIframeLoading(true);
      setIframeError(false);
      setScanMessage(null);
      setRecentlyFoundTracks([]);
      handleScanDownloads(true);
    }
  }, [isOpen]);

  /**
   * Respaldo para navegadores de escritorio: permite seleccionar el archivo
   * descargado de la carpeta Downloads de la computadora.
   */
  const handleManualFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imported: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const track = await parseAudioFile(file);
        if (track) {
          track.folderPath = "Download";
          imported.push(track);
        }
      } catch (err) {
        console.warn("Error leyendo archivo descargado:", err);
      }
    }

    if (imported.length > 0) {
      setRecentlyFoundTracks((prev) => [...imported, ...prev]);
      if (onTracksImported) {
        onTracksImported(imported);
      } else if (onTrackDownloaded && imported.length === 1) {
        onTrackDownloaded(imported[0], true);
      }
      setScanMessage(
        imported.length === 1
          ? `¡"${imported[0].title}" importada e integrada con éxito!`
          : `¡${imported.length} canciones importadas a la biblioteca!`
      );
    }

    e.target.value = "";
  };

  if (!isOpen) return null;

  return (
    <div
      id="cobalt-download-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div
        id="cobalt-download-modal-container"
        className="relative w-full max-w-5xl h-[92vh] sm:h-[88vh] rounded-3xl flex flex-col shadow-2xl border overflow-hidden select-none"
        style={{
          backgroundColor: "var(--color-surface, #121212)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.15))",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8)",
        }}
      >
        {/* ================================================================= */}
        {/* HEADER SUPERIOR: Controles del Navegador y Escaneo                 */}
        {/* ================================================================= */}
        <div
          className="px-4 py-3 sm:px-6 sm:py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
          style={{
            borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))",
            backgroundColor: "var(--color-surface-elevated, #181818)",
          }}
        >
          {/* Lado izquierdo: Título y URL de Cobalt */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  Descargar Música
                </h2>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  <Globe className="w-3 h-3" />
                  cobalt.tools
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate">
                Descarga directa a la carpeta <span className="text-cyan-300 font-mono font-medium">/Download</span> del dispositivo
              </p>
            </div>
          </div>

          {/* Lado derecho: Acciones rápidas y Cerrar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Botón Abrir en Navegador Nativo / Externo */}
            <button
              id="cobalt-open-external-btn"
              type="button"
              onClick={handleOpenInNativeBrowser}
              title="Abrir en Navegador de Android / Pestaña Externa"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-neutral-200 hover:text-white transition-all cursor-pointer active:scale-95 border border-white/10"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden md:inline">Abrir en Navegador</span>
            </button>

            {/* Botón Recargar iframe */}
            <button
              id="cobalt-reload-iframe-btn"
              type="button"
              onClick={() => {
                setIsIframeLoading(true);
                setIframeError(false);
                setIframeKey((k) => k + 1);
              }}
              title="Recargar página de Cobalt"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer active:scale-95"
            >
              <RotateCw className={`w-4 h-4 ${isIframeLoading ? "animate-spin text-cyan-400" : ""}`} />
            </button>

            {/* Botón Cerrar */}
            <button
              id="cobalt-modal-close-btn"
              type="button"
              onClick={onClose}
              title="Cerrar ventana"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer active:scale-95 ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* BANNER DE GUÍA RÁPIDA: Pasos claros para el usuario               */}
        {/* ================================================================= */}
        <div
          className="px-4 py-2 sm:px-6 sm:py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs shrink-0"
          style={{
            backgroundColor: "rgba(6, 182, 212, 0.06)",
            borderColor: "rgba(6, 182, 212, 0.15)",
          }}
        >
          <div className="flex items-center gap-2 text-cyan-300">
            <Info className="w-4 h-4 shrink-0" />
            <span>
              <strong>Paso a paso:</strong> Pega tu enlace en Cobalt &rarr; elige modo <strong>Audio (MP3/FLAC)</strong> &rarr; descarga el archivo &rarr; Sonora lo agregará automáticamente a tu biblioteca.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* Estado de monitorización automática */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Auto-escáner activo</span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* CUERPO CENTRAL: Navegador Interno con Cobalt Tools                */}
        {/* ================================================================= */}
        <div className="relative flex-1 w-full bg-neutral-950 overflow-hidden">
          {/* Spinner de carga del iframe */}
          {isIframeLoading && !iframeError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/90 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs text-neutral-300 font-medium">
                Cargando navegador integrado de Cobalt Tools...
              </p>
            </div>
          )}

          {/* Iframe integrado de https://cobalt.tools */}
          {!iframeError ? (
            <iframe
              key={iframeKey}
              id="cobalt-tools-iframe"
              src="https://cobalt.tools"
              title="Cobalt Tools - Descarga de Música"
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write; downloads; fullscreen; web-share"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
              onLoad={() => setIsIframeLoading(false)}
              onError={() => {
                setIsIframeLoading(false);
                setIframeError(true);
              }}
            />
          ) : (
            /* Respaldo si el navegador restringe iframes cruzados por CSP */
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto gap-4">
              <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Globe className="w-10 h-10 mx-auto" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">
                  Abrir Cobalt Tools en Navegador
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Las políticas de seguridad de este navegador recomiendan abrir Cobalt Tools directamente. Al descargar tu canción a <span className="text-cyan-300 font-mono">/Download</span>, Sonora la incorporará automáticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenInNativeBrowser}
                className="w-full py-3 px-5 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir Cobalt Tools Ahora</span>
              </button>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* BARRA INFERIOR: Notificaciones de Escaneo y Botones de Acción     */}
        {/* ================================================================= */}
        <div
          className="p-3 sm:px-6 sm:py-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: "var(--color-surface-elevated, #161616)",
            borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))",
          }}
        >
          {/* Mensaje de estado de escaneo */}
          <div className="flex items-center gap-2 text-xs text-neutral-300 w-full sm:w-auto min-w-0">
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                <span className="truncate">Escaneando /Download en busca de nuevos audios...</span>
              </>
            ) : scanMessage ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-300 font-medium truncate">{scanMessage}</span>
              </>
            ) : recentlyFoundTracks.length > 0 ? (
              <>
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-white font-medium truncate">
                  {recentlyFoundTracks.length === 1
                    ? `1 canción agregada: ${recentlyFoundTracks[0].title}`
                    : `${recentlyFoundTracks.length} canciones agregadas recientemente`}
                </span>
              </>
            ) : (
              <>
                <FolderSync className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="text-neutral-400 truncate">
                  La biblioteca se actualiza sola al volver a la app tras descargar.
                </span>
              </>
            )}
          </div>

          {/* Botones de acción manual */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
            {/* Respaldo: Seleccionar archivo descargado manualmente */}
            <button
              id="cobalt-import-manual-file-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Importar archivo descargado manualmente"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition-all cursor-pointer active:scale-95"
            >
              <FileAudio className="w-3.5 h-3.5 text-purple-400" />
              <span>Importar archivo</span>
            </button>

            {/* Input oculto para selección manual */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,.mp3,.m4a,.flac,.wav,.aac,.ogg,.opus"
              className="hidden"
              onChange={handleManualFileImport}
            />

            {/* Botón Escanear /Download ahora */}
            <button
              id="cobalt-scan-downloads-btn"
              type="button"
              onClick={() => handleScanDownloads(false)}
              disabled={isScanning}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-cyan-900/30"
            >
              <FolderSync className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
              <span>{isScanning ? "Escaneando..." : "Escanear /Download ahora"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
