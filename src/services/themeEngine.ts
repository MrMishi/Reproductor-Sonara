import { ThemeConfig } from "../types";

export const THEME_PRESETS: ThemeConfig[] = [
  {
    id: "sonora-signature",
    name: "Sonora Signature (Violeta & Cían)",
    isDark: true,
    accentColor: "#8B5CF6",
    accentHover: "#7C3AED",
    bgColor: "#0A0915",
    surfaceColor: "#121026",
    surfaceElevated: "#1D193B",
    playerBarBg: "#141129",
    textPrimary: "#FFFFFF",
    textSecondary: "#A3A0BD",
    borderSubtle: "rgba(139, 92, 246, 0.16)",
    glowEffect: true,
    borderRadius: "lg",
  },
  {
    id: "cyber-cyan",
    name: "Cyber Sonora (Cían Eléctrico)",
    isDark: true,
    accentColor: "#06B6D4",
    accentHover: "#0891B2",
    bgColor: "#060D17",
    surfaceColor: "#0C1A2B",
    surfaceElevated: "#132840",
    playerBarBg: "#0B1626",
    textPrimary: "#F0F9FF",
    textSecondary: "#8CB2D1",
    borderSubtle: "rgba(6, 182, 212, 0.18)",
    glowEffect: true,
    borderRadius: "lg",
  },
  {
    id: "emerald-groove",
    name: "Esmeralda Sonora",
    isDark: true,
    accentColor: "#10B981",
    accentHover: "#059669",
    bgColor: "#06130E",
    surfaceColor: "#0D221B",
    surfaceElevated: "#13352A",
    playerBarBg: "#0B1D16",
    textPrimary: "#ECFDF5",
    textSecondary: "#86A89A",
    borderSubtle: "rgba(16, 185, 129, 0.16)",
    glowEffect: true,
    borderRadius: "lg",
  },
  {
    id: "sunset-amber",
    name: "Atardecer Ámbar & Coral",
    isDark: true,
    accentColor: "#F59E0B",
    accentHover: "#D97706",
    bgColor: "#120D08",
    surfaceColor: "#1D160E",
    surfaceElevated: "#2C2116",
    playerBarBg: "#1A130C",
    textPrimary: "#FFFBEB",
    textSecondary: "#B49E85",
    borderSubtle: "rgba(245, 158, 11, 0.15)",
    glowEffect: true,
    borderRadius: "lg",
  },
  {
    id: "oled-black",
    name: "OLED Pitch Black (Violeta Minimal)",
    isDark: true,
    accentColor: "#A855F7",
    accentHover: "#9333EA",
    bgColor: "#000000",
    surfaceColor: "#0A0A0E",
    surfaceElevated: "#14141A",
    playerBarBg: "#050508",
    textPrimary: "#FFFFFF",
    textSecondary: "#888899",
    borderSubtle: "rgba(168, 85, 247, 0.16)",
    glowEffect: true,
    borderRadius: "md",
  },
  {
    id: "midnight-blue",
    name: "Medianoche Zafiro",
    isDark: true,
    accentColor: "#3B82F6",
    accentHover: "#2563EB",
    bgColor: "#050C17",
    surfaceColor: "#0E1A30",
    surfaceElevated: "#182C4F",
    playerBarBg: "#0B1527",
    textPrimary: "#F8FAFC",
    textSecondary: "#8EA3C4",
    borderSubtle: "rgba(59, 130, 246, 0.15)",
    glowEffect: true,
    borderRadius: "lg",
  },
  {
    id: "synthwave-pink",
    name: "Synthwave Magenta",
    isDark: true,
    accentColor: "#EC4899",
    accentHover: "#DB2777",
    bgColor: "#140614",
    surfaceColor: "#220C24",
    surfaceElevated: "#351338",
    playerBarBg: "#1B091D",
    textPrimary: "#FDF2F8",
    textSecondary: "#B6849F",
    borderSubtle: "rgba(236, 72, 153, 0.18)",
    glowEffect: true,
    borderRadius: "lg",
  },
  {
    id: "sonora-light",
    name: "Sonora Luz Ártica (Claro)",
    isDark: false,
    accentColor: "#7C3AED",
    accentHover: "#6D28D9",
    bgColor: "#F8FAFC",
    surfaceColor: "#FFFFFF",
    surfaceElevated: "#F1F5F9",
    playerBarBg: "#FFFFFF",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    borderSubtle: "rgba(124, 58, 237, 0.10)",
    glowEffect: false,
    borderRadius: "lg",
  },
  {
    id: "ytm-retro",
    name: "Rojo Retro (Estilo YouTube)",
    isDark: true,
    accentColor: "#FF0000",
    accentHover: "#CC0000",
    bgColor: "#030303",
    surfaceColor: "#121212",
    surfaceElevated: "#212121",
    playerBarBg: "#181818",
    textPrimary: "#FFFFFF",
    textSecondary: "#AAAAAA",
    borderSubtle: "rgba(255, 255, 255, 0.08)",
    glowEffect: true,
    borderRadius: "lg",
  },
];

const THEME_STORAGE_KEY = "sonora_player_theme_config";

export function loadSavedTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.accentColor && parsed.bgColor) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed loading saved theme:", e);
  }
  return THEME_PRESETS[0];
}

export function saveTheme(theme: ThemeConfig) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch (e) {
    console.warn("Failed saving theme to storage:", e);
  }
}

/**
 * Injects CSS variables onto document element so Tailwind and inline styles adapt dynamically
 */
export function applyThemeToDocument(theme: ThemeConfig) {
  const root = document.documentElement;

  root.style.setProperty("--color-accent", theme.accentColor);
  root.style.setProperty("--color-accent-hover", theme.accentHover);
  root.style.setProperty("--color-bg", theme.bgColor);
  root.style.setProperty("--color-surface", theme.surfaceColor);
  root.style.setProperty("--color-surface-elevated", theme.surfaceElevated);
  root.style.setProperty("--color-player-bg", theme.playerBarBg);
  root.style.setProperty("--color-text-primary", theme.textPrimary);
  root.style.setProperty("--color-text-secondary", theme.textSecondary);
  root.style.setProperty("--color-border-subtle", theme.borderSubtle);

  // Border radius map
  const radiusMap: Record<ThemeConfig["borderRadius"], string> = {
    none: "0px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    full: "9999px",
  };
  root.style.setProperty("--theme-radius", radiusMap[theme.borderRadius] || "12px");

  // Accent glow
  if (theme.glowEffect) {
    root.style.setProperty("--theme-accent-glow", `0 0 18px ${theme.accentColor}55`);
  } else {
    root.style.setProperty("--theme-accent-glow", "none");
  }

  // Update body background
  document.body.style.backgroundColor = theme.bgColor;
  document.body.style.color = theme.textPrimary;
}
