/**
 * ============================================================================
 * SONARA MUSIC - EDITOR DE ETIQUETAS ID3 Y METADATOS (ID3EditorModal.tsx)
 * ============================================================================
 * Responsabilidad:
 * Permite al usuario editar los metadatos de cualquier pista de su biblioteca:
 * - Título de la canción
 * - Artista (ID3)
 * - Álbum (ID3)
 * - Año y Género
 * - Cambiar foto de portada (subir imagen local con previsualización en vivo)
 * - Guardado reactivo y persistente en IndexedDB
 */

import React, { useState, useRef } from "react";
import { X, Tag, Image as ImageIcon, Upload, Save, RotateCcw, Music, Disc3, User, Calendar, FileAudio } from "lucide-react";
import { Track } from "../types";

interface ID3EditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  onSave: (updatedTrack: Track) => void;
}

export const ID3EditorModal: React.FC<ID3EditorModalProps> = ({
  isOpen,
  onClose,
  track,
  onSave,
}) => {
  if (!isOpen || !track) return null;

  const [title, setTitle] = useState(track.title || "");
  const [artist, setArtist] = useState(track.artist || "");
  const [album, setAlbum] = useState(track.album || "");
  const [year, setYear] = useState(track.year || "");
  const [genre, setGenre] = useState(track.genre || "");
  const [coverUrl, setCoverUrl] = useState(track.coverUrl || "");
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manejar cambio de foto de portada desde archivo local
  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result && typeof event.target.result === "string") {
        setCoverUrl(event.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleResetCover = () => {
    setCoverUrl("https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const updated: Track = {
      ...track,
      title: title.trim() || track.fileName || "Sin Título",
      artist: artist.trim() || "Artista Desconocido",
      album: album.trim() || "Álbum Desconocido",
      year: year.trim() || undefined,
      genre: genre.trim() || undefined,
      coverUrl: coverUrl || track.coverUrl,
    };

    onSave(updated);
    setIsSaving(false);
    onClose();
  };

  const originalFileName = track.fileName || track.file?.name || (track.url ? track.url.split("/").pop() : "archivo_audio.mp3");

  return (
    <div
      id="id3-editor-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="id3-editor-modal-content"
        className="w-full max-w-xl rounded-2xl border shadow-2xl p-5 sm:p-6 flex flex-col gap-5 max-h-[92vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1a1a1a)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--color-border-subtle)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow"
              style={{ backgroundColor: "var(--color-accent, #7C3AED)", color: "#fff" }}
            >
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">Editor de Etiquetas ID3</h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Modifica los metadatos y la portada de la canción
              </p>
            </div>
          </div>

          <button
            id="id3-modal-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Cerrar editor ID3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Sección de Portada / Álbum Art */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl border bg-black/20"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden shadow-lg border border-white/10 shrink-0 group">
              <img
                src={coverUrl}
                alt="Carátula"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 text-white text-[11px] font-bold transition-opacity cursor-pointer"
              >
                <Upload className="w-5 h-5" />
                <span>Cambiar</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 w-full">
              <span className="text-xs font-bold uppercase tracking-wider opacity-60">Foto de Portada</span>
              <p className="text-xs opacity-75">
                Sube una imagen de tu galería (PNG, JPG, WEBP) para reemplazar la carátula de este tema.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverFileChange}
                />
                <button
                  type="button"
                  id="id3-change-cover-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                  style={{ backgroundColor: "var(--color-accent, #7C3AED)" }}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Subir Nueva Portada</span>
                </button>
                <button
                  type="button"
                  id="id3-reset-cover-btn"
                  onClick={handleResetCover}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border hover:bg-white/10 flex items-center gap-1 opacity-70 hover:opacity-100 transition-all cursor-pointer"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restablecer</span>
                </button>
              </div>
            </div>
          </div>

          {/* Información del archivo (solo lectura) */}
          <div className="p-3 rounded-xl border bg-black/20 text-xs flex items-center gap-2 text-neutral-400"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <FileAudio className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="opacity-70">Archivo: </span>
              <span className="text-white font-mono text-[11px] truncate">{originalFileName}</span>
            </div>
          </div>

          {/* Campos de texto */}
          <div className="flex flex-col gap-3">
            {/* Título */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-purple-400" /> Título de la canción *
              </label>
              <input
                id="id3-input-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Bohemian Rhapsody"
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-black/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* Artista */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" /> Artista (ID3) *
              </label>
              <input
                id="id3-input-artist"
                type="text"
                required
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ej. Queen"
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-black/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* Álbum */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1.5">
                <Disc3 className="w-3.5 h-3.5 text-amber-400" /> Álbum (ID3)
              </label>
              <input
                id="id3-input-album"
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Ej. A Night at the Opera"
                className="w-full px-3.5 py-2 rounded-xl text-sm border bg-black/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>

            {/* Grid Año y Género */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Año
                </label>
                <input
                  id="id3-input-year"
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Ej. 1975"
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-black/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  style={{
                    borderColor: "var(--color-border-subtle)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-rose-400" /> Género
                </label>
                <input
                  id="id3-input-genre"
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Ej. Rock Clásico"
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-black/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                  style={{
                    borderColor: "var(--color-border-subtle)",
                    color: "var(--color-text-primary)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Botones de acción inferiores */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t mt-2" style={{ borderColor: "var(--color-border-subtle)" }}>
            <button
              type="button"
              id="id3-cancel-btn"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              id="id3-save-btn"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent, #7C3AED)" }}
            >
              <Save className="w-4 h-4" />
              <span>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
