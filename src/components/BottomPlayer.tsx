/**
 * ============================================================================
 * SONARA MUSIC - BARRA INFERIOR DE REPRODUCCIÓN (BottomPlayer.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente renderiza la barra persistente de reproducción anclada en la parte
 * inferior de la pantalla. Proporciona controles rápidos y fluidos sin interrumpir
 * la navegación de la biblioteca.
 *
 * ¿Cómo funciona?:
 * 1. Muestra la carátula, título y artista de la pista actual (`currentTrack`).
 * 2. Barra de progreso interactiva: Permite hacer clic o arrastrar para saltar
 *    a cualquier punto de la pista mediante `onSeek`.
 * 3. Botones de transporte: Play/Pausa (`onTogglePlay`), Anterior (`onPrev`),
 *    Siguiente (`onNext`).
 * 4. Apertura del reproductor expandido: Al tocar la información de la pista o el botón
 *    dedicado, ejecuta `onOpenExpanded` para mostrar la carátula gigante y el karaoke.
 *
 * Guía para futuras actualizaciones:
 * - Los colores de fondo y acento responden a las variables CSS dinámicas del tema
 *   `--color-player-bg` y `--color-accent`.
 */

import React, { useState, useRef } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronUp,
  Music,
} from "lucide-react";
import { Track, PlaybackMode } from "../types";

interface BottomPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume?: number;
  isMuted?: boolean;
  playbackMode?: PlaybackMode;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  onCyclePlaybackMode?: () => void;
  onToggleFavorite?: (id: string) => void;
  onOpenExpanded: () => void;
  onOpenEqualizer?: () => void;
  onOpenLyrics?: () => void;
  onToggleMiniMode?: () => void;
}

export const BottomPlayer: React.FC<BottomPlayerProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onOpenExpanded,
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
      {/* Barra de progreso fina en el borde superior del mini reproductor */}
      <div
        ref={progressBarRef}
        id="player-progress-bar-container"
        onClick={handleProgressBarClick}
        onMouseEnter={() => setIsHoveringProgress(true)}
        onMouseLeave={() => setIsHoveringProgress(false)}
        className="relative w-full cursor-pointer h-1 hover:h-2 transition-all bg-white/10 group"
      >
        <div
          id="player-progress-bar-fill"
          className="h-full relative transition-all"
          style={{
            width: `${progressPercent}%`,
            backgroundColor: "var(--color-accent, #7C3AED)",
          }}
        >
          {/* Draggable indicator dot */}
          <div
            className={`absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md transition-transform ${
              isHoveringProgress ? "scale-100" : "scale-0 group-hover:scale-100"
            }`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 gap-4 max-w-7xl mx-auto">
        {/* 1. EXTREMO IZQUIERDO: ÚNICAMENTE la carátula/portada del álbum (sin texto) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            id="player-artwork-thumbnail"
            onClick={onOpenExpanded}
            title="Abrir reproductor a pantalla completa"
            className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 cursor-pointer shadow-md border border-white/10 group bg-neutral-800 transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          >
            {currentTrack.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
                  isPlaying ? "brightness-100" : "brightness-90"
                }`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/5 text-neutral-400">
                <Music className="w-5 h-5" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ChevronUp className="w-4 h-4 text-white" />
            </div>
          </button>
        </div>

        {/* 2. REDISTRIBUCIÓN ESPACIOSA: Anterior, Play/Pause destacado y Siguiente */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 flex-1">
          {/* Anterior (Skip Back) */}
          <button
            id="player-prev-btn"
            onClick={onPrev}
            title="Canción anterior"
            className="p-2.5 rounded-full hover:bg-white/10 transition-transform active:scale-90 text-neutral-300 hover:text-white cursor-pointer"
          >
            <SkipBack className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Play / Pause (centrado y destacado) */}
          <button
            id="player-play-pause-btn"
            onClick={onTogglePlay}
            title={isPlaying ? "Pausar" : "Reproducir"}
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 text-white cursor-pointer"
            style={{
              backgroundColor: "var(--color-accent, #7C3AED)",
              boxShadow: "0 4px 18px rgba(124, 58, 237, 0.45)",
            }}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-white" />
            ) : (
              <Play className="w-6 h-6 fill-white ml-0.5" />
            )}
          </button>

          {/* Siguiente (Skip Forward) */}
          <button
            id="player-next-btn"
            onClick={onNext}
            title="Canción siguiente"
            className="p-2.5 rounded-full hover:bg-white/10 transition-transform active:scale-90 text-neutral-300 hover:text-white cursor-pointer"
          >
            <SkipForward className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* 3. EXTREMO DERECHO: Flecha/icono para desplegar el reproductor completo */}
        <div className="flex items-center justify-end shrink-0">
          <button
            id="player-expand-btn"
            onClick={onOpenExpanded}
            title="Desplegar reproductor completo"
            className="p-2.5 rounded-full hover:bg-white/10 transition-all active:scale-95 text-neutral-300 hover:text-white cursor-pointer"
          >
            <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>
    </footer>
  );
};
