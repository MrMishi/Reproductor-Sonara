import React, { useState } from "react";
import {
  Play,
  Heart,
  FileText,
  HardDrive,
  Sparkles,
  Clock,
  Music,
  EyeOff,
  Trash2,
  ListChecks,
  CheckSquare,
  Square,
  Check,
  X,
  MoreVertical,
} from "lucide-react";
import { Track } from "../types";

interface TrackListProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, index: number) => void;
  onToggleFavorite: (id: string) => void;
  onOpenLyricsSearchForTrack: (track: Track) => void;
  onOpenScanner: () => void;
  onLoadDemos: () => void;
  onHideTrack?: (track: Track) => void;
  onOpenHiddenTracks?: () => void;
  hiddenCount?: number;
  onDeleteTracks?: (trackIds: string[]) => void;
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onToggleFavorite,
  onOpenLyricsSearchForTrack,
  onOpenScanner,
  onLoadDemos,
  onHideTrack,
  onOpenHiddenTracks,
  hiddenCount,
  onDeleteTracks,
}) => {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingDeleteTracks, setPendingDeleteTracks] = useState<Track[]>([]);
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);

  // Cerrar menú contextual al hacer clic en cualquier parte de la ventana
  React.useEffect(() => {
    if (!openMenuTrackId) return;
    const handleDocumentClick = () => setOpenMenuTrackId(null);
    window.addEventListener("click", handleDocumentClick);
    return () => window.removeEventListener("click", handleDocumentClick);
  }, [openMenuTrackId]);

  // Selection helpers
  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === tracks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tracks.map((t) => t.id)));
    }
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleStartDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const selectedTracks = tracks.filter((t) => selectedIds.has(t.id));
    setPendingDeleteTracks(selectedTracks);
    setShowConfirmModal(true);
  };

  const handleStartDeleteSingle = (track: Track) => {
    setPendingDeleteTracks([track]);
    setShowConfirmModal(true);
  };

  const handleConfirmDelete = () => {
    if (pendingDeleteTracks.length > 0 && onDeleteTracks) {
      const idsToDelete = pendingDeleteTracks.map((t) => t.id);
      onDeleteTracks(idsToDelete);

      // Clean selected if they were among deleted
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });

      if (isSelectionMode && selectedIds.size <= idsToDelete.length) {
        setIsSelectionMode(false);
      }
    }
    setShowConfirmModal(false);
    setPendingDeleteTracks([]);
  };

  const handleCancelDelete = () => {
    setShowConfirmModal(false);
    setPendingDeleteTracks([]);
  };

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center my-8 rounded-3xl border border-dashed border-white/10 max-w-xl mx-auto">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white mb-4 shadow-xl"
          style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
        >
          <Music className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold mb-1">Tu biblioteca está vacía</h3>
        <p className="text-xs sm:text-sm opacity-70 max-w-md mb-6" style={{ color: "var(--color-text-secondary)" }}>
          Detecta y agrega todas las canciones guardadas en las carpetas de tu dispositivo, o carga pistas de prueba de demostración.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            id="empty-state-scan-btn"
            onClick={onOpenScanner}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs text-white shadow-lg transition-all hover:scale-105"
            style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
          >
            <HardDrive className="w-4 h-4" />
            <span>Escanear Dispositivo</span>
          </button>

          <button
            id="empty-state-demo-btn"
            onClick={onLoadDemos}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs border hover:bg-white/10 transition-all"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <Sparkles className="w-4 h-4" style={{ color: "var(--color-accent)" }} />
            <span>Cargar Pistas Demo</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Top Selection Bar (shown only when in selection mode, or sleek discrete trigger) */}
      {isSelectionMode ? (
        <div
          id="selection-mode-active-bar"
          className="w-full flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl border bg-neutral-900/90 backdrop-blur-md shadow-lg mb-1"
          style={{ borderColor: "var(--color-accent, #7C3AED)" }}
        >
          <div className="flex items-center gap-3">
            <button
              id="select-all-toggle-btn"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold transition-colors cursor-pointer"
            >
              {selectedIds.size === tracks.length ? (
                <CheckSquare className="w-4 h-4 text-violet-400" />
              ) : (
                <Square className="w-4 h-4 text-neutral-400" />
              )}
              <span>
                {selectedIds.size === tracks.length
                  ? "Deseleccionar todas"
                  : `Seleccionar todas (${tracks.length})`}
              </span>
            </button>

            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/10 text-white">
              {selectedIds.size} seleccionada{selectedIds.size === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="delete-selected-tracks-btn"
              onClick={handleStartDeleteSelected}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:pointer-events-none shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar ({selectedIds.size})</span>
            </button>

            <button
              id="cancel-selection-mode-btn"
              onClick={handleExitSelectionMode}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar</span>
            </button>
          </div>
        </div>
      ) : (
        onDeleteTracks && (
          <div className="flex justify-end px-1">
            <button
              id="enter-selection-mode-btn"
              onClick={() => setIsSelectionMode(true)}
              className="text-[11px] font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 py-0.5 px-2 rounded-lg hover:bg-white/5 cursor-pointer"
              title="Seleccionar canciones para eliminar"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Seleccionar</span>
            </button>
          </div>
        )
      )}

      {/* Lista de Canciones: Filas Modernas con Bordes Redondeados Suaves */}
      <div className="flex flex-col space-y-1">
        {tracks.map((track, idx) => {
          const isCurrent = track.id === currentTrackId;
          const isSelected = selectedIds.has(track.id);

          return (
            <div
              key={track.id}
              id={`track-row-${track.id}`}
              onClick={(e) => {
                if (isSelectionMode) {
                  handleToggleSelect(track.id, e);
                } else {
                  onPlayTrack(track, idx);
                }
              }}
              className={`relative flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-2xl cursor-pointer transition-all group select-none ${
                isSelected
                  ? "bg-violet-950/40 border border-violet-500/30 shadow-sm"
                  : isCurrent
                  ? "bg-white/[0.08] shadow-sm border border-white/10"
                  : "hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              {/* Izquierda: Portada + Selección + Título + Artista */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {isSelectionMode && (
                  <button
                    type="button"
                    onClick={(e) => handleToggleSelect(track.id, e)}
                    className="w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 cursor-pointer"
                  >
                    {isSelected ? (
                      <div className="w-4 h-4 rounded bg-violet-600 text-white flex items-center justify-center shadow">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded border border-neutral-500 hover:border-white transition-colors" />
                    )}
                  </button>
                )}

                {/* Portada pequeña con indicador de reproducción */}
                <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-neutral-900 border border-white/5 shadow-sm group-hover:shadow-md transition-shadow">
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    className="w-full h-full object-cover"
                  />
                  {isCurrent ? (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow"
                        style={{ backgroundColor: "var(--color-accent, #7C3AED)" }}
                      >
                        {isPlaying ? "▶" : "❚❚"}
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </div>
                  )}
                </div>

                {/* Título y Artista */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold truncate ${
                      isCurrent ? "font-bold" : ""
                    }`}
                    style={{
                      color: isCurrent ? "var(--color-accent, #8B5CF6)" : "var(--color-text-primary, #ffffff)",
                    }}
                  >
                    {track.title}
                  </p>
                  <p
                    className="text-xs truncate opacity-65 mt-0.5"
                    style={{ color: "var(--color-text-secondary, #9ca3af)" }}
                  >
                    {track.artist || "Artista Desconocido"}
                  </p>
                </div>
              </div>

              {/* Derecha: Duración + Menú tres puntos (...) */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <span className="text-xs font-mono opacity-50 select-none">
                  {formatDuration(track.duration)}
                </span>

                {/* Menú tres puntos (...) */}
                <div className="relative">
                  <button
                    id={`track-menu-btn-${track.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuTrackId((prev) => (prev === track.id ? null : track.id));
                    }}
                    title="Opciones"
                    className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer active:scale-95"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {openMenuTrackId === track.id && (
                    <div
                      id={`track-options-menu-${track.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1 w-48 rounded-2xl p-1.5 shadow-2xl border backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
                      style={{
                        backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
                        borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
                      }}
                    >
                      {/* Favorita */}
                      <button
                        onClick={() => {
                          onToggleFavorite(track.id);
                          setOpenMenuTrackId(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 text-left transition-colors cursor-pointer text-white"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            track.isFavorite ? "fill-red-500 text-red-500" : "text-neutral-400"
                          }`}
                        />
                        <span>{track.isFavorite ? "Quitar de Favoritas" : "Marcar Favorita"}</span>
                      </button>

                      {/* Letras */}
                      <button
                        onClick={() => {
                          onOpenLyricsSearchForTrack(track);
                          setOpenMenuTrackId(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 text-left transition-colors cursor-pointer text-white"
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-400" />
                        <span>Ver / Buscar Letra</span>
                      </button>

                      {/* Ocultar */}
                      {onHideTrack && (
                        <button
                          onClick={() => {
                            onHideTrack(track);
                            setOpenMenuTrackId(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 text-left transition-colors cursor-pointer text-neutral-300 hover:text-white"
                        >
                          <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Ocultar Canción</span>
                        </button>
                      )}

                      {/* Eliminar */}
                      {onDeleteTracks && (
                        <button
                          onClick={() => {
                            setOpenMenuTrackId(null);
                            handleStartDeleteSingle(track);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-red-500/20 text-left transition-colors cursor-pointer text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar Canción</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal for Deletion */}
      {showConfirmModal && pendingDeleteTracks.length > 0 && (
        <div
          id="delete-tracks-confirm-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={handleCancelDelete}
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 border shadow-2xl flex flex-col gap-5 text-left"
            style={{
              backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
              borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
              color: "var(--color-text-primary, #ffffff)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold">
                  {pendingDeleteTracks.length === 1
                    ? "¿Eliminar canción del reproductor?"
                    : `¿Eliminar ${pendingDeleteTracks.length} canciones?`}
                </h3>
                <p className="text-xs opacity-70" style={{ color: "var(--color-text-secondary)" }}>
                  Se quitarán de tu biblioteca local y de la cola.
                </p>
              </div>
            </div>

            {/* List preview */}
            <div className="max-h-48 overflow-y-auto rounded-2xl bg-black/40 border border-white/5 p-3 flex flex-col gap-2">
              {pendingDeleteTracks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 text-xs">
                  <img
                    src={t.coverUrl}
                    alt={t.title}
                    className="w-8 h-8 rounded-lg object-cover shrink-0 shadow"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="opacity-60 text-[11px] truncate">{t.artist}</p>
                  </div>
                </div>
              ))}
              {pendingDeleteTracks.length > 5 && (
                <p className="text-[11px] opacity-60 text-center pt-1 italic">
                  ... y {pendingDeleteTracks.length - 5} canción(es) más
                </p>
              )}
            </div>

            {/* Explanatory note */}
            <p className="text-xs text-neutral-400 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
              💡 <strong>Nota:</strong> Los archivos de audio originales en las carpetas de tu dispositivo físico no se borrarán; únicamente se retirarán de este reproductor.
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                id="cancel-delete-modal-btn"
                onClick={handleCancelDelete}
                className="px-4 py-2 rounded-full text-xs font-semibold hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                id="confirm-delete-modal-btn"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-full text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg transition-transform active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {pendingDeleteTracks.length === 1
                    ? "Eliminar canción"
                    : `Eliminar ${pendingDeleteTracks.length} canciones`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
