import React, { useState, useEffect } from "react";
import { X, Clock, Moon, Check, Volume2, Plus, AlertCircle } from "lucide-react";
import { SleepTimerConfig, Track } from "../types";

export interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sleepTimer: SleepTimerConfig;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  onSetTimerMinutes: (minutes: number, fadeOut: boolean) => void;
  onSetTimerEndOfSong: (fadeOut: boolean) => void;
  onCancelTimer: () => void;
  onAddMinutes: (minutes: number) => void;
  onToggleFadeOut: (fadeOut: boolean) => void;
}

function formatTimer(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return "00:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

const PRESETS = [
  { minutes: 15, label: "15 min", sublabel: "Quince minutos" },
  { minutes: 30, label: "30 min", sublabel: "Media hora" },
  { minutes: 45, label: "45 min", sublabel: "Cuarenta y cinco min" },
  { minutes: 60, label: "60 min", sublabel: "1 hora" },
  { minutes: 90, label: "90 min", sublabel: "1 hora y media" },
];

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({
  isOpen,
  onClose,
  sleepTimer,
  currentTrack,
  currentTime,
  duration,
  onSetTimerMinutes,
  onSetTimerEndOfSong,
  onCancelTimer,
  onAddMinutes,
  onToggleFadeOut,
}) => {
  const [customMinutesInput, setCustomMinutesInput] = useState<string>("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [localFadeOut, setLocalFadeOut] = useState<boolean>(sleepTimer.fadeOut);

  useEffect(() => {
    setLocalFadeOut(sleepTimer.fadeOut);
  }, [sleepTimer.fadeOut]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (minutes: number) => {
    onSetTimerMinutes(minutes, localFadeOut);
    onClose();
  };

  const handleSelectEndOfSong = () => {
    onSetTimerEndOfSong(localFadeOut);
    onClose();
  };

  const handleApplyCustomMinutes = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customMinutesInput.trim(), 10);
    if (isNaN(val) || val <= 0) {
      setCustomError("Ingresa un número válido mayor a 0.");
      return;
    }
    if (val > 720) {
      setCustomError("El temporizador máximo permitido es de 12 horas (720 min).");
      return;
    }
    setCustomError(null);
    onSetTimerMinutes(val, localFadeOut);
    setCustomMinutesInput("");
    onClose();
  };

  // Calcular tiempo restante si fuera fin de canción
  const songRemaining = Math.max(0, Math.floor(duration - currentTime));

  return (
    <div
      id="sleep-timer-modal-overlay"
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="sleep-timer-modal-card"
        className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900/95 text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        style={{
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.15)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 bg-neutral-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <span className="text-xl select-none leading-none">💤</span>
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Temporizador de apagado
              </h2>
              <p className="text-xs text-neutral-400">
                Pausa la música automáticamente al dormir
              </p>
            </div>
          </div>

          <button
            id="sleep-timer-close-btn"
            onClick={onClose}
            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Active Countdown Card (if active) */}
          {sleepTimer.isActive && (
            <div
              id="sleep-timer-active-card"
              className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 shadow-lg relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  <span>TEMPORIZADOR ACTIVO</span>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                  {sleepTimer.mode === "end-of-song" ? "Fin de canción" : "Por tiempo"}
                </span>
              </div>

              <div className="flex items-baseline justify-between my-2">
                <div className="font-mono text-3xl font-extrabold tracking-tight text-white">
                  {formatTimer(sleepTimer.remainingSeconds)}
                </div>
                <div className="text-xs text-indigo-200/70">
                  {sleepTimer.mode === "end-of-song"
                    ? `Al terminar "${currentTrack?.title || "canción"}"`
                    : "hasta pausar reproducción"}
                </div>
              </div>

              {/* Quick Actions while Active: +5 min, +15 min, Cancel */}
              <div className="flex items-center gap-2 pt-2 mt-2 border-t border-indigo-500/20">
                <button
                  id="sleep-timer-add-5-btn"
                  onClick={() => onAddMinutes(5)}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  title="Añadir 5 minutos más"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+5 min</span>
                </button>
                <button
                  id="sleep-timer-add-15-btn"
                  onClick={() => onAddMinutes(15)}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  title="Añadir 15 minutos más"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+15 min</span>
                </button>
                <button
                  id="sleep-timer-cancel-btn"
                  onClick={() => {
                    onCancelTimer();
                  }}
                  className="py-1.5 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Desactivar
                </button>
              </div>
            </div>
          )}

          {/* Preset Buttons Grid */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2.5">
              Opciones rápidas
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map((preset) => {
                const isSelected =
                  sleepTimer.isActive &&
                  sleepTimer.mode === "minutes" &&
                  sleepTimer.selectedMinutes === preset.minutes;

                return (
                  <button
                    key={preset.minutes}
                    id={`sleep-preset-${preset.minutes}-btn`}
                    onClick={() => handleSelectPreset(preset.minutes)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-indigo-600/30 border-indigo-400/50 shadow-md text-white"
                        : "bg-neutral-800/60 hover:bg-neutral-800 border-white/5 hover:border-white/20 text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-sm">{preset.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <span className="text-[11px] text-neutral-400 mt-1">
                      {preset.sublabel}
                    </span>
                  </button>
                );
              })}

              {/* End of Song Option */}
              <button
                id="sleep-preset-end-of-song-btn"
                onClick={handleSelectEndOfSong}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1 ${
                  sleepTimer.isActive && sleepTimer.mode === "end-of-song"
                    ? "bg-indigo-600/30 border-indigo-400/50 shadow-md text-white"
                    : "bg-neutral-800/60 hover:bg-neutral-800 border-white/5 hover:border-white/20 text-neutral-300 hover:text-white"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs sm:text-sm">Fin de canción</span>
                  {sleepTimer.isActive && sleepTimer.mode === "end-of-song" && (
                    <Check className="w-4 h-4 text-indigo-400" />
                  )}
                </div>
                <span className="text-[10px] text-neutral-400 mt-1 truncate">
                  {currentTrack ? `~${formatTimer(songRemaining)}` : "Al terminar"}
                </span>
              </button>
            </div>
          </div>

          {/* Custom Duration Input */}
          <div className="pt-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Tiempo personalizado
            </div>
            <form onSubmit={handleApplyCustomMinutes} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="sleep-timer-custom-input"
                  type="number"
                  min="1"
                  max="720"
                  value={customMinutesInput}
                  onChange={(e) => {
                    setCustomMinutesInput(e.target.value);
                    setCustomError(null);
                  }}
                  placeholder="Minutos (ej. 20)"
                  className="w-full px-4 py-2.5 rounded-2xl bg-neutral-800/80 border border-white/10 text-white placeholder:text-neutral-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none">
                  min
                </span>
              </div>
              <button
                id="sleep-timer-custom-submit-btn"
                type="submit"
                disabled={!customMinutesInput.trim()}
                className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
              >
                Iniciar
              </button>
            </form>
            {customError && (
              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{customError}</span>
              </p>
            )}
          </div>

          {/* Fade-Out Toggle */}
          <div className="pt-2 border-t border-white/10">
            <label
              htmlFor="sleep-timer-fadeout-checkbox"
              className="flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 pr-2">
                <Volume2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-neutral-200 group-hover:text-white">
                    Atenuación suave (Fade Out)
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Baja progresivamente el volumen antes de pausar
                  </div>
                </div>
              </div>
              <input
                id="sleep-timer-fadeout-checkbox"
                type="checkbox"
                checked={localFadeOut}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setLocalFadeOut(checked);
                  onToggleFadeOut(checked);
                }}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-neutral-950/60 flex items-center justify-between">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
            <Moon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Actualiza el motor de audio y pausa la reproducción</span>
          </div>
          <button
            id="sleep-timer-footer-close-btn"
            onClick={onClose}
            className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
