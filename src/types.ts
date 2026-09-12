/**
 * ============================================================================
 * SONARA MUSIC - DEFINICIONES DE TIPOS GLOBALES (types.ts)
 * ============================================================================
 * Propósito y función:
 * Este archivo centraliza todas las definiciones de TypeScript para garantizar
 * coherencia estructural en todo el proyecto:
 * 
 * 1. Track: Representa una canción o audio con sus metadatos (ID3, duración,
 *    ruta nativa, archivo físico, letras sincronizadas, estado de favorito, etc.).
 * 2. SyncedLyricLine: Línea de letra sincronizada (.lrc) con soporte para
 *    marcas de tiempo, texto nativo japonés (Kanji/Kana) y transliteración Romaji.
 * 3. EqualizerBand / EqualizerPreset: Configuración de bandas del ecualizador
 *    paramétrico de 10 bandas y perfiles de audio (Bass Boost, Rock, Pop, etc.).
 * 4. ThemeConfig: Variables del sistema de temas dinámicos (colores, bordes, brillos).
 * 5. SleepTimerConfig: Configuración del temporizador de apagado automático con desvanecimiento.
 * 6. HiddenTrackRecord / Playlist: Estructuras para canciones excluidas y listas de reproducción.
 *
 * Guía para futuras actualizaciones:
 * - Al añadir nuevos campos a `Track`, asegúrese de actualizar los métodos de guardado
 *   y recuperación en `db.ts` (IndexedDB) para no perder compatibilidad hacia atrás.
 */

/**
 * Estructura de una pista musical dentro del reproductor Sonora.
 */
export interface Track {
  /** Identificador único de la pista (generado o derivado de la ruta) */
  id: string;
  /** Título de la pista extraído de metadatos ID3 o del nombre del archivo */
  title: string;
  /** Artista o banda intérprete */
  artist: string;
  /** Nombre del álbum discográfico al que pertenece */
  album: string;
  /** Duración total de la canción expresada en segundos (ej. 195.4) */
  duration: number;
  /** URL utilizable en <audio src="..."> (Blob URL o convertFileSrc nativo) */
  url: string;
  /** Ruta física real en el almacenamiento del dispositivo (ej. '/storage/emulated/0/Music/...') */
  nativePath?: string;
  /** Objeto File del navegador cuando la pista se carga vía input o drag & drop */
  file?: File;
  /** Carátula de la pista en base64, URL de internet o SVG dinámico generado */
  coverUrl?: string;
  /** Año de publicación */
  year?: string;
  /** Género musical (ej. Rock, Pop, Lo-Fi) */
  genre?: string;
  /** Formato o códec del archivo de audio (ej. MP3, FLAC, WAV, M4A) */
  format?: string;
  /** Tamaño del archivo en bytes */
  size?: number;
  /** Marca de tiempo Unix (milisegundos) de cuándo se agregó a la biblioteca */
  addedAt: number;
  /** Indica si la canción está marcada como favorita por el usuario */
  isFavorite?: boolean;
  /** Carpeta de procedencia (ej. "Music", "Download", "YMusic") */
  folderPath?: string;
  /** Nombre completo del archivo físico (ej. "cancion.mp3") */
  fileName?: string;
  /** Archivo binario .lrc guardado si se descargó manualmente */
  lrcBlob?: Blob;
  /** Nombre del archivo .lrc asociado */
  lrcFileName?: string;
  /** Contenido en texto plano del archivo .lrc original */
  rawLrc?: string;
  /** Letras procesadas de la canción (texto plano o versos sincronizados) */
  lyrics?: {
    plain: string;
    synced?: SyncedLyricLine[];
    source?: string;
    rawLrc?: string;
    /** Versión completa en texto plano de la transcripción a Romaji */
    romajiPlain?: string;
    /** Versión completa en texto plano traducida al español */
    spanishPlain?: string;
    /** Estrofas o versos planos emparejados con su pronunciación Romaji o traducción al español */
    pairedPlainLines?: { original: string; romaji?: string; spanish?: string }[];
    /** Bandera booleana que indica si la letra contiene caracteres japoneses */
    hasJapanese?: boolean;
  };
}

/**
 * Secciones disponibles dentro de la vista de Biblioteca
 */
export type LibrarySection = "songs" | "artists" | "albums" | "folders";

/**
 * Línea o verso individual de una letra sincronizada con formato .LRC
 * Estructura interlineal: { time: number, original: string, romaji?: string, spanish?: string }
 */
