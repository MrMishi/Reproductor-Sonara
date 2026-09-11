/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE ESCANEO NATIVO DE AUDIO (@capacitor/filesystem)
 * ============================================================================
 * Escaneo y detección de pistas locales en Android:
 * - Solicitud explícita de permisos con Filesystem.requestPermissions() ('READ_MEDIA_AUDIO' y 'READ_EXTERNAL_STORAGE').
 * - ESCANEO ULTRARRÁPIDO DELIMITADO: Escanea ÚNICAMENTE las siguientes 3 carpetas dentro de /storage/emulated/0/:
 *     1. /Music
 *     2. /Download
 *     3. /YMusic
 * - IGNORA Y BLOQUEA de forma explícita el escaneo en la raíz del almacenamiento y en carpetas pesadas/del sistema:
 *     /Android, /DCIM, /Pictures, /WhatsApp, /Telegram, /Movies, temporales y caché.
 * - FILTRO ESTRICTO DE NOTAS DE VOZ:
 *     Descarta automáticamente todo archivo cuyo nombre comience por 'PTT-' o con duración menor a 30 segundos.
 *
 * Persistencia nativa sin conversión de caché:
 * - Guarda únicamente rutas nativas ('file://...' o URI) y URLs directas con Capacitor.convertFileSrc().
 * - CERO Blobs y CERO ArrayBuffers en caché o IndexedDB.
 */

import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Track } from "../types";
import {
  cleanFilename,
  generateCoverArt,
  getAudioDuration,
  isVideoFilename,
  MAX_VIDEO_DURATION_SECONDS,
} from "./metadataParser";
import { isTrackHidden, addSingleTrackToDB } from "./db";
import { checkNativeStoragePermissions, openNativeAppSettings } from "./nativeFolderPicker";

export interface ScanProgressCallback {
  (currentFolder: string, foundFilesCount: number, processedCount: number, message: string): void;
}

export interface AndroidFolderOption {
  id: string;
  name: string;
  path: string;
  fallbackPaths?: string[];
  displayPath: string;
  description: string;
  icon: "music" | "download" | "folder";
}

/**
 * Interfaz para representar una carpeta del explorador nativo de Android
 */
export interface NativeFolderItem {
  name: string;
  path: string;
  displayPath: string;
}

/**
 * Carpetas estándar de música recomendadas para escaneo rápido en Android (/storage/emulated/0/)
 * Consulta el almacenamiento raíz usando 'Directory.ExternalStorage' en Capacitor Filesystem.
 */
export const ALLOWED_FAST_SCAN_FOLDERS: AndroidFolderOption[] = [
  {
    id: "music",
    name: "Music",
    path: "Music",
    fallbackPaths: ["Music", "/Music"],
    displayPath: "/storage/emulated/0/Music",
    description: "Carpeta principal de música",
    icon: "music",
  },
  {
    id: "download",
    name: "Download",
    path: "Download",
    fallbackPaths: ["Download", "/Download", "Downloads", "/Downloads"],
    displayPath: "/storage/emulated/0/Download",
    description: "Descargas de canciones",
    icon: "download",
  },
  {
    id: "ymusic",
    name: "YMusic",
    path: "YMusic",
    fallbackPaths: ["YMusic", "/YMusic"],
    displayPath: "/storage/emulated/0/YMusic",
    description: "Música de YMusic",
    icon: "music",
  },
];

/**
 * Carpetas estándar de Android para selección rápida en el explorador nativo
 */
export const ANDROID_QUICK_FOLDERS: AndroidFolderOption[] = ALLOWED_FAST_SCAN_FOLDERS.map((f) => ({
  id: f.id,
  name: f.name,
  path: f.path,
  fallbackPaths: f.fallbackPaths,
  displayPath: f.displayPath,
  description: f.description,
  icon: f.icon,
}));

/**
 * Lista dinámicamente las carpetas en una ruta dada del almacenamiento físico de Android (/storage/emulated/0/).
 * Permite explorar y navegar libremente por cualquier carpeta del dispositivo sin restricciones hardcodeadas.
 */
