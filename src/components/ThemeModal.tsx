/**
 * ============================================================================
 * SONARA MUSIC - MODAL DE PERSONALIZACIÓN Y TEMAS (ThemeModal.tsx)
 * ============================================================================
 * Propósito y función del archivo:
 * Este componente permite al usuario personalizar el aspecto estético de Sonora.
 * Ofrece una galería de temas predefinidos (OLED negro profundo, estilos oscuros
 * con acentos violeta/cian/esmeralda, estilos claros de alto contraste) y un
 * editor personalizado para ajustar colores hexadecimales de fondo, superficie,
 * acento, bordes y curvatura de esquinas.
 *
 * ¿Cómo funciona?:
 * 1. Pestaña "Predefinidos": Muestra tarjetas interactivas con vista previa de
 *    cada preset definido en `THEME_PRESETS`.
 * 2. Pestaña "Personalizado": Permite seleccionar colores de acento rápidos (`QUICK_ACCENTS`),
 *    fondos (`DARK_BG_OPTIONS`, `LIGHT_BG_OPTIONS`) y radios de borde (`borderRadius`).
 * 3. En cada cambio, ejecuta `applyThemeToDocument(theme)` para actualizar las variables
 *    CSS globales en tiempo real y persiste la preferencia con `saveTheme(theme)`.
 *
 * Guía para futuras actualizaciones:
 * - Para añadir opciones de acento rápido, actualice el array `QUICK_ACCENTS`.
 */

import React, { useState } from "react";
import { X, Palette, Check, Sparkles, RefreshCw, Sun, Moon } from "lucide-react";
import { ThemeConfig } from "../types";
import { THEME_PRESETS, saveTheme, applyThemeToDocument } from "../services/themeEngine";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeConfig;
  onThemeChange: (theme: ThemeConfig) => void;
}

