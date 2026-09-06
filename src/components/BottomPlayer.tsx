import React, { useState, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  ChevronUp,
  Sliders,
  FileText,
  Maximize2,
  PictureInPicture2,
} from "lucide-react";
import { Track, PlaybackMode } from "../types";

interface BottomPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackMode: PlaybackMode;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onCyclePlaybackMode: () => void;
  onToggleFavorite: (id: string) => void;
  onOpenExpanded: () => void;
  onOpenEqualizer: () => void;
  onOpenLyrics: () => void;
  onToggleMiniMode: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export const BottomPlayer: React.FC<BottomPlayerProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackMode,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onCyclePlaybackMode,
  onToggleFavorite,
  onOpenExpanded,
  onOpenEqualizer,
  onOpenLyrics,
  onToggleMiniMode,
}) => {
  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  if (!currentTrack) {
    return (
      <div
        id="ytm-bottom-player-empty"
        className="fixed bottom-0 left-0 right-0 z-40 border-t py-3 px-6 text-center text-xs opacity-60 backdrop-blur-md"
        style={{
          backgroundColor: "var(--color-player-bg, #181818)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
          color: "var(--color-text-secondary)",
        }}
      >
        Selecciona una canción o escanea tu dispositivo para comenzar a escuchar
      </div>
    );
  }

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(newPercent * duration);
  };

  return (
    <footer
      id="ytm-bottom-player"
      className="fixed bottom-0 left-0 right-0 z-40 border-t shadow-2xl transition-colors select-none"
      style={{
        backgroundColor: "var(--color-player-bg, #181818)",
        borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))",
        color: "var(--color-text-primary, #ffffff)",
      }}
    >
      {/* Top Scrubber Progress Bar */}
      <div
        ref={progressBarRef}
        id="player-progress-bar-container"
        onClick={handleProgressBarClick}
        onMouseEnter={() => setIsHoveringProgress(true)}
        onMouseLeave={() => setIsHoveringProgress(false)}
        className="relative w-full cursor-pointer h-1.5 hover:h-2.5 transition-all bg-neutral-800/80 group"
      >
        <div
          id="player-progress-bar-fill"
          className="h-full relative transition-all"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: "var(--color-accent, #FF0000)",
          }}
        >
          {/* Draggable indicator dot */}
          <div
            className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md transition-transform ${
              isHoveringProgress ? "scale-100" : "scale-0 group-hover:scale-100"
            }`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 gap-2 sm:gap-4">
        {/* Left: Track Information & Album Art */}
        <div className="flex items-center gap-3 min-w-0 max-w-[28%] sm:max-w-[30%]">
          {/* Album thumbnail with subtle vinyl ring */}
          <div
            id="player-artwork-thumbnail"
            onClick={onOpenExpanded}
            className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 cursor-pointer shadow-md group"
          >
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                isPlaying ? "brightness-100" : "brightness-90"
              }`}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ChevronUp className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex flex-col justify-center">
            <button
              onClick={onOpenExpanded}
              className="text-xs sm:text-sm font-bold truncate text-left hover:underline"
              style={{ color: "var(--color-text-primary)" }}
            >
              {currentTrack.title}
            </button>
            <span
              className="text-[11px] truncate text-left opacity-75"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {currentTrack.artist}
            </span>
          </div>

          {/* Favorite heart */}
          <button
            id="player-like-btn"
            onClick={() => onToggleFavorite(currentTrack.id)}
            className="p-1.5 rounded-full hover:bg-white/10 transition-transform active:scale-90 shrink-0 hidden sm:inline-flex"
            title={currentTrack.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"}
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                currentTrack.isFavorite ? "fill-red-500 text-red-500" : "text-neutral-400 hover:text-white"
              }`}
            />
          </button>
        </div>

        {/* Center: Playback Controls & Time */}
        <div className="flex flex-col items-center gap-1 flex-1 max-w-lg">
          <div className="flex items-center gap-1 sm:gap-4">
            {/* Shuffle */}
            <button
              id="player-shuffle-btn"
              onClick={onCyclePlaybackMode}
              title={`Modo: ${playbackMode}`}
              className={`p-2 rounded-full transition-colors ${
                playbackMode === "shuffle" ? "text-white" : "opacity-50 hover:opacity-100 text-neutral-300"
              }`}
              style={{
                color: playbackMode === "shuffle" ? "var(--color-accent)" : undefined,
              }}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            {/* Previous */}
            <button
              id="player-prev-btn"
              onClick={onPrev}
              title="Anterior"
              className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-90"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play / Pause Main Action Button */}
            <button
              id="player-play-pause-btn"
              onClick={onTogglePlay}
              title={isPlaying ? "Pausar" : "Reproducir"}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 text-white"
              style={{
                backgroundColor: "var(--color-accent, #FF0000)",
                boxShadow: "var(--theme-accent-glow)",
              }}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              id="player-next-btn"
              onClick={onNext}
              title="Siguiente"
              className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-90"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Repeat (oculto en pantallas pequeñas < 640px para evitar encimamiento) */}
            <button
              id="player-repeat-btn"
              onClick={onCyclePlaybackMode}
              title={`Modo: ${playbackMode}`}
              className={`p-2 rounded-full transition-colors hidden sm:inline-flex ${
                playbackMode.startsWith("repeat") ? "text-white" : "opacity-50 hover:opacity-100 text-neutral-300"
              }`}
              style={{
                color: playbackMode.startsWith("repeat") ? "var(--color-accent)" : undefined,
              }}
            >
              {playbackMode === "repeat-one" ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Time display */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono opacity-70">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Lyrics, Equalizer, Volume, Fullscreen */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-3 min-w-0 max-w-[28%] sm:max-w-[30%]">
          {/* Lyrics toggle button */}
          <button
            id="player-lyrics-btn"
            onClick={onOpenLyrics}
            title="Letras de la canción"
            className="p-2 rounded-full hover:bg-white/10 transition-colors relative"
          >
            <FileText className="w-4 h-4" />
            {currentTrack.lyrics && (
              <span
                className="absolute top-1 right-1 w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--color-accent)" }}
              />
            )}
          </button>

          {/* Equalizer button (oculto en pantallas pequeñas < 640px) */}
          <button
            id="player-equalizer-btn"
            onClick={onOpenEqualizer}
            title="Ajustes de Ecualizador"
            className="p-2 rounded-full hover:bg-white/10 transition-colors hidden sm:inline-flex"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Volume slider */}
          <div className="hidden md:flex items-center gap-2 group">
            <button
              id="player-mute-btn"
              onClick={onToggleMute}
              className="p-1 rounded-full hover:bg-white/10 opacity-70 hover:opacity-100"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-500" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              id="player-volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-18 sm:w-24 h-1.5 rounded-lg appearance-none cursor-pointer bg-neutral-800"
              style={{ accentColor: "var(--color-accent)" }}
              aria-label="Volumen"
            />
          </div>

          {/* Modo Mini / Gadget Flotante (oculto en pantallas pequeñas < 640px) */}
          <button
            id="player-mini-mode-btn"
            onClick={onToggleMiniMode}
            title="Modo Mini (Gadget flotante)"
            className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-95 text-neutral-300 hover:text-white hidden sm:inline-flex"
          >
            <PictureInPicture2 className="w-4 h-4" />
          </button>

          {/* Expand Fullscreen / Large Player */}
          <button
            id="player-expand-btn"
            onClick={onOpenExpanded}
            title="Pantalla completa / Detalles"
            className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-95"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    </footer>
  );
};
