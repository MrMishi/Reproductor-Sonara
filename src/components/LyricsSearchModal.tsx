import React, { useState, useEffect } from "react";
import { X, Search, FileText, Check, Loader2, Globe, Sparkles } from "lucide-react";
import { Track } from "../types";
import { searchLyricsOnline, LyricsResult } from "../services/lyricsService";

interface LyricsSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  onLyricsApplied: (trackId: string, lyrics: Track["lyrics"]) => void;
}

export const LyricsSearchModal: React.FC<LyricsSearchModalProps> = ({
  isOpen,
  onClose,
  track,
  onLyricsApplied,
}) => {
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [customText, setCustomText] = useState("");
  const [isEditingCustom, setIsEditingCustom] = useState(false);

  useEffect(() => {
    if (track) {
      setSongTitle(track.title);
      setSongArtist(track.artist && track.artist !== "Artista Desconocido" ? track.artist : "");
      setResult(null);
      setErrorMessage("");
      setCustomText(track.lyrics?.plain || "");
    }
  }, [track, isOpen]);

  if (!isOpen || !track) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!songTitle.trim()) {
      setErrorMessage("Por favor ingresa el título de la canción.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setResult(null);

    try {
      const res = await searchLyricsOnline(songTitle.trim(), songArtist.trim(), track.album, track.duration);
      if (!res.plainLyrics && (!res.syncedLyrics || res.syncedLyrics.length === 0)) {
        setErrorMessage("No se encontraron letras para esta búsqueda. Prueba modificando el nombre o artista.");
      } else {
        setResult(res);
        setCustomText(res.plainLyrics);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al conectar con el servicio de letras en internet.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (isEditingCustom) {
      onLyricsApplied(track.id, {
        plain: customText,
        source: "Personalizada por el usuario",
      });
    } else if (result) {
      onLyricsApplied(track.id, {
        plain: result.plainLyrics,
        synced: result.syncedLyrics || undefined,
        source: result.source === "lrclib" || result.source === "lrclib-search"
          ? "LRCLib (Sincronizada)"
          : result.source === "gemini"
          ? "Google Gemini AI"
          : "Web Lyrics",
      });
    } else if (customText) {
      onLyricsApplied(track.id, {
        plain: customText,
        source: "Manual",
      });
    }
    onClose();
  };

  return (
    <div
      id="lyrics-search-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="lyrics-search-modal-content"
        className="w-full max-w-2xl rounded-2xl border shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--color-border-subtle)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Buscar Letras en Internet</h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Encuentra letras sincronizadas y versos oficiales para "{track.title}"
              </p>
            </div>
          </div>

          <button
            id="lyrics-search-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Cerrar búsqueda de letras"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Título de la canción:
              </label>
              <input
                id="lyrics-search-input-title"
                type="text"
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
                placeholder="Ej. Blinding Lights, Despacito..."
                className="px-3.5 py-2.5 rounded-xl border bg-neutral-900 text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  // @ts-ignore
                  "--tw-ring-color": "var(--color-accent)",
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Artista (recomendado):
              </label>
              <input
                id="lyrics-search-input-artist"
                type="text"
                value={songArtist}
                onChange={(e) => setSongArtist(e.target.value)}
                placeholder="Ej. The Weeknd, Luis Fonsi..."
                className="px-3.5 py-2.5 rounded-xl border bg-neutral-900 text-sm focus:outline-none focus:ring-2"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  // @ts-ignore
                  "--tw-ring-color": "var(--color-accent)",
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              id="lyrics-toggle-custom-btn"
              onClick={() => setIsEditingCustom(!isEditingCustom)}
              className="text-xs font-medium hover:underline flex items-center gap-1.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isEditingCustom ? "Ver resultados de búsqueda" : "Pegar letra manualmente"}</span>
            </button>

            <button
              id="lyrics-submit-search-btn"
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-xs text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Buscando en la red...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Buscar en Internet</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Results / Preview Container */}
        {isEditingCustom ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold opacity-70">Pega o edita la letra aquí:</label>
            <textarea
              id="lyrics-custom-textarea"
              rows={10}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Escribe o pega las estrofas aquí..."
              className="w-full p-4 rounded-xl border bg-neutral-900 text-sm font-sans leading-relaxed focus:outline-none focus:ring-1"
              style={{
                borderColor: "var(--color-border-subtle)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>
        ) : result ? (
          <div
            className="rounded-xl border p-4 flex flex-col gap-3 max-h-[300px] overflow-y-auto"
            style={{
              backgroundColor: "var(--color-surface, #141414)",
              borderColor: "var(--color-border-subtle)",
            }}
          >
            <div className="flex items-center justify-between border-b pb-2 sticky top-0 bg-neutral-900/90 backdrop-blur-sm z-10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{result.track}</span>
                {result.artist && <span className="text-xs opacity-60">· {result.artist}</span>}
              </div>
              <div className="flex items-center gap-2">
                {result.syncedLyrics && result.syncedLyrics.length > 0 && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white flex items-center gap-1"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Karaoke Sincronizado
                  </span>
                )}
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 opacity-80">
                  Fuente: {result.source}
                </span>
              </div>
            </div>

            {/* Lyrics content lines preview */}
            <div className="text-xs sm:text-sm whitespace-pre-line font-sans leading-relaxed opacity-90 py-1">
              {result.plainLyrics || "Instrumental sin voz detectada."}
            </div>
          </div>
        ) : (
          <div
            className="p-8 rounded-xl border text-center flex flex-col items-center justify-center gap-2 opacity-60"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            <Globe className="w-8 h-8 stroke-1" />
            <span className="text-xs">
              Presiona "Buscar en Internet" para localizar la letra oficial y sincronizada de esta canción.
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <button
            id="lyrics-cancel-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-medium hover:bg-white/10 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Cancelar
          </button>

          {(result || customText) && (
            <button
              id="lyrics-apply-btn"
              onClick={handleApply}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-full font-bold text-xs text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <Check className="w-4 h-4" />
              <span>Aplicar y Guardar Letra</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
