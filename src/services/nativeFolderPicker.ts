import { registerPlugin, Capacitor } from "@capacitor/core";
import { Track } from "../types";
import { addSingleTrackToDB, isTrackHidden } from "./db";
import { cleanFilename, generateCoverArt, getAudioDuration } from "./metadataParser";

/**
 * Representa un archivo de audio descubierto en el árbol de documentos SAF de Android
 */
export interface NativeAudioFileItem {
  name: string;
  uri: string;
  size: number;
  lastModified?: number;
  mimeType?: string;
  relativePath?: string;
}

/**
 * Respuesta devuelta por el Intent.ACTION_OPEN_DOCUMENT_TREE en Android
 */
export interface NativeFolderPickResponse {
  cancelled: boolean;
  folderName?: string;
  folderUri?: string;
  files: NativeAudioFileItem[];
  totalCount?: number;
}

export interface NativeFolderPickerPlugin {
  pickFolder(): Promise<NativeFolderPickResponse>;
}

/**
 * Registro del plugin nativo 'NativeFolderPicker' de Capacitor
 */
export const NativeFolderPicker = registerPlugin<NativeFolderPickerPlugin>("NativeFolderPicker");

/**
 * Función que invoca DIRECTAMENTE el Intent oficial de Android ACTION_OPEN_DOCUMENT_TREE (SAF)
 * mediante el plugin nativo de Capacitor.
 *
 * Abre la pantalla oficial del sistema del teléfono para que el usuario seleccione cualquier
 * carpeta de almacenamiento interno o tarjeta SD y pulse "Usar esta carpeta".
 *
 * Luego procesa las URIs nativas devueltas y las registra en IndexedDB utilizando sus rutas nativas
 * con `Capacitor.convertFileSrc(uri)` exactamente igual que 'Seleccionar Archivos', sin pasar por caché ni blobs.
 */
export async function pickAndScanNativeSafFolder(
  options: {
    filterShortAudios?: boolean;
    minDurationSeconds?: number;
    filterHiddenTracks?: boolean;
    onProgress?: (folder: string, discovered: number, processed: number, message: string) => void;
    onTrackDiscovered?: (track: Track) => void;
    isCancelled?: () => boolean;
  } = {}
): Promise<{ tracks: Track[]; cancelled: boolean; error?: string }> {
  const {
    filterShortAudios = true,
    minDurationSeconds = 30,
    filterHiddenTracks = true,
    onProgress,
    onTrackDiscovered,
    isCancelled,
  } = options;

  // 1. Verificar si estamos en entorno Android nativo
  if (!Capacitor.isNativePlatform()) {
    return {
      tracks: [],
      cancelled: false,
      error: "SAF_NOT_AVAILABLE_ON_WEB",
    };
  }

  try {
    onProgress?.("Sistema Android", 0, 0, "Abriendo selector oficial de carpetas del sistema (SAF)...");

    // 2. Invocar DIRECTAMENTE el Intent nativo de Android ACTION_OPEN_DOCUMENT_TREE
    const result = await NativeFolderPicker.pickFolder();

    if (result.cancelled || !result.files || result.files.length === 0) {
      return {
        tracks: [],
        cancelled: result.cancelled,
      };
    }

    const folderName = result.folderName || "Carpeta seleccionada";
    const totalFiles = result.files.length;
    const importedTracks: Track[] = [];
    let processedCount = 0;

    onProgress?.(folderName, totalFiles, 0, `Se detectaron ${totalFiles} archivos de audio en ${folderName}. Procesando...`);

    // 3. Procesamiento nativo de las canciones encontradas en el DocumentTree
    for (const fileItem of result.files) {
      if (isCancelled?.()) {
        break;
      }

      // Descartar notas de voz Push-To-Talk ('PTT-')
      if (/^PTT-/i.test(fileItem.name)) {
        continue;
      }

      const currentStep = processedCount + 1;
      onProgress?.(
        folderName,
        totalFiles,
        currentStep,
        `Registrando (${currentStep}/${totalFiles}): ${fileItem.name}`
      );

      try {
        // Generar URL para reproducción directa en <audio> mediante el puente nativo de Capacitor
        const webAudioUrl = Capacitor.convertFileSrc(fileItem.uri);

        // Medir o estimar duración
        const duration = await getAudioDuration(webAudioUrl, fileItem.size);

        // Filtro de duración: descarta audios de WhatsApp / sonidos breves menores a minDurationSeconds
        // Asegurarse de que el filtro NO descarte canciones si el metadato aún no se ha medido (duration <= 0)
        if (filterShortAudios && duration && duration > 0 && duration < minDurationSeconds) {
          continue;
        }

        // Obtener título y artista limpios a partir del nombre del archivo
        const { title, artist } = cleanFilename(fileItem.name);
        const coverUrl = generateCoverArt(title, artist);
        const format = fileItem.name.split(".").pop()?.toUpperCase() || "AUDIO";
        const albumName = fileItem.relativePath || folderName;

        // Estructura completa de la canción con su URI nativa persistida
        const parsedTrack: Track = {
          id: `native_saf_${encodeURIComponent(fileItem.uri)}`,
          title,
          artist,
          album: albumName,
          duration,
          url: webAudioUrl,
          nativePath: fileItem.uri,
          coverUrl,
          format,
          size: fileItem.size || 0,
          addedAt: Date.now(),
          isFavorite: false,
          folderPath: albumName,
          fileName: fileItem.name,
        };

        // Verificar si la pista está oculta en la biblioteca del usuario
        if (filterHiddenTracks && isTrackHidden(parsedTrack.title, parsedTrack.artist, fileItem.name)) {
          continue;
        }

        importedTracks.push(parsedTrack);
        processedCount++;

        // Guardado directo en IndexedDB y notificación inmediata para la UI
        await addSingleTrackToDB(parsedTrack);
        onTrackDiscovered?.(parsedTrack);
      } catch (trackErr) {
        console.warn(`[SAF Picker] Error procesando archivo ${fileItem.name}:`, trackErr);
      }
    }

    return {
      tracks: importedTracks,
      cancelled: false,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[SAF Picker] Error en selección de carpeta nativa:", err);
    return {
      tracks: [],
      cancelled: false,
      error: errorMsg,
    };
  }
}
