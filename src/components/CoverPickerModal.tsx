/**
 * ============================================================================
 * SONARA MUSIC - SELECTOR Y GESTOR DE CARÁTULAS (CoverPickerModal.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente proporciona una experiencia idéntica a la selección de carátulas
 * de Poweramp:
 * 
 * 1. Búsqueda masiva en línea (iTunes y Deezer) en alta resolución (600x600 / HD).
 * 2. Visualización en cuadrícula interactiva para que el usuario elija exactamente
 *    la portada oficial que corresponde a su canción (evitando portadas equivocadas).
 * 3. Botón "Eliminar carátula": Elimina la carátula errónea actual, restablece la
 *    carátula generativa por defecto y bloquea la descarga automática repetitiva.
 * 4. Botón "Subir desde dispositivo": Permite seleccionar una imagen JPEG/PNG/WebP
 *    desde la galería o administrador de archivos del teléfono.
 * 5. Barra de búsqueda editable: Permite corregir o afinar el término de búsqueda
 *    (ej: "NEFFEX Afterlife") si los metadatos de la canción estaban incompletos.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Trash2,
  Upload,
  Check,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Track } from "../types";
import { buscarMultiplesCaratulas, CandidateCover, cleanQueryTerm } from "../services/coverService";
import { saveCoverToFile, removeCoverFromFile } from "../services/coverStorageService";
import { generateCoverArt } from "../services/metadataParser";
import { updateTrackInDb } from "../services/db";

interface CoverPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  onCoverUpdated: (updatedTrack: Track) => void;
  onShowToast: (message: string) => void;
}

export const CoverPickerModal: React.FC<CoverPickerModalProps> = ({
  isOpen,
  onClose,
  track,
  onCoverUpdated,
  onShowToast,
}) => {
  if (!isOpen || !track) return null;

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [candidates, setCandidates] = useState<CandidateCover[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(track.coverUrl || null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inicializar búsqueda al abrir el modal con el título y artista del tema
  useEffect(() => {
    if (isOpen && track) {
      const initialTerm = `${cleanQueryTerm(track.artist)} ${cleanQueryTerm(track.title)}`.trim() || track.title;
      setSearchQuery(initialTerm);
      setSelectedUrl(track.coverUrl || null);
      ejecutarBusqueda(initialTerm);
    }
  }, [isOpen, track?.id]);

  const ejecutarBusqueda = async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setHasSearched(true);
    try {
      const results = await buscarMultiplesCaratulas(track.artist, track.title, query.trim());
      setCandidates(results);
    } catch (err) {
      console.warn("[CoverPickerModal] Error buscando carátulas:", err);
      setCandidates([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutarBusqueda(searchQuery);
  };

  // 1. APLICAR CARÁTULA SELECCIONADA DESDE LA CUADRÍCULA
  const handleSelectCover = async (candidate: CandidateCover) => {
    setSelectedUrl(candidate.url);
    const updated: Track = {
      ...track,
      coverUrl: candidate.url,
      album: track.album || candidate.album,
    };

    // Guardar permanentemente en sonora_covers.json y en IndexedDB
    saveCoverToFile(
      track.artist,
      track.title,
      candidate.url,
      track.fileName,
      track.id,
      "custom"
    );
    await updateTrackInDb(updated);
    onCoverUpdated(updated);
    onShowToast(`¡Carátula de "${candidate.artist}" aplicada con éxito!`);
    onClose();
  };

  // 2. ELIMINAR CARÁTULA ACTUAL (Borrar carátula errónea y volver a carátula por defecto)
  const handleRemoveCover = async () => {
    const defaultCover = generateCoverArt(track.title, track.artist);
    const updated: Track = {
      ...track,
      coverUrl: defaultCover,
    };

    // Remover del archivo persistente sonora_covers.json y marcar para no auto-descargar
    removeCoverFromFile(track.artist, track.title, track.fileName, track.id);
    await updateTrackInDb(updated);
    onCoverUpdated(updated);
    setSelectedUrl(defaultCover);
    onShowToast("Carátula eliminada. Se restableció el diseño por defecto.");
    onClose();
  };

  // 3. SUBIR IMAGEN LOCAL DESDE LA GALERÍA / DISPOSITIVO
  const handleLocalImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const updated: Track = {
          ...track,
          coverUrl: dataUrl,
        };

        saveCoverToFile(
          track.artist,
          track.title,
          dataUrl,
          track.fileName,
          track.id,
          "custom"
        );
        await updateTrackInDb(updated);
        onCoverUpdated(updated);
        setSelectedUrl(dataUrl);
        onShowToast("Carátula personalizada aplicada desde tu dispositivo.");
        onClose();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      id="cover-picker-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="cover-picker-modal-content"
        className="w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface-elevated, #121217)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0 bg-neutral-900/40"
          style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                Elegir Carátula
              </h2>
              <p className="text-xs text-neutral-400">
                Selecciona la portada correcta o elimina la carátula errónea
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">
          {/* Tarjeta de Canción Actual y Acciones Rápidas */}
          <div className="p-3.5 rounded-xl border bg-white/5 border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
              <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-white/15 shadow-md bg-neutral-800">
                {selectedUrl ? (
                  <img
                    src={selectedUrl}
                    alt={track.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-500">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider font-mono text-purple-300 font-semibold">
                  Canción en reproducción
                </p>
                <p className="text-sm font-bold text-white truncate">{track.title}</p>
                <p className="text-xs text-neutral-400 truncate">{track.artist || "Artista Desconocido"}</p>
              </div>
            </div>

            {/* Botones Rápidos: Eliminar Carátula / Subir Foto Local */}
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                id="cover-picker-remove-btn"
                onClick={handleRemoveCover}
                className="flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                title="Eliminar la portada actual de esta canción"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Eliminar carátula</span>
              </button>

              <button
                type="button"
                id="cover-picker-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                title="Elegir foto desde la galería o archivos locales"
              >
                <Upload className="w-3.5 h-3.5 text-purple-300" />
                <span>Subir imagen</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLocalImageChange}
              />
            </div>
          </div>

          {/* Barra de Búsqueda Editable (Modo Poweramp) */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar carátula (ej: NEFFEX Afterlife)..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl border bg-black/40 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 text-neutral-400 hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !searchQuery.trim()}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-all shrink-0 flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Buscar</span>
            </button>
          </form>

          {/* Subtítulo de Resultados */}
          <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
            <span>
              {isLoading
                ? "Buscando carátulas en línea en alta resolución..."
                : candidates.length > 0
                ? `Se encontraron ${candidates.length} carátulas disponibles. Toca la que deseas:`
                : hasSearched
                ? "Sin resultados directos."
                : "Escribe el artista y título para buscar."}
            </span>
            {candidates.length > 0 && (
              <span className="text-[11px] font-mono text-purple-300">600 × 600 HD</span>
            )}
          </div>

          {/* Cuadrícula de Carátulas Candidatas (Poweramp Grid) */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl bg-white/5 border border-white/10 animate-pulse flex flex-col justify-end p-2.5"
                >
                  <div className="w-2/3 h-2.5 bg-white/10 rounded mb-1.5" />
                  <div className="w-1/2 h-2 bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : candidates.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-1">
              {candidates.map((item) => {
                const isCurrent = selectedUrl === item.url;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectCover(item)}
                    className={`group relative rounded-xl overflow-hidden border transition-all cursor-pointer flex flex-col bg-neutral-900/60 hover:scale-[1.02] active:scale-95 ${
                      isCurrent
                        ? "border-purple-500 shadow-[0_0_18px_rgba(168,85,247,0.45)] ring-2 ring-purple-500"
                        : "border-white/10 hover:border-white/30 hover:shadow-lg"
                    }`}
                  >
                    {/* Imagen de Portada */}
                    <div className="relative aspect-square w-full bg-neutral-950 overflow-hidden">
                      <img
                        src={item.thumbnailUrl || item.url}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Badge de Selección Actual */}
                      {isCurrent && (
                        <div className="absolute top-2 right-2 p-1 rounded-full bg-purple-600 text-white shadow-md">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Badge de Fuente / Resolución */}
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[9px] font-mono text-purple-200 border border-white/10">
                        {item.resolution}
                      </div>
                    </div>

                    {/* Metadatos de la Carátula */}
                    <div className="p-2 flex flex-col min-w-0">
                      <p className="text-xs font-bold text-white truncate leading-tight group-hover:text-purple-300 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {item.artist}
                      </p>
                      {item.album && (
                        <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                          {item.album} {item.year ? `(${item.year})` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasSearched ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4 rounded-xl border border-dashed border-white/10 bg-white/5">
              <AlertCircle className="w-8 h-8 text-neutral-400 mb-2 opacity-60" />
              <p className="text-sm font-semibold text-white">No se encontraron carátulas para "{searchQuery}"</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                Intenta buscar con un término más simple (ej: solo el nombre del artista o de la canción), o sube una imagen directamente desde tu dispositivo.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-purple-300" />
                <span>Subir foto desde galería</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Pie del Modal */}
        <div
          className="px-5 py-3.5 border-t shrink-0 flex items-center justify-between bg-neutral-900/60 text-xs text-neutral-400"
          style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))" }}
        >
          <span>Toca cualquier carátula para asignarla a la pista</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