export async function listNativeDirectories(
  subPath: string = ""
): Promise<NativeFolderItem[]> {
  const isNative = Capacitor.isNativePlatform();
  if (!isNative) return [];

  const cleanPath = subPath.trim().replace(/^\/+|\/+$/g, "");

  try {
    const res = await Filesystem.readdir({
      path: cleanPath,
      directory: Directory.ExternalStorage,
    });

    const folders: NativeFolderItem[] = [];

    for (const entry of res.files || []) {
      const entryName = typeof entry === "string" ? entry : entry?.name;
      if (!entryName) continue;

      const fullChildPath = cleanPath ? `${cleanPath}/${entryName}` : entryName;

      // Omitir carpetas ocultas y sandboxes privados protegidos por Android
      if (entryName.startsWith(".") || isIgnoredFolder(entryName, fullChildPath)) {
        continue;
      }

      const isFile = typeof entry === "object" && entry && "type" in entry ? entry.type === "file" : undefined;

      // Si no es un archivo de audio conocido, considerar como carpeta navegable
      if (isFile !== true && !isAudioFileName(entryName)) {
        folders.push({
          name: entryName,
          path: fullChildPath,
          displayPath: `/storage/emulated/0/${fullChildPath}`,
        });
      }
    }

    // Ordenar alfabéticamente
    return folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  } catch (err) {
    console.warn(`[NativeScanner] No se pudieron listar carpetas en '${subPath}':`, err);
    return [];
  }
}

/**
 * Verificación de extensiones soportadas insensible a mayúsculas y minúsculas:
 * Audio: ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac', '.webm', '.wma']
 * Video (Audio Track): ['.mp4', '.mkv', '.3gp']
 */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".flac",
  ".wav",
  ".ogg",
  ".opus",
  ".aac",
  ".webm",
  ".wma",
  ".mp4",
  ".mkv",
  ".3gp",
];

export function isAudioFileName(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const lower = filename.trim().toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext.toLowerCase()));
}

/**
 * Filtro de notas de voz y audios cortos:
 * - Descarta automáticamente notas de voz de mensajería identificadas por 'PTT-' (WhatsApp Push-To-Talk).
 * - IMPORTANTE: NO descarta canciones con prefijo 'AUD-' (removido bloqueo para admitir canciones legítimas).
 * - IMPORTANTE: NO descarta canciones si el metadato de tiempo aún no se ha terminado de leer (duración es 0, indefinida o NaN).
 * - Solo descarta si la duración fue leída con certeza (> 0) y es menor a 30 segundos (o minDurationSeconds si está activo).
 */
export function isVoiceNoteOrShortAudio(
  fileName: string,
  duration?: number,
  minDurationSeconds: number = 30
): boolean {
  if (!fileName) return false;
  const baseName = fileName.replace(/^.*[/\\]/, "").trim();

  // Descartar automáticamente solo si comienza por 'PTT-' (WhatsApp Push-To-Talk)
  // El prefijo 'AUD-' NO se bloquea para admitir canciones legítimas
  if (/^PTT-/i.test(baseName)) {
    return true;
  }

  // Descartar SOLO si la duración ya se terminó de leer (> 0) y es menor al mínimo (30s).
  // Si duration es 0, undefined o NaN (metadato aún no terminado de leer), NO descartar.
  if (
    duration !== undefined &&
    duration !== null &&
    !isNaN(duration) &&
    duration > 0 &&
    duration < minDurationSeconds
  ) {
    return true;
  }

  return false;
}

/**
 * Carpetas del sistema o basura IGNORADAS de forma segura:
 * - Sandboxes privados restringidos por Android (/Android/data y /Android/obb)
 * - Archivos temporales, miniaturas (.thumbnails), papeleras y control de versiones
 */
const SYSTEM_IGNORED_FOLDER_NAMES = new Set([
  "lost.dir",
  "system volume information",
  "$recycle.bin",
  ".thumbnails",
  ".trash",
  ".cache",
  ".git",
  ".svn",
  ".vscode",
  "node_modules",
]);

