/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE ESCANEO NATIVO DE AUDIO (@capacitor/filesystem)
 * ============================================================================
 * Escaneo y detección de pistas locales en Android:
 * - Solicitud explícita de permisos con Filesystem.requestPermissions() (READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE).
 * - Acceso a la raíz (/storage/emulated/0/) mediante Directory.ExternalStorage y Directory.Documents.
 * - Escaneo recursivo de la raíz y subcarpetas comunes:
 *   'Music', 'Download', 'YMusic', 'WhatsApp/Media/WhatsApp Audio', etc.
 *
 * Persistencia nativa sin conversión de caché:
 * - Guarda únicamente rutas nativas ('file://...' o URI) y URLs directas con Capacitor.convertFileSrc().
 * - NO almacena Blobs ni ArrayBuffers en caché o IndexedDB.
 * - Reproducción directa desde la ruta física local en el WebView de Capacitor.
 */

import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Track } from "../types";
import { cleanFilename, generateCoverArt } from "./metadataParser";
import { isTrackHidden } from "./db";

export interface ScanProgressCallback {
  (currentFolder: string, foundFilesCount: number, processedCount: number, message: string): void;
}

const SUPPORTED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".wav",
  ".ogg",
  ".opus",
  ".webm",
  ".wma",
];

function isAudioFileName(filename: string): boolean {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Carpetas comunes de música en Android a inspeccionar con prioridad
 */
export const ANDROID_COMMON_MUSIC_DIRECTORIES = [
  { name: "Music", path: "Music" },
  { name: "Download", path: "Download" },
  { name: "Downloads", path: "Downloads" },
  { name: "YMusic", path: "YMusic" },
  { name: "Music/YMusic", path: "Music/YMusic" },
  { name: "WhatsApp Audio", path: "WhatsApp/Media/WhatsApp Audio" },
  { name: "WhatsApp Audio (Media)", path: "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Audio" },
  { name: "Podcasts", path: "Podcasts" },
  { name: "Audiobooks", path: "Audiobooks" },
  { name: "Recordings", path: "Recordings" },
  { name: "Telegram Audio", path: "Telegram/Telegram Audio" },
  { name: "Snaptube Audio", path: "snaptube/download/Snaptube Audio" },
];

/**
 * Carpetas del sistema a ignorar durante el escaneo recursivo para maximizar velocidad
 */
const IGNORED_SYSTEM_FOLDERS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".vscode",
  ".thumbnails",
  ".trash",
  ".cache",
  "lost.dir",
  "android/data",
  "android/obb",
  "dcim",
  "pictures",
  "movies",
  "cache",
  "temp",
  "tmp",
  "appdata",
  "system volume information",
  "$recycle.bin",
]);

function isIgnoredFolder(folderName: string, fullPath: string): boolean {
  const lowerName = folderName.toLowerCase();
  const lowerPath = fullPath.toLowerCase();
  if (lowerName.startsWith(".")) return true;
  if (IGNORED_SYSTEM_FOLDERS.has(lowerName)) return true;
  if (lowerPath.includes("android/data") || lowerPath.includes("android/obb")) return true;
  return false;
}

/**
 * Solicita explícitamente permisos de almacenamiento en Android ('READ_MEDIA_AUDIO' / 'READ_EXTERNAL_STORAGE')
 * llamando directamente a Filesystem.requestPermissions()
 */
export async function requestStoragePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    console.log("[NativeScanner] Solicitando permisos con Filesystem.requestPermissions()...");
    const req = await Filesystem.requestPermissions();
    console.log("[NativeScanner] Resultado requestPermissions:", req);
    if (req?.publicStorage === "granted") {
      return true;
    }
    const check = await Filesystem.checkPermissions();
    console.log("[NativeScanner] Resultado checkPermissions:", check);
    return check?.publicStorage === "granted";
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
}

/**
 * Recorre recursivamente un directorio en el almacenamiento físico de Android
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
  const normalizedKey = `${baseDirectory}:${subPath.replace(/^\/+|\/+$/g, "")}`.toLowerCase();
  if (visitedPaths.has(normalizedKey)) return;
  visitedPaths.add(normalizedKey);

  try {
    const readResult = await Filesystem.readdir({
      path: subPath,
      directory: baseDirectory,
    });

    const entries = readResult.files || [];
    const displayFolder = subPath || "Almacenamiento raíz";
    onProgress?.(displayFolder, audioFiles.length, `Explorando /${displayFolder}...`);

    for (const entry of entries) {
      const entryName = typeof entry === "string" ? entry : entry.name;
      if (!entryName) continue;

      const childPath = subPath ? `${subPath}/${entryName}` : entryName;
      const entrySize =
        typeof entry === "object" && entry && "size" in entry && typeof entry.size === "number"
          ? entry.size
          : 0;
      const isDir = typeof entry === "object" && entry && "type" in entry ? entry.type === "directory" : undefined;
      const isFile = typeof entry === "object" && entry && "type" in entry ? entry.type === "file" : undefined;

      if (isAudioFileName(entryName) && isDir !== true) {
        audioFiles.push({
          path: childPath,
          fileName: entryName,
          folderName: subPath || "Almacenamiento Local",
          size: entrySize,
          directory: baseDirectory,
        });
      } else if (isFile !== true && !isIgnoredFolder(entryName, childPath)) {
        try {
          await scanFolderRecursively(
            baseDirectory,
            childPath,
            depth + 1,
            maxDepth,
            visitedPaths,
            audioFiles,
            onProgress
          );
        } catch {
          // Omitir subcarpeta protegida o inaccesible
        }
      }
    }
  } catch {
    // Si la carpeta no existe o no tiene permisos, omitir silenciosamente
  }
}

/**
 * Escanea el almacenamiento físico de Android en busca de canciones.
 * - Utiliza Directory.ExternalStorage (/storage/emulated/0/) con fallback a Directory.Documents.
 * - Escaneo recursivo de la raíz y subcarpetas comunes: 'Music', 'Download', 'YMusic', 'WhatsApp/Media/WhatsApp Audio'.
 * - Persistencia nativa: asigna Capacitor.convertFileSrc(nativeUri) y guarda 'file://...'.
 * - CERO Blobs y CERO ArrayBuffers en IndexedDB o caché.
 */
