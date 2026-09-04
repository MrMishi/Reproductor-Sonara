import React, { useState } from "react";
import { X, Sliders, RotateCcw, Volume2, Flame, Power } from "lucide-react";
import { audioEngine, DEFAULT_BANDS, EQUALIZER_PRESETS } from "../services/audioEngine";
import { VisualizerCanvas } from "./VisualizerCanvas";

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPlaying: boolean;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({
  isOpen,
  onClose,
  isPlaying,
}) => {
  const [eqState, setEqState] = useState(() => audioEngine.getState());

  if (!isOpen) return null;

  const handleBandChange = (index: number, val: number) => {
    audioEngine.setBandGain(index, val);
    setEqState(audioEngine.getState());
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = EQUALIZER_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      audioEngine.applyPreset(preset);
      setEqState(audioEngine.getState());
    }
  };

  const handleBassBoostChange = (val: number) => {
    audioEngine.setBassBoost(val);
    setEqState(audioEngine.getState());
  };

  const handlePreampChange = (val: number) => {
    audioEngine.setPreamp(val);
    setEqState(audioEngine.getState());
  };

  const handleToggle = () => {
    audioEngine.toggleEqualizer(!eqState.isEnabled);
    setEqState(audioEngine.getState());
  };

  const handleReset = () => {
    const flat = EQUALIZER_PRESETS[0];
    audioEngine.applyPreset(flat);
    audioEngine.setPreamp(0);
    setEqState(audioEngine.getState());
  };

  return (
    <div
      id="equalizer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="equalizer-modal-content"
        className="w-full max-w-2xl rounded-2xl border shadow-2xl p-6 flex flex-col gap-6 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.1))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--color-border-subtle)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            >
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Ecualizador de Audio</h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Ajuste fino de frecuencias y refuerzo de graves en tiempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Power toggle */}
            <button
              id="equalizer-power-toggle"
              onClick={handleToggle}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                eqState.isEnabled
                  ? "text-white shadow-md"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
              style={{
                backgroundColor: eqState.isEnabled ? "var(--color-accent)" : undefined,
              }}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{eqState.isEnabled ? "ACTIVADO" : "DESACTIVADO"}</span>
            </button>

            <button
              id="equalizer-modal-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Cerrar ecualizador"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Visualizer Box */}
        <div
          className="rounded-xl p-3 border relative overflow-hidden"
          style={{
            backgroundColor: "var(--color-bg, #090909)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold opacity-70">
              Espectro de Frecuencias
            </span>
            <span className="text-[11px] font-mono text-xs opacity-70">
              {isPlaying ? "Reproduciendo" : "Pausado"}
            </span>
          </div>
          <VisualizerCanvas className="w-full h-20" type="bars" isPlaying={isPlaying && eqState.isEnabled} />
        </div>

        {/* Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Ajuste predefinido:
            </span>
            <select
              id="equalizer-presets-select"
              value={eqState.presetId}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-neutral-900 focus:outline-none cursor-pointer"
              style={{
                borderColor: "var(--color-border-subtle)",
                color: "var(--color-text-primary)",
              }}
            >
              {EQUALIZER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} className="bg-neutral-900 text-white">
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          <button
            id="equalizer-reset-btn"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer plano</span>
          </button>
        </div>

        {/* 7 Band Sliders */}
        <div
          className="rounded-2xl p-5 border flex flex-col gap-4"
          style={{
            backgroundColor: "var(--color-surface, #141414)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <div className="flex justify-between items-center text-xs font-mono opacity-60 px-2">
            <span>+12 dB</span>
            <span>0 dB</span>
            <span>-12 dB</span>
          </div>

          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end justify-items-center py-2 min-h-[190px]">
            {DEFAULT_BANDS.map((band, idx) => {
              const currentGain = eqState.gains[idx] || 0;
              return (
                <div key={band.label} className="flex flex-col items-center gap-2 w-full h-full justify-between">
                  {/* Gain readout tag */}
                  <span
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded text-center transition-colors min-w-[36px]"
                    style={{
                      backgroundColor: currentGain !== 0 ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                      color: currentGain !== 0 ? "#fff" : "var(--color-text-secondary)",
                    }}
                  >
                    {currentGain > 0 ? `+${currentGain}` : currentGain}
                  </span>

                  {/* Vertical Slider Track */}
                  <div className="relative flex items-center justify-center h-36 py-2">
                    <input
                      id={`eq-band-${idx}`}
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      disabled={!eqState.isEnabled}
                      value={currentGain}
                      onChange={(e) => handleBandChange(idx, Number(e.target.value))}
                      className="slider-vertical h-32 w-2.5 appearance-none bg-neutral-800 rounded-full cursor-pointer accent-red-600 disabled:opacity-40"
                      style={{
                        writingMode: "vertical-lr",
                        direction: "rtl",
                        accentColor: "var(--color-accent)",
                      }}
                      aria-label={`Banda ${band.label}`}
                    />
                  </div>

                  {/* Frequency Label */}
                  <span className="text-[11px] font-semibold text-center mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    {band.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extra Enhancements: Bass Boost & Pre-amp */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Bass Boost */}
          <div
            className="p-4 rounded-xl border flex flex-col gap-2.5"
            style={{
              backgroundColor: "var(--color-surface, #141414)",
              borderColor: "var(--color-border-subtle)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4" style={{ color: "var(--color-accent)" }} />
                <span className="text-xs font-semibold">Refuerzo de Graves (Bass Boost)</span>
              </div>
              <span className="text-xs font-mono font-bold" style={{ color: "var(--color-accent)" }}>
                {eqState.bassBoost} / 10
              </span>
            </div>
            <input
              id="equalizer-bass-boost-slider"
              type="range"
              min={0}
              max={10}
              step={1}
              disabled={!eqState.isEnabled}
              value={eqState.bassBoost}
              onChange={(e) => handleBassBoostChange(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 disabled:opacity-40"
              style={{ accentColor: "var(--color-accent)" }}
            />
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Potencia frecuencias sub-graves de 80Hz para mayor impacto.
            </span>
          </div>

          {/* Pre-amp */}
          <div
            className="p-4 rounded-xl border flex flex-col gap-2.5"
            style={{
              backgroundColor: "var(--color-surface, #141414)",
              borderColor: "var(--color-border-subtle)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" style={{ color: "var(--color-accent)" }} />
                <span className="text-xs font-semibold">Ganancia Pre-Amp</span>
              </div>
              <span className="text-xs font-mono font-bold" style={{ color: "var(--color-accent)" }}>
                {eqState.preamp > 0 ? `+${eqState.preamp}` : eqState.preamp} dB
              </span>
            </div>
            <input
              id="equalizer-preamp-slider"
              type="range"
              min={-6}
              max={6}
              step={0.5}
              disabled={!eqState.isEnabled}
              value={eqState.preamp}
              onChange={(e) => handlePreampChange(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-800 disabled:opacity-40"
              style={{ accentColor: "var(--color-accent)" }}
            />
            <span className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Compensa el volumen maestro antes de la filtración.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            id="equalizer-done-btn"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full font-semibold text-sm text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Guardar y Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};
