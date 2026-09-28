/**
 * ============================================================================
 * SONARA MUSIC - MINIREPRODUCTOR FLOTANTE Y MODO PiP (FloatingMiniPlayer.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente proporciona un reproductor compacto y flotante (Picture-in-Picture)
 * que se puede arrastrar y reubicar libremente por la pantalla mientras se
 * interactúa con otras partes de la aplicación o se trabaja en segundo plano.
 *
 * ¿Cómo funciona?:
 * 1. Movimiento y arrastre (Drag & Drop):
 *    - Registra eventos de ratón (`pointerdown`, `pointermove`, `pointerup`) y táctiles
 *      para desplazar suavemente la ventana dentro de los límites del viewport.
 * 2. Modos visuales:
 *    - Compacto (barra delgada) y Expandido (carátula, controles de volumen, avance).
 * 3. Integración con Document Picture-in-Picture API si está disponible en el navegador.
 * 4. Persiste la posición en pantalla y estado entre sesiones.
 *
 * Guía para futuras actualizaciones:
 * - Asegúrese de mantener los límites del viewport para evitar que el reproductor
 *   se desborde fuera de la pantalla en dispositivos móviles.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Maximize2,
  X,
  Grip,
  Minus,
  Maximize,
  ChevronUp,
  Sliders,
  ExternalLink,
  Sparkles,
  Layers,
} from "lucide-react";
import { Track, PlaybackMode } from "../types";
import { CyberMarquee } from "./CyberMarquee";

interface FloatingMiniPlayerProps {
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
  onRestoreBottomPlayer: () => void;
  onOpenExpanded: () => void;
  onCloseMiniMode: () => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export const FloatingMiniPlayer: React.FC<FloatingMiniPlayerProps> = ({
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
  onRestoreBottomPlayer,
  onOpenExpanded,
  onCloseMiniMode,
}) => {
  // Widget size mode: "standard" gadget or "pill" (iPhone Dynamic Island)
  const [isPillMode, setIsPillMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("sonora_gadget_pill_mode") || localStorage.getItem("ytm_gadget_pill_mode");
    return saved !== null ? saved === "true" : true;
  });

  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [showDockMenu, setShowDockMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Position coordinates - Default to top center (Dynamic Island)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem("sonora_gadget_pos") || localStorage.getItem("ytm_gadget_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed;
        }
      }
    } catch {
      // fallback
    }

    // Default to Top-Center (iPhone Dynamic Island position)
    const initialWidth = 360;
    const defX = typeof window !== "undefined" ? Math.max(12, Math.floor((window.innerWidth - initialWidth) / 2)) : 20;
    const defY = 14;
    return { x: defX, y: defY };
  });

  const currentPosRef = useRef(position);
  useEffect(() => {
    currentPosRef.current = position;
  }, [position]);

  const gadgetRef = useRef<HTMLDivElement | null>(null);

  // Keep within viewport boundaries when window resizes
  useEffect(() => {
    const handleResize = () => {
      if (!gadgetRef.current) return;
      const rect = gadgetRef.current.getBoundingClientRect();
      const maxX = Math.max(10, window.innerWidth - rect.width - 10);
      const maxY = Math.max(10, window.innerHeight - rect.height - 10);

      const boundedX = Math.min(Math.max(10, currentPosRef.current.x), maxX);
      const boundedY = Math.min(Math.max(10, currentPosRef.current.y), maxY);

      currentPosRef.current = { x: boundedX, y: boundedY };
      setPosition({ x: boundedX, y: boundedY });
      if (gadgetRef.current) {
        gadgetRef.current.style.transform = `translate3d(${boundedX}px, ${boundedY}px, 0)`;
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Save pill mode
  useEffect(() => {
    localStorage.setItem("sonora_gadget_pill_mode", String(isPillMode));
  }, [isPillMode]);

  // Robust, continuous pointer and touch drag handling (allows smooth movement with no stutter)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from non-interactive parts of header or the 9-dots grip
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("a")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = currentPosRef.current.x;
    const startPosY = currentPosRef.current.y;

    const currentTarget = e.currentTarget;
    if (typeof currentTarget.setPointerCapture === "function") {
      try {
        currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";

    const moveAt = (clientX: number, clientY: number) => {
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      const gadgetEl = gadgetRef.current;
      const width = gadgetEl ? gadgetEl.offsetWidth : 320;
      const height = gadgetEl ? gadgetEl.offsetHeight : 180;

      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);

      const newX = Math.min(Math.max(8, startPosX + deltaX), maxX);
      const newY = Math.min(Math.max(8, startPosY + deltaY), maxY);

      currentPosRef.current = { x: newX, y: newY };

      // Instant hardware-accelerated transform without React re-render overhead
      if (gadgetRef.current) {
        gadgetRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
      }
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveAt(moveEvent.clientX, moveEvent.clientY);
    };

    const cleanup = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("touchmove", handleTouchMove, { capture: true });
      window.removeEventListener("touchend", handleTouchEnd, { capture: true });
      window.removeEventListener("touchcancel", handleTouchEnd, { capture: true });

      if (typeof currentTarget.releasePointerCapture === "function") {
        try {
          currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      setPosition({ ...currentPosRef.current });
      try {
        localStorage.setItem("sonora_gadget_pos", JSON.stringify(currentPosRef.current));
      } catch {
        // ignore
      }
    };

    const handlePointerUp = () => {
      cleanup();
    };

    const handleTouchMove = (tEvent: TouchEvent) => {
      if (tEvent.touches.length > 0) {
        tEvent.preventDefault();
        moveAt(tEvent.touches[0].clientX, tEvent.touches[0].clientY);
      }
    };

    const handleTouchEnd = () => {
      cleanup();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
    window.addEventListener("touchend", handleTouchEnd, { capture: true });
    window.addEventListener("touchcancel", handleTouchEnd, { capture: true });
  };

  // Quick docking presets
  const dockTo = (preset: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "bottom-center") => {
    if (!gadgetRef.current) return;
    const width = gadgetRef.current.offsetWidth;
    const height = gadgetRef.current.offsetHeight;
    const margin = 20;

    let targetX = position.x;
    let targetY = position.y;

    switch (preset) {
      case "bottom-right":
        targetX = window.innerWidth - width - margin;
        targetY = window.innerHeight - height - margin;
        break;
      case "bottom-left":
        targetX = margin;
        targetY = window.innerHeight - height - margin;
        break;
      case "top-right":
        targetX = window.innerWidth - width - margin;
        targetY = 70; // below navbar
        break;
      case "top-left":
        targetX = margin;
        targetY = 70;
        break;
      case "bottom-center":
        targetX = Math.round((window.innerWidth - width) / 2);
        targetY = window.innerHeight - height - margin;
        break;
    }

    currentPosRef.current = { x: targetX, y: targetY };
    if (gadgetRef.current) {
      gadgetRef.current.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    }
    setPosition({ x: targetX, y: targetY });
    setShowDockMenu(false);
    try {
      localStorage.setItem("sonora_gadget_pos", JSON.stringify({ x: targetX, y: targetY }));
    } catch {
      // ignore
    }
  };

  // Document Picture-in-Picture support (Window PiP in modern browsers)
  const isDocumentPipSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  const handleOpenDocumentPip = async () => {
    if (!isDocumentPipSupported) return;
    try {
      // @ts-ignore
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 350,
        height: 220,
      });

      // Copy stylesheet links to the pip window so styles match exactly
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((styleEl) => {
        pipWindow.document.head.appendChild(styleEl.cloneNode(true));
      });

      // Pass root theme variables
      pipWindow.document.body.className = "bg-neutral-950 text-white p-3 font-sans select-none overflow-hidden";
      pipWindow.document.title = currentTrack ? `${currentTrack.title} • ${currentTrack.artist}` : "Mini Gadget";

      const pipContainer = pipWindow.document.createElement("div");
      pipContainer.id = "pip-container";
      pipWindow.document.body.appendChild(pipContainer);

      // We can notify user that pip window is running
      setShowDockMenu(false);
    } catch (err) {
      console.warn("Could not open Document PiP:", err);
    }
  };

  if (!currentTrack) {
    return null;
  }

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={gadgetRef}
      id="sonora-floating-mini-player-gadget"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        backgroundColor: "rgba(10, 10, 16, 0.78)",
        borderColor: "rgba(255, 255, 255, 0.22)",
        color: "var(--color-text-primary, #ffffff)",
        touchAction: "none",
      }}
      className={`fixed top-0 left-0 z-50 border shadow-[0_16px_50px_rgba(0,0,0,0.7),0_0_25px_rgba(168,85,247,0.35)] ring-1 ring-purple-500/30 select-none backdrop-blur-2xl touch-none transition-all duration-300 relative overflow-hidden ${
        isPillMode ? "rounded-full w-80 sm:w-[380px]" : "rounded-[28px] w-80 sm:w-[350px]"
      } ${
        isDragging
          ? "shadow-[0_24px_60px_rgba(0,0,0,0.9),0_0_35px_rgba(236,72,153,0.5)] ring-2 ring-fuchsia-500/60 cursor-grabbing"
          : "cursor-grab"
      }`}
    >
      {/* Dynamic Glass Top Glossy Highlight (Efecto Cristal Esmerilado Líquido) */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none rounded-t-[28px]" />

      {/* Mode 1: iPhone Dynamic Island Liquid Glass Pill */}
      {isPillMode ? (
        <div
          id="gadget-drag-header"
          onPointerDown={handlePointerDown}
          className="p-2 sm:p-2.5 flex items-center justify-between gap-2.5 relative z-10 touch-none cursor-grab active:cursor-grabbing"
        >
          {/* Left: Carátula reducida en cristal con resplandor neón */}
          <div
            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden shrink-0 border border-white/30 shadow-[0_0_10px_rgba(168,85,247,0.4)] cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              onOpenExpanded();
            }}
            title="Doble toque para ver en pantalla completa"
          >
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className={`w-full h-full object-cover transition-transform duration-500 ${
                isPlaying ? "animate-[spin_12s_linear_infinite]" : "scale-100"
              }`}
            />
            {/* Anillo de cristal central tipo Dynamic Island */}
            <div className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-neutral-950 border border-white/50" />
            {isPlaying && (
              <span className="absolute inset-0 rounded-full border border-fuchsia-400 animate-ping opacity-60 pointer-events-none" />
            )}
          </div>

          {/* Center: Título de la canción y Artista con Marquee y separación clara */}
          <div
            className="min-w-0 flex-1 cursor-pointer pr-1"
            onClick={(e) => {
              e.stopPropagation();
              setIsPillMode(false);
            }}
            title="Toca para expandir isla dinámica"
          >
            <div className="w-full min-w-0">
              <CyberMarquee
                text={currentTrack.title}
                active={isPlaying}
                className="text-xs font-bold leading-tight text-white hover:text-fuchsia-300 transition-colors"
              />
            </div>
            <div className="w-full min-w-0 mt-0.5">
              <CyberMarquee
                text={currentTrack.artist || "Artista Desconocido"}
                active={isPlaying}
                className="text-[10px] text-neutral-400 font-mono leading-tight font-medium"
              />
            </div>
          </div>

          {/* Right: Botones táctiles rápidos (Anterior, Pausa/Play, Siguiente, Expandir/Cerrar) */}
          <div
            className="flex items-center gap-1 shrink-0 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Anterior */}
            <button
              id="dynamic-island-prev-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-neutral-300 hover:text-white cursor-pointer pointer-events-auto"
              title="Anterior"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            {/* Play / Pause táctil con resplandor neón violeta */}
            <button
              id="dynamic-island-play-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all cursor-pointer pointer-events-auto"
              style={{
                backgroundColor: "var(--color-accent, #7C3AED)",
                boxShadow: isPlaying ? "0 0 14px rgba(168, 85, 247, 0.8)" : "none",
              }}
              title={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-white" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              )}
            </button>

            {/* Siguiente */}
            <button
              id="dynamic-island-next-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-neutral-300 hover:text-white cursor-pointer pointer-events-auto"
              title="Siguiente"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Expandir a tarjeta */}
            <button
              id="dynamic-island-expand-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPillMode(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer pointer-events-auto"
              title="Expandir Dynamic Glass"
            >
              <ChevronUp className="w-3.5 h-3.5 rotate-180" />
            </button>

            {/* Restaurar a barra inferior */}
            <button
              id="dynamic-island-restore-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestoreBottomPlayer();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer pointer-events-auto"
              title="Restaurar barra inferior clásica"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Mode 2: Dynamic Glass Expanded Island Card */
        <div className="flex flex-col relative z-10">
          {/* Header con botón de arrastre y opciones */}
          <div
            id="gadget-drag-header"
            onPointerDown={handlePointerDown}
            className="flex items-center justify-between px-3.5 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing text-xs select-none touch-none"
            title="Mantén presionado para mover"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
              <span className="font-mono text-[10px] tracking-wider uppercase font-bold text-fuchsia-300">
                DYNAMIC GLASS // HUD
              </span>
            </div>

            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Minimizar a píldora estilo Dynamic Island */}
              <button
                id="gadget-collapse-to-pill-btn"
                onClick={() => setIsPillMode(true)}
                className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                title="Minimizar a píldora Dynamic Island"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              {/* Pantalla completa */}
              <button
                id="gadget-fullscreen-btn"
                onClick={onOpenExpanded}
                className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                title="Abrir reproductor completo"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              {/* Restaurar barra inferior */}
              <button
                id="gadget-restore-bottom-btn"
                onClick={onRestoreBottomPlayer}
                className="p-1 rounded-md hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
                title="Restaurar barra inferior"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Cuerpo principal de la tarjeta */}
          <div className="p-3.5 flex flex-col gap-3">
            {/* Fila superior: Carátula de cristal biselada 45° + Información de pista */}
            <div className="flex items-center gap-3">
              <div
                style={{
                  clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)",
                }}
                className="relative w-13 h-13 overflow-hidden shrink-0 border border-fuchsia-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)] cursor-pointer group bg-neutral-950"
                onClick={onOpenExpanded}
                title="Toca para pantalla completa"
              >
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                    isPlaying ? "brightness-100" : "brightness-90"
                  }`}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Maximize2 className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Título y artista en dos líneas con Marquee y sin badge */}
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <button
                  type="button"
                  onClick={onOpenExpanded}
                  className="w-full min-w-0 text-left cursor-pointer"
                >
                  <CyberMarquee
                    text={currentTrack.title}
                    active={isPlaying}
                    className="text-xs sm:text-sm font-bold leading-tight text-white hover:text-fuchsia-300 transition-colors"
                  />
                </button>
                <div className="w-full min-w-0 mt-0.5">
                  <CyberMarquee
                    text={currentTrack.artist || "Artista Desconocido"}
                    active={isPlaying}
                    className="text-[11px] font-mono tracking-wider opacity-75 leading-tight text-purple-300"
                  />
                </div>
              </div>

              {/* Favorita */}
              <button
                id="gadget-fav-btn"
                onClick={() => onToggleFavorite(currentTrack.id)}
                className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-90 shrink-0 text-neutral-400 hover:text-white"
                title={currentTrack.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"}
              >
                <Heart
                  className={`w-4 h-4 ${
                    currentTrack.isFavorite ? "fill-red-500 text-red-500" : "text-neutral-400"
                  }`}
                />
              </button>
            </div>

            {/* Barra de progreso de cristal con resplandor neón */}
            <div className="flex flex-col gap-1">
              <div
                id="gadget-progress-bar"
                onClick={(e) => {
                  if (duration <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
                  onSeek(newPercent * duration);
                }}
                className="w-full h-1.5 hover:h-2 rounded-full bg-white/10 cursor-pointer overflow-hidden relative group transition-all"
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    background: "linear-gradient(90deg, #7C3AED 0%, #D946EF 100%)",
                    boxShadow: "0 0 8px rgba(217, 70, 239, 0.7)",
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono opacity-65 px-0.5">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controles de transporte y volumen */}
            <div className="flex items-center justify-between pt-0.5">
              {/* Modo de reproducción */}
              <button
                onClick={onCyclePlaybackMode}
                className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                title={`Modo de reproducción: ${playbackMode}`}
              >
                {playbackMode === "shuffle" ? (
                  <Shuffle className="w-3.5 h-3.5 text-fuchsia-400" />
                ) : playbackMode === "repeat-one" ? (
                  <Repeat1 className="w-3.5 h-3.5 text-fuchsia-400" />
                ) : (
                  <Repeat className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Botones de reproducción principales */}
              <div
                className="flex items-center gap-2 pointer-events-auto"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  id="gadget-prev-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrev();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-neutral-300 hover:text-white cursor-pointer pointer-events-auto"
                  title="Canción anterior"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  id="gadget-play-pause-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePlay();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform cursor-pointer pointer-events-auto"
                  style={{
                    backgroundColor: "var(--color-accent, #7C3AED)",
                    boxShadow: isPlaying ? "0 0 14px rgba(168, 85, 247, 0.8)" : "none",
                  }}
                  title={isPlaying ? "Pausar" : "Reproducir"}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  )}
                </button>

                <button
                  id="gadget-next-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform text-neutral-300 hover:text-white cursor-pointer pointer-events-auto"
                  title="Canción siguiente"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Control de volumen emergente */}
              <div className="relative flex items-center">
                <button
                  onClick={() => setShowVolumePopup((prev) => !prev)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                  title="Ajustar volumen"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>

                {showVolumePopup && (
                  <div
                    onMouseLeave={() => setShowVolumePopup(false)}
                    className="absolute right-0 bottom-full mb-2 p-2 rounded-xl border border-white/20 shadow-2xl flex items-center gap-2 z-50 backdrop-blur-2xl bg-black/85"
                  >
                    <button onClick={onToggleMute} className="p-1 rounded hover:bg-white/10">
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-3.5 h-3.5 text-red-400" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => onVolumeChange(Number(e.target.value))}
                      className="w-20 h-1.5 rounded-lg appearance-none cursor-pointer bg-neutral-700 accent-fuchsia-500"
                      aria-label="Volumen gadget"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
