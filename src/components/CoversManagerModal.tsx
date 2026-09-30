/**
 * ============================================================================
 * SONARA MUSIC - MODAL DE GESTIÓN DE ARCHIVO DE CARÁTULAS (CoversManagerModal.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente permite al usuario inspeccionar, forzar el guardado, exportar
 * o importar el archivo físico permanente "sonora_covers.json":
 * 
 * - Muestra el recuento exacto de portadas resguardadas.
 * - Información sobre el formato de archivo (JSON estándar ultrarrápido y seguro).
 * - Botón "Guardar archivo ahora" (fuerza la sincronización a disco).
 * - Botón "Exportar archivo (JSON)" (permite descargar una copia de seguridad).
 * - Botón "Importar archivo (JSON)" (restaura o traslada portadas desde otro dispositivo).
 * - Botón "Buscar carátulas para pistas sin portada" (escaneo en lote en segundo plano).
 */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  FileJson,
  Download,
  Upload,
  Save,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Sparkles,
  Info,
  ShieldCheck,
  Search,
} from "lucide-react";
import { Track } from "../types";
import {
  COVERS_FILE_NAME,
  getCoversFileStats,
  flushCoversToPhysicalFile,
  exportCoversFile,
  importCoversFromFile,
  saveCoverToFile,
  enrichTracksWithCoversFromFile,
  convertAllCoversToOfflineWebp,
} from "../services/coverStorageService";
import { buscarYObtenerCaratula } from "../services/coverService";
import { updateTrackInDb } from "../services/db";

interface CoversManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  onTracksUpdated: (updatedTracks: Track[]) => void;
  onShowToast: (message: string) => void;
}

