/**
 * ============================================================================
 * SONARA MUSIC - MODAL DE LISTAS DE REPRODUCCIÓN (PlaylistModal.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente gestiona:
 * 1. La creación de nuevas listas de reproducción con nombre y descripción.
 * 2. La adición de una canción específica a cualquier lista con un toque.
 * 3. La visualización de pistas contenidas en una lista de reproducción con opción
 *    de reproducir todo o eliminar canciones individuales.
 */

import React, { useState } from "react";
import {
  X,
  ListMusic,
  Plus,
  Play,
  Trash2,
  Music,
  Check,
  FolderHeart,
  Sparkles,
} from "lucide-react";
import { Playlist, Track } from "../types";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "add-track" | "view-playlist";
  playlists: Playlist[];
  targetTrack?: Track | null;
  activePlaylist?: Playlist | null;
  allTracks: Track[];
  onCreatePlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  onAddToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  onRemoveFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
  onShowToast: (msg: string) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  mode,
  playlists,
  targetTrack,
  activePlaylist,
  allTracks,
  onCreatePlaylist,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onDeletePlaylist,
  onPlayPlaylist,
  onShowToast,
}) => {
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Manejar creación de nueva lista
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    setIsSubmitting(true);
    try {
      const created = await onCreatePlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
      if (created) {
        if (targetTrack) {
          await onAddToPlaylist(created.id, targetTrack.id);
          onShowToast(`Lista "${created.name}" creada y canción agregada.`);
        } else {
          onShowToast(`Lista "${created.name}" creada con éxito.`);
        }
        setNewPlaylistName("");
        setNewPlaylistDesc("");
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejar añadir canción a una lista existente
  const handleSelectPlaylistForTrack = async (playlistId: string) => {
    if (!targetTrack) return;
    await onAddToPlaylist(playlistId, targetTrack.id);
    const pl = playlists.find((p) => p.id === playlistId);
    onShowToast(`Se agregó "${targetTrack.title}" a "${pl?.name || "la lista"}".`);
    onClose();
  };

  // Pistas de la lista activa
  const playlistTracks = activePlaylist
    ? activePlaylist.trackIds
        .map((id) => allTracks.find((t) => t.id === id))
        .filter((t): t is Track => Boolean(t))
    : [];

  return (
    <div
      id="playlist-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="playlist-modal-content"
        className="w-full max-w-md rounded-2xl border shadow-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #181818)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b pb-3 border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                {mode === "create" && "Nueva Lista de Reproducción"}
                {mode === "add-track" && "Añadir a Lista de Reproducción"}
                {mode === "view-playlist" && (activePlaylist?.name || "Lista de Reproducción")}
              </h2>
              {targetTrack && mode === "add-track" && (
                <p className="text-xs text-purple-300 truncate max-w-[240px]">
                  {targetTrack.title} · {targetTrack.artist}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODO 1: CREAR LISTA */}
        {mode === "create" && (
          <form onSubmit={handleCreate} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs font-semibold opacity-70 block mb-1">Nombre de la lista *</label>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Ej. Favoritas del Gimnasio, Lo-Fi Noche..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold opacity-70 block mb-1">Descripción (opcional)</label>
              <input
                type="text"
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
                placeholder="Breve nota o ambiente de la lista"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newPlaylistName.trim()}
              className="w-full mt-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Lista</span>
            </button>
          </form>
        )}

        {/* MODO 2: AÑADIR CANCIÓN A UNA LISTA EXISTENTE */}
        {mode === "add-track" && (
          <div className="flex flex-col gap-3">
            {/* Opción rápida para crear lista nueva en el acto */}
            <form onSubmit={handleCreate} className="flex items-center gap-2 p-1.5 rounded-xl bg-white/5 border border-white/10">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Crear nueva lista y añadir..."
                className="flex-1 bg-transparent px-2.5 py-1 text-xs text-white placeholder-white/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer shrink-0"
              >
                Crear y Añadir
              </button>
            </form>

            <div className="text-xs font-semibold opacity-60 px-1 pt-1">
              Listas existentes ({playlists.length})
            </div>

            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
              {playlists.length === 0 ? (
                <div className="text-center py-6 text-xs opacity-50 flex flex-col items-center gap-2">
                  <FolderHeart className="w-8 h-8 opacity-40" />
                  <span>Aún no tienes listas creadas. Escribe un nombre arriba para crear tu primera lista.</span>
                </div>
              ) : (
                playlists.map((pl) => {
                  const alreadyHasTrack = Boolean(targetTrack && pl.trackIds.includes(targetTrack.id));
                  return (
                    <button
                      key={pl.id}
                      onClick={() => handleSelectPlaylistForTrack(pl.id)}
                      disabled={alreadyHasTrack}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition cursor-pointer ${
                        alreadyHasTrack
                          ? "bg-purple-950/20 border-purple-800/30 opacity-60 cursor-default"
                          : "bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold shrink-0">
                          <ListMusic className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{pl.name}</div>
                          <div className="text-[10px] opacity-60">
                            {pl.trackIds.length} {pl.trackIds.length === 1 ? "canción" : "canciones"}
                          </div>
                        </div>
                      </div>
                      {alreadyHasTrack ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <Check className="w-3.5 h-3.5" />
                          <span>Ya agregada</span>
                        </span>
                      ) : (
                        <Plus className="w-4 h-4 text-purple-400" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* MODO 3: VER Y GESTIONAR CANCIONES DE LA LISTA ACTIVA */}
        {mode === "view-playlist" && activePlaylist && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-950/30 border border-purple-800/40">
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{activePlaylist.name}</div>
                {activePlaylist.description && (
                  <div className="text-[11px] opacity-70 truncate">{activePlaylist.description}</div>
                )}
                <div className="text-[10px] opacity-50 mt-0.5 font-mono">
                  {playlistTracks.length} canción(es)
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPlayPlaylist(activePlaylist)}
                  disabled={playlistTracks.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer shadow-md shadow-purple-600/20"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Reproducir</span>
                </button>
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar la lista "${activePlaylist.name}"? (Las canciones seguirán en tu biblioteca)`)) {
                      onDeletePlaylist(activePlaylist.id);
                      onClose();
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer"
                  title="Eliminar lista"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {playlistTracks.length === 0 ? (
                <div className="text-center py-8 text-xs opacity-50">
                  Esta lista no contiene canciones aún.
                </div>
              ) : (
                playlistTracks.map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                        {tr.coverUrl ? (
                          <img src={tr.coverUrl} alt={tr.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-500">
                            <Music className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{tr.title}</div>
                        <div className="text-[10px] opacity-60 truncate">{tr.artist}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => onRemoveFromPlaylist(activePlaylist.id, tr.id)}
                      className="p-1 rounded-md hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition cursor-pointer shrink-0"
                      title="Quitar de esta lista"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
