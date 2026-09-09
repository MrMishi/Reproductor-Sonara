/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE ESCANEO NATIVO DE AUDIO (@capacitor/filesystem)
 * ============================================================================
 * Escaneo y detección de pistas locales en directorios estándar de Android:
 * - /Music
 * - /Download
 * - /WhatsApp Audio
 *
 * Persistencia nativa:
 * - Guarda únicamente rutas nativas ('file://...' o URI).
 * - NO almacena Blobs ni ArrayBuffers en caché o memoria.
 * - Reproducción directa desde la ruta física local.
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
];

function isAudioFileName(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Rutas nativas estándar a inspeccionar en almacenamiento de Android
 */
export const ANDROID_TARGET_DIRECTORIES = [
  { name: "Music", path: "Music" },
  { name: "Download", path: "Download" },
  { name: "Downloads", path: "Downloads" },
  { name: "WhatsApp Audio", path: "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Audio" },
  { name: "WhatsApp Audio (Legacy)", path: "WhatsApp/Media/WhatsApp Audio" },
];

/**
 * Solicita permisos de lectura en almacenamiento público
 */
export async function requestStoragePermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const permStatus = await Filesystem.checkPermissions();
    if (permStatus.publicStorage !== "granted") {
      const req = await Filesystem.requestPermissions();
      return req.publicStorage === "granted";
    }
    return true;
  } catch (permErr) {
    console.warn("Error al verificar/solicitar permisos de almacenamiento:", permErr);
    return false;
  }
}

/**
 * Escanea el almacenamiento físico de Android en busca de canciones.
 * Utiliza rutas nativas y URLs directas sin conversión de Blobs ni saturación de memoria.
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
    await requestStoragePermissions();

    let totalDiscovered = 0;
    let totalProcessed = 0;

    for (const dirTarget of ANDROID_TARGET_DIRECTORIES) {
      onProgress?.(dirTarget.name, totalDiscovered, totalProcessed, `Inspeccionando /${dirTarget.name}...`);

      try {
        const readResult = await Filesystem.readdir({
          path: dirTarget.path,
          directory: Directory.ExternalStorage,
        });

        const filesList = readResult.files || [];
        const audioEntries = filesList.filter((f) => {
          const name = typeof f === "string" ? f : f.name;
          return isAudioFileName(name);
        });

        totalDiscovered += audioEntries.length;

        for (const fileEntry of audioEntries) {
          const fileName = typeof fileEntry === "string" ? fileEntry : fileEntry.name;
          const fullFilePath = `${dirTarget.path}/${fileName}`;

          try {
            onProgress?.(dirTarget.name, totalDiscovered, totalProcessed, `Analizando: ${fileName}`);

            const fileUriResult = await Filesystem.getUri({
              path: fullFilePath,
              directory: Directory.ExternalStorage,
            });

            const nativeUri = fileUriResult.uri;
            // Convertir URI a URL directa para el Webview de Capacitor
            const webAudioUrl = Capacitor.convertFileSrc(nativeUri);

            // Obtener título y artista limpios a partir del nombre del archivo
            const { title, artist } = cleanFilename(fileName);
            const coverUrl = generateCoverArt(title, artist);

            const fileSize =
              typeof fileEntry === "object" && fileEntry && "size" in fileEntry && typeof fileEntry.size === "number"
                ? fileEntry.size
                : 0;

            const format = fileName.split(".").pop()?.toUpperCase() || "AUDIO";

            const parsedTrack: Track = {
              id: `native_${encodeURIComponent(nativeUri)}`,
              title,
              artist,
              album: dirTarget.name,
              duration: 0, // Se actualiza automáticamente cuando el elemento <audio> carga los metadatos
              url: webAudioUrl,
              nativePath: nativeUri,
              coverUrl,
              format,
              size: fileSize,
              addedAt: Date.now(),
              isFavorite: false,
              folderPath: dirTarget.name,
              fileName,
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
            console.warn(`No se pudo procesar archivo ${fileName}:`, fileErr);
          }
        }
      } catch (dirErr: unknown) {
        // La carpeta puede no existir en el dispositivo, omitir silenciosamente
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
 * escanea /Music y /Download, y devuelve las nuevas pistas a incorporar.
 */
export async function autoScanStartup(
  existingTracks: Track[],
  filterShortAudios: boolean = true
): Promise<Track[]> {
  const isNative = Capacitor.isNativePlatform();
  if (!isNative) return [];

  try {
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