export const CoversManagerModal: React.FC<CoversManagerModalProps> = ({
  isOpen,
  onClose,
  tracks,
  onTracksUpdated,
  onShowToast,
}) => {
  const [stats, setStats] = useState(() => getCoversFileStats());
  const [isFlushing, setIsFlushing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; found: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setStats(getCoversFileStats());
      isCancelledRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Canciones sin carátula real (que tienen carátula SVG generada o nula)
  const tracksWithoutCover = tracks.filter((t) => {
    return (
      !t.coverUrl ||
      t.coverUrl.startsWith("data:image/svg+xml") ||
      t.coverUrl.includes("generateCoverArt")
    );
  });

  // Guardar archivo ahora
  const handleFlushNow = async () => {
    setIsFlushing(true);
    try {
      await flushCoversToPhysicalFile();
      setStats(getCoversFileStats());
      onShowToast(`Archivo "${COVERS_FILE_NAME}" guardado y sincronizado con éxito.`);
    } catch (err) {
      console.error(err);
      onShowToast("Error al guardar archivo en disco.");
    } finally {
      setIsFlushing(false);
    }
  };

  // Exportar archivo JSON
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await flushCoversToPhysicalFile();
      const success = await exportCoversFile();
      if (success) {
        onShowToast(`Archivo "${COVERS_FILE_NAME}" exportado correctamente.`);
      } else {
        onShowToast("No se pudo completar la descarga del archivo.");
      }
    } catch (err) {
      console.error(err);
      onShowToast("Error exportando archivo de carátulas.");
    } finally {
      setIsExporting(false);
    }
  };

  // Importar archivo JSON
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importCoversFromFile(file);
      if (result.success) {
        // Enriquecer canciones de la biblioteca con las nuevas carátulas importadas
        const enriched = enrichTracksWithCoversFromFile(tracks);
        onTracksUpdated(enriched);
        setStats(getCoversFileStats());
        onShowToast(`¡Éxito! Se importaron ${result.imported} carátulas al archivo permanente.`);
      } else {
        onShowToast("El archivo seleccionado no tiene el formato válido de carátulas.");
      }
    } catch (err) {
      console.error(err);
      onShowToast("Error al leer el archivo JSON.");
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  // Convertir todas las carátulas en línea a WebP local 100% offline
  const [isOptimizingOffline, setIsOptimizingOffline] = useState(false);
  const handleOptimizeOffline = async () => {
    setIsOptimizingOffline(true);
    try {
      const res = await convertAllCoversToOfflineWebp();
      const enriched = enrichTracksWithCoversFromFile(tracks);
      onTracksUpdated(enriched);
      setStats(getCoversFileStats());
      onShowToast(
        res.converted > 0
          ? `¡Listo! Se optimizaron ${res.converted} carátulas a WebP local para funcionamiento 100% sin internet.`
          : "Todas tus carátulas ya están guardadas en formato local offline."
      );
    } catch (e) {
      console.warn(e);
      onShowToast("Error al optimizar carátulas.");
    } finally {
      setIsOptimizingOffline(false);
    }
  };

  // Búsqueda en lote de carátulas en línea para canciones pendientes
  const handleBatchSearchCovers = async () => {
    if (tracksWithoutCover.length === 0) {
      onShowToast("Todas tus canciones ya tienen carátula guardada.");
      return;
    }

    setIsBatchScanning(true);
    isCancelledRef.current = false;
    let foundCount = 0;
    const total = tracksWithoutCover.length;
    let updatedTracks = [...tracks];

    for (let i = 0; i < total; i++) {
      if (isCancelledRef.current) break;

      const track = tracksWithoutCover[i];
      setScanProgress({ current: i + 1, total, found: foundCount });

      try {
        const cover = await buscarYObtenerCaratula(track.artist, track.title, track.fileName);
        if (cover && !cover.startsWith("data:image/svg+xml")) {
          foundCount++;
          saveCoverToFile(track.artist, track.title, cover, track.fileName, track.id, "online");

          const updatedTrack = { ...track, coverUrl: cover };
          updatedTracks = updatedTracks.map((t) => (t.id === track.id ? updatedTrack : t));
          updateTrackInDb(updatedTrack).catch(() => {});
        }
      } catch (err) {
        console.warn("Fallo buscando carátula para:", track.title, err);
      }

      // Pequeña pausa para no saturar APIs públicas
      await new Promise((r) => setTimeout(r, 250));
    }

    await flushCoversToPhysicalFile();
    onTracksUpdated(updatedTracks);
    setStats(getCoversFileStats());
    setIsBatchScanning(false);
    setScanProgress(null);

    onShowToast(
      isCancelledRef.current
        ? `Búsqueda detenida. Se añadieron ${foundCount} carátulas al archivo.`
        : `Búsqueda finalizada: ${foundCount} carátulas encontradas y guardadas.`
    );
  };

  const handleStopBatchSearch = () => {
    isCancelledRef.current = true;
  };

  return (
    <div
      id="covers-manager-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="covers-manager-modal-content"
        className="w-full max-w-lg rounded-2xl border shadow-2xl p-5 sm:p-6 flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1a1a1a)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b pb-3 border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Archivo de Carátulas</h2>
              <p className="text-xs opacity-60 font-mono">{COVERS_FILE_NAME}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tarjeta de Información y Estado */}
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Persistencia Permanente Activa</span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium">
              JSON Estable
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-lg bg-black/30 border border-white/5">
              <div className="text-[11px] opacity-60">Carátulas Guardadas</div>
              <div className="text-xl font-bold text-white mt-0.5 flex items-baseline gap-1.5">
                <span>{stats.totalCovers}</span>
                <span className="text-xs font-normal opacity-50">en archivo</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-black/30 border border-white/5">
              <div className="text-[11px] opacity-60">Almacenamiento</div>
              <div className="text-xs font-semibold text-white mt-1 truncate">
                {stats.isNative ? "Android (Data Direct)" : "Web Local Seguro"}
              </div>
            </div>
          </div>

          <div className="text-xs text-white/70 flex items-start gap-2 bg-purple-950/20 border border-purple-800/30 p-2.5 rounded-lg">
            <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <span>
              Las portadas se guardan en el archivo <strong className="text-white font-mono">{COVERS_FILE_NAME}</strong>. Al cerrar y abrir la aplicación, las canciones recuperan su imagen instantáneamente en 0 segundos sin volver a buscarlas en internet.
            </span>
          </div>
        </div>

        {/* Acciones principales del archivo */}
        <div className="flex flex-col gap-2.5">
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 px-1">
            Acciones de Archivo
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Guardar Ahora */}
            <button
              onClick={handleFlushNow}
              disabled={isFlushing}
              className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-98 transition text-xs font-semibold cursor-pointer border border-white/10"
            >
              {isFlushing ? (
                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
              ) : (
                <Save className="w-4 h-4 text-purple-400" />
              )}
              <span>Guardar archivo ahora</span>
            </button>

            {/* Exportar Archivo */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 active:scale-98 transition text-xs font-semibold cursor-pointer border border-purple-500/30 text-purple-200"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-purple-300" />
              ) : (
                <Download className="w-4 h-4 text-purple-300" />
              )}
              <span>Exportar copia (JSON)</span>
            </button>
          </div>

          {/* Importar Archivo */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-98 transition text-xs font-semibold cursor-pointer border border-white/10"
            >
              {isImporting ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <Upload className="w-4 h-4 text-emerald-400" />
              )}
              <span>Restaurar / Importar archivo (JSON)</span>
            </button>
          </div>

          {/* Optimizar carátulas para 100% Offline */}
          <button
            onClick={handleOptimizeOffline}
            disabled={isOptimizingOffline}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 active:scale-98 transition text-xs font-semibold cursor-pointer border border-indigo-500/25 text-indigo-300"
          >
            {isOptimizingOffline ? (
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-indigo-400" />
            )}
            <span>Optimizar carátulas para modo 100% Offline (WebP)</span>
          </button>
        </div>

        {/* Búsqueda en lote para pistas sin carátula */}
        <div className="pt-2 border-t border-white/10 flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60">
              Completar Biblioteca
            </span>
            <span className="text-[11px] opacity-60">
              {tracksWithoutCover.length} canción(es) sin portada
            </span>
          </div>

          {isBatchScanning && scanProgress ? (
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/40 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Buscando ({scanProgress.current} de {scanProgress.total})...
                </span>
                <span className="text-emerald-400 font-medium font-mono">
                  +{scanProgress.found} halladas
                </span>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full transition-all duration-200"
                  style={{
                    width: `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`,
                  }}
                />
              </div>

              <button
                onClick={handleStopBatchSearch}
                className="self-end px-3 py-1 text-[11px] rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold cursor-pointer"
              >
                Detener búsqueda
              </button>
            </div>
          ) : (
            <button
              onClick={handleBatchSearchCovers}
              disabled={tracksWithoutCover.length === 0}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
                tracksWithoutCover.length === 0
                  ? "bg-white/5 opacity-50 cursor-not-allowed border border-white/5"
                  : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-600/20"
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Buscar carátulas para canciones pendientes</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