export async function scanNativeMusicDirectories(
  onProgress?: ScanProgressCallback,
  filterShortAudios: boolean = true
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

    // 2. Escaneo recursivo en subcarpetas comunes prioritarias en Directory.ExternalStorage
    for (const commonDir of ANDROID_COMMON_MUSIC_DIRECTORIES) {
      onProgress?.(commonDir.name, audioEntries.length, 0, `Inspeccionando /${commonDir.name}...`);
      await scanFolderRecursively(
        Directory.ExternalStorage,
        commonDir.path,
        0,
        5, // Hasta 5 niveles de profundidad (ej. Music/Artista/Álbum/CD1)
        visitedPaths,
        audioEntries,
        (folder, count, msg) => onProgress?.(folder, count, 0, msg)
      );
    }

    // 3. Escaneo recursivo en la raíz del almacenamiento (/storage/emulated/0/)
    onProgress?.("Raíz", audioEntries.length, 0, "Escaneando raíz de almacenamiento (/storage/emulated/0/)...");
    await scanFolderRecursively(
      Directory.ExternalStorage,
      "",
      0,
      3, // Hasta 3 niveles en la raíz para capturar carpetas personalizadas sin saturar
      visitedPaths,
      audioEntries,
      (folder, count, msg) => onProgress?.(folder, count, 0, msg)
    );

    // 4. Fallback a Directory.Documents si no se encontraron pistas o para completar
    if (audioEntries.length === 0) {
      onProgress?.("Documentos", 0, 0, "Intentando escaneo en Directory.Documents...");
      await scanFolderRecursively(
        Directory.Documents,
        "",
        0,
        4,
        visitedPaths,
        audioEntries,
        (folder, count, msg) => onProgress?.(folder, count, 0, msg)
      );
    }

    const totalDiscovered = audioEntries.length;
    let totalProcessed = 0;

    // 5. Convertir entradas a pistas con rutas nativas y URLs directas (sin Blobs)
    const seenUris = new Set<string>();

    for (const item of audioEntries) {
      try {
        onProgress?.(item.folderName, totalDiscovered, totalProcessed, `Procesando: ${item.fileName}`);

        const fileUriResult = await Filesystem.getUri({
          path: item.path,
          directory: item.directory,
        });

        const nativeUri = fileUriResult.uri;
        if (seenUris.has(nativeUri)) {
          continue;
        }
        seenUris.add(nativeUri);

        // Convertir URI a URL directa para el WebView de Capacitor
        const webAudioUrl = Capacitor.convertFileSrc(nativeUri);

        // Obtener título y artista limpios a partir del nombre del archivo
        const { title, artist } = cleanFilename(item.fileName);
        const coverUrl = generateCoverArt(title, artist);

        const format = item.fileName.split(".").pop()?.toUpperCase() || "AUDIO";

        const parsedTrack: Track = {
          id: `native_${encodeURIComponent(nativeUri)}`,
          title,
          artist,
          album: item.folderName || "Almacenamiento Local",
          duration: 0, // Se autocompleta con el elemento <audio> al reproducir o cargar metadatos
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

        // Filtro opcional de notas de voz cortas
        if (filterShortAudios && parsedTrack.duration > 0 && parsedTrack.duration < 30) {
          continue;
        }

        discoveredTracks.push(parsedTrack);
        totalProcessed++;
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
 * escanea el almacenamiento nativo de forma recursiva y devuelve las nuevas pistas a incorporar.
 */
export async function autoScanStartup(
  existingTracks: Track[],
  filterShortAudios: boolean = true
): Promise<Track[]> {
  const isNative = Capacitor.isNativePlatform();
  if (!isNative) return [];

  try {
    // Solicita permisos explícitamente antes de escanear
    await requestStoragePermissions();

    const { tracks } = await scanNativeMusicDirectories(undefined, filterShortAudios);
    if (!tracks || tracks.length === 0) return [];

    // Filtrar pistas que ya están presentes en la biblioteca para evitar duplicados
    const existingMap = new Set(
      existingTracks.map((t) => (t.nativePath || t.url || `${t.title}-${t.artist}`).toLowerCase())
    );

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