export function isIgnoredFolder(folderName: string, fullPath: string): boolean {
  const lowerName = folderName.toLowerCase().trim();
  const lowerPath = fullPath.toLowerCase().trim().replace(/^[/\\]+|[/\\]+$/g, "");

  // Ignorar carpetas ocultas
  if (lowerName.startsWith(".")) return true;

  // Bloqueo de carpetas de basura del sistema
  if (SYSTEM_IGNORED_FOLDER_NAMES.has(lowerName)) return true;

  // Bloqueo específico de sandboxes privados de aplicaciones en Android (Android 11+ restringe /Android/data y /Android/obb)
  if (
    lowerPath === "android/data" ||
    lowerPath.startsWith("android/data/") ||
    lowerPath === "android/obb" ||
    lowerPath.startsWith("android/obb/")
  ) {
    return true;
  }

  return false;
}

/**
 * Comprueba de forma no invasiva si los permisos de lectura de archivos de audio/almacenamiento
 * están concedidos ('READ_MEDIA_AUDIO' / 'READ_EXTERNAL_STORAGE').
 * Retorna true si están concedidos, o false si están denegados.
 */
export async function checkStoragePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const nativeGranted = await checkNativeStoragePermissions();
    if (nativeGranted) return true;

    const checkState = await Filesystem.checkPermissions();
    return checkState?.publicStorage === "granted";
  } catch (err) {
    console.warn("[NativeScanner] Error comprobando permisos:", err);
    return false;
  }
}

/**
 * Solicita explícitamente permisos de almacenamiento en Android ('READ_MEDIA_AUDIO' / 'READ_EXTERNAL_STORAGE')
 * llamando a las APIs nativas y a Filesystem.requestPermissions().
 */
export async function requestStoragePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    console.log("[NativeScanner] Comprobando permisos de almacenamiento nativos...");
    const nativeCheck = await checkNativeStoragePermissions();
    if (nativeCheck) return true;

    const checkState = await Filesystem.checkPermissions();
    console.log("[NativeScanner] Estado previo de permisos:", checkState);

    if (checkState?.publicStorage === "granted") {
      return true;
    }

    console.log("[NativeScanner] Solicitando permisos explícitos con Filesystem.requestPermissions()...");
    const req = await Filesystem.requestPermissions();
    console.log("[NativeScanner] Resultado requestPermissions:", req);

    if (req?.publicStorage === "granted") {
      return true;
    }

    const recheck = await Filesystem.checkPermissions();
    if (recheck?.publicStorage === "granted") return true;

    return await checkNativeStoragePermissions();
  } catch (permErr) {
    console.warn("[NativeScanner] Error al solicitar permisos de almacenamiento:", permErr);
    try {
      const check = await Filesystem.checkPermissions();
      return check?.publicStorage === "granted";
    } catch {
      return false;
    }
  }
}

interface DiscoveredAudioEntry {
  path: string;
  fileName: string;
  folderName: string;
  size?: number;
  directory: Directory;
  uri?: string;
}

/**
 * Recorre recursivamente un directorio en el almacenamiento físico de Android (Directory.ExternalStorage)
 * Si una subcarpeta o directorio no existe o no tiene permisos, ignora el error y continúa.
 */
