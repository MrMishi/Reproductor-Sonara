/**
 * ============================================================================
 * SONARA MUSIC - GESTOR DE PISTAS OCULTAS (HiddenTracksModal.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente permite al usuario revisar y restaurar canciones que fueron
 * marcadas como "ocultas" (para que no aparezcan en la biblioteca ni en el reproductor).
 *
 * ¿Cómo funciona?:
 * 1. Muestra la lista de pistas ocultas registradas en `localStorage` (`HiddenTrackRecord`).
 * 2. Desocultar individual (`onUnhideTrack`): Restaura la pista a la biblioteca visible.
 * 3. Desocultar todas (`onUnhideAll`): Restaura todas las pistas en bloque.
 *
 * Guía para futuras actualizaciones:
 * - El almacenamiento y verificación de pistas ocultas se delega a `db.ts`
 *   (`addHiddenTrack`, `getHiddenTracks`, `removeHiddenTrack`).
 */

import React from "react";
import { X, EyeOff, Eye, Trash2, Music, Clock, AlertCircle } from "lucide-react";
import { HiddenTrackRecord } from "../types";

interface HiddenTracksModalProps {
  isOpen: boolean;
  onClose: () => void;
  hiddenTracks: HiddenTrackRecord[];
  onUnhideTrack: (idOrTitle: string) => void;
  onUnhideAll: () => void;
}

function formatDuration(sec?: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const HiddenTracksModal: React.FC<HiddenTracksModalProps> = ({
  isOpen,
  onClose,
  hiddenTracks,
  onUnhideTrack,
  onUnhideAll,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="hidden-tracks-modal"
        className="w-full max-w-xl rounded-3xl border shadow-2xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1a1a1a)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
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
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0 bg-neutral-800"
            >
              <EyeOff className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Canciones y Archivos Ocultos
              </h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Pistas omitidas permanentemente de la biblioteca y de futuros escaneos
              </p>
            </div>
          </div>

          <button
            id="close-hidden-modal-btn"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar if there are items */}
        {hiddenTracks.length > 0 && (
          <div className="flex items-center justify-between px-2 text-xs">
            <span className="opacity-70 font-mono">
              Total: <strong>{hiddenTracks.length}</strong> archivo{hiddenTracks.length === 1 ? "" : "s"} oculto{hiddenTracks.length === 1 ? "" : "s"}
            </span>

            <button
              id="unhide-all-btn"
              onClick={onUnhideAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 text-xs font-semibold transition-all"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>Restaurar todas</span>
            </button>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar min-h-[220px]">
          {hiddenTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-dashed border-white/10 my-4">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-neutral-400 mb-3">
                <Music className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-sm font-bold mb-1">No tienes archivos ocultos</p>
              <p className="text-xs opacity-65 max-w-sm">
                Si en algún momento no quieres que la aplicación reconozca una canción o audio, pulsa el botón de ocultar en la lista y será omitida automáticamente.
              </p>
            </div>
          ) : (
            hiddenTracks.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border flex items-center justify-between gap-3 bg-white/5 hover:bg-white/10 transition-all"
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4 text-neutral-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold truncate text-white">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] opacity-70 truncate">
                      <span>{item.artist}</span>
                      {item.fileName && (
                        <>
                          <span>•</span>
                          <span className="font-mono truncate">{item.fileName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.duration ? (
                    <span className="text-xs font-mono opacity-60">
                      {formatDuration(item.duration)}
                    </span>
                  ) : null}

                  <button
                    id={`unhide-track-btn-${item.id}`}
                    onClick={() => onUnhideTrack(item.id)}
                    title="Restaurar y volver a permitir en la biblioteca"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-transform active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Restaurar</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Note */}
        <div
          className="text-[11px] opacity-65 pt-3 border-t flex items-center gap-2"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
          <span>
            Los archivos en esta lista negra no se mostrarán en tu biblioteca ni se volverán a importar cuando escanees carpetas locales.
          </span>
        </div>
      </div>
    </div>
  );
};
