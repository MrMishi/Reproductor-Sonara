import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Search,
  Globe,
  Music2,
  Sliders,
  ListMusic,
  Heart,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Sparkles,
  Volume2,
  PictureInPicture2,
  EyeOff,
  Trash2,
} from "lucide-react";
import { Track, PlaybackMode } from "../types";
import { getActiveLyricIndex } from "../services/lyricsService";
import { VisualizerCanvas } from "./VisualizerCanvas";

interface ExpandedPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: Track | null;
  queue: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackMode: PlaybackMode;
  onSelectTrack: (track: Track, index: number) => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleFavorite: (id: string) => void;
  onCyclePlaybackMode: () => void;
  onOpenLyricsSearch: () => void;
  onOpenEqualizer: () => void;
  onToggleMiniMode?: () => void;
  onHideTrack?: (track: Track) => void;
  onDeleteTracks?: (trackIds: string[]) => void;
  activeSubTab?: "queue" | "lyrics" | "details";
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export const ExpandedPlayer: React.FC<ExpandedPlayerProps> = ({
  isOpen,
  onClose,
  currentTrack,
  queue,
  currentTrackIndex,
  isPlaying,
  currentTime,
  duration,
  playbackMode,
  onSelectTrack,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onToggleFavorite,
  onCyclePlaybackMode,
  onOpenLyricsSearch,
  onOpenEqualizer,
  onToggleMiniMode,
  onHideTrack,
  onDeleteTracks,
  activeSubTab: initialSubTab = "queue",
}) => {
  const [activeTab, setActiveTab] = useState<"queue" | "lyrics" | "details">(initialSubTab);
  const [visualMode, setVisualMode] = useState<"cover" | "spectrum">("cover");
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialSubTab) setActiveTab(initialSubTab);
  }, [initialSubTab]);

  // Handle auto-scrolling for synchronized lyrics
  const syncedLyrics = currentTrack?.lyrics?.synced;
  const activeLyricIndex = getActiveLyricIndex(syncedLyrics, currentTime);

  useEffect(() => {
    if (activeTab === "lyrics" && lyricsContainerRef.current && activeLyricIndex >= 0) {
      const activeEl = lyricsContainerRef.current.querySelector(`[data-lyric-index="${activeLyricIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeLyricIndex, activeTab]);

  if (!isOpen || !currentTrack) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      id="ytm-expanded-player"
      className="fixed inset-0 z-50 flex flex-col backdrop-blur-3xl animate-in slide-in-from-bottom-6 duration-300 overflow-hidden"
      style={{
        backgroundColor: "var(--color-bg, #030303)",
        color: "var(--color-text-primary, #ffffff)",
      }}
    >
      {/* Top Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))" }}
      >
        <button
          id="expanded-player-collapse-btn"
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-90 flex items-center gap-2 text-xs font-semibold"
          aria-label="Minimizar reproductor"
        >
          <ChevronDown className="w-6 h-6" />
          <span className="hidden sm:inline">Minimizar</span>
        </button>

        {/* Center Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full border bg-neutral-900/60" style={{ borderColor: "var(--color-border-subtle)" }}>
          <button
            id="expanded-tab-queue"
            onClick={() => setActiveTab("queue")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "queue" ? "bg-white text-black shadow-md" : "text-neutral-400 hover:text-white"
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>A continuación</span>
          </button>
          <button
            id="expanded-tab-lyrics"
            onClick={() => setActiveTab("lyrics")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "lyrics" ? "bg-white text-black shadow-md" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Letras</span>
          </button>
          <button
            id="expanded-tab-details"
            onClick={() => setActiveTab("details")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "details" ? "bg-white text-black shadow-md" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Audio & EQ</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onToggleMiniMode && (
            <button
              id="expanded-mini-mode-btn"
              onClick={() => {
                onClose();
                onToggleMiniMode();
              }}
              className="px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold border border-white/10 text-neutral-300 hover:text-white"
              title="Reducir a Gadget Modo Mini"
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span className="hidden sm:inline">Modo Mini</span>
            </button>
          )}

          <button
            id="expanded-open-eq-btn"
            onClick={onOpenEqualizer}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Ecualizador de audio"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Large Visual Artwork & Core Controls */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 max-w-xl mx-auto w-full">
          {/* Artwork Card or Spectrum */}
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-3xl overflow-hidden shadow-2xl border flex items-center justify-center group mb-6"
            style={{
              borderColor: "var(--color-border-subtle)",
              backgroundColor: "var(--color-surface, #121212)",
            }}
          >
            {visualMode === "cover" ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isPlaying ? "scale-105" : "scale-100"
                }`}
              />
            ) : (
              <div className="w-full h-full p-8 flex flex-col justify-end bg-gradient-to-b from-black/80 to-black/40">
                <VisualizerCanvas className="w-full h-48" type="bars" isPlaying={isPlaying} />
              </div>
            )}

            {/* Visualizer Mode Toggle Chip */}
            <button
              id="expanded-toggle-visual-btn"
              onClick={() => setVisualMode(visualMode === "cover" ? "spectrum" : "cover")}
              className="absolute bottom-3 right-3 px-3 py-1 rounded-full text-[11px] font-semibold bg-black/60 backdrop-blur-md text-white/90 border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {visualMode === "cover" ? "Ver Espectro" : "Ver Portada"}
            </button>
          </div>

          {/* Track Info & Like */}
          <div className="w-full flex items-center justify-between mb-4">
            <div className="min-w-0 pr-4">
              <h1 className="text-xl sm:text-2xl font-extrabold truncate" style={{ color: "var(--color-text-primary)" }}>
                {currentTrack.title}
              </h1>
              <p className="text-sm font-medium truncate opacity-75 mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                {currentTrack.artist} {currentTrack.album ? `• ${currentTrack.album}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                id="expanded-like-btn"
                onClick={() => onToggleFavorite(currentTrack.id)}
                className="p-3 rounded-full hover:bg-white/10 transition-transform active:scale-90"
                title={currentTrack.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"}
              >
                <Heart
                  className={`w-6 h-6 transition-colors ${
                    currentTrack.isFavorite ? "fill-red-500 text-red-500" : "text-neutral-400 hover:text-white"
                  }`}
                />
              </button>

              {onHideTrack && (
                <button
                  id="expanded-hide-btn"
                  onClick={() => onHideTrack(currentTrack)}
                  className="p-3 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-transform active:scale-90"
                  title="Ocultar canción (omitir de la biblioteca permanentemente)"
                >
                  <EyeOff className="w-5 h-5" />
                </button>
              )}

              {onDeleteTracks && (
                <button
                  id="expanded-delete-btn"
                  onClick={() => onDeleteTracks([currentTrack.id])}
                  className="p-3 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-transform active:scale-90"
                  title="Eliminar canción del reproductor"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Progress Slider */}
          <div className="w-full flex flex-col gap-1.5 mb-6">
            <input
              id="expanded-scrubber"
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800"
              style={{ accentColor: "var(--color-accent, #FF0000)" }}
            />
            <div className="flex items-center justify-between text-xs font-mono opacity-70">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Large Main Player Controls */}
          <div className="flex items-center justify-center gap-6 sm:gap-8 w-full">
            <button
              id="expanded-shuffle-btn"
              onClick={onCyclePlaybackMode}
              className={`p-2.5 rounded-full transition-colors ${
                playbackMode === "shuffle" ? "text-white" : "opacity-50 hover:opacity-100 text-neutral-300"
              }`}
              style={{ color: playbackMode === "shuffle" ? "var(--color-accent)" : undefined }}
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              id="expanded-prev-btn"
              onClick={onPrev}
              className="p-3 rounded-full hover:bg-white/10 transition-transform active:scale-90"
            >
              <SkipBack className="w-7 h-7" />
            </button>

            <button
              id="expanded-play-pause-btn"
              onClick={onTogglePlay}
              className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
              style={{
                backgroundColor: "var(--color-accent, #FF0000)",
                boxShadow: "var(--theme-accent-glow)",
              }}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-white" />
              ) : (
                <Play className="w-8 h-8 fill-white ml-1" />
              )}
            </button>

            <button
              id="expanded-next-btn"
              onClick={onNext}
              className="p-3 rounded-full hover:bg-white/10 transition-transform active:scale-90"
            >
              <SkipForward className="w-7 h-7" />
            </button>

            <button
              id="expanded-repeat-btn"
              onClick={onCyclePlaybackMode}
              className={`p-2.5 rounded-full transition-colors ${
                playbackMode.startsWith("repeat") ? "text-white" : "opacity-50 hover:opacity-100 text-neutral-300"
              }`}
              style={{ color: playbackMode.startsWith("repeat") ? "var(--color-accent)" : undefined }}
            >
              {playbackMode === "repeat-one" ? (
                <Repeat1 className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Tab Panel (Queue, Synchronized Lyrics, or Details) */}
        <div
          className="flex-1 border-t lg:border-t-0 lg:border-l flex flex-col overflow-hidden max-w-2xl w-full"
          style={{
            borderColor: "var(--color-border-subtle)",
            backgroundColor: "var(--color-surface, #121212)",
          }}
        >
          {/* TAB 1: A continuación (Queue) */}
          {activeTab === "queue" && (
            <div className="flex-1 flex flex-col overflow-hidden p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm tracking-wider uppercase opacity-70">
                  Cola de Reproducción ({queue.length} temas)
                </h3>
                <span className="text-xs opacity-60">Reproduciendo tema {currentTrackIndex + 1}</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-2">
                {queue.map((track, idx) => {
                  const isCurrent = track.id === currentTrack.id;
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      id={`queue-item-${track.id}`}
                      onClick={() => onSelectTrack(track, idx)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        isCurrent
                          ? "bg-white/15 shadow-sm font-bold"
                          : "hover:bg-white/5 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-5 text-xs text-center opacity-60 font-mono">
                          {isCurrent && isPlaying ? "▶" : idx + 1}
                        </span>
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p
                            className="text-xs sm:text-sm font-semibold truncate"
                            style={{ color: isCurrent ? "var(--color-accent)" : undefined }}
                          >
                            {track.title}
                          </p>
                          <p className="text-[11px] truncate opacity-70">{track.artist}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-mono opacity-60">
                          {formatTime(track.duration)}
                        </span>
                        {onHideTrack && (
                          <button
                            id={`queue-hide-btn-${track.id}`}
                            onClick={() => onHideTrack(track)}
                            title="Ocultar pista"
                            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white opacity-40 hover:opacity-100 transition-all"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteTracks && (
                          <button
                            id={`queue-delete-btn-${track.id}`}
                            onClick={() => onDeleteTracks([track.id])}
                            title="Eliminar del reproductor"
                            className="p-1.5 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 opacity-40 hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Letras de Canciones (Lyrics with Real-Time Karaoke Sync) */}
          {activeTab === "lyrics" && (
            <div className="flex-1 flex flex-col overflow-hidden p-6">
              {/* Lyrics header with Internet Search trigger */}
              <div className="flex items-center justify-between mb-4 border-b pb-3" style={{ borderColor: "var(--color-border-subtle)" }}>
                <div>
                  <h3 className="font-bold text-sm tracking-wide uppercase opacity-70">Letras</h3>
                  {currentTrack.lyrics?.source && (
                    <span className="text-[10px] font-mono opacity-60">
                      Fuente: {currentTrack.lyrics.source}
                    </span>
                  )}
                </div>

                <button
                  id="expanded-search-lyrics-btn"
                  onClick={onOpenLyricsSearch}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar en Internet</span>
                </button>
              </div>

              {/* Lyrics Scrollable Area */}
              <div
                ref={lyricsContainerRef}
                id="expanded-lyrics-container"
                className="flex-1 overflow-y-auto space-y-5 py-8 px-2 scroll-smooth text-center"
              >
                {syncedLyrics && syncedLyrics.length > 0 ? (
                  /* Synchronized Karaoke View */
                  syncedLyrics.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    return (
                      <p
                        key={idx}
                        data-lyric-index={idx}
                        onClick={() => onSeek(line.time)}
                        className={`cursor-pointer transition-all duration-300 py-1.5 px-3 rounded-xl select-none ${
                          isActive
                            ? "text-xl sm:text-2xl font-extrabold scale-105"
                            : "text-sm sm:text-base opacity-40 hover:opacity-80"
                        }`}
                        style={{
                          color: isActive ? "var(--color-accent)" : undefined,
                          textShadow: isActive ? "0 0 16px var(--color-accent)" : "none",
                        }}
                      >
                        {line.text}
                      </p>
                    );
                  })
                ) : currentTrack.lyrics?.plain ? (
                  /* Plain Lyrics View */
                  <div className="text-base sm:text-lg leading-loose whitespace-pre-line opacity-90 font-medium max-w-lg mx-auto">
                    {currentTrack.lyrics.plain}
                  </div>
                ) : (
                  /* No Lyrics State */
                  <div className="h-full flex flex-col items-center justify-center gap-4 text-center my-auto p-8">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: "var(--color-accent)" }}
                    >
                      <Globe className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold">¿No hay letras para esta canción?</h4>
                      <p className="text-xs max-w-xs mx-auto opacity-70 mt-1">
                        Utiliza nuestro buscador web para encontrar automáticamente las letras oficiales en internet.
                      </p>
                    </div>
                    <button
                      id="no-lyrics-search-btn"
                      onClick={onOpenLyricsSearch}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs text-white shadow-lg transition-transform hover:scale-105"
                      style={{ backgroundColor: "var(--color-accent)" }}
                    >
                      <Search className="w-4 h-4" />
                      <span>Buscar Letras en Internet</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Detalles & Equalizer Settings */}
          {activeTab === "details" && (
            <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase opacity-70 mb-3">
                  Información del Archivo de Audio
                </h3>
                <div
                  className="rounded-2xl p-4 border grid grid-cols-2 gap-4 text-xs"
                  style={{
                    backgroundColor: "var(--color-bg, #090909)",
                    borderColor: "var(--color-border-subtle)",
                  }}
                >
                  <div>
                    <span className="opacity-60 block">Formato:</span>
                    <span className="font-bold text-sm">{currentTrack.format || "Audio Estándar"}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">Duración:</span>
                    <span className="font-mono font-bold text-sm">{formatTime(currentTrack.duration)}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">Álbum:</span>
                    <span className="font-semibold">{currentTrack.album}</span>
                  </div>
                  <div>
                    <span className="opacity-60 block">Género / Estilo:</span>
                    <span className="font-semibold">{currentTrack.genre || "No especificado"}</span>
                  </div>
                  {currentTrack.size && (
                    <div>
                      <span className="opacity-60 block">Tamaño del archivo:</span>
                      <span className="font-mono font-semibold">
                        {(currentTrack.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="opacity-60 block">Origen:</span>
                    <span className="font-semibold">
                      {currentTrack.file ? "Almacenamiento del Dispositivo" : "Pista de Demostración"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Equalizer Button Card */}
              <div
                className="rounded-2xl p-5 border flex flex-col gap-3"
                style={{
                  backgroundColor: "var(--color-bg, #090909)",
                  borderColor: "var(--color-border-subtle)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-5 h-5" style={{ color: "var(--color-accent)" }} />
                    <span className="font-bold text-sm">Ecualizador Multibanda</span>
                  </div>
                  <button
                    id="details-open-eq-btn"
                    onClick={onOpenEqualizer}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:scale-105"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    Ajustar Ecualizador
                  </button>
                </div>
                <p className="text-xs opacity-70">
                  Modifica las 7 bandas de frecuencia (60Hz a 14kHz), el refuerzo de graves y la ganancia previa en tiempo real.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
