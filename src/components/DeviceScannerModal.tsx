import React, { useState, useRef, useEffect } from "react";
import {
  X,
  FolderSearch,
  HardDrive,
  Music,
  UploadCloud,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  StopCircle,
  Filter,
  EyeOff,
  VolumeX,
} from "lucide-react";
import { Track } from "../types";
import { parseAudioFile } from "../services/metadataParser";
import { getInitialDemoTracks } from "../services/demoTracks";
import { isTrackHidden, getHiddenTracks } from "../services/db";

interface DeviceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTracksImported: (newTracks: Track[]) => void;
}

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus", ".webm", ".wma"];

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".vscode",
  "appdata",
  "windows",
  "android",
  "cache",
  "temp",
  "tmp",
  "system volume information",
  "$recycle.bin",
  "recovery",
  "program files",
  "program files (x86)",
  "library",
  "applications",
]);

function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const DeviceScannerModal: React.FC<DeviceScannerModalProps> = ({
  isOpen,
  onClose,
  onTracksImported,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [progressStatus, setProgressStatus] = useState("");
  const [statusType, setStatusType] = useState<"info" | "success" | "error" | "cancelled">("info");
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Audio Duration & Blacklist Filters (Default: 75 seconds minimum to eliminate WhatsApp audio / voice notes)
  const [filterShortAudios, setFilterShortAudios] = useState<boolean>(true);
  const [minDurationSeconds, setMinDurationSeconds] = useState<number>(75);
  const [filterHiddenTracks, setFilterHiddenTracks] = useState<boolean>(true);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Reset cancellation flag whenever modal opens
  useEffect(() => {
    if (isOpen) {
      isCancelledRef.current = false;
      setIsScanning(false);
      setProgressStatus("");
      setDiscoveredCount(0);
      setProcessedCount(0);
      setStatusType("info");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStopOrCancel = () => {
    isCancelledRef.current = true;
    setProgressStatus("Deteniendo escaneo de manera segura...");
  };

  const handleSafeClose = () => {
    if (isScanning) {
      isCancelledRef.current = true;
    }
    setIsScanning(false);
    onClose();
  };

  /**
   * Process gathered audio files in optimized concurrent batches with duration & blacklist checks
   */
  const processFilesBatch = async (files: File[]) => {
    if (files.length === 0) {
      setIsScanning(false);
      setStatusType("info");
      setProgressStatus("No se encontraron archivos de audio compatibles en la carpeta.");
      return;
    }

    setIsScanning(true);
    setDiscoveredCount(files.length);
    setProcessedCount(0);
    setStatusType("info");

    const imported: Track[] = [];
    const BATCH_SIZE = 5; // Concurrently process 5 tracks at a time for high speed
    let skippedShortCount = 0;
    let skippedHiddenCount = 0;

    try {
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (isCancelledRef.current) {
          break;
        }

        const currentBatch = files.slice(i, i + BATCH_SIZE);
        const displayName = currentBatch[0]?.name || "canción";
        setProgressStatus(
          `Extrayendo metadatos: ${displayName} (${Math.min(i + 1, files.length)} de ${files.length})...`
        );

        const parsedResults = await Promise.all(
          currentBatch.map(async (file) => {
            // Fast check if file is marked as hidden
            if (filterHiddenTracks && isTrackHidden("", "", file.name)) {
              skippedHiddenCount++;
              return null;
            }

            try {
              const track = await parseAudioFile(file);
              if (!track) return null;

              // Check if track is marked as hidden by title or artist
              if (filterHiddenTracks && isTrackHidden(track.title, track.artist, file.name)) {
                skippedHiddenCount++;
                return null;
              }

              // Verify duration: ignore WhatsApp voice notes or short sounds under minDurationSeconds
              if (filterShortAudios && track.duration < minDurationSeconds) {
                skippedShortCount++;
                return null;
              }

              return track;
            } catch (err) {
              console.warn("Error parsing audio file:", file.name, err);
              return null;
            }
          })
        );

        for (const track of parsedResults) {
          if (track) {
            imported.push(track);
          }
        }

        const countNow = Math.min(i + currentBatch.length, files.length);
        setProcessedCount(countNow);
      }
    } catch (err) {
      console.error("Error in processFilesBatch:", err);
    } finally {
      setIsScanning(false);

      if (isCancelledRef.current) {
        if (imported.length > 0) {
          onTracksImported(imported);
          setStatusType("success");
          const details = skippedShortCount > 0 ? ` (se ignoraron ${skippedShortCount} audios cortos < 1:15)` : "";
          setProgressStatus(
            `Escaneo detenido: Se importaron las ${imported.length} canciones procesadas${details}.`
          );
        } else {
          setStatusType("cancelled");
          setProgressStatus("Escaneo cancelado. No se añadieron canciones.");
        }
      } else if (imported.length > 0) {
        setStatusType("success");
        const detailsList = [];
        if (skippedShortCount > 0) {
          detailsList.push(`se omitieron ${skippedShortCount} audios cortos < 1:15`);
        }
        if (skippedHiddenCount > 0) {
          detailsList.push(`se omitieron ${skippedHiddenCount} archivos ocultos`);
        }
        const extraNote = detailsList.length > 0 ? ` (${detailsList.join(", ")})` : "";

        setProgressStatus(
          `¡Escaneo completado con éxito! Se añadieron ${imported.length} canciones válidas${extraNote}.`
        );
        onTracksImported(imported);
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        setStatusType("info");
        if (skippedShortCount > 0) {
          const minMin = Math.floor(minDurationSeconds / 60);
          const minSec = minDurationSeconds % 60;
          setProgressStatus(
            `Se encontraron ${files.length} archivos de audio, pero todos duraban menos de ${minMin}:${minSec < 10 ? "0" : ""}${minSec} (notas de voz/WhatsApp) y fueron omitidos según tu filtro de duración.`
          );
        } else if (skippedHiddenCount > 0) {
          setProgressStatus(
            `Se encontraron ${files.length} archivos, pero todos coinciden con tu lista de canciones ocultas.`
          );
        } else {
          setProgressStatus("No se pudieron extraer canciones válidas de los archivos seleccionados.");
        }
      }
    }
  };

  /**
   * Modern File System Access API: showDirectoryPicker() with full abort/cancel safety
   */
  const handleScanDeviceDirectory = async () => {
    isCancelledRef.current = false;
    setProgressStatus("");
    setStatusType("info");

    // Fallback if showDirectoryPicker is not supported
    // @ts-ignore
    if (typeof window.showDirectoryPicker !== "function") {
      folderInputRef.current?.click();
      return;
    }

    let dirHandle: any = null;

    try {
      setProgressStatus("Esperando que selecciones la carpeta en el explorador...");
      setIsScanning(true);

      // @ts-ignore
      dirHandle = await window.showDirectoryPicker({
        id: "music-folder",
        mode: "read",
      });
    } catch (err: any) {
      setIsScanning(false);
      setProgressStatus("");

      // Detect user cancellation or abort cleanly
      const isUserCancel =
        err?.name === "AbortError" ||
        err?.code === 20 ||
        err?.name === "NotAllowedError" ||
        err?.name === "SecurityError" ||
        err?.message?.toLowerCase().includes("abort") ||
        err?.message?.toLowerCase().includes("cancel") ||
        err?.message?.toLowerCase().includes("user");

      if (isUserCancel) {
        // User clicked cancel or dismissed dialog: cleanly reset without getting stuck
        setStatusType("cancelled");
        setProgressStatus("Selección de carpeta cancelada.");
        return;
      }

      // If blocked by iframe or browser permissions, attempt standard input
      console.warn("showDirectoryPicker restricted, falling back to input:", err);
      folderInputRef.current?.click();
      return;
    }

    if (!dirHandle) {
      setIsScanning(false);
      return;
    }

    try {
      setProgressStatus("Explorando carpetas y subcarpetas del dispositivo...");
      const audioFiles: File[] = [];

      async function scanDirectory(handle: any) {
        if (isCancelledRef.current) return;

        try {
          for await (const entry of handle.values()) {
            if (isCancelledRef.current) break;

            if (entry.kind === "file") {
              if (isAudioFile(entry.name)) {
                try {
                  const file = await entry.getFile();
                  audioFiles.push(file);
                  setDiscoveredCount((prev) => prev + 1);
                } catch {
                  // File permission or read issue, skip
                }
              }
            } else if (entry.kind === "directory") {
              const dirName = entry.name.toLowerCase();
              // Skip heavy non-audio system directories to keep scan fast
              if (!IGNORED_DIRECTORIES.has(dirName) && !dirName.startsWith(".")) {
                try {
                  await scanDirectory(entry);
                } catch {
                  // Skip unreadable folder
                }
              }
            }
          }
        } catch {
          // Handle iteration issues cleanly
        }
      }

      await scanDirectory(dirHandle);

      if (isCancelledRef.current) {
        setIsScanning(false);
        setStatusType("cancelled");
        setProgressStatus("Escaneo cancelado antes de procesar archivos.");
        return;
      }

      await processFilesBatch(audioFiles);
    } catch (scanErr) {
      console.error("Error during folder traversal:", scanErr);
      setIsScanning(false);
      setStatusType("error");
      setProgressStatus("Ocurrió un error al leer la carpeta seleccionada.");
    }
  };

  const handleFolderInputSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      setIsScanning(false);
      return;
    }

    isCancelledRef.current = false;
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (isAudioFile(f.name) || f.type.startsWith("audio/")) {
        files.push(f);
      }
    }

    // Reset input value so selecting the same or new folder again works
    e.target.value = "";

    await processFilesBatch(files);
  };

  const handleFilesInputSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      setIsScanning(false);
      return;
    }

    isCancelledRef.current = false;
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (isAudioFile(f.name) || f.type.startsWith("audio/")) {
        files.push(f);
      }
    }

    // Reset input value so re-selecting works
    e.target.value = "";

    await processFilesBatch(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    isCancelledRef.current = false;

    const items = e.dataTransfer.items;
    const files: File[] = [];

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file && (isAudioFile(file.name) || file.type.startsWith("audio/"))) {
            files.push(file);
          }
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (isAudioFile(file.name) || file.type.startsWith("audio/")) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      await processFilesBatch(files);
    } else {
      setStatusType("info");
      setProgressStatus("No se soltaron archivos de audio compatibles.");
    }
  };

  const handleLoadDemo = async () => {
    setIsScanning(true);
    isCancelledRef.current = false;
    setStatusType("info");
    setProgressStatus("Generando pistas de alta resolución sintetizadas en Web Audio...");

    try {
      const demos = await getInitialDemoTracks();
      onTracksImported(demos);
      setStatusType("success");
      setProgressStatus("¡Pistas de prueba añadidas a tu biblioteca!");
      setTimeout(() => onClose(), 800);
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setProgressStatus("Error al generar pistas de prueba.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      id="device-scanner-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleSafeClose}
    >
      <div
        id="device-scanner-modal-content"
        className="w-full max-w-xl rounded-2xl border shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b pb-4"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
              style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Detectar Música del Dispositivo</h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Escanea tu almacenamiento local, carpetas o canciones descargadas
              </p>
            </div>
          </div>

          <button
            id="device-scanner-close-btn"
            onClick={handleSafeClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
            aria-label="Cerrar escáner"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File Inputs */}
        {/* @ts-ignore */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          directory=""
          multiple
          accept="audio/*"
          className="hidden"
          onChange={handleFolderInputSelected}
          onCancel={() => {
            setIsScanning(false);
            setProgressStatus("");
          }}
        />
        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus"
          className="hidden"
          onChange={handleFilesInputSelected}
          onCancel={() => {
            setIsScanning(false);
            setProgressStatus("");
          }}
        />

        {/* Drag & Drop Zone */}
        <div
          id="device-scanner-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 transition-all ${
            isDragOver ? "scale-[1.01] bg-white/10" : "hover:border-white/40"
          }`}
          style={{
            borderColor: isDragOver ? "var(--color-accent)" : "var(--color-border-subtle)",
            backgroundColor: isDragOver ? "rgba(255,255,255,0.04)" : "transparent",
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
            style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
          >
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold">Arrastra carpetas o canciones aquí</p>
            <p className="text-xs opacity-70 mt-0.5">Compatible con MP3, FLAC, WAV, M4A, AAC, OGG y OPUS</p>
          </div>
        </div>

        {/* Smart Audio Duration & Blacklist Filters */}
        <div
          id="smart-filter-settings-box"
          className="p-3.5 rounded-2xl border flex flex-col gap-3 transition-all"
          style={{
            backgroundColor: "var(--color-surface, #141414)",
            borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: "var(--color-accent, #FF0000)" }} />
              <span className="text-xs font-bold text-white">Filtro de Duración y Audios de WhatsApp</span>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Antivirus de audios cortos
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
            <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
              <input
                id="filter-short-audios-toggle"
                type="checkbox"
                checked={filterShortAudios}
                onChange={(e) => setFilterShortAudios(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-neutral-200 block">
                  Omitir audios cortos (WhatsApp, notas de voz, tonos)
                </span>
                <span className="text-[10px] opacity-60">
                  Verifica que los archivos sean música real y no mensajes de voz
                </span>
              </div>
            </label>

            {filterShortAudios && (
              <div className="flex items-center gap-2 text-xs shrink-0 self-end sm:self-auto">
                <span className="opacity-70 text-[11px]">Duración mínima:</span>
                <select
                  id="min-duration-select"
                  value={minDurationSeconds}
                  onChange={(e) => setMinDurationSeconds(Number(e.target.value))}
                  className="bg-neutral-800 text-white rounded-lg px-2.5 py-1.5 text-xs border border-white/10 font-bold focus:outline-none cursor-pointer hover:border-white/20"
                >
                  <option value={75}>1 min 15 seg (75s) · Recomendado</option>
                  <option value={60}>1 min 00 seg (60s)</option>
                  <option value={90}>1 min 30 seg (90s)</option>
                  <option value={120}>2 min 00 seg (120s)</option>
                  <option value={30}>30 segundos (30s)</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/5 opacity-80">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id="filter-hidden-tracks-toggle"
                type="checkbox"
                checked={filterHiddenTracks}
                onChange={(e) => setFilterHiddenTracks(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-violet-500 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5 text-red-400" />
                <span>Omitir permanentemente archivos de tu lista de "Archivos Ocultos"</span>
              </span>
            </label>
            <span className="font-mono text-[10px] text-neutral-400">
              {getHiddenTracks().length} {getHiddenTracks().length === 1 ? "oculta" : "ocultas"}
            </span>
          </div>
        </div>

        {/* Action Options */}
        <div className="flex flex-col gap-3">
          {/* Main Option: Native folder scan */}
          <button
            id="scan-device-folder-btn"
            disabled={isScanning}
            onClick={handleScanDeviceDirectory}
            className="p-4 rounded-xl border flex items-center justify-between text-left transition-all hover:scale-[1.01] group shadow-md disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-surface, #141414)",
              borderColor: "var(--color-accent)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                <FolderSearch className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold block text-white">
                  Escanear Carpeta de Música del Dispositivo
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  Busca automáticamente todas las canciones en tu carpeta seleccionada y subcarpetas
                </span>
              </div>
            </div>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full text-white shrink-0"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Recomendado
            </span>
          </button>

          {/* Secondary Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              id="select-audio-files-btn"
              disabled={isScanning}
              onClick={() => filesInputRef.current?.click()}
              className="p-3 rounded-xl border flex items-center gap-3 text-left hover:bg-white/5 transition-all disabled:opacity-50"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <Music className="w-4 h-4 text-neutral-400 shrink-0" />
              <div>
                <span className="text-xs font-bold block">Seleccionar Archivos</span>
                <span className="text-[11px] opacity-70">Elige pistas específicas</span>
              </div>
            </button>

            <button
              id="load-demo-tracks-btn"
              disabled={isScanning}
              onClick={handleLoadDemo}
              className="p-3 rounded-xl border flex items-center gap-3 text-left hover:bg-white/5 transition-all disabled:opacity-50"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: "var(--color-accent)" }} />
              <div>
                <span className="text-xs font-bold block">Cargar Música de Prueba</span>
                <span className="text-[11px] opacity-70">Sintetizador Lo-Fi & Synthwave</span>
              </div>
            </button>
          </div>
        </div>

        {/* Scanning In-Progress Display with CANCEL button */}
        {isScanning && (
          <div
            className="p-4 rounded-xl border flex flex-col gap-3 animate-in fade-in"
            style={{
              backgroundColor: "var(--color-surface, #141414)",
              borderColor: "var(--color-accent)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2
                  className="w-4 h-4 animate-spin text-red-500 shrink-0"
                  style={{ color: "var(--color-accent)" }}
                />
                <span className="text-xs font-semibold">Procesando audio local...</span>
              </div>

              {/* Explicit Cancel / Stop button */}
              <button
                id="cancel-scan-active-btn"
                onClick={handleStopOrCancel}
                className="px-3 py-1 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="Detener el escaneo en cualquier momento"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Detener / Cancelar</span>
              </button>
            </div>

            {discoveredCount > 0 && (
              <div className="flex items-center justify-between text-xs font-mono font-bold opacity-80">
                <span>Progreso:</span>
                <span>
                  {processedCount} / {discoveredCount} canciones
                </span>
              </div>
            )}

            {/* Animated Progress Bar */}
            <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full transition-all duration-150 rounded-full"
                style={{
                  backgroundColor: "var(--color-accent)",
                  width:
                    discoveredCount > 0
                      ? `${Math.max(5, (processedCount / discoveredCount) * 100)}%`
                      : "25%",
                }}
              />
            </div>

            <span
              className="text-[11px] font-mono truncate"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {progressStatus || "Extrayendo audio..."}
            </span>
          </div>
        )}

        {/* Completed or Cancelled Status Feedback */}
        {!isScanning && progressStatus && (
          <div
            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-medium ${
              statusType === "success"
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                : statusType === "cancelled"
                ? "bg-amber-950/40 border-amber-500/30 text-amber-300"
                : statusType === "error"
                ? "bg-red-950/40 border-red-500/30 text-red-400"
                : "bg-neutral-900 border-neutral-700 text-neutral-300"
            }`}
          >
            {statusType === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {statusType === "cancelled" && <AlertCircle className="w-4 h-4 shrink-0" />}
            {statusType === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
            {statusType === "info" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{progressStatus}</span>
          </div>
        )}

        {/* Explanatory note */}
        <div
          className="text-[11px] opacity-60 leading-relaxed border-t pt-3"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          💡 <span className="font-semibold">Privacidad total:</span> Las canciones se leen y reproducen directamente en tu dispositivo local mediante la API de archivos del navegador web. Puedes detener el escaneo en cualquier momento si la carpeta es muy grande.
        </div>
      </div>
    </div>
  );
};
