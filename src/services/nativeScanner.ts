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
import { cleanFilename, generateCoverArt, getAudioDuration } from "./metadataParser";
import { isTrackHidden, addSingleTrackToDB } from "./db";

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
 * Carpetas permitidas para el escaneo ultrarrápido en Android (/storage/emulated/0/)
 * Consulta el almacenamiento raíz usando 'Directory.ExternalStorage' en Capacitor Filesystem.
 * Lee explícitamente:
 * 1. /Music
 * 2. /Download
 * 3. /YMusic
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
 * Limitadas estrictamente a las 3 carpetas de música autorizadas
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
 * Verificación de extensiones soportadas insensible a mayúsculas y minúsculas:
 * ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac', '.webm', '.wma']
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
];

export function isAudioFileName(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const lower = filename.trim().toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext.toLowerCase()));
}

/**
 * Filtro de notas de voz y audios cortos:
 * - Descarta automáticamente todo archivo cuyo nombre comience por 'PTT-' (WhatsApp Push-To-Talk).
 * - IMPORTANTE: NO descarta canciones si el metadato de tiempo aún no se ha terminado de leer (duración es 0, indefinida o NaN).
 * - Solo descarta si la duración fue leída con certeza (> 0) y es menor a 75 segundos.
 */
export function isVoiceNoteOrShortAudio(
  fileName: string,
  duration?: number,
  minDurationSeconds: number = 75
): boolean {
  if (!fileName) return false;
  const baseName = fileName.replace(/^.*[/\\]/, "").trim();

  // Descartar automáticamente si comienza por 'PTT-' (insensible a mayúsculas/minúsculas)
  if (/^PTT-/i.test(baseName)) {
    return true;
  }

  // Descartar SOLO si la duración ya se terminó de leer (> 0) y es menor al mínimo (75s).
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
 * Carpetas pesadas, de mensajería o del sistema IGNORADAS Y BLOQUEADAS de forma explícita:
 * - /Android
 * - /DCIM
 * - /Pictures
 * - /WhatsApp
 * - /Telegram
 * - Archivos temporales, caché y miniaturas
 */
const BLOCKED_FOLDER_NAMES = new Set([
  "android",
  "dcim",
  "pictures",
  "whatsapp",
  "telegram",
  "movies",
  "camera",
  "snapchat",
  "instagram",
  "facebook",
  "cache",
  "temp",
  "tmp",
  "appdata",
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
  const lowerPath = fullPath.toLowerCase().trim();

  // Ignorar carpetas ocultas
  if (lowerName.startsWith(".")) return true;

  // Bloqueo explícito por nombre de carpeta
  if (BLOCKED_FOLDER_NAMES.has(lowerName)) return true;

  // Bloqueo estricto si cualquier segmento de la ruta contiene carpetas prohibidas
  const blockedSubstrings = [
    "android",
    "dcim",
    "pictures",
    "whatsapp",
    "telegram",
    "temp",
    "tmp",
    "cache",
    ".trash",
    ".thumbnails",
  ];

  const segments = lowerPath.split(/[/\\]+/).map((s) => s.trim());
  for (const block of blockedSubstrings) {
    if (segments.includes(block)) return true;
  }

  return false;
}

/**
 * Solicita explícitamente permisos de almacenamiento en Android ('READ_MEDIA_AUDIO' / 'READ_EXTERNAL_STORAGE')
 * llamando directamente a Filesystem.requestPermissions()
 */
export async function requestStoragePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    console.log("[NativeScanner] Comprobando permisos de almacenamiento nativos...");
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
    return recheck?.publicStorage === "granted";
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
      directory: baseDirectory,
    });
  } catch {
    try {
      readResult = await Filesystem.readdir({
        path: `/${cleanSubPath}`,
        directory: baseDirectory,
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
    // Descarta automáticamente si el archivo comienza por 'PTT-' (WhatsApp Push-To-Talk)
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

    // Verificación de extensiones insensible a mayúsculas/minúsculas
    if (isAudioFileName(entryName) && isDir !== true) {
      audioFiles.push({
        path: childPath,
        fileName: entryName,
        folderName: cleanSubPath || "Música",
        size: entrySize,
        directory: baseDirectory,
        uri: entryUri,
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
        // Omitir subcarpeta protegida o inaccesible sin interrumpir el escaneo
      }
    }
  }
}

/**
 * Escanea el almacenamiento físico de Android en busca de canciones.
 * 1. RUTA ABSOLUTA Y DIRECTORIOS NATIVOS:
 *    - Consulta el almacenamiento raíz usando 'Directory.ExternalStorage' en Capacitor Filesystem.
 *    - Lee explícitamente los directorios '/Music', '/Download' y '/YMusic'.
 *    - Si una carpeta no existe, ignora el error y continúa con las demás.
 * 2. EXTENSIONES Y FILTRADO:
 *    - Verificación de extensiones insensible a mayúsculas/minúsculas: ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac'].
 *    - El filtro de duración (75s) NO descarte canciones si el metadato de tiempo aún no se ha terminado de leer (duration <= 0).
 * 3. AGREGAR A BIBLIOTECA:
 *    - Registra de inmediato en IndexedDB la ruta devuelta 'Capacitor.convertFileSrc(path)'
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

    // 1. RUTA ABSOLUTA Y DIRECTORIOS NATIVOS:
    // Lee explícitamente '/Music', '/Download' y '/YMusic' en Directory.ExternalStorage.
    // Si una carpeta no existe, ignora el error y continúa con las demás.
    for (const targetDir of ALLOWED_FAST_SCAN_FOLDERS) {
      onProgress?.(targetDir.name, audioEntries.length, 0, `Inspeccionando /storage/emulated/0/${targetDir.path}...`);

      let readSuccess = false;
      const candidates = targetDir.fallbackPaths || [targetDir.path, `/${targetDir.path}`];

      for (const dirPath of candidates) {
        try {
          await scanFolderRecursively(
            Directory.ExternalStorage,
            dirPath,
            0,
            4, // Hasta 4 niveles de subdirectorios (ej. Music/Artista/Álbum)
            visitedPaths,
            audioEntries,
            (folder, count, msg) => onProgress?.(folder, count, 0, msg)
          );
          readSuccess = true;
          break; // Lectura exitosa de esta carpeta
        } catch {
          // Si no existe la ruta, ignora el error y continúa con la alternativa o siguiente carpeta
        }
      }

      if (!readSuccess) {
        console.log(`[NativeScanner] Directorio /${targetDir.name} no presente en almacenamiento. Continuando con las demás carpetas.`);
      }
    }

    const totalDiscovered = audioEntries.length;
    let totalProcessed = 0;
    const seenUris = new Set<string>();

    for (const item of audioEntries) {
      try {
        // Filtro de notas de voz por nombre: descarta si comienza por 'PTT-'
        if (isVoiceNoteOrShortAudio(item.fileName)) {
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

        // 3. AGREGAR A BIBLIOTECA: Obtener ruta devuelta 'Capacitor.convertFileSrc(path)'
        const webAudioUrl = Capacitor.convertFileSrc(nativeUri);

        // Medir o estimar duración
        const duration = await getAudioDuration(webAudioUrl, item.size);

        // 2. FILTRO DE DURACIÓN (75s):
        // Asegurarse de que el filtro de duración (75s) NO descarte canciones si el metadato de tiempo aún no se ha terminado de leer.
        // Solo descartar si filterShortAudios está activo, duration > 0 (leída con certeza) y duration < 75.
        if (filterShortAudios && duration && duration > 0 && duration < 75) {
          continue;
        }

        // Obtener título y artista limpios a partir del nombre del archivo
        const { title, artist } = cleanFilename(item.fileName);
        const coverUrl = generateCoverArt(title, artist);
        const format = item.fileName.split(".").pop()?.toUpperCase() || "AUDIO";

        const parsedTrack: Track = {
          id: `native_${encodeURIComponent(nativeUri)}`,
          title,
          artist,
          album: item.folderName || "Música Local",
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
 * Escaneo nativo directo de una carpeta específica de Android seleccionada por el usuario.
 * Reemplaza la 'HTML5 File System Access API' por el uso nativo de Filesystem.readdir().
 * Bloquea la raíz y carpetas del sistema.
 */
export async function scanSpecificNativeDirectory(
  targetPath: string,
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

  // Bloqueo explícito de la raíz de almacenamiento y carpetas del sistema
  const normalizedPath = targetPath.trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedPath) {
    errors.push("El escaneo de la raíz del almacenamiento está bloqueado para garantizar velocidad y proteger archivos del sistema. Selecciona /Music, /Download o /YMusic.");
    return { tracks: [], scannedCount: 0, errors };
  }

  if (isIgnoredFolder(normalizedPath, normalizedPath)) {
    errors.push(`La carpeta '${targetPath}' es del sistema o no contiene música permitida.`);
    return { tracks: [], scannedCount: 0, errors };
  }

  try {
    onProgress?.("Permisos", 0, 0, "Comprobando permisos de almacenamiento Android...");
    await requestStoragePermissions();

    const visitedPaths = new Set<string>();
    const audioEntries: DiscoveredAudioEntry[] = [];

    onProgress?.(folderLabel, 0, 0, `Leyendo /${normalizedPath} con Filesystem.readdir()...`);

    // Escanear recursivamente la carpeta indicada hasta 4 niveles
    await scanFolderRecursively(
      Directory.ExternalStorage,
      normalizedPath,
      0,
      4,
      visitedPaths,
      audioEntries,
      (folder, count, msg) => onProgress?.(folder, count, 0, msg)
    );

    const totalDiscovered = audioEntries.length;
    let totalProcessed = 0;
    const seenUris = new Set<string>();

    for (const item of audioEntries) {
      try {
        // Descartar notas de voz que comiencen por 'PTT-'
        if (isVoiceNoteOrShortAudio(item.fileName)) {
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

        // FILTRO DE DURACIÓN (75s):
        // NO descartar canciones si el metadato de tiempo aún no se ha terminado de leer (duration <= 0).
        if (filterShortAudios && duration && duration > 0 && duration < 75) {
          continue;
        }

        const { title, artist } = cleanFilename(item.fileName);
        const coverUrl = generateCoverArt(title, artist);
        const format = item.fileName.split(".").pop()?.toUpperCase() || "AUDIO";

        const parsedTrack: Track = {
          id: `native_${encodeURIComponent(nativeUri)}`,
          title,
          artist,
          album: item.folderName || folderLabel,
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

