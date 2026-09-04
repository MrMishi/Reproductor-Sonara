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
  // Widget size mode: "standard" gadget or "pill" (ultra compact)
  const [isPillMode, setIsPillMode] = useState<boolean>(() => {
    return localStorage.getItem("ytm_gadget_pill_mode") === "true";
  });

  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [showDockMenu, setShowDockMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Position coordinates
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

    // Default to bottom-right corner with 24px margin
    const initialWidth = 340;
    const initialHeight = 190;
    const defX = typeof window !== "undefined" ? Math.max(16, window.innerWidth - initialWidth - 24) : 20;
    const defY = typeof window !== "undefined" ? Math.max(16, window.innerHeight - initialHeight - 24) : 20;
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
        backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
        borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
        color: "var(--color-text-primary, #ffffff)",
        touchAction: "none",
      }}
      className={`fixed top-0 left-0 z-50 rounded-2xl border shadow-2xl select-none backdrop-blur-xl touch-none ${
        isDragging
          ? "shadow-[0_20px_50px_rgba(0,0,0,0.8)] ring-2 ring-violet-500/50 cursor-grabbing"
          : "shadow-2xl transition-shadow"
      } ${isPillMode ? "w-72 sm:w-80" : "w-80 sm:w-[340px]"}`}
    >
      {/* Gadget Header / Drag Handle */}
      <div
        id="gadget-drag-header"
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between px-2.5 py-1.5 border-b cursor-grab active:cursor-grabbing text-xs font-semibold select-none group touch-none"
        style={{ borderColor: "var(--color-border-subtle)", touchAction: "none" }}
        title="Mantén presionado para mover este gadget libremente"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 9 dots grip handle */}
          <div
            id="gadget-grip-handle"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 active:bg-white/20 active:scale-95 text-neutral-400 hover:text-white transition-all cursor-grab active:cursor-grabbing touch-none select-none shrink-0"
            title="Mantén presionado para mover el gadget"
            style={{ touchAction: "none" }}
          >
            <Grip className="w-4 h-4 text-neutral-400 group-hover:text-white shrink-0 transition-colors" />
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: isPlaying ? "var(--color-accent, #7C3AED)" : "#666",
                boxShadow: isPlaying ? "0 0 8px var(--color-accent, #7C3AED)" : "none",
              }}
            />
          </div>
        </div>

        {/* Window controls on top right */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Dock menu toggle */}
          <div className="relative">
            <button
              id="gadget-dock-btn"
              onClick={() => setShowDockMenu((prev) => !prev)}
              className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-[11px]"
              title="Fijar en una esquina (Docking)"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            {/* Dock dropdown */}
            {showDockMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border shadow-2xl p-1.5 text-xs flex flex-col gap-0.5 z-50"
                style={{
                  backgroundColor: "var(--color-surface, #121212)",
                  borderColor: "var(--color-border-subtle)",
                }}
              >
                <span className="text-[10px] font-bold px-2 py-1 uppercase opacity-60">
                  Posición del Gadget
                </span>
                <button
                  onClick={() => dockTo("bottom-right")}
                  className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-left flex items-center justify-between"
                >
                  <span>Abajo Derecha</span>
                  <span className="text-[10px] opacity-60">Defecto</span>
                </button>
                <button
                  onClick={() => dockTo("bottom-left")}
                  className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-left"
                >
                  Abajo Izquierda
                </button>
                <button
                  onClick={() => dockTo("top-right")}
                  className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-left"
                >
                  Arriba Derecha
                </button>
                <button
                  onClick={() => dockTo("top-left")}
                  className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-left"
                >
                  Arriba Izquierda
                </button>
                <button
                  onClick={() => dockTo("bottom-center")}
                  className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-left"
                >
                  Abajo Centro
                </button>

                {isDocumentPipSupported && (
                  <>
                    <div className="h-px bg-white/10 my-1" />
                    <button
                      onClick={handleOpenDocumentPip}
                      className="px-2 py-1.5 rounded-lg hover:bg-white/10 text-left flex items-center gap-1.5 text-amber-300 font-semibold"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Ventana PiP del SO</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Toggle pill mode vs standard gadget */}
          <button
            id="gadget-toggle-pill-btn"
            onClick={() => setIsPillMode((prev) => !prev)}
            className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            title={isPillMode ? "Modo Gadget Completo" : "Modo Píldora Compacta"}
          >
            {isPillMode ? <Maximize className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          </button>

          {/* Restore to sticky bottom player bar */}
          <button
            id="gadget-restore-bottom-btn"
            onClick={onRestoreBottomPlayer}
            className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            title="Restaurar barra inferior clásica"
          >
            <ChevronUp className="w-3.5 h-3.5 rotate-180" />
          </button>

          {/* Fullscreen player */}
          <button
            id="gadget-expand-fullscreen-btn"
            onClick={onOpenExpanded}
            className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
            title="Abrir reproductor en pantalla completa"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close mini player / return to bottom bar */}
          <button
            id="gadget-close-btn"
            onClick={onCloseMiniMode}
            className="p-1 rounded-md hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
            title="Cerrar modo mini"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mode 1: Ultra-Compact Pill View */}
      {isPillMode ? (
        <div className="p-2.5 flex items-center gap-3">
          {/* Mini rotating artwork */}
          <div
            className={`w-10 h-10 rounded-full overflow-hidden shrink-0 shadow-md relative cursor-pointer group ${
              isPlaying ? "animate-[spin_12s_linear_infinite]" : ""
            }`}
            onClick={onOpenExpanded}
            title="Clic para ver detalles"
          >
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
            {/* Center vinyl hole dot */}
            <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-neutral-900 border border-white/40 shadow-inner" />
          </div>

          {/* Title & Artist */}
          <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpenExpanded}>
            <p className="text-xs font-bold truncate leading-tight hover:underline">
              {currentTrack.title}
            </p>
            <p className="text-[10px] opacity-70 truncate leading-tight">
              {currentTrack.artist}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onPrev}
              className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform"
              title="Anterior"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onTogglePlay}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-transform"
              style={{
                backgroundColor: "var(--color-accent, #FF0000)",
                boxShadow: isPlaying ? "0 0 10px var(--color-accent, #FF0000)" : "none",
              }}
              title={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-white" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              )}
            </button>

            <button
              onClick={onNext}
              className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform"
              title="Siguiente"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Mode 2: Standard Rich Gadget Card View */
        <div className="p-3.5 flex flex-col gap-3">
          {/* Top section: Album Art + Track Info + Favorite */}
          <div className="flex items-center gap-3">
            {/* Album artwork with playing glow */}
            <div
              className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-lg cursor-pointer group"
              onClick={onOpenExpanded}
              title="Abrir pantalla completa"
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

              {/* Animated playing indicator pulse */}
              {isPlaying && (
                <div
                  className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-black"
                  style={{ backgroundColor: "var(--color-accent)" }}
                />
              )}
            </div>

            {/* Song title and artist */}
            <div className="min-w-0 flex-1">
              <button
                onClick={onOpenExpanded}
                className="text-xs sm:text-sm font-bold truncate text-left block w-full hover:underline leading-tight"
                title={currentTrack.title}
              >
                {currentTrack.title}
              </button>
              <span
                className="text-[11px] truncate block opacity-75 leading-tight mt-0.5"
                title={currentTrack.artist}
                style={{ color: "var(--color-text-secondary)" }}
              >
                {currentTrack.artist}
              </span>

              {/* Format tag or album if available */}
              <div className="flex items-center gap-1.5 mt-1">
                {currentTrack.format && (
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 uppercase tracking-tight">
                    {currentTrack.format}
                  </span>
                )}
                {currentTrack.album && (
                  <span className="text-[10px] opacity-50 truncate max-w-[140px]">
                    {currentTrack.album}
                  </span>
                )}
              </div>
            </div>

            {/* Favorite button */}
            <button
              id="gadget-favorite-btn"
              onClick={() => onToggleFavorite(currentTrack.id)}
              className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-90 shrink-0"
              title={currentTrack.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  currentTrack.isFavorite ? "fill-red-500 text-red-500" : "text-neutral-400 hover:text-white"
                }`}
              />
            </button>
          </div>

          {/* Interactive Scrubber / Progress bar */}
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
              className="w-full h-1.5 hover:h-2 rounded-full bg-neutral-800 cursor-pointer overflow-hidden relative group transition-all"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: "var(--color-accent, #FF0000)",
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono opacity-65 px-0.5">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback Controls & Volume */}
          <div className="flex items-center justify-between pt-0.5">
            {/* Playback mode (shuffle / repeat) */}
            <button
              onClick={onCyclePlaybackMode}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${
                playbackMode !== "normal" ? "text-white" : "text-neutral-400 opacity-60"
              }`}
              style={{
                color: playbackMode !== "normal" ? "var(--color-accent)" : undefined,
              }}
              title={`Modo de reproducción: ${playbackMode}`}
            >
              {playbackMode === "shuffle" ? (
                <Shuffle className="w-3.5 h-3.5" />
              ) : playbackMode === "repeat-one" ? (
                <Repeat1 className="w-3.5 h-3.5" />
              ) : (
                <Repeat className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Central Controls: Prev, Play/Pause, Next */}
            <div className="flex items-center gap-2">
              <button
                id="gadget-prev-btn"
                onClick={onPrev}
                className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform"
                title="Canción anterior"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                id="gadget-play-pause-btn"
                onClick={onTogglePlay}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
                style={{
                  backgroundColor: "var(--color-accent, #FF0000)",
                  boxShadow: isPlaying ? "0 0 12px var(--color-accent, #FF0000)" : "none",
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
                onClick={onNext}
                className="p-1.5 rounded-full hover:bg-white/10 active:scale-90 transition-transform"
                title="Siguiente canción"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Volume toggle with hover slider */}
            <div className="relative flex items-center">
              <button
                onClick={() => setShowVolumePopup((prev) => !prev)}
                onMouseEnter={() => setShowVolumePopup(true)}
                className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                title="Ajustar volumen"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Volume Slider Popup */}
              {showVolumePopup && (
                <div
                  onMouseLeave={() => setShowVolumePopup(false)}
                  className="absolute right-0 bottom-full mb-2 p-2 rounded-xl border shadow-xl flex items-center gap-2 z-50 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                  style={{
                    backgroundColor: "var(--color-surface, #141414)",
                    borderColor: "var(--color-border-subtle)",
                  }}
                >
                  <button
                    onClick={onToggleMute}
                    className="p-1 rounded hover:bg-white/10"
                    title={isMuted ? "Reactivar sonido" : "Silenciar"}
                  >
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
                    className="w-20 h-1.5 rounded-lg appearance-none cursor-pointer bg-neutral-700"
                    style={{ accentColor: "var(--color-accent)" }}
                    aria-label="Volumen gadget"
                  />
                  <span className="text-[10px] font-mono w-6 text-right opacity-80">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dragging hint tooltip when hovered over header */}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/90 border border-white/10 text-[9px] font-mono text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md">
        Mantén presionado para arrastrar
      </div>
    </div>
  );
};
