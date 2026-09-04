export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  url: string; // Object URL or sample URL
  file?: File; // Original File if from device
  coverUrl?: string; // Extracted or fallback album artwork
  year?: string;
  genre?: string;
  format?: string;
  size?: number;
  addedAt: number;
  isFavorite?: boolean;
  lyrics?: {
    plain: string;
    synced?: SyncedLyricLine[];
    source?: string;
  };
}

export interface SyncedLyricLine {
  time: number; // in seconds
  text: string;
}

export interface EqualizerBand {
  frequency: number;
  gain: number; // -12 to +12 dB
  type: BiquadFilterType;
  label: string;
}

export interface EqualizerPreset {
  id: string;
  name: string;
  gains: number[]; // Array of gains in dB for each band
  bassBoost?: number; // 0 to 10
}

export interface ThemeConfig {
  id: string;
  name: string;
  isDark: boolean;
  accentColor: string; // Primary brand color (e.g. #FF0000)
  accentHover: string;
  bgColor: string; // Base background (e.g. #030303)
  surfaceColor: string; // Cards & sidebars (e.g. #121212)
  surfaceElevated: string; // Dropdowns / modals (e.g. #212121)
  playerBarBg: string; // Bottom bar (e.g. #181818)
  textPrimary: string; // #FFFFFF
  textSecondary: string; // #AAAAAA
  borderSubtle: string; // rgba(255,255,255,0.08)
  glowEffect: boolean;
  borderRadius: "none" | "sm" | "md" | "lg" | "full";
}

export type PlaybackMode = "normal" | "repeat-all" | "repeat-one" | "shuffle";

export type ActiveTab = "home" | "library" | "albums" | "artists" | "favorites" | "hidden";

export interface HiddenTrackRecord {
  id: string;
  title: string;
  artist: string;
  album?: string;
  fileName?: string;
  duration?: number;
  hiddenAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  coverUrl?: string;
}
