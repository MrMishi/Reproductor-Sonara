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
  PictureInPicture2,
  EyeOff,
  Trash2,
  ChevronUp,
  Maximize2,
  Minimize2,
  FileText,
  Volume2,
  Languages,
  Sparkles,
} from "lucide-react";
import { Track, PlaybackMode } from "../types";
import { getActiveLyricIndex, hasJapaneseText } from "../services/lyricsService";
import { VisualizerCanvas } from "./VisualizerCanvas";

export interface ExpandedPlayerProps {
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
  activeSubTab?: "cover" | "queue" | "lyrics" | "details";
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
  activeSubTab = "cover",
}) => {
  const [activeTab, setActiveTab] = useState<"cover" | "queue" | "lyrics" | "details">(
    activeSubTab || "cover"
  );
  const [visualMode, setVisualMode] = useState<"cover" | "spectrum">("cover");

  // Dynamic Lyrics Sheet Expansion: 'full' (fullscreen lyrics) or 'compact' (split with mini cover banner)
  const [lyricsExpansion, setLyricsExpansion] = useState<"full" | "compact">("full");
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  // Swipe & Tap Gestures State on Cover
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [slideAnimation, setSlideAnimation] = useState<
    "idle" | "slide-left" | "slide-right" | "enter-left" | "enter-right"
  >("idle");
  const [tapFeedback, setTapFeedback] = useState<"play" | "pause" | null>(null);

  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const hasMovedSignificantRef = useRef<boolean>(false);

  // Sync sub tab when prop changes
  useEffect(() => {
    if (activeSubTab) {
      setActiveTab(activeSubTab);
    }
  }, [activeSubTab]);

  // Handle auto-scrolling for synchronized lyrics in real-time karaoke
  const syncedLyrics = currentTrack?.lyrics?.synced;
  const activeLyricIndex = getActiveLyricIndex(syncedLyrics, currentTime);

  // Soporte Multilingüe de Letras (Japonés / Hiragana / Kanji / Katakana / Romaji)
  const [japaneseViewMode, setJapaneseViewMode] = useState<"both" | "native" | "romaji">("both");

  const hasJapaneseInLyrics = React.useMemo(() => {
    if (syncedLyrics && syncedLyrics.some((l) => l.hasJapanese || hasJapaneseText(l.text))) {
      return true;
    }
    if (currentTrack?.lyrics?.plain && hasJapaneseText(currentTrack.lyrics.plain)) {
      return true;
    }
    return false;
  }, [syncedLyrics, currentTrack?.lyrics?.plain]);

  useEffect(() => {
    if (activeTab === "lyrics" && lyricsContainerRef.current && activeLyricIndex >= 0) {
      const activeEl = lyricsContainerRef.current.querySelector(
        `[data-lyric-index="${activeLyricIndex}"]`
      );
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeLyricIndex, activeTab]);

  // Reset slide animation when current track changes
  useEffect(() => {
    setDragOffset(0);
    setIsDragging(false);
  }, [currentTrack?.id]);

  if (!isOpen || !currentTrack) return null;

  // -------------------------------------------------------------
  // GESTURE HANDLERS (Tap & Swipe on Cover)
  // -------------------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle primary button
    if (e.button !== 0) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    isPointerDownRef.current = true;
    hasMovedSignificantRef.current = false;
    setIsDragging(true);
    setDragOffset(0);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || !pointerStartRef.current) return;
    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;

    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      hasMovedSignificantRef.current = true;
    }

    // Horizontal drag prioritization
    if (Math.abs(deltaX) > Math.abs(deltaY) * 0.7) {
      // Dampen drag effect
      const damped = Math.sign(deltaX) * Math.min(180, Math.abs(deltaX) * 0.85);
      setDragOffset(damped);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || !pointerStartRef.current) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;
    const durationMs = Date.now() - pointerStartRef.current.time;

    isPointerDownRef.current = false;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // 1. Tap Simple (Clic): Alterna reproducción entre Play y Pausa
    if (
      !hasMovedSignificantRef.current ||
      (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12 && durationMs < 350)
    ) {
      setDragOffset(0);
      onTogglePlay();
      setTapFeedback(isPlaying ? "pause" : "play");
      setTimeout(() => setTapFeedback(null), 500);
      return;
    }

    // 2. Deslizar a la Derecha (Swipe Right): Avanza a la siguiente canción
    if (deltaX > 45) {
      setSlideAnimation("slide-right");
      setTimeout(() => {
        onNext();
        setSlideAnimation("enter-left");
        setDragOffset(0);
        setTimeout(() => setSlideAnimation("idle"), 300);
      }, 180);
      return;
    }

    // 3. Deslizar a la Izquierda (Swipe Left): Regresa a la canción anterior
    if (deltaX < -45) {
      setSlideAnimation("slide-left");
      setTimeout(() => {
        onPrev();
        setSlideAnimation("enter-right");
        setDragOffset(0);
        setTimeout(() => setSlideAnimation("idle"), 300);
      }, 180);
      return;
    }

    // Snap back if threshold not met
    setDragOffset(0);
  };

  const handlePointerCancel = () => {
    isPointerDownRef.current = false;
    setIsDragging(false);
    setDragOffset(0);
  };

  return (
    <div
      id="ytm-expanded-player"
      className="fixed inset-0 z-50 flex flex-col backdrop-blur-3xl animate-in slide-in-from-bottom-6 duration-300 overflow-hidden select-none"
      style={{
        backgroundColor: "var(--color-bg, #030303)",
        color: "var(--color-text-primary, #ffffff)",
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER: Navigation Tabs, Minimize & EQ                     */}
      {/* ------------------------------------------------------------- */}
      <header
        className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 z-30 bg-neutral-950/80 backdrop-blur-md"
        style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))" }}
      >
        <button
          id="expanded-player-collapse-btn"
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-transform active:scale-90 flex items-center gap-1.5 text-xs font-semibold"
          aria-label="Minimizar reproductor"
        >
          <ChevronDown className="w-6 h-6" />
          <span className="hidden sm:inline">Minimizar</span>
        </button>

        {/* Center Tabs: Tema (Cover) | Letras | Cola | Audio & EQ */}
        <div
          className="flex items-center gap-1 p-1 rounded-full border bg-neutral-900/80 backdrop-blur-sm"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <button
            id="expanded-tab-cover"
            onClick={() => setActiveTab("cover")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "cover"
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>Tema</span>
          </button>
          <button
            id="expanded-tab-lyrics"
            onClick={() => setActiveTab("lyrics")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 relative ${
              activeTab === "lyrics"
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Letras</span>
            {currentTrack.lyrics && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
              />
            )}
          </button>
          <button
            id="expanded-tab-queue"
            onClick={() => setActiveTab("queue")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "queue"
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">A continuación</span>
          </button>
          <button
            id="expanded-tab-details"
            onClick={() => setActiveTab("details")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "details"
                ? "bg-white text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Audio & EQ</span>
          </button>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5">
          {onToggleMiniMode && (
            <button
              id="expanded-mini-mode-btn"
              onClick={() => {
                onClose();
                onToggleMiniMode();
              }}
              className="px-2.5 sm:px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors flex items-center gap-1 text-xs font-semibold border border-white/10 text-neutral-300 hover:text-white"
              title="Modo Mini flotante"
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span className="hidden md:inline">Mini</span>
            </button>
          )}

          <button
            id="expanded-open-eq-btn"
            onClick={onOpenEqualizer}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-neutral-300 hover:text-white"
            title="Ecualizador"
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* MAIN BODY: Dynamic Views (Cover, Lyrics, Queue, Details)      */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
        {/* ========================================================= */}
        {/* VIEW 1: COVER ARTWORK WITH TAP & SWIPE GESTURES           */}
        {/* ========================================================= */}
        {activeTab === "cover" && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:px-8 max-w-xl mx-auto w-full overflow-hidden">
            {/* Interactive Artwork Card with Gestures */}
            <div
              id="expanded-cover-card"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{
                touchAction: "none",
                transform:
                  slideAnimation === "slide-right"
                    ? "translateX(120%) rotate(12deg)"
                    : slideAnimation === "slide-left"
                    ? "translateX(-120%) rotate(-12deg)"
                    : slideAnimation === "enter-left"
                    ? "translateX(-40px) scale(0.96)"
                    : slideAnimation === "enter-right"
                    ? "translateX(40px) scale(0.96)"
                    : `translateX(${dragOffset}px) rotate(${dragOffset * 0.04}deg)`,
                opacity:
                  slideAnimation === "slide-right" || slideAnimation === "slide-left"
                    ? 0
                    : Math.max(0.35, 1 - Math.abs(dragOffset) / 280),
                transition: isDragging
                  ? "none"
                  : "transform 0.28s cubic-bezier(0.2, 0, 0, 1), opacity 0.28s ease-out",
                borderColor: "var(--color-border-subtle)",
                backgroundColor: "var(--color-surface, #121212)",
              }}
              className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-3xl overflow-hidden shadow-2xl border flex items-center justify-center group mb-6 cursor-grab active:cursor-grabbing select-none"
            >
              {visualMode === "cover" ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  draggable={false}
                  className={`w-full h-full object-cover transition-transform duration-700 pointer-events-none ${
                    isPlaying ? "scale-105" : "scale-100"
                  }`}
                />
              ) : (
                <div className="w-full h-full p-8 flex flex-col justify-end bg-gradient-to-b from-black/80 to-black/40 pointer-events-none">
                  <VisualizerCanvas className="w-full h-48" type="bars" isPlaying={isPlaying} />
                </div>
              )}

              {/* Tap Simple Feedback Ripple Animation */}
              {tapFeedback && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[2px] animate-fade-in z-20">
                  <div className="w-20 h-20 rounded-full bg-white/25 border border-white/40 flex items-center justify-center animate-ping text-white shadow-2xl">
                    {tapFeedback === "play" ? (
                      <Play className="w-10 h-10 fill-white ml-1" />
                    ) : (
                      <Pause className="w-10 h-10 fill-white" />
                    )}
                  </div>
                </div>
              )}

              {/* Swipe Direction Indicators (during drag) */}
              {dragOffset > 25 && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/70 backdrop-blur-md px-3 py-2 rounded-full border border-white/20 flex items-center gap-1.5 text-xs font-bold text-white shadow-lg pointer-events-none">
                  <span>Siguiente</span>
                  <SkipForward className="w-4 h-4" />
                </div>
              )}
              {dragOffset < -25 && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/70 backdrop-blur-md px-3 py-2 rounded-full border border-white/20 flex items-center gap-1.5 text-xs font-bold text-white shadow-lg pointer-events-none">
                  <SkipBack className="w-4 h-4" />
                  <span>Anterior</span>
                </div>
              )}
            </div>

            {/* Track Info & Actions */}
            <div className="w-full flex items-center justify-between mb-4">
              <div className="min-w-0 pr-4">
                <h1
                  className="text-xl sm:text-2xl font-extrabold truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {currentTrack.title}
                </h1>
                <p
                  className="text-sm font-medium truncate opacity-75 mt-0.5"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {currentTrack.artist} {currentTrack.album ? `• ${currentTrack.album}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle Visualizer / Cover Art */}
                <button
                  id="expanded-toggle-visual-btn"
                  onClick={() => setVisualMode(visualMode === "cover" ? "spectrum" : "cover")}
                  className={`p-3 rounded-full hover:bg-white/10 transition-all active:scale-90 ${
                    visualMode === "spectrum" ? "text-red-400 bg-white/10" : "text-neutral-400 hover:text-white"
                  }`}
                  title={visualMode === "cover" ? "Ver Espectro de Audio" : "Ver Portada de Álbum"}
                >
                  <Music2 className="w-5 h-5" />
                </button>

                <button
                  id="expanded-like-btn"
                  onClick={() => onToggleFavorite(currentTrack.id)}
                  className="p-3 rounded-full hover:bg-white/10 transition-transform active:scale-90"
                  title={currentTrack.isFavorite ? "Quitar de favoritas" : "Marcar como favorita"}
                >
                  <Heart
                    className={`w-6 h-6 transition-colors ${
                      currentTrack.isFavorite
                        ? "fill-red-500 text-red-500"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  />
                </button>

                {onHideTrack && (
                  <button
                    id="expanded-hide-btn"
                    onClick={() => onHideTrack(currentTrack)}
                    className="p-3 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-transform active:scale-90"
                    title="Ocultar canción permanentemente"
                  >
                    <EyeOff className="w-5 h-5" />
                  </button>
                )}

                {onDeleteTracks && (
                  <button
                    id="expanded-delete-btn"
                    onClick={() => onDeleteTracks([currentTrack.id])}
                    className="p-3 rounded-full hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-transform active:scale-90"
                    title="Eliminar canción"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 2: REDISEÑO DEL VISOR DE LETRAS (ESTILO YOUTUBE MUSIC)*/}
        {/* ========================================================= */}
        {activeTab === "lyrics" && (
          <div className="flex-1 flex flex-col overflow-hidden max-w-3xl mx-auto w-full px-4 sm:px-8 py-2 relative">
            {/* Top Minimized Track Banner (Oculta/minimiza la carátula grande) */}
            <div
              className="flex items-center justify-between py-2 px-3 rounded-2xl border bg-neutral-900/60 backdrop-blur-md mb-2 shrink-0"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <div
                className="flex items-center gap-3 min-w-0 cursor-pointer"
                onClick={onTogglePlay}
                title="Toca para pausar/reproducir"
              >
                <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow shrink-0 border border-white/10 group">
                  <img
                    src={currentTrack.coverUrl}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {isPlaying ? (
                      <Pause className="w-4 h-4 text-white fill-white" />
                    ) : (
                      <Play className="w-4 h-4 text-white fill-white" />
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold truncate">{currentTrack.title}</p>
                  <p className="text-[11px] opacity-70 truncate">{currentTrack.artist}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Selector de Vista Multilingüe para Japonés / Romaji */}
                {hasJapaneseInLyrics && (
                  <div className="hidden xs:flex items-center bg-black/40 p-0.5 rounded-full border border-white/10 text-[11px]">
                    <button
                      onClick={() => setJapaneseViewMode("both")}
                      className={`px-2 py-0.5 rounded-full transition-all ${
                        japaneseViewMode === "both"
                          ? "bg-white text-black font-bold shadow-sm"
                          : "text-neutral-400 hover:text-white"
                      }`}
                      title="Mostrar caracteres nativos (Kanji/Kana) y pronunciación Romaji"
                    >
                      Kanji + Romaji
                    </button>
                    <button
                      onClick={() => setJapaneseViewMode("native")}
                      className={`px-2 py-0.5 rounded-full transition-all ${
                        japaneseViewMode === "native"
                          ? "bg-white text-black font-bold shadow-sm"
                          : "text-neutral-400 hover:text-white"
                      }`}
                      title="Mostrar solo caracteres nativos japoneses"
                    >
                      Solo Nativo
                    </button>
                    <button
                      onClick={() => setJapaneseViewMode("romaji")}
                      className={`px-2 py-0.5 rounded-full transition-all ${
                        japaneseViewMode === "romaji"
                          ? "bg-white text-black font-bold shadow-sm"
                          : "text-neutral-400 hover:text-white"
                      }`}
                      title="Mostrar solo fonética Romaji"
                    >
                      Romaji
                    </button>
                  </div>
                )}

                <button
                  id="lyrics-toggle-expand-btn"
                  onClick={() =>
                    setLyricsExpansion(lyricsExpansion === "full" ? "compact" : "full")
                  }
                  className="p-2 rounded-full hover:bg-white/10 text-neutral-300 hover:text-white transition-colors"
                  title={
                    lyricsExpansion === "full"
                      ? "Modo Dividido"
                      : "Modo Inmersivo (Pantalla Completa)"
                  }
                >
                  {lyricsExpansion === "full" ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  id="lyrics-search-online-btn"
                  onClick={onOpenLyricsSearch}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
                  title="Buscar letras oficiales en internet"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Buscar en Internet</span>
                </button>
              </div>
            </div>

            {/* Mobile Japanese View Switcher */}
            {hasJapaneseInLyrics && (
              <div className="xs:hidden flex items-center justify-between py-1 px-2.5 rounded-xl border bg-neutral-900/40 mb-1.5 text-xs shrink-0"
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <span className="text-[11px] opacity-70 flex items-center gap-1 font-semibold">
                  <Languages className="w-3 h-3 text-red-400" /> Japonés:
                </span>
                <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px]">
                  <button
                    onClick={() => setJapaneseViewMode("both")}
                    className={`px-1.5 py-0.5 rounded ${
                      japaneseViewMode === "both" ? "bg-white text-black font-bold" : "text-neutral-400"
                    }`}
                  >
                    Kanji+Romaji
                  </button>
                  <button
                    onClick={() => setJapaneseViewMode("native")}
                    className={`px-1.5 py-0.5 rounded ${
                      japaneseViewMode === "native" ? "bg-white text-black font-bold" : "text-neutral-400"
                    }`}
                  >
                    Nativo
                  </button>
                  <button
                    onClick={() => setJapaneseViewMode("romaji")}
                    className={`px-1.5 py-0.5 rounded ${
                      japaneseViewMode === "romaji" ? "bg-white text-black font-bold" : "text-neutral-400"
                    }`}
                  >
                    Romaji
                  </button>
                </div>
              </div>
            )}

            {/* Draggable Slide Handle Bar */}
            <div
              className="w-full flex flex-col items-center justify-center py-2 cursor-pointer group shrink-0"
              onClick={() =>
                setLyricsExpansion(lyricsExpansion === "full" ? "compact" : "full")
              }
              title="Ajustar vista de letras"
            >
              <div className="w-12 h-1.5 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
            </div>

            {/* Compact Mode Artwork Preview (if lyricsExpansion === 'compact') */}
            {lyricsExpansion === "compact" && (
              <div className="h-28 sm:h-36 shrink-0 my-2 rounded-2xl overflow-hidden relative border flex items-center justify-center group"
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover filter blur-sm brightness-50"
                />
                <div className="absolute inset-0 flex items-center justify-center gap-4">
                  <VisualizerCanvas className="w-48 h-16" type="bars" isPlaying={isPlaying} />
                </div>
              </div>
            )}

            {/* Karaoke Lyrics Scrollable Viewport (Ocupa el protagonismo de la pantalla) */}
            <div
              ref={lyricsContainerRef}
              id="expanded-lyrics-container"
              className="flex-1 overflow-y-auto space-y-6 py-12 px-2 scroll-smooth text-center relative select-none"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)",
              }}
            >
              {syncedLyrics && syncedLyrics.length > 0 ? (
                /* Synchronized Real-Time Karaoke Lines with Japanese & Romaji Support */
                syncedLyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const isJap = line.hasJapanese || hasJapaneseText(line.text);

                  let primaryText = line.nativeText || line.text;
                  let secondaryText = line.romaji;

                  if (isJap && line.nativeText && line.romaji) {
                    if (japaneseViewMode === "native") {
                      primaryText = line.nativeText;
                      secondaryText = undefined;
                    } else if (japaneseViewMode === "romaji") {
                      primaryText = line.romaji;
                      secondaryText = undefined;
                    }
                  }

                  return (
                    <div
                      key={idx}
                      data-lyric-index={idx}
                      onClick={() => onSeek(line.time)}
                      className={`cursor-pointer transition-all duration-300 py-2.5 px-4 rounded-2xl select-none flex flex-col items-center justify-center gap-1 ${
                        isActive
                          ? "scale-105"
                          : "opacity-40 hover:opacity-85"
                      }`}
                    >
                      {/* Main Lyric Line (Native CJK or Standard Text) */}
                      <p
                        className={`transition-all duration-300 ${
                          isActive
                            ? "text-2xl sm:text-3xl md:text-4xl font-extrabold"
                            : "text-base sm:text-lg md:text-xl font-medium"
                        }`}
                        style={{
                          fontFamily: isJap
                            ? '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", "Noto Sans JP", system-ui, sans-serif'
                            : undefined,
                          color: isActive ? "var(--color-accent, #FF0000)" : undefined,
                          textShadow: isActive
                            ? "0 0 24px var(--color-accent, rgba(255,0,0,0.6))"
                            : "none",
                        }}
                      >
                        {primaryText}
                      </p>

                      {/* Romaji Karaoke Phonetics Line */}
                      {secondaryText && (
                        <p
                          className={`italic font-medium tracking-wide transition-opacity ${
                            isActive
                              ? "text-sm sm:text-base text-white/90"
                              : "text-xs sm:text-sm text-white/60"
                          }`}
                        >
                          {secondaryText}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : currentTrack.lyrics?.plain ? (
                /* Plain Lyrics View with Japanese CJK Font Support */
                <div
                  className="text-base sm:text-xl leading-loose whitespace-pre-line opacity-85 font-medium max-w-xl mx-auto py-8"
                  style={{
                    fontFamily:
                      '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", "Noto Sans JP", system-ui, sans-serif',
                  }}
                >
                  {currentTrack.lyrics.plain}
                </div>
              ) : (
                /* Empty Lyrics State */
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center my-auto p-6">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl"
                    style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
                  >
                    <Globe className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">¿No hay letras para esta canción?</h4>
                    <p className="text-xs max-w-xs mx-auto opacity-70 mt-1">
                      Utiliza nuestro buscador web para sincronizar automáticamente las letras
                      oficiales desde internet.
                    </p>
                  </div>
                  <button
                    id="no-lyrics-search-btn"
                    onClick={onOpenLyricsSearch}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                    style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
                  >
                    <Search className="w-4 h-4" />
                    <span>Buscar Letras en Internet</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* VIEW 3: QUEUE (A CONTINUACIÓN)                            */}
        {/* ========================================================= */}
        {activeTab === "queue" && (
          <div className="flex-1 flex flex-col overflow-hidden max-w-3xl mx-auto w-full p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="font-bold text-sm tracking-wider uppercase opacity-70">
                Cola de Reproducción ({queue.length} temas)
              </h3>
              <span className="text-xs opacity-60">Tema {currentTrackIndex + 1} de {queue.length}</span>
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

                    <div
                      className="flex items-center gap-2 shrink-0 ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
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

        {/* ========================================================= */}
        {/* VIEW 4: DETALLES & EQUALIZER SETTINGS                      */}
        {/* ========================================================= */}
        {activeTab === "details" && (
          <div className="flex-1 flex flex-col overflow-y-auto max-w-2xl mx-auto w-full p-4 sm:p-6 gap-6">
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
                    {currentTrack.file ? "Almacenamiento Local" : "Pista Sonora / Remota"}
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
                  className="px-4 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:scale-105 active:scale-95 shadow"
                  style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
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
      </main>

      {/* ------------------------------------------------------------- */}
      {/* ZONA INFERIOR FIJA: ALWAYS ACCESSIBLE PLAYBACK CONTROLS       */}
      {/* ------------------------------------------------------------- */}
      <footer
        id="expanded-player-bottom-deck"
        className="shrink-0 w-full border-t z-30 px-4 sm:px-8 pt-3 pb-6 sm:pb-5 bg-neutral-950/95 backdrop-blur-2xl"
        style={{
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.8)",
        }}
      >
        {/* Scrubber Progress Slider */}
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-1 mb-3">
          <div className="relative flex items-center group py-1">
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
              aria-label="Línea de tiempo de reproducción"
            />
          </div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono opacity-70">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Transport Controls Row */}
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          {/* Shuffle Mode */}
          <button
            id="expanded-shuffle-btn"
            onClick={onCyclePlaybackMode}
            title={`Modo: ${playbackMode}`}
            className={`p-2.5 rounded-full transition-colors ${
              playbackMode === "shuffle" ? "text-white" : "opacity-50 hover:opacity-100 text-neutral-300"
            }`}
            style={{ color: playbackMode === "shuffle" ? "var(--color-accent)" : undefined }}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          {/* Previous Track */}
          <button
            id="expanded-prev-btn"
            onClick={onPrev}
            title="Canción anterior"
            className="p-3 rounded-full hover:bg-white/10 transition-transform active:scale-90"
          >
            <SkipBack className="w-7 h-7" />
          </button>

          {/* Play / Pause Main Action Button */}
          <button
            id="expanded-play-pause-btn"
            onClick={onTogglePlay}
            title={isPlaying ? "Pausar" : "Reproducir"}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
            style={{
              backgroundColor: "var(--color-accent, #FF0000)",
              boxShadow: "var(--theme-accent-glow, 0 0 24px rgba(255,0,0,0.5))",
            }}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-white" />
            ) : (
              <Play className="w-8 h-8 fill-white ml-1" />
            )}
          </button>

          {/* Next Track */}
          <button
            id="expanded-next-btn"
            onClick={onNext}
            title="Siguiente canción"
            className="p-3 rounded-full hover:bg-white/10 transition-transform active:scale-90"
          >
            <SkipForward className="w-7 h-7" />
          </button>

          {/* Repeat Mode */}
          <button
            id="expanded-repeat-btn"
            onClick={onCyclePlaybackMode}
            title={`Modo: ${playbackMode}`}
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
      </footer>
    </div>
  );
};

export default ExpandedPlayer;