export interface SyncedLyricLine {
  /** Marca de tiempo en segundos en que inicia el verso */
  time: number;
  /** Texto del verso a desplegar */
  text: string;
  /** Línea original del verso (Kanji, Kana, texto nativo para estructura interlineal) */
  original?: string;
  /** Texto en idioma original (ej. Japonés, Coreano, Chino) */
  nativeText?: string;
  /** Transliteración en alfabeto latino (ej. Romaji) */
  romaji?: string;
  /** Traducción al español u otro idioma (si está disponible) */
  translation?: string;
  /** Traducción al español específica para mostrar interlinealmente bajo demanda */
  spanish?: string;
  /** Bandera booleana que indica si contiene caracteres orientales */
  hasJapanese?: boolean;
}

/**
 * Configuración de una banda de frecuencia del ecualizador paramétrico
 */
export interface EqualizerBand {
  /** Frecuencia central en Hertz (Hz) */
  frequency: number;
  /** Nivel de ganancia en decibelios (-12 dB a +12 dB) */
  gain: number;
  /** Tipo de filtro de audio en Web Audio API (lowshelf, peaking, highshelf) */
  type: BiquadFilterType;
  /** Etiqueta descriptiva para la interfaz de usuario (ej. "60 Hz", "1 kHz") */
  label: string;
}

/**
 * Preajuste o curva predefinida de ecualización musical
 */
export interface EqualizerPreset {
  /** Identificador único del preset (ej. 'bass-boost', 'rock', 'pop') */
  id: string;
  /** Nombre visible para el usuario en la interfaz */
  name: string;
  /** Ganancias asignadas a cada una de las 10 bandas (-12 a +12 dB) */
  gains: number[];
  /** Nivel de refuerzo de frecuencias sub-graves (0 a 10) */
  bassBoost?: number;
}

/**
 * Configuración del tema visual y paleta de colores de la aplicación
 */
export interface ThemeConfig {
  /** Identificador único del tema */
  id: string;
  /** Nombre descriptivo del tema */
  name: string;
  /** Bandera de modo oscuro (true) o modo claro (false) */
  isDark: boolean;
  /** Color de acento primario en formato HEX (ej. #8B5CF6) */
  accentColor: string;
  /** Color de acento al pasar el cursor (hover) */
  accentHover: string;
  /** Color de fondo principal de la aplicación */
  bgColor: string;
  /** Color de superficie para paneles, tarjetas y barras secundarias */
  surfaceColor: string;
  /** Color de superficie elevada para modales flotantes y menús desplegables */
  surfaceElevated: string;
  /** Color de fondo de la barra de reproducción inferior */
  playerBarBg: string;
  /** Color del texto principal con alto contraste */
  textPrimary: string;
  /** Color del texto secundario (subtítulos, metadatos) */
  textSecondary: string;
  /** Color sutil para líneas divisorias y bordes de tarjetas */
  borderSubtle: string;
  /** Activa o desactiva resplandor luminoso alrededor de elementos de acento */
  glowEffect: boolean;
  /** Radio de redondeo de las esquinas (none, sm, md, lg, full) */
  borderRadius: "none" | "sm" | "md" | "lg" | "full";
}

/**
 * Modos de reproducción soportados por el reproductor
 */
export type PlaybackMode = "normal" | "repeat-all" | "repeat-one" | "shuffle";

/**
 * Pestañas principales de navegación de la aplicación
 */
export type ActiveTab = "home" | "library" | "albums" | "artists" | "favorites" | "hidden";

/**
 * Registro de una canción o archivo que el usuario decidió ocultar permanentemente
 */
export interface HiddenTrackRecord {
  /** ID de la pista */
  id: string;
  /** Título registrado */
  title: string;
  /** Artista registrado */
  artist: string;
  /** Álbum registrado */
  album?: string;
  /** Nombre del archivo físico */
  fileName?: string;
  /** Duración en segundos */
  duration?: number;
  /** Marca de tiempo Unix cuando fue ocultada */
  hiddenAt: number;
}

/**
 * Lista de reproducción creada por el usuario
 */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
  coverUrl?: string;
}

/**
 * Configuración y estado del temporizador de suspensión musical (Sleep Timer)
 */
export interface SleepTimerConfig {
  /** Indica si el temporizador está corriendo activamente */
  isActive: boolean;
  /** Modo: 'minutes' (cuenta regresiva) o 'end-of-song' (al terminar la canción actual) */
  mode: "minutes" | "end-of-song";
  /** Marca de tiempo Unix objetivo donde se pausará la música */
  targetTimestamp: number | null;
  /** Segundos restantes calculados para mostrar en la interfaz */
  remainingSeconds: number;
  /** Cantidad de minutos originalmente seleccionados (ej. 15, 30, 45, 60) */
  selectedMinutes?: number;
  /** Si es true, aplica un desvanecimiento acústico (fade out) de 2s antes de pausar */
  fadeOut: boolean;
}