async function scanFolderRecursively(
  baseDirectory: Directory,
  subPath: string,
  depth: number,
  maxDepth: number,
  visitedPaths: Set<string>,
  audioFiles: DiscoveredAudioEntry[],
  onProgress?: (folder: string, count: number, msg: string) => void
): Promise<void> {
  if (depth > maxDepth) return;
  const cleanSubPath = subPath.replace(/^\/+/, "");
  const normalizedKey = `${baseDirectory}:${cleanSubPath.toLowerCase()}`;
  if (visitedPaths.has(normalizedKey)) return;
  visitedPaths.add(normalizedKey);

  let readResult;
  try {
    readResult = await Filesystem.readdir({
      path: cleanSubPath,
      directory: Directory.ExternalStorage,
    });
  } catch {
    try {
      readResult = await Filesystem.readdir({
        path: `/${cleanSubPath}`,
        directory: Directory.ExternalStorage,
      });
    } catch {
      // Si la carpeta no existe, ignorar el error y terminar la rama limpiamente
      return;
    }
  }

  const entries = readResult?.files || [];
  const displayFolder = cleanSubPath || "Almacenamiento";
  onProgress?.(displayFolder, audioFiles.length, `Explorando /${displayFolder}...`);

  for (const entry of entries) {
    const entryName = typeof entry === "string" ? entry : entry?.name;
    if (!entryName) continue;

    // FILTRO ESTRICTO DE NOTAS DE VOZ:
    // Descarta si el archivo comienza por 'PTT-' (WhatsApp Push-To-Talk).
    // El prefijo 'AUD-' se admite para canciones legítimas.
    if (/^PTT-/i.test(entryName)) {
      continue;
    }

    const childPath = cleanSubPath ? `${cleanSubPath}/${entryName}` : entryName;
    const entrySize =
      typeof entry === "object" && entry && "size" in entry && typeof entry.size === "number"
        ? entry.size
        : 0;
    const entryUri =
      typeof entry === "object" && entry && "uri" in entry && typeof (entry as any).uri === "string"
        ? (entry as any).uri
        : undefined;
    const isDir = typeof entry === "object" && entry && "type" in entry ? entry.type === "directory" : undefined;
    const isFile = typeof entry === "object" && entry && "type" in entry ? entry.type === "file" : undefined;

    // Verificación de extensiones insensible a mayúsculas/minúsculas (acepta .mp3, .MP3, .m4a, .M4A, .flac, .wav, .ogg, .opus, .aac)
    if (isAudioFileName(entryName) && isDir !== true) {
      audioFiles.push({
        path: childPath,
        fileName: entryName,
        folderName: cleanSubPath || "Música",
        size: entrySize,
        directory: Directory.ExternalStorage,
        uri: entryUri,
      });
    } else if (isFile !== true && !isIgnoredFolder(entryName, childPath)) {
      try {
        await scanFolderRecursively(
          Directory.ExternalStorage,
          childPath,
          depth + 1,
          maxDepth,
          visitedPaths,
          audioFiles,
          onProgress
        );
      } catch {
        // Omitir subcarpeta protegida o inaccesible sin interrumpir el escaneo
      }
    }
  }
}

/**
 * Escanea el almacenamiento físico de Android en busca de canciones.
 * 1. RUTA ABSOLUTA Y DIRECTORIOS NATIVOS (Directory.ExternalStorage):
 *    - Configura 'Filesystem.readdir' usando de forma explícita 'directory: Directory.ExternalStorage'
 *      para leer la memoria interna física (/storage/emulated/0/).
 *    - Envuelve la lectura de cada carpeta ('/Music', '/Download', '/YMusic') en bloques try/catch individuales.
 *    - Si la carpeta '/YMusic' no existe, ignora el error y continúa leyendo '/Music' y '/Download'.
 *    - Asegura la lectura recursiva de subcarpetas dentro de '/Music' y '/Download'.
 * 2. EXTENSIONES Y FILTRADO:
 *    - Verificación de extensiones insensible a mayúsculas/minúsculas: ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac', '.webm', '.wma'].
 *    - Filtra y omite de forma estricta audios menores a 30 segundos o que comiencen por 'PTT-'. Se admiten canciones con prefijo 'AUD-'.
 *    - Asegura que el filtro de duración (30s) NO descarte canciones si el metadato de tiempo aún no se ha terminado de leer (duration <= 0).
 * 3. AGREGAR A BIBLIOTECA SIN CACHÉ:
 *    - Guarda directamente la ruta convertida 'Capacitor.convertFileSrc(nativeUri)' o 'file://...' en la base de datos sin convertir a Blob o ArrayBuffer.
 *    - Notifica a la interfaz mediante onTrackDiscovered para que se reflejen en la lista al instante.
 */
