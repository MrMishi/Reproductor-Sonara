/**
 * ============================================================================
 * SONARA MUSIC - DEFINICIONES DE TIPOS GLOBALES (TypeScript)
 * ============================================================================
 * Este archivo centraliza todas las interfaces, tipos y estructuras de datos
 * utilizadas en el reproductor de música:
 * - Track: Pistas de audio locales y remotas con metadatos, carátula y letras.
 * - SyncedLyricLine: Líneas de letras sincronizadas con soporte bilingüe (Romaji/Kanji).
 * - EqualizerBand / EqualizerPreset: Bandas de ecualización y curvas predefinidas.
 * - ThemeConfig: Personalización visual dinámica de la interfaz.
 * - PlaybackMode: Modos de reproducción (normal, bucle, aleatorio).
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // en segundos
  url: string; // Object URL de blob local o URL remota
  file?: File; // Objeto File original cargado desde el dispositivo
  coverUrl?: string; // Carátula oficial en HD o carátula generada
  year?: string;
  genre?: string;
  format?: string;
  size?: number;
  addedAt: number;
  isFavorite?: boolean;
  folderPath?: string; // Ruta de carpeta o directorio de origen en el dispositivo
  lrcBlob?: Blob; // Archivo .lrc binario persistido en IndexedDB
  lrcFileName?: string; // Nombre del archivo .lrc asociado
  rawLrc?: string; // Texto original del archivo .lrc para carga rápida
  lyrics?: {
    plain: string; // Letra plana sin marcas de tiempo
    synced?: SyncedLyricLine[]; // Letras procesadas verso a verso
    source?: string; // Origen (LrcLib, Genius, Local)
    rawLrc?: string; // Contenido textual original en formato .lrc
  };
}

export type LibrarySection = "songs" | "artists" | "albums" | "folders";

export interface SyncedLyricLine {
  time: number; // Marca de tiempo en segundos
  text: string; // Texto del verso
  nativeText?: string; // Texto en idioma nativo (ej. japonés)
  romaji?: string; // Transliteración romanizada
  translation?: string; // Traducción opcional
  hasJapanese?: boolean; // Indicador de caracteres japoneses
}

export interface EqualizerBand {
  frequency: number; // Frecuencia central en Hz
  gain: number; // Ganancia de -12 a +12 dB
  type: BiquadFilterType; // Tipo de filtro Web Audio API
  label: string; // Etiqueta descriptiva (ej. 60 Hz, 1 kHz)
}

export interface EqualizerPreset {
  id: string;
  name: string; // Nombre del preset (ej. Rock, Pop, Bass Boost)
  gains: number[]; // Array de ganancias en dB para cada banda
  bassBoost?: number; // Realce de graves adicional (0 a 10)
}

export interface ThemeConfig {
  id: string;
  name: string;
  isDark: boolean;
  accentColor: string; // Color de acento primario (ej. #FF0000)
  accentHover: string;
  bgColor: string; // Color de fondo base
  surfaceColor: string; // Tarjetas y paneles laterales
  surfaceElevated: string; // Modales y menús desplegables
  playerBarBg: string; // Barra inferior del reproductor
  textPrimary: string;
  textSecondary: string;
  borderSubtle: string;
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

