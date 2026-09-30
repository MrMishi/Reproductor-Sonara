/**
 * ============================================================================
 * SONARA MUSIC - MODAL DE EFECTOS DE AUDIO Y VELOCIDAD (AudioEffectsModal.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente permite al usuario ajustar:
 * 1. La velocidad de reproducción (0.75x a 2.0x).
 * 2. Modos de efectos acústicos: "Normal", "Slowed & Reverb" y "Nightcore".
 * 3. La duración del Fundido Cruzado (Crossfade): 0s, 2s, 3s o 5s.
 */

import React, { useState, useEffect } from "react";
import {
  X,
  Gauge,
  Moon,
  Zap,
  Headphones,
  Sliders,
  Check,
  Sparkles,
  Shuffle,
  Volume2,
} from "lucide-react";
import { AudioEffectMode } from "../types";
import { audioEngine } from "../services/audioEngine";

interface AudioEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onShowToast: (msg: string) => void;
}

const SPEED_PRESETS = [0.75, 0.85, 1.0, 1.15, 1.25, 1.5];
const CROSSFADE_OPTIONS = [
  { value: 0, label: "Desactivado (0s)" },
  { value: 2, label: "2 segundos" },
  { value: 3, label: "3 segundos (Recomendado)" },
  { value: 5, label: "5 segundos" },
];

export const AudioEffectsModal: React.FC<AudioEffectsModalProps> = ({
  isOpen,
  onClose,
  audioRef,
  onShowToast,
}) => {
  const [currentSpeed, setCurrentSpeed] = useState<number>(() => audioEngine.getPlaybackSpeed());
  const [currentEffect, setCurrentEffect] = useState<AudioEffectMode>(() => audioEngine.getAudioEffect());
  const [crossfade, setCrossfade] = useState<number>(() => audioEngine.getCrossfadeDuration());

  useEffect(() => {
    if (isOpen) {
      setCurrentSpeed(audioEngine.getPlaybackSpeed());
      setCurrentEffect(audioEngine.getAudioEffect());
      setCrossfade(audioEngine.getCrossfadeDuration());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectSpeed = (speed: number) => {
    setCurrentSpeed(speed);
    audioEngine.setPlaybackSpeed(speed, audioRef.current);
    onShowToast(`Velocidad ajustada a ${speed}x`);
  };

  const handleSelectEffect = (effect: AudioEffectMode) => {
    setCurrentEffect(effect);
    audioEngine.setAudioEffect(effect, audioRef.current);
    setCurrentSpeed(audioEngine.getPlaybackSpeed());

    if (effect === "slowed") {
      onShowToast("Modo Slowed & Reverb activado 🌙 (0.85x con calidez acústica)");
    } else if (effect === "nightcore") {
      onShowToast("Modo Nightcore activado ⚡ (1.25x con tono dinámico)");
    } else {
      onShowToast("Efectos restaurados a Normal 🎧");
    }
  };

  const handleSelectCrossfade = (sec: number) => {
    setCrossfade(sec);
    audioEngine.setCrossfadeDuration(sec);
    onShowToast(sec > 0 ? `Fundido cruzado configurado en ${sec} segundos` : "Fundido cruzado desactivado");
  };

  return (
    <div
      id="audio-effects-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="audio-effects-modal-content"
        className="w-full max-w-md rounded-2xl border shadow-2xl p-5 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #181818)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b pb-3 border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Audio FX & Velocidad</h2>
              <p className="text-xs opacity-60">Velocidad, Slowed/Nightcore y Fundido</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SECCIÓN 1: MODOS DE EFECTO ESPECIALES */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold uppercase tracking-wider opacity-60 px-1">
            Modos de Efecto Acústico
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Normal */}
            <button
              onClick={() => handleSelectEffect("normal")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-center cursor-pointer ${
                currentEffect === "normal"
                  ? "bg-purple-600/30 border-purple-500 text-white shadow-md shadow-purple-600/20"
                  : "bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10"
              }`}
            >
              <Headphones className="w-5 h-5 text-purple-400" />
              <div className="text-xs font-bold">Normal</div>
              <div className="text-[10px] opacity-60">1.0x Estándar</div>
            </button>

            {/* Slowed & Reverb */}
            <button
              onClick={() => handleSelectEffect("slowed")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-center cursor-pointer ${
                currentEffect === "slowed"
                  ? "bg-indigo-600/30 border-indigo-500 text-white shadow-md shadow-indigo-600/20"
                  : "bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10"
              }`}
            >
              <Moon className="w-5 h-5 text-indigo-400" />
              <div className="text-xs font-bold">Slowed</div>
              <div className="text-[10px] opacity-60">0.85x + Bajos</div>
            </button>

            {/* Nightcore */}
            <button
              onClick={() => handleSelectEffect("nightcore")}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition text-center cursor-pointer ${
                currentEffect === "nightcore"
                  ? "bg-fuchsia-600/30 border-fuchsia-500 text-white shadow-md shadow-fuchsia-600/20"
                  : "bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10"
              }`}
            >
              <Zap className="w-5 h-5 text-fuchsia-400" />
              <div className="text-xs font-bold">Nightcore</div>
              <div className="text-[10px] opacity-60">1.25x + Pitch</div>
            </button>
          </div>
        </div>

        {/* SECCIÓN 2: SELECTOR DE VELOCIDAD MANUAL */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60">
              Velocidad de Reproducción
            </span>
            <span className="text-xs font-mono font-bold text-purple-400">
              {currentSpeed.toFixed(2)}x
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {SPEED_PRESETS.map((spd) => {
              const isSelected = Math.abs(currentSpeed - spd) < 0.01;
              return (
                <button
                  key={spd}
                  onClick={() => handleSelectSpeed(spd)}
                  className={`py-2 rounded-lg text-xs font-bold transition text-center cursor-pointer border ${
                    isSelected
                      ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                      : "bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10"
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>
        </div>

        {/* SECCIÓN 3: FUNDIDO CRUZADO (CROSSFADE) */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60">
              Fundido Cruzado (Crossfade)
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {crossfade === 0 ? "Desactivado" : `${crossfade}s`}
            </span>
          </div>

          <p className="text-[11px] opacity-65 px-1">
            Mezcla suavemente el final de una canción con el inicio de la siguiente sin silencios ni cortes bruscos.
          </p>

          <div className="grid grid-cols-2 gap-2 mt-1">
            {CROSSFADE_OPTIONS.map((opt) => {
              const isSelected = crossfade === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelectCrossfade(opt.value)}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-200"
                      : "bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
