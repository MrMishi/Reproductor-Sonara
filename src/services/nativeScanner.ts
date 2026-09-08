/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE ESCANEO NATIVO DE AUDIO (@capacitor/filesystem)
 * ============================================================================
 * Escaneo y detección de pistas locales en directorios estándar de Android:
 * - /Music
 * - /Download
 * - /WhatsApp Audio
 *
 * Compatible con Capacitor Android y modo de respaldo en navegador web.
 */

import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Track } from "../types";
import { parseAudioFile } from "./metadataParser";
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
 * Rutas nativas estándar a inspeccionar en dispositivos Android
 */
export const ANDROID_TARGET_DIRECTORIES = [
  { name: "Music", path: "Music" },
  { name: "Download", path: "Download" },
  { name: "WhatsApp Audio", path: "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Audio" },
  { name: "WhatsApp Audio (Legacy)", path: "WhatsApp/Media/WhatsApp Audio" },
];

/**
 * Escanea el sistema de archivos nativo o solicita permisos si está en Capacitor
 */
export async function scanNativeMusicDirectories(
  onProgress?: ScanProgressCallback,
  filterShortAudios: boolean = true
): Promise<{ tracks: Track[]; scannedCount: number; errors: string[] }> {
  const isNative = Capacitor.isNativePlatform();
  const errors: string[] = [];
  const discoveredTracks: Track[] = [];

  if (!isNative) {
    // Si se ejecuta en navegador Web / Dev server, advertir sobre entorno simulado
    onProgress?.("Entorno Web", 0, 0, "Dispositivo no nativo. Usa el explorador de archivos local.");
    return {
      tracks: [],
      scannedCount: 0,
      errors: ["No se encuentra en plataforma nativa Android de Capacitor."],
    };
  }

  try {
    // Solicitar permisos de almacenamiento si la plataforma lo requiere
    try {
      const permStatus = await Filesystem.checkPermissions();
      if (permStatus.publicStorage !== "granted") {
        await Filesystem.requestPermissions();
      }
    } catch (permErr: unknown) {
      const msg = permErr instanceof Error ? permErr.message : String(permErr);
      errors.push(`Permiso de almacenamiento: ${msg}`);
    }

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
            onProgress?.(dirTarget.name, totalDiscovered, totalProcessed, `Procesando: ${fileName}`);

            const fileUriResult = await Filesystem.getUri({
              path: fullFilePath,
              directory: Directory.ExternalStorage,
            });

            // Convertir URI de Capacitor para reproducción nativa (Capacitor.convertFileSrc)
            const webAudioUrl = Capacitor.convertFileSrc(fileUriResult.uri);

            // Obtener datos binarios o blob para analizar metadatos si es posible
            let parsedTrack: Track | null = null;
            try {
              const fileData = await Filesystem.readFile({
                path: fullFilePath,
                directory: Directory.ExternalStorage,
              });

              let blob: Blob;
              if (typeof fileData.data === "string") {
                const byteCharacters = atob(fileData.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                blob = new Blob([byteArray], { type: "audio/mpeg" });
              } else {
                blob = fileData.data as Blob;
              }

              const nativeFileObj = new File([blob], fileName, { type: "audio/mpeg" });
              parsedTrack = await parseAudioFile(nativeFileObj);
              // Asignar url nativa de Capacitor convertFileSrc
              parsedTrack.url = webAudioUrl;
              parsedTrack.folderPath = dirTarget.name;
              parsedTrack.fileName = fileName;
            } catch {
              // Si falla la lectura completa del Blob, crear pista básica con el URI nativo
              parsedTrack = {
                id: `native_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                title: fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
                artist: "Audio Local",
                album: dirTarget.name,
                duration: 0,
                url: webAudioUrl,
                coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
                folderPath: dirTarget.name,
                fileName,
                addedAt: Date.now(),
              };
            }

            if (parsedTrack) {
              // Filtrar si está en la lista de ocultas
              if (isTrackHidden(parsedTrack)) {
                continue;
              }

              // Filtro de audios cortos (< 30 segundos)
              if (filterShortAudios && parsedTrack.duration > 0 && parsedTrack.duration < 30) {
                continue;
              }

              discoveredTracks.push(parsedTrack);
              totalProcessed++;
            }
          } catch (fileErr: unknown) {
            console.warn(`No se pudo leer archivo ${fileName}:`, fileErr);
          }
        }
      } catch (dirErr: unknown) {
        // La carpeta puede no existir en este dispositivo (ej. WhatsApp Audio si no usa WhatsApp)
        const errMsg = dirErr instanceof Error ? dirErr.message : String(dirErr);
        errors.push(`Directorio /${dirTarget.name}: ${errMsg}`);
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
 * Escaneo rápido enfocado exclusivamente en la carpeta /Download de Android
 * para detectar e incorporar de inmediato los archivos descargados desde Cobalt Tools.
 */
export async function scanDownloadsFolderOnly(
  filterShortAudios: boolean = true
): Promise<{ tracks: Track[]; scannedCount: number; errors: string[] }> {
  const isNative = Capacitor.isNativePlatform();
  const errors: string[] = [];
  const discoveredTracks: Track[] = [];

  if (!isNative) {
    return { tracks: [], scannedCount: 0, errors: ["Entorno web (no nativo)."] };
  }

  try {
    try {
      const permStatus = await Filesystem.checkPermissions();
      if (permStatus.publicStorage !== "granted") {
        await Filesystem.requestPermissions();
      }
    } catch {
      // Ignorar si los permisos ya están gestionados
    }

    const downloadFolderTargets = [
      { path: "Download", dir: Directory.ExternalStorage },
      { path: "Downloads", dir: Directory.ExternalStorage },
    ];

    for (const target of downloadFolderTargets) {
      try {
        const result = await Filesystem.readdir({
          path: target.path,
          directory: target.dir,
        });

        const filesList = result.files || [];
        const audioEntries = filesList.filter((f) => {
          const name = typeof f === "string" ? f : f.name;
          return isAudioFileName(name);
        });

        for (const fileEntry of audioEntries) {
          const fileName = typeof fileEntry === "string" ? fileEntry : fileEntry.name;
          const fullPath = `${target.path}/${fileName}`;

          try {
            const uriResult = await Filesystem.getUri({
              path: fullPath,
              directory: target.dir,
            });

            const webUrl = Capacitor.convertFileSrc(uriResult.uri);

            let parsedTrack: Track | null = null;
            try {
              const fileData = await Filesystem.readFile({
                path: fullPath,
                directory: target.dir,
              });

              let blob: Blob;
              if (typeof fileData.data === "string") {
                const byteChars = atob(fileData.data);
                const byteNums = new Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                  byteNums[i] = byteChars.charCodeAt(i);
                }
                blob = new Blob([new Uint8Array(byteNums)], { type: "audio/mpeg" });
              } else {
                blob = fileData.data as Blob;
              }

              const fileObj = new File([blob], fileName, { type: "audio/mpeg" });
              parsedTrack = await parseAudioFile(fileObj);
              parsedTrack.url = webUrl;
              parsedTrack.folderPath = "Download";
              parsedTrack.fileName = fileName;
            } catch {
              parsedTrack = {
                id: `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                title: fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
                artist: "Descarga",
                album: "Download",
                duration: 0,
                url: webUrl,
                coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80",
                folderPath: "Download",
                fileName,
                addedAt: Date.now(),
              };
            }

            if (parsedTrack) {
              if (isTrackHidden(parsedTrack)) continue;
              if (filterShortAudios && parsedTrack.duration > 0 && parsedTrack.duration < 30) continue;
              discoveredTracks.push(parsedTrack);
            }
          } catch (itemErr) {
            console.warn(`Error al leer archivo ${fileName} en /Download:`, itemErr);
          }
        }
      } catch (dirErr: unknown) {
        // Carpeta no presente o ruta alterna
      }
    }

    return {
      tracks: discoveredTracks,
      scannedCount: discoveredTracks.length,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Error general al escanear /Download: ${msg}`);
    return { tracks: [], scannedCount: 0, errors };
  }
}
