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

        {hiddenCount !== undefined && hiddenCount > 0 && onOpenHiddenTracks && (
          <div className="mt-6 pt-4 border-t border-white/10 w-full">
            <button
              onClick={onOpenHiddenTracks}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 mx-auto font-semibold"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Ver {hiddenCount} canciones ocultas</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Hidden tracks quick notice if any */}
      {hiddenCount !== undefined && hiddenCount > 0 && onOpenHiddenTracks && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-red-950/30 border border-red-500/25 text-xs">
          <span className="flex items-center gap-2 text-neutral-300">
            <EyeOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>
              Tienes <strong>{hiddenCount}</strong> archivo{hiddenCount === 1 ? "" : "s"} de música en tu lista de ocultos (se omiten siempre).
            </span>
          </span>
          <button
            id="view-hidden-tracks-btn"
            onClick={onOpenHiddenTracks}
            className="text-red-400 hover:text-red-300 font-bold underline cursor-pointer shrink-0 ml-2"
          >
            Ver o restaurar
          </button>
        </div>
      )}

      {/* Top Action & Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
        {!isSelectionMode ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold opacity-60">
              {tracks.length} {tracks.length === 1 ? "canción" : "canciones"} en la lista
            </span>

            {onDeleteTracks && (
              <button
                id="enter-selection-mode-btn"
                onClick={() => setIsSelectionMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold hover:bg-white/10 transition-colors text-neutral-300 hover:text-white"
                style={{ borderColor: "var(--color-border-subtle)" }}
                title="Selecciona varias canciones para eliminarlas"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>Seleccionar para eliminar</span>
              </button>
            )}
          </div>
        ) : (
          /* Selection Mode Active Bar */
          <div
            id="selection-mode-active-bar"
            className="w-full flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl border bg-neutral-900/90 backdrop-blur-md shadow-lg"
            style={{ borderColor: "var(--color-accent, #7C3AED)" }}
          >
            <div className="flex items-center gap-3">
              <button
                id="select-all-toggle-btn"
                onClick={handleToggleSelectAll}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold transition-colors"
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
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:pointer-events-none shadow-md transition-all active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar ({selectedIds.size})</span>
              </button>

              <button
                id="cancel-selection-mode-btn"
                onClick={handleExitSelectionMode}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table Header */}
      <div
        className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider opacity-60 border-b select-none"
        style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))" }}
      >
        <span className="col-span-1 text-center">
          {isSelectionMode ? (
            <span title="Seleccionar">Sel</span>
          ) : (
            "#"
          )}
        </span>
        <span className="col-span-6 sm:col-span-5">Título</span>
        <span className="hidden sm:block sm:col-span-3">Álbum</span>
        <span className="col-span-3 sm:col-span-2 text-right flex items-center justify-end gap-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Tiempo</span>
        </span>
        <span className="col-span-2 sm:col-span-1 text-center">Acción</span>
      </div>

      {/* Rows */}
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
              className={`grid grid-cols-12 gap-2 items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all group ${
                isSelected
                  ? "bg-violet-950/40 border border-violet-500/40 shadow-sm"
                  : isCurrent
                  ? "bg-white/10 shadow-sm"
                  : "hover:bg-white/5"
              }`}
              style={{
                borderRadius: "var(--theme-radius, 12px)",
              }}
            >
              {/* Checkbox (selection mode) or Index/Play icon (normal mode) */}
              <div className="col-span-1 flex items-center justify-center">
                {isSelectionMode ? (
                  <button
                    type="button"
                    onClick={(e) => handleToggleSelect(track.id, e)}
                    className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                  >
                    {isSelected ? (
                      <div className="w-4 h-4 rounded bg-violet-600 text-white flex items-center justify-center shadow">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded border border-neutral-500 hover:border-white transition-colors" />
                    )}
                  </button>
                ) : isCurrent ? (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    {isPlaying ? "▶" : "❚❚"}
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-mono opacity-50 group-hover:hidden">
                      {idx + 1}
                    </span>
                    <Play className="w-4 h-4 text-white hidden group-hover:block ml-0.5 fill-white" />
                  </>
                )}
              </div>

              {/* Title & Artist & Thumbnail */}
              <div className="col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0">
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  className="w-10 h-10 rounded-lg object-cover shrink-0 shadow"
                />
                <div className="min-w-0">
                  <p
                    className={`text-xs sm:text-sm font-semibold truncate ${
                      isCurrent ? "font-bold" : ""
                    }`}
                    style={{ color: isCurrent ? "var(--color-accent)" : "var(--color-text-primary)" }}
                  >
                    {track.title}
                  </p>
                  <p className="text-[11px] truncate opacity-70" style={{ color: "var(--color-text-secondary)" }}>
                    {track.artist}
                  </p>
                </div>
              </div>

              {/* Album */}
              <div className="hidden sm:block sm:col-span-3 truncate text-xs opacity-75">
                {track.album}
              </div>

              {/* Duration */}
              <div className="col-span-3 sm:col-span-2 text-right text-xs font-mono opacity-70">
                {formatDuration(track.duration)}
              </div>

              {/* Actions (Like + Lyrics + Hide + Delete) */}
              <div
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  id={`track-like-btn-${track.id}`}
                  onClick={() => onToggleFavorite(track.id)}
                  title={track.isFavorite ? "Quitar favorita" : "Marcar favorita"}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-transform active:scale-90"
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      track.isFavorite ? "fill-red-500 text-red-500" : "text-neutral-400 group-hover:text-white"
                    }`}
                  />
                </button>

                <button
                  id={`track-lyrics-btn-${track.id}`}
                  onClick={() => onOpenLyricsSearchForTrack(track)}
                  title="Buscar o ver letra"
                  className="p-1.5 rounded-full hover:bg-white/10 transition-transform active:scale-90 opacity-60 hover:opacity-100"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>

                <button
                  id={`track-hide-btn-${track.id}`}
                  onClick={() => onHideTrack && onHideTrack(track)}
                  title="Ocultar canción (omitir de la biblioteca)"
                  className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-transform active:scale-90 opacity-50 hover:opacity-100"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>

                {onDeleteTracks && (
                  <button
                    id={`track-delete-btn-${track.id}`}
                    onClick={() => handleStartDeleteSingle(track)}
                    title="Eliminar del reproductor"
                    className="p-1.5 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-transform active:scale-90 opacity-60 hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
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