const QUICK_ACCENTS = [
  { name: "Violeta Sonora", hex: "#8B5CF6" },
  { name: "Cían Eléctrico", hex: "#06B6D4" },
  { name: "Esmeralda Hi-Fi", hex: "#10B981" },
  { name: "Azul Zafiro", hex: "#3B82F6" },
  { name: "Rosa Synthwave", hex: "#EC4899" },
  { name: "Ámbar Dorado", hex: "#F59E0B" },
  { name: "Naranja Fuego", hex: "#FF5722" },
  { name: "Rojo Retro", hex: "#FF0000" },
  { name: "Verde Lima", hex: "#84CC16" },
  { name: "Blanco Puro", hex: "#FFFFFF" },
];

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onThemeChange,
}) => {
  const [activeTab, setActiveTab] = useState<"presets" | "custom">("presets");
  const [theme, setTheme] = useState<ThemeConfig>(currentTheme);

  if (!isOpen) return null;

  const updateTheme = (updated: ThemeConfig) => {
    setTheme(updated);
    onThemeChange(updated);
    applyThemeToDocument(updated);
    saveTheme(updated);
  };

  const handleSelectPreset = (preset: ThemeConfig) => {
    updateTheme(preset);
  };

  const handleColorChange = (key: keyof ThemeConfig, val: string) => {
    const updated = { ...theme, [key]: val };
    if (key === "accentColor") {
      updated.accentHover = val;
    }
    updateTheme(updated);
  };

  const handleRadiusChange = (radius: ThemeConfig["borderRadius"]) => {
    updateTheme({ ...theme, borderRadius: radius });
  };

  const handleReset = () => {
    updateTheme(THEME_PRESETS[0]);
  };

  return (
    <div
      id="theme-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="theme-modal-content"
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
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: "var(--color-accent)", color: "#fff" }}
            >
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Personalizador de Temas y Colores</h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Modifica el estilo visual, los colores de todos los elementos y el aspecto general
              </p>
            </div>
          </div>

          <button
            id="theme-modal-close-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Cerrar personalizador"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Switch between Presets and Custom Color Picker */}
        <div className="flex p-1 rounded-xl bg-neutral-900/60 border" style={{ borderColor: "var(--color-border-subtle)" }}>
          <button
            id="theme-tab-presets-btn"
            onClick={() => setActiveTab("presets")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "presets"
                ? "bg-white/15 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Temas Predefinidos ({THEME_PRESETS.length})</span>
          </button>
          <button
            id="theme-tab-custom-btn"
            onClick={() => setActiveTab("custom")}
            className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "custom"
                ? "bg-white/15 text-white shadow-sm"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Personalizar Todo a Medida</span>
          </button>
        </div>

        {activeTab === "presets" ? (
          /* Presets Grid */
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {THEME_PRESETS.map((preset) => {
                const isSelected = theme.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    id={`theme-preset-${preset.id}`}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 group hover:scale-[1.02] ${
                      isSelected ? "ring-2 shadow-xl" : "hover:border-white/30"
                    }`}
                    style={{
                      backgroundColor: preset.surfaceColor,
                      borderColor: isSelected ? preset.accentColor : preset.borderSubtle,
                      // @ts-ignore
                      "--tw-ring-color": preset.accentColor,
                    }}
                  >
                    {/* Color Swatch Bars Preview */}
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full border border-white/20 shadow"
                          style={{ backgroundColor: preset.accentColor }}
                        />
                        <span className="text-sm font-bold" style={{ color: preset.textPrimary }}>
                          {preset.name}
                        </span>
                      </div>
                      {isSelected ? (
                        <span
                          className="p-1 rounded-full text-white"
                          style={{ backgroundColor: preset.accentColor }}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        preset.isDark ? (
                          <Moon className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <Sun className="w-4 h-4 text-amber-500" />
                        )
                      )}
                    </div>

                    {/* Preview palette bar */}
                    <div className="flex items-center gap-1.5 w-full h-4 rounded-md overflow-hidden bg-black/30 p-0.5">
                      <div className="h-full flex-1 rounded-sm" style={{ backgroundColor: preset.bgColor }} />
                      <div className="h-full flex-1 rounded-sm" style={{ backgroundColor: preset.surfaceColor }} />
                      <div className="h-full flex-1 rounded-sm" style={{ backgroundColor: preset.playerBarBg }} />
                      <div className="h-full flex-1 rounded-sm" style={{ backgroundColor: preset.accentColor }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Custom Full Color Adjustments */
          <div className="flex flex-col gap-6">
            {/* Quick Accent Swatches */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>
                Color de Acento Rápido:
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {QUICK_ACCENTS.map((item) => (
                  <button
                    key={item.hex}
                    id={`accent-swatch-${item.hex}`}
                    onClick={() => handleColorChange("accentColor", item.hex)}
                    title={item.name}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                      theme.accentColor.toLowerCase() === item.hex.toLowerCase()
                        ? "ring-2 ring-white scale-110 border-white shadow-lg"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: item.hex }}
                  >
                    {theme.accentColor.toLowerCase() === item.hex.toLowerCase() && (
                      <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Individual Pickers for Everything */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Accent Color */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <span className="text-xs font-bold block">Color de Acento</span>
                  <span className="text-[11px] opacity-70">Botones, barras y destaques</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{theme.accentColor}</span>
                  <input
                    id="theme-picker-accent"
                    type="color"
                    value={theme.accentColor}
                    onChange={(e) => handleColorChange("accentColor", e.target.value)}
                    className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {/* Background Color */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <span className="text-xs font-bold block">Fondo Principal</span>
                  <span className="text-[11px] opacity-70">Lienzo y base de la pantalla</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{theme.bgColor}</span>
                  <input
                    id="theme-picker-bg"
                    type="color"
                    value={theme.bgColor}
                    onChange={(e) => handleColorChange("bgColor", e.target.value)}
                    className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {/* Surface Color */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <span className="text-xs font-bold block">Superficie y Tarjetas</span>
                  <span className="text-[11px] opacity-70">Listas, cards y menú lateral</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{theme.surfaceColor}</span>
                  <input
                    id="theme-picker-surface"
                    type="color"
                    value={theme.surfaceColor}
                    onChange={(e) => handleColorChange("surfaceColor", e.target.value)}
                    className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {/* Player Bar Color */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <span className="text-xs font-bold block">Barra de Reproductor</span>
                  <span className="text-[11px] opacity-70">Contenedor inferior fijo</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{theme.playerBarBg}</span>
                  <input
                    id="theme-picker-player-bg"
                    type="color"
                    value={theme.playerBarBg}
                    onChange={(e) => handleColorChange("playerBarBg", e.target.value)}
                    className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {/* Text Primary */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <span className="text-xs font-bold block">Texto Principal</span>
                  <span className="text-[11px] opacity-70">Títulos y encabezados</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{theme.textPrimary}</span>
                  <input
                    id="theme-picker-text-primary"
                    type="color"
                    value={theme.textPrimary}
                    onChange={(e) => handleColorChange("textPrimary", e.target.value)}
                    className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>

              {/* Text Secondary */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border-subtle)" }}
              >
                <div>
                  <span className="text-xs font-bold block">Texto Secundario</span>
                  <span className="text-[11px] opacity-70">Artistas, tiempos y subtítulos</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{theme.textSecondary}</span>
                  <input
                    id="theme-picker-text-secondary"
                    type="color"
                    value={theme.textSecondary}
                    onChange={(e) => handleColorChange("textSecondary", e.target.value)}
                    className="w-9 h-9 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Curvature & Glow FX */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border" style={{ borderColor: "var(--color-border-subtle)" }}>
              <div className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="text-xs font-bold">Curvatura de Bordes:</span>
                <div className="flex items-center gap-2 mt-1">
                  {(["none", "sm", "md", "lg", "full"] as ThemeConfig["borderRadius"][]).map((r) => (
                    <button
                      key={r}
                      id={`theme-radius-${r}`}
                      onClick={() => handleRadiusChange(r)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md border transition-all ${
                        theme.borderRadius === r
                          ? "bg-white text-black border-white shadow"
                          : "border-neutral-700 text-neutral-300 hover:border-white"
                      }`}
                    >
                      {r === "none" ? "Plano" : r === "sm" ? "Suave" : r === "md" ? "Medio" : r === "lg" ? "YTM" : "Píldora"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                <span className="text-xs font-bold">Resplandor Neón:</span>
                <button
                  id="theme-glow-toggle"
                  onClick={() => updateTheme({ ...theme, glowEffect: !theme.glowEffect })}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    theme.glowEffect ? "text-white shadow-lg" : "bg-neutral-800 text-neutral-400"
                  }`}
                  style={{ backgroundColor: theme.glowEffect ? "var(--color-accent)" : undefined }}
                >
                  {theme.glowEffect ? "ACTIVADO" : "DESACTIVADO"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <button
            id="theme-reset-default-btn"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Restablecer predeterminado</span>
          </button>

          <button
            id="theme-save-btn"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full font-semibold text-sm text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