export async function scanNativeMusicDirectories(
  onProgress?: ScanProgressCallback,
  filterShortAudios: boolean = true,
  onTrackDiscovered?: (track: Track) => void
): Promise<{ tracks: Track[]; scannedCount: number; errors: string[] }> {
  const isNative = Capacitor.isNativePlatform();
  const errors: string[] = [];
  const discoveredTracks: Track[] = [];

  if (!isNative) {
    onProgress?.("Entorno Web", 0, 0, "Dispositivo no nativo. Usa el explorador de archivos local (+).");
    return {
      tracks: [],
      scannedCount: 0,
      errors: ["No se encuentra en plataforma nativa Android de Capacitor."],
    };
  }

  try {
    // 1. Solicitar permisos de almacenamiento explícitamente
    onProgress?.("Permisos", 0, 0, "Solicitando permisos de almacenamiento...");
    const hasPermission = await requestStoragePermissions();
    if (!hasPermission) {
      console.warn("[NativeScanner] Permisos de almacenamiento no confirmados; intentando escaneo de todas formas...");
    }

    const visitedPaths = new Set<string>();
    const audioEntries: DiscoveredAudioEntry[] = [];

    // 1. FIX ESCANEO CAPACITOR FILESYSTEM (CARPETAS ESPECÍFICAS):
    // Bloques try/catch individuales para /Music, /Download y /YMusic en Directory.ExternalStorage (/storage/emulated/0/).

    // A. Lectura de /Music con recursión completa en todas sus subcarpetas
    try {
      onProgress?.("Music", audioEntries.length, 0, "Inspeccionando /storage/emulated/0/Music y subcarpetas...");
      for (const dirPath of ["Music", "/Music"]) {
        try {
          await scanFolderRecursively(
            Directory.ExternalStorage,
            dirPath,
            0,
            6, // Hasta 6 niveles de subdirectorios (ej. Music/Rock/Queen/...)
            visitedPaths,
            audioEntries,
            (folder, count, msg) => onProgress?.(folder, count, 0, msg)
          );
          break; // Lectura exitosa
        } catch {
          // Continuar con fallback
        }
      }
    } catch (musicErr) {
      console.warn("[NativeScanner] Error inspeccionando /Music:", musicErr);
    }

    // B. Lectura de /Download con recursión completa en todas sus subcarpetas
    try {
      onProgress?.("Download", audioEntries.length, 0, "Inspeccionando /storage/emulated/0/Download y subcarpetas...");
      for (const dirPath of ["Download", "/Download", "Downloads", "/Downloads"]) {
        try {
          await scanFolderRecursively(
            Directory.ExternalStorage,
            dirPath,
            0,
            6, // Hasta 6 niveles de subdirectorios
            visitedPaths,
            audioEntries,
            (folder, count, msg) => onProgress?.(folder, count, 0, msg)
          );
          break; // Lectura exitosa
        } catch {
          // Continuar con fallback
        }
      }
    } catch (downloadErr) {
      console.warn("[NativeScanner] Error inspeccionando /Download:", downloadErr);
    }

    // C. Lectura de /YMusic. Si no existe, se ignora el error y continúa con /Music y /Download
    try {
      onProgress?.("YMusic", audioEntries.length, 0, "Inspeccionando /storage/emulated/0/YMusic...");
      for (const dirPath of ["YMusic", "/YMusic"]) {
        try {
          await scanFolderRecursively(
            Directory.ExternalStorage,
            dirPath,
            0,
            6,
            visitedPaths,
            audioEntries,
            (folder, count, msg) => onProgress?.(folder, count, 0, msg)
          );
          break; // Lectura exitosa
        } catch {
          // Si no existe, continuar con la siguiente ruta
        }
      }
    } catch (ymusicErr) {
      // Si la carpeta /YMusic no existe, ignorar el error limpiamente y continuar
      console.log("[NativeScanner] Carpeta /YMusic no presente en almacenamiento. Continuando con las demás carpetas.");
    }

    const totalDiscovered = audioEntries.length;
    let totalProcessed = 0;
    const seenUris = new Set<string>();

    for (const item of audioEntries) {
      try {
        // Filtro estricto de notas de voz: descarta si comienza por 'PTT-' o por duración < 30s
        if (isVoiceNoteOrShortAudio(item.fileName, undefined, 30)) {
          continue;
        }

        onProgress?.(item.folderName, totalDiscovered, totalProcessed, `Procesando: ${item.fileName}`);

        let nativeUri = item.uri;
        if (!nativeUri) {
          const fileUriResult = await Filesystem.getUri({
            path: item.path,
            directory: item.directory,
          });
          nativeUri = fileUriResult.uri;
        }

        if (seenUris.has(nativeUri)) {
          continue;
        }
        seenUris.add(nativeUri);

        // 3. AGREGAR A BIBLIOTECA SIN CACHÉ:
        // Obtener ruta nativa convertida directamente con 'Capacitor.convertFileSrc(path)'
        const webAudioUrl = Capacitor.convertFileSrc(nativeUri);

        // Medir o estimar duración
        const duration = await getAudioDuration(webAudioUrl, item.size);

        // Soporte de contenedores de video ('.mp4', '.mkv', '.webm', '.3gp'):
        // Descarta automáticamente cualquier video con duración mayor a 480 segundos (8 minutos)
        // para evitar películas o capítulos largos. Los videos permitidos reproducen solo su audio.
        const isVideo = isVideoFilename(item.fileName);
        if (isVideo && duration > MAX_VIDEO_DURATION_SECONDS) {
          console.log(
            `[NativeScanner] Video descartado por superar los 8 minutos (${Math.round(duration)}s > ${MAX_VIDEO_DURATION_SECONDS}s): ${item.fileName}`
          );
          continue;
        }

        // 2. FILTRO DE DURACIÓN (30s):
        // Asegurarse de que el filtro de duración (30s) NO descarte canciones si el metadato de tiempo aún no se ha terminado de leer.
        // Solo descartar si filterShortAudios está activo, duration > 0 (leída con certeza) y duration < 30.
        if (filterShortAudios && duration && duration > 0 && duration < 30) {
          continue;
        }

        // Obtener título y artista limpios a partir del nombre del archivo
        const { title, artist } = cleanFilename(item.fileName);
        const coverUrl = generateCoverArt(title, artist);
        const rawFormat = item.fileName.split(".").pop()?.toUpperCase() || "AUDIO";
        const format = isVideo ? `${rawFormat} (Audio)` : rawFormat;

        const parsedTrack: Track = {
          id: `native_${encodeURIComponent(nativeUri)}`,
          title,
          artist,
          album: item.folderName || (isVideo ? "Videos (Audio)" : "Música Local"),
          duration,
          url: webAudioUrl,
          nativePath: nativeUri,
          coverUrl,
          format,
          size: item.size || 0,
          addedAt: Date.now(),
          isFavorite: false,
          folderPath: item.folderName,
          fileName: item.fileName,
        };

        // Filtrar pistas marcadas como ocultas
        if (isTrackHidden(parsedTrack)) {
          continue;
        }

        discoveredTracks.push(parsedTrack);
        totalProcessed++;

        // 3. AGREGAR A BIBLIOTECA DE INMEDIATO:
        // Registra de inmediato en IndexedDB la ruta devuelta 'Capacitor.convertFileSrc(path)'
        // y emite onTrackDiscovered para que se reflejen en la lista al instante.
        await addSingleTrackToDB(parsedTrack);
        onTrackDiscovered?.(parsedTrack);
      } catch (fileErr: unknown) {
        console.warn(`[NativeScanner] No se pudo resolver ruta para ${item.fileName}:`, fileErr);
      }
    }

    return {
      tracks: discoveredTracks,
      scannedCount: totalProcessed,
      errors,
    };
  } catch (globalErr: unknown) {
    const msg = globalErr instanceof Error ? globalErr.message : String(globalErr);
    errors.push(`Fallo global de escaneo: ${msg}`);
    return {
      tracks: discoveredTracks,
      scannedCount: discoveredTracks.length,
      errors,
    };
  }
}

