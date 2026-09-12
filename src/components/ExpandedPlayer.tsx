/**
 * ============================================================================
 * SONARA MUSIC - REPRODUCTOR EXPANDIDO A PANTALLA COMPLETA (ExpandedPlayer.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente es la vista inmersiva principal del reproductor de música.
 * Ofrece la experiencia completa de reproducción, incluyendo carátula de alta
 * resolución, espectrograma de audio en vivo, visualizador de letras sincronizadas
 * estilo karaoke con desplazamiento automático, cola de reproducción interactiva
 * y acceso a ajustes de audio (ecualizador, temporizador de apagado, editor ID3).
 *
 * ¿Cómo funciona?:
 * 1. Sub-pestañas (`activeSubTab`):
 *    - "cover": Carátula grande, espectrograma en tiempo real (`VisualizerCanvas`) y controles.
 *    - "queue": Lista interactiva de la cola de reproducción con selección directa.
 *    - "lyrics": Modo karaoke con versos sincronizados (.lrc) o texto plano, soporte bilingüe
 *      japonés/romaji y botón de sincronización directa a cualquier verso tocándolo.
 *    - "details": Ficha técnica con metadatos ID3 (formato, bitrate estimado, frecuencia, tamaño).
 * 2. Desplazamiento inteligente de letras:
 *    - `getActiveLyricIndex` calcula la línea actual; el componente realiza scroll suave
 *      automático manteniendo el verso activo visible al centro.
 * 3. Controles avanzados:
 *    - Modos de reproducción (bucle, bucle único, aleatorio).
 *    - Ocultar pista, marcar favoritos, temporizador de apagado y acceso al ecualizador.
 *
 * Guía para futuras actualizaciones:
 * - Para añadir un nuevo panel dentro de este reproductor, defina una nueva subpestaña
 *   en `activeSubTab` y agréguele su botón de acceso en la barra superior.
 */

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
  FileText,
  Volume2,
  Sparkles,
  Tag,
  Loader2,
} from "lucide-react";
import { Track, PlaybackMode, SleepTimerConfig } from "../types";
import {
  getActiveLyricIndex,
  hasJapaneseText,
  enrichLyricsWithRomaji,
  enrichLyricsWithSpanish,
} from "../services/lyricsService";
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
  onOpenID3Editor?: (track: Track) => void;
  activeSubTab?: "cover" | "queue" | "lyrics" | "details";
  sleepTimer?: SleepTimerConfig;
  onOpenSleepTimer?: () => void;
  onLyricsApplied?: (trackId: string, lyrics: Track["lyrics"], album?: string) => void;
  onLyricsRemoved?: (trackId: string) => void;
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
  onOpenID3Editor,
  activeSubTab = "cover",
  sleepTimer,
  onOpenSleepTimer,
  onLyricsApplied,
  onLyricsRemoved,
}) => {
  const [activeTab, setActiveTab] = useState<"cover" | "queue" | "lyrics" | "details">(
    activeSubTab || "cover"
  );
  const [visualMode, setVisualMode] = useState<"cover" | "bars" | "wave" | "circle">("cover");

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  // Estado para la transcripción automática de Romaji
  const [isTranscribingRomaji, setIsTranscribingRomaji] = useState<boolean>(false);

  // Estado para la traducción a Español bajo demanda
  const [isTranslatingSpanish, setIsTranslatingSpanish] = useState<boolean>(false);

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

  // Estado para la traducción a Romaji bajo demanda (Modo Botón con toggle ON/OFF)
  const [showRomaji, setShowRomaji] = useState<boolean>(false);

  // Estado para la traducción al Español bajo demanda (Modo Botón con toggle ON/OFF)
  const [showSpanish, setShowSpanish] = useState<boolean>(false);

  // Al cambiar de pista, las traducciones inician desactivadas por defecto (bajo demanda)
  useEffect(() => {
    setShowRomaji(false);
    setIsTranscribingRomaji(false);
    setShowSpanish(false);
    setIsTranslatingSpanish(false);
  }, [currentTrack?.id]);

  // Detectar si la letra contiene caracteres japoneses para habilitar el botón de Romaji
  const hasJapaneseInLyrics = React.useMemo(() => {
    if (
      syncedLyrics &&
      syncedLyrics.some(
        (l) =>
          l.hasJapanese ||
          hasJapaneseText(l.text) ||
          hasJapaneseText(l.nativeText || "") ||
          hasJapaneseText(l.original || "")
      )
    ) {
      return true;
    }
    if (currentTrack?.lyrics?.plain && hasJapaneseText(currentTrack.lyrics.plain)) {
      return true;
    }
    if (currentTrack?.lyrics?.hasJapanese) {
      return true;
    }
    return false;
  }, [syncedLyrics, currentTrack?.lyrics?.plain, currentTrack?.lyrics?.hasJapanese]);

  /**
   * Función: handleToggleRomaji
   * Propósito: Traducción a Romaji bajo demanda al pulsar el botón.
   * REGLAS DEL SISTEMA:
   * - Si ya está activo, permite desactivar la traducción (toggle ON/OFF).
   * - Al activar:
   *   a) Mantiene las marcas de tiempo '[mm:ss.xx]' completamente intactas.
   *   b) Extrae solo el texto de cada verso y lo envía a 'https://sonara-backend-zpjn.onrender.com/api/transcribe'.
   *   c) Asigna la respuesta en Romaji como una propiedad secundaria de la línea ({ time, original, romaji }).
   *   d) Actualiza la vista para mostrar el Romaji debajo del texto original.
   */
  const handleToggleRomaji = async () => {
    if (!currentTrack?.lyrics) return;

    // Si ya está activo, toggle a desactivado
    if (showRomaji) {
      setShowRomaji(false);
      return;
    }

    const lyrics = currentTrack.lyrics;
    const hasRomajiAlready =
      (lyrics.synced && lyrics.synced.some((l) => Boolean(l.romaji && l.romaji.trim().length > 0))) ||
      (lyrics.pairedPlainLines && lyrics.pairedPlainLines.some((p) => Boolean(p.romaji && p.romaji.trim().length > 0)));

    // Si ya contamos con las líneas en Romaji calculadas previamente, activar inmediatamente la vista
    if (hasRomajiAlready) {
      setShowRomaji(true);
      return;
    }

    // Si aún no están calculadas, transcribir bajo demanda preservando marcas de tiempo
    try {
      setIsTranscribingRomaji(true);
      const enriched = await enrichLyricsWithRomaji(lyrics);
      if (enriched && onLyricsApplied && currentTrack) {
        onLyricsApplied(currentTrack.id, enriched, currentTrack.album);
      }
      setShowRomaji(true);
    } catch (err) {
      console.warn("[ExpandedPlayer] Error al traducir letras a Romaji bajo demanda:", err);
    } finally {
      setIsTranscribingRomaji(false);
    }
  };

  /**
   * Función: handleToggleSpanish
   * Propósito: Traducción a Español bajo demanda al presionar el botón "Español".
   * REGLAS DEL SISTEMA:
   * - Si ya está activo, permite desactivar la traducción (toggle ON/OFF).
   * - Al activar:
   *   a) Mantiene las marcas de tiempo '[mm:ss.xx]' completamente intactas.
   *   b) Extrae el texto de cada verso y lo envía al servicio de traducción (/api/lyrics/translate).
   *   c) Asigna la respuesta en Español como una propiedad secundaria de la línea ({ time, original, spanish }).
   *   d) Actualiza la vista para mostrar el significado en español debajo del verso original o traducido.
   */
  const handleToggleSpanish = async () => {
    if (!currentTrack?.lyrics) return;

    // Si ya está activo, toggle a desactivado
    if (showSpanish) {
      setShowSpanish(false);
      return;
    }

    const lyrics = currentTrack.lyrics;
    const hasSpanishAlready =
      (lyrics.synced && lyrics.synced.some((l) => Boolean(l.spanish && l.spanish.trim().length > 0))) ||
      (lyrics.pairedPlainLines && lyrics.pairedPlainLines.some((p) => Boolean(p.spanish && p.spanish.trim().length > 0)));

    // Si ya contamos con las líneas en español traducidas previamente, activar inmediatamente la vista
    if (hasSpanishAlready) {
      setShowSpanish(true);
      return;
    }

    // Si aún no están traducidas, enviar al servicio de traducción preservando marcas de tiempo
    try {
      setIsTranslatingSpanish(true);
      const enriched = await enrichLyricsWithSpanish(lyrics);
      if (enriched && onLyricsApplied && currentTrack) {
        onLyricsApplied(currentTrack.id, enriched, currentTrack.album);
      }
      setShowSpanish(true);
    } catch (err) {
      console.warn("[ExpandedPlayer] Error al traducir letras a Español bajo demanda:", err);
    } finally {
      setIsTranslatingSpanish(false);
    }
  };

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
      className="fixed inset-0 z-50 flex flex-col backdrop-blur-3xl animate-in slide-in-from-bottom duration-300 ease-out overflow-hidden select-none"
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
          {/* Botón de Temporizador de Apagado (Símbolo 💤) */}
          {onOpenSleepTimer && (
            <button
              id="expanded-sleep-timer-btn"
              onClick={onOpenSleepTimer}
              className={`px-2.5 sm:px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 text-xs font-semibold border ${
                sleepTimer?.isActive
                  ? "bg-indigo-500/25 text-indigo-200 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.35)] animate-pulse"
                  : "hover:bg-white/10 text-neutral-300 hover:text-white border-white/10"
              }`}
              title={
                sleepTimer?.isActive
                  ? `Temporizador de apagado activo (${Math.floor(sleepTimer.remainingSeconds / 60)}m restantes)`
                  : "Temporizador de apagado (Dormir)"
              }
              aria-label="Temporizador de apagado"
            >
              <span className="text-base leading-none select-none">💤</span>
              {sleepTimer?.isActive ? (
                <span className="font-mono text-[11px] font-bold text-indigo-300">
                  {Math.floor(sleepTimer.remainingSeconds / 60)}:
                  {(sleepTimer.remainingSeconds % 60).toString().padStart(2, "0")}
                </span>
              ) : (
                <span className="hidden sm:inline">Dormir</span>
              )}
            </button>
          )}

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
                <div className="w-full h-full p-4 sm:p-6 flex items-center justify-center bg-black/40 pointer-events-none">
                  <VisualizerCanvas className="w-full h-full" type={visualMode} isPlaying={isPlaying} />
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

            {/* Selector de Modo Visual: Carátula | Barras | Ondas | Círculos */}
            <div
              className="flex items-center gap-1 p-1 rounded-full border bg-black/30 backdrop-blur-md mb-4 text-[11px]"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <button
                type="button"
                id="visual-mode-cover-btn"
                onClick={() => setVisualMode("cover")}
                className={`px-3 py-1 rounded-full transition-all font-semibold cursor-pointer ${
                  visualMode === "cover" ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Carátula
              </button>
              <button
                type="button"
                id="visual-mode-bars-btn"
                onClick={() => setVisualMode("bars")}
                className={`px-3 py-1 rounded-full transition-all font-semibold cursor-pointer ${
                  visualMode === "bars" ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Barras
              </button>
              <button
                type="button"
                id="visual-mode-wave-btn"
                onClick={() => setVisualMode("wave")}
                className={`px-3 py-1 rounded-full transition-all font-semibold cursor-pointer ${
                  visualMode === "wave" ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Ondas
              </button>
              <button
                type="button"
                id="visual-mode-circle-btn"
                onClick={() => setVisualMode("circle")}
                className={`px-3 py-1 rounded-full transition-all font-semibold cursor-pointer ${
                  visualMode === "circle" ? "bg-white text-black shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Círculos
              </button>
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

                {onOpenID3Editor && (
                  <button
                    id="expanded-edit-id3-btn"
                    onClick={() => onOpenID3Editor(currentTrack)}
                    className="p-3 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-transform active:scale-90"
                    title="Editar etiquetas ID3 y carátula"
                  >
                    <Tag className="w-5 h-5 text-purple-400" />
                  </button>
                )}

                {/* Botón de Temporizador de Apagado (Símbolo 💤) en barra de acciones */}
                {onOpenSleepTimer && (
                  <button
                    id="expanded-track-sleep-timer-btn"
                    onClick={onOpenSleepTimer}
                    className={`p-3 rounded-full transition-all active:scale-90 relative ${
                      sleepTimer?.isActive
                        ? "bg-indigo-500/25 text-indigo-300 shadow-[0_0_14px_rgba(99,102,241,0.35)]"
                        : "hover:bg-white/10 text-neutral-400 hover:text-white"
                    }`}
                    title={
                      sleepTimer?.isActive
                        ? `Temporizador activo (${Math.floor(sleepTimer.remainingSeconds / 60)}m restantes)`
                        : "Temporizador de apagado 💤"
                    }
                    aria-label="Temporizador de apagado"
                  >
                    <span className="text-lg leading-none select-none">💤</span>
                    {sleepTimer?.isActive && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                    )}
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
          <div className="flex-1 flex flex-col overflow-hidden max-w-3xl mx-auto w-full px-3 sm:px-6 py-2 relative">
            {/* Top Minimized Track Banner con botones minimalistas alineados en una sola fila */}
            <div
              className="flex items-center justify-between py-2 px-2.5 sm:px-3 rounded-2xl border bg-neutral-900/60 backdrop-blur-md mb-2 shrink-0 gap-2"
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <div
                className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 cursor-pointer"
                onClick={onTogglePlay}
                title="Toca para pausar/reproducir"
              >
                <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden shadow shrink-0 border border-white/10 group">
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs sm:text-sm font-bold truncate text-white">{currentTrack.title}</p>
                    {/* Indicador visual discreto en el encabezado */}
                    {syncedLyrics && syncedLyrics.length > 0 ? (
                      <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        [Karaoke Activo]
                      </span>
                    ) : currentTrack.lyrics?.plain ? (
                      <span className="hidden md:inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/10 shrink-0">
                        [Texto Estático]
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] opacity-70 truncate">
                    <p className="truncate">{currentTrack.artist}</p>
                    {syncedLyrics && syncedLyrics.length > 0 ? (
                      <span className="md:hidden inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 shrink-0">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                        [Karaoke]
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Botones de acción organizados en una sola fila limpia y sin recortes: [文] [🌐] [🗑️] [🔍] */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* 1. Icono Romaji '文' */}
                {Boolean(currentTrack.lyrics?.plain || (currentTrack.lyrics?.synced && currentTrack.lyrics.synced.length > 0)) && (
                  <button
                    id="lyrics-toggle-romaji-btn"
                    onClick={handleToggleRomaji}
                    disabled={isTranscribingRomaji}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 border ${
                      showRomaji
                        ? "bg-emerald-500/25 text-emerald-300 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400/60 font-bold scale-105"
                        : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:text-white"
                    }`}
                    title={
                      showRomaji
                        ? "Desactivar transcripción a Romaji"
                        : "Traducir versos a Romaji (fonética)"
                    }
                    aria-label="Romaji"
                  >
                    {isTranscribingRomaji ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : (
                      <span className="text-sm font-bold leading-none select-none font-sans">文</span>
                    )}
                  </button>
                )}

                {/* 2. Icono Español '🌐' */}
                {Boolean(currentTrack.lyrics?.plain || (currentTrack.lyrics?.synced && currentTrack.lyrics.synced.length > 0)) && (
                  <button
                    id="lyrics-toggle-spanish-btn"
                    onClick={handleToggleSpanish}
                    disabled={isTranslatingSpanish}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 border ${
                      showSpanish
                        ? "bg-amber-500/25 text-amber-300 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.45)] ring-1 ring-amber-400/60 scale-105"
                        : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10 hover:text-white"
                    }`}
                    title={
                      showSpanish
                        ? "Desactivar traducción a Español"
                        : "Traducir versos al Español (interlineal)"
                    }
                    aria-label="Español"
                  >
                    <Globe className={`w-4 h-4 ${isTranslatingSpanish ? "animate-spin text-amber-400" : ""}`} />
                  </button>
                )}

                {/* 3. Icono Papelera '🗑️' */}
                {Boolean(currentTrack.lyrics?.plain || (currentTrack.lyrics?.synced && currentTrack.lyrics.synced.length > 0)) && (
                  <button
                    id="lyrics-remove-btn"
                    onClick={() => {
                      if (onLyricsRemoved && currentTrack) {
                        onLyricsRemoved(currentTrack.id);
                        setShowRomaji(false);
                        setShowSpanish(false);
                      }
                    }}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 transition-all hover:scale-105 active:scale-95 shadow-sm"
                    title="Eliminar / Limpiar Letra de esta canción"
                    aria-label="Eliminar Letra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                {/* 4. Icono Lupa '🔍' */}
                <button
                  id="lyrics-search-online-btn"
                  onClick={onOpenLyricsSearch}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white shadow transition-all hover:scale-105 active:scale-95 border border-white/10"
                  style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
                  title="Buscar letras oficiales en internet"
                  aria-label="Buscar Letras en Internet"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Karaoke Lyrics Scrollable Viewport (Ocupa todo el protagonismo y espacio vertical de la pantalla) */}
            <div
              ref={lyricsContainerRef}
              id="expanded-lyrics-container"
              className="flex-1 overflow-y-auto space-y-6 py-6 sm:py-10 px-2 scroll-smooth text-center relative select-none"
              style={{
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
              }}
            >
              {syncedLyrics && syncedLyrics.length > 0 ? (
                /* Synchronized Real-Time Karaoke Lines with Japanese, Romaji & Spanish Support */
                syncedLyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const isJap =
                    line.hasJapanese ||
                    hasJapaneseText(line.text) ||
                    hasJapaneseText(line.nativeText || "") ||
                    hasJapaneseText(line.original || "");

                  const primaryText = line.original || line.nativeText || line.text;
                  const secondaryRomajiText = showRomaji ? line.romaji : undefined;
                  const secondarySpanishText = showSpanish ? (line.spanish || line.translation) : undefined;

                  return (
                    <div
                      key={idx}
                      data-lyric-index={idx}
                      onClick={() => onSeek(line.time)}
                      className={`cursor-pointer transition-all duration-300 py-2.5 px-4 rounded-2xl select-none flex flex-col items-center justify-center gap-1 scroll-mt-24 ${
                        isActive
                          ? "scale-105 opacity-100 bg-white/5 shadow-lg border border-white/10"
                          : "opacity-40 hover:opacity-85 scale-100"
                      }`}
                    >
                      {/* Main Lyric Line (Original Song Text / Native CJK or Standard) */}
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

                      {/* Romaji Secondary Line (Pronunciación fonética debajo del texto original cuando está activada) */}
                      {secondaryRomajiText && (
                        <p
                          className={`italic font-medium tracking-wide transition-opacity ${
                            isActive
                              ? "text-sm sm:text-base text-white/90"
                              : "text-xs sm:text-sm text-white/60"
                          }`}
                        >
                          {secondaryRomajiText}
                        </p>
                      )}

                      {/* Spanish Secondary Line (Significado en español debajo del verso original o traducido) */}
                      {secondarySpanishText && (
                        <p
                          className={`font-normal tracking-wide transition-opacity ${
                            isActive
                              ? "text-sm sm:text-base text-amber-200/95 font-medium"
                              : "text-xs sm:text-sm text-amber-200/60"
                          }`}
                        >
                          {secondarySpanishText}
                        </p>
                      )}
                    </div>
                  );
                })
              ) : currentTrack.lyrics?.plain ? (
                /* Plain Lyrics View with Japanese CJK Font Support, Romaji & Spanish Secondary Line */
                (showRomaji || showSpanish) &&
                currentTrack.lyrics.pairedPlainLines &&
                currentTrack.lyrics.pairedPlainLines.length > 0 ? (
                  <div className="space-y-4 max-w-xl mx-auto py-8 text-center select-none">
                    {currentTrack.lyrics.pairedPlainLines.map((pLine, pIdx) => {
                      if (!pLine.original.trim()) {
                        return <div key={pIdx} className="h-4" />;
                      }
                      const isJap = hasJapaneseText(pLine.original);
                      const primaryText = pLine.original;
                      const secondaryRomaji = showRomaji ? pLine.romaji : undefined;
                      const secondarySpanish = showSpanish ? (pLine.spanish || (pLine as any).translation) : undefined;

                      return (
                        <div key={pIdx} className="flex flex-col items-center justify-center py-1">
                          {/* Línea principal con el texto original */}
                          <p
                            className="text-base sm:text-xl leading-relaxed opacity-90 font-medium"
                            style={{
                              fontFamily: isJap
                                ? '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", "Noto Sans JP", system-ui, sans-serif'
                                : undefined,
                            }}
                          >
                            {primaryText}
                          </p>

                          {/* Línea secundaria con la pronunciación Romaji debajo del texto original */}
                          {secondaryRomaji && (
                            <p className="text-xs sm:text-sm md:text-base text-white/60 italic font-medium tracking-wide mt-0.5">
                              {secondaryRomaji}
                            </p>
                          )}

                          {/* Línea secundaria con el significado en español debajo del verso */}
                          {secondarySpanish && (
                            <p className="text-xs sm:text-sm md:text-base text-amber-200/70 font-normal tracking-wide mt-0.5">
                              {secondarySpanish}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className="text-base sm:text-xl leading-loose whitespace-pre-line opacity-85 font-medium max-w-xl mx-auto py-8"
                    style={{
                      fontFamily:
                        '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", "Noto Sans JP", system-ui, sans-serif',
                    }}
                  >
                    {showSpanish && currentTrack.lyrics.spanishPlain
                      ? currentTrack.lyrics.spanishPlain
                      : currentTrack.lyrics.plain}
                  </div>
                )
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
                    <h4 className="text-lg font-bold">Sin letra cargada</h4>
                    <p className="text-xs max-w-xs mx-auto opacity-70 mt-1">
                      Esta canción no cuenta con letras sincronizadas ni texto plano en la biblioteca.
                    </p>
                  </div>
                  <button
                    id="no-lyrics-search-btn"
                    onClick={onOpenLyricsSearch}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-xs text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                    style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
                  >
                    <Search className="w-4 h-4" />
                    <span>Buscar Manualmente</span>
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

            {/* Quick Sleep Timer Card in Details */}
            {onOpenSleepTimer && (
              <div
                className="rounded-2xl p-5 border flex flex-col gap-3"
                style={{
                  backgroundColor: "var(--color-bg, #090909)",
                  borderColor: sleepTimer?.isActive ? "rgba(99, 102, 241, 0.4)" : "var(--color-border-subtle)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl select-none leading-none">💤</span>
                    <div>
                      <span className="font-bold text-sm text-white">Temporizador de apagado</span>
                      {sleepTimer?.isActive && (
                        <span className="ml-2 font-mono text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                          {Math.floor(sleepTimer.remainingSeconds / 60)}:
                          {(sleepTimer.remainingSeconds % 60).toString().padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    id="details-open-sleep-timer-btn"
                    onClick={onOpenSleepTimer}
                    className="px-4 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:scale-105 active:scale-95 shadow cursor-pointer bg-indigo-600 hover:bg-indigo-500"
                  >
                    {sleepTimer?.isActive ? "Modificar" : "Configurar"}
                  </button>
                </div>
                <p className="text-xs opacity-70">
                  {sleepTimer?.isActive
                    ? `La música se pausará automáticamente al terminar el temporizador, actualizando el estado del motor de audio.`
                    : "Programa el apagado automático de la música tras 15, 30, 60 minutos o al finalizar la pista actual."}
                </p>
              </div>
            )}
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
