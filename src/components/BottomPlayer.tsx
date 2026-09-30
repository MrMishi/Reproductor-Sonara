/**
 * ============================================================================
 * SONARA MUSIC - BARRA INFERIOR DE REPRODUCCIÓN (BottomPlayer.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente renderiza la barra persistente de reproducción anclada en la parte
 * inferior de la pantalla. Proporciona controles estándar limpios, rápidos y fiables.
 *
 * Controles estándar conservados:
 * 1. Extremo izquierdo: Carátula + Título/Artista (tocar abre el reproductor completo).
 * 2. Centro: Botones de transporte (Anterior, Play/Pausa destacado, Siguiente).
 * 3. Extremo derecho: Botón exclusivo para desplegar el reproductor completo.
 *
 * Estabilidad táctil:
 * - Todos los botones cuentan con parada de propagación explícita (e.stopPropagation()),
 *   áreas táctiles cómodas de 48px y estado 'type="button"' para garantizar respuesta
 *   inmediata al primer toque en cualquier dispositivo.
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
import { Track } from "../types";
import { CyberMarquee } from "./CyberMarquee";

interface BottomPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume?: number;
  isMuted?: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onOpenExpanded: () => void;
}

export const BottomPlayer: React.FC<BottomPlayerProps> = React.memo(({
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
    e.stopPropagation();
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
        className="relative w-full cursor-pointer h-1.5 hover:h-2 transition-all bg-white/10 group"
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

      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-2.5 gap-3 max-w-7xl mx-auto">
        {/* 1. EXTREMO IZQUIERDO: Carátula + Título/Artista (toque abre reproductor expandido) */}
        <div
          className="flex items-center gap-3 min-w-0 max-w-[42%] sm:max-w-[32%] cursor-pointer group shrink-0"
          onClick={onOpenExpanded}
          title="Toca para abrir el reproductor completo"
        >
          <div
            id="player-artwork-thumbnail"
            style={{
              clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)",
            }}
            className="relative w-11 h-11 sm:w-12 sm:h-12 overflow-hidden shrink-0 shadow-md border border-white/10 bg-neutral-900 transition-transform group-hover:scale-105 active:scale-95"
          >
            {currentTrack.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                className={`w-full h-full object-cover transition-transform duration-300 ${
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
          </div>

          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="w-full min-w-0">
              <CyberMarquee
                text={currentTrack.title}
                active={isPlaying}
                className="text-xs sm:text-sm font-bold tracking-wide text-white group-hover:text-fuchsia-300 transition-colors leading-tight"
              />
            </div>
            <div className="w-full min-w-0 mt-0.5">
              <CyberMarquee
                text={currentTrack.artist || "Artista Desconocido"}
                active={isPlaying}
                className="text-[11px] font-mono tracking-wider text-purple-300/80 leading-tight"
              />
            </div>
          </div>
        </div>

        {/* 2. CENTRO: Controles estándar de reproducción (Anterior, Play/Pausa, Siguiente) */}
        <div className="flex items-center justify-center gap-3 sm:gap-7 flex-1 min-w-0">
          {/* Anterior (Skip Back) */}
          <button
            id="player-prev-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            title="Canción anterior"
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer pointer-events-auto"
          >
            <SkipBack className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Play / Pause (centrado y destacado con respuesta táctil inmediata) */}
          <button
            id="player-play-pause-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePlay();
            }}
            title={isPlaying ? "Pausar" : "Reproducir"}
            className="min-w-[48px] min-h-[48px] w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 text-white cursor-pointer shrink-0 pointer-events-auto"
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
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            title="Canción siguiente"
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer pointer-events-auto"
          >
            <SkipForward className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* 3. EXTREMO DERECHO: ÚNICAMENTE el botón para desplegar el reproductor completo */}
        <div className="flex items-center justify-end shrink-0">
          <button
            id="player-expand-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenExpanded();
            }}
            title="Desplegar reproductor completo"
            className="min-w-[44px] min-h-[44px] p-2.5 rounded-full hover:bg-white/10 active:scale-95 transition-all text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer pointer-events-auto"
          >
            <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>
    </footer>
  );
});