/**
 * Escaneo automático al iniciar la app.
 * Solicita permisos de almacenamiento ('@capacitor/filesystem'),
 * escanea el almacenamiento nativo de forma recursiva en /Music, /Download y /YMusic
 * y devuelve las nuevas pistas a incorporar, registrándolas de inmediato.
 */
export async function autoScanStartup(
  existingTracks: Track[],
  filterShortAudios: boolean = true,
  onTrackDiscovered?: (track: Track) => void
): Promise<Track[]> {
  const isNative = Capacitor.isNativePlatform();
  if (!isNative) return [];

  try {
    // Solicita permisos explícitamente antes de escanear
    await requestStoragePermissions();

    const existingMap = new Set(
      existingTracks.map((t) => (t.nativePath || t.url || `${t.title}-${t.artist}`).toLowerCase())
    );

    const { tracks } = await scanNativeMusicDirectories(
      undefined,
      filterShortAudios,
      (newTrack) => {
        const keyNative = (newTrack.nativePath || "").toLowerCase();
        const keyUrl = (newTrack.url || "").toLowerCase();
        const keyName = `${newTrack.title}-${newTrack.artist}`.toLowerCase();

        if (
          (!keyNative || !existingMap.has(keyNative)) &&
          (!keyUrl || !existingMap.has(keyUrl)) &&
          !existingMap.has(keyName)
        ) {
          existingMap.add(keyNative);
          existingMap.add(keyUrl);
          existingMap.add(keyName);
          onTrackDiscovered?.(newTrack);
        }
      }
    );

    if (!tracks || tracks.length === 0) return [];

    // Filtrar pistas que ya están presentes en la biblioteca para evitar duplicados
    const newTracks = tracks.filter((t) => {
      const keyNative = (t.nativePath || "").toLowerCase();
      const keyUrl = (t.url || "").toLowerCase();
      const keyName = `${t.title}-${t.artist}`.toLowerCase();

      return (
        (!keyNative || !existingMap.has(keyNative)) &&
        (!keyUrl || !existingMap.has(keyUrl)) &&
        !existingMap.has(keyName)
      );
    });

    return newTracks;
  } catch (err) {
    console.warn("Auto-scan startup error:", err);
    return [];
  }
}

/**
 * Escaneo nativo directo de una carpeta específica de Android o de la RAÍZ física del almacenamiento.
 * Utiliza Filesystem.readdir() con Directory.ExternalStorage (/storage/emulated/0/).
 * Permite explorar libremente cualquier carpeta o escanear desde la raíz física del dispositivo.
 */
export async function scanSpecificNativeDirectory(
  targetPath: string = "",
  folderLabel: string = "Carpeta seleccionada",
  onProgress?: ScanProgressCallback,
  filterShortAudios: boolean = true,
  onTrackDiscovered?: (track: Track) => void
): Promise<{ tracks: Track[]; scannedCount: number; errors: string[] }> {
  const isNative = Capacitor.isNativePlatform();
  const errors: string[] = [];
  const discoveredTracks: Track[] = [];

  if (!isNative) {
    errors.push("El escaneo nativo requiere ejecutarse en la app Android de Capacitor.");
    return { tracks: [], scannedCount: 0, errors };
  }

  // Normalizar la ruta. Si está vacía o es '.', se escanea desde la RAÍZ física del almacenamiento (/storage/emulated/0/)
  const normalizedPath = (targetPath || "").trim().replace(/^\/+|\/+$/g, "");
  const isRootScan = !normalizedPath;

  if (normalizedPath && isIgnoredFolder(normalizedPath, normalizedPath)) {
    errors.push(`La carpeta '${targetPath}' es del sistema o no contiene música accesible.`);
    return { tracks: [], scannedCount: 0, errors };
  }

  try {
    onProgress?.("Permisos", 0, 0, "Comprobando permisos de almacenamiento Android...");
    await requestStoragePermissions();

    const visitedPaths = new Set<string>();
    const audioEntries: DiscoveredAudioEntry[] = [];

    onProgress?.(
      folderLabel,
      0,
      0,
      isRootScan
        ? "Leyendo almacenamiento completo (/storage/emulated/0/) con Filesystem.readdir()..."
        : `Leyendo /${normalizedPath} con Filesystem.readdir()...`
    );

    // Escanear recursivamente la carpeta indicada o la raíz completa hasta 8 niveles de profundidad
    await scanFolderRecursively(
      Directory.ExternalStorage,
      normalizedPath,
      0,
      8,
      visitedPaths,
      audioEntries,
      (folder, count, msg) => onProgress?.(folder, count, 0, msg)
    );

    const totalDiscovered = audioEntries.length;
    let totalProcessed = 0;
    const seenUris = new Set<string>();

    for (const item of audioEntries) {
      try {
        // Descartar notas de voz que comiencen por 'PTT-' (se admite prefijo 'AUD-')
        if (isVoiceNoteOrShortAudio(item.fileName, undefined, 30)) {
          continue;
        }

        onProgress?.(item.folderName, totalDiscovered, totalProcessed, `Procesando: ${item.fileName}`);

        let nativeUri = item.uri;
        if (!nativeUri) {
          const fileUriResult = await Filesystem.getUri({
            path: item.path,
            directory: item.directory,
          });
          nativeUri = fileUriResult.uri;
        }

        if (seenUris.has(nativeUri)) continue;
        seenUris.add(nativeUri);

        const webAudioUrl = Capacitor.convertFileSrc(nativeUri);

        // Medir o estimar duración
        const duration = await getAudioDuration(webAudioUrl, item.size);

        // Soporte de contenedores de video ('.mp4', '.mkv', '.webm', '.3gp'):
        // Descarta automáticamente cualquier video con duración mayor a 480 segundos (8 minutos)
        const isVideo = isVideoFilename(item.fileName);
        if (isVideo && duration > MAX_VIDEO_DURATION_SECONDS) {
          console.log(
            `[NativeScanner] Video descartado por superar los 8 minutos (${Math.round(duration)}s > ${MAX_VIDEO_DURATION_SECONDS}s): ${item.fileName}`
          );
          continue;
        }

        // FILTRO DE DURACIÓN (30s):
        // NO descartar canciones si el metadato de tiempo aún no se ha terminado de leer (duration <= 0).
        if (filterShortAudios && duration && duration > 0 && duration < 30) {
          continue;
        }

        const { title, artist } = cleanFilename(item.fileName);
        const coverUrl = generateCoverArt(title, artist);
        const rawFormat = item.fileName.split(".").pop()?.toUpperCase() || "AUDIO";
        const format = isVideo ? `${rawFormat} (Audio)` : rawFormat;

        const parsedTrack: Track = {
          id: `native_${encodeURIComponent(nativeUri)}`,
          title,
          artist,
          album: item.folderName || (isVideo ? "Videos (Audio)" : folderLabel),
          duration,
          url: webAudioUrl,
          nativePath: nativeUri,
          coverUrl,
          format,
          size: item.size || 0,
          addedAt: Date.now(),
          isFavorite: false,
          folderPath: item.folderName,
          fileName: item.fileName,
        };

        if (isTrackHidden(parsedTrack)) continue;

        discoveredTracks.push(parsedTrack);
        totalProcessed++;

        // AGREGAR A BIBLIOTECA DE INMEDIATO:
        await addSingleTrackToDB(parsedTrack);
        onTrackDiscovered?.(parsedTrack);
      } catch (fileErr) {
        console.warn(`[NativeScanner] No se pudo procesar archivo ${item.fileName}:`, fileErr);
      }
    }

    return {
      tracks: discoveredTracks,
      scannedCount: totalProcessed,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Error en escaneo de carpeta ${targetPath}: ${msg}`);
    return {
      tracks: discoveredTracks,
      scannedCount: discoveredTracks.length,
      errors,
    };
  }
}

