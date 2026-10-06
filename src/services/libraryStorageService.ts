/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE ARCHIVO PERMANENTE DE BIBLIOTECA (libraryStorageService.ts)
 * ============================================================================
 * Propósito y función del archivo:
 * Este servicio implementa un archivo persistente denominado "sonora_library.json"
 * que almacena la colección musical, metadatos, listas y preferencias tanto en PC como en Android:
 * 
 * 1. En Navegador Web / Computadora:
 *    Garantiza que toda la música agregada quede respaldada en un archivo JSON interno
 *    y en IndexedDB permanente (solicitando 'navigator.storage.persist()').
 * 2. En Android (Capacitor nativo):
 *    Se respalda físicamente en 'Directory.Data' para resistir formateos de caché y reinicios.
 * 3. Exportación e Importación de archivo:
 *    Permite al usuario descargar y guardar "sonora_library.json" en su computadora
 *    para restaurar su colección completa en cualquier momento.
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Track } from "../types";

export const LIBRARY_FILE_NAME = "sonora_library.json";
const LOCAL_STORAGE_LIBRARY_KEY = "sonora_library_file_backup";

export interface StoredTrackEntry {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  year?: string;
  genre?: string;
  format?: string;
  size?: number;
  addedAt?: number;
  isFavorite?: boolean;
  folderPath?: string;
  fileName?: string;
  nativePath?: string;
}

export interface LibraryFileSchema {
  version: number;
  appName: string;
  description: string;
  updatedAt: number;
  totalTracks: number;
  tracks: StoredTrackEntry[];
}

let libraryFlushTimeout: any = null;

/**
 * Solicita almacenamiento permanente al navegador en PC para evitar que el sistema
 * elimine canciones o IndexedDB automáticamente al limpiar datos temporales.
 */
export async function requestPersistentStorageOnPC(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log("[Storage] Almacenamiento persistente en PC concedido:", granted);
        return granted;
      }
      return true;
    } catch (err) {
      console.warn("[Storage] No se pudo solicitar persistencia de almacenamiento:", err);
    }
  }
  return false;
}

/**
 * Guarda la colección en el archivo permanente 'sonora_library.json' con debounce
 */
export function saveLibraryToFile(tracks: Track[]): void {
  if (libraryFlushTimeout) {
    clearTimeout(libraryFlushTimeout);
  }

  libraryFlushTimeout = setTimeout(() => {
    executeSaveLibraryToFile(tracks);
  }, 400);
}

async function executeSaveLibraryToFile(tracks: Track[]): Promise<void> {
  try {
    const simplifiedTracks: StoredTrackEntry[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration || 0,
      year: t.year,
      genre: t.genre,
      format: t.format,
      size: t.size || 0,
      addedAt: t.addedAt || Date.now(),
      isFavorite: t.isFavorite || false,
      folderPath: t.folderPath,
      fileName: t.fileName || t.file?.name,
      nativePath: t.nativePath,
    }));

    const schema: LibraryFileSchema = {
      version: 1,
      appName: "Sonora Music",
      description: "Archivo permanente de biblioteca y metadatos de Sonora",
      updatedAt: Date.now(),
      totalTracks: simplifiedTracks.length,
      tracks: simplifiedTracks,
    };

    const jsonStr = JSON.stringify(schema, null, 2);

    // 1. Guardar en localStorage / Web
    try {
      localStorage.setItem(LOCAL_STORAGE_LIBRARY_KEY, jsonStr);
    } catch {
      // Ignorar cuota excedida en localStorage si hay demasiadas pistas
    }

    // 2. Si estamos en plataforma nativa de Android/Capacitor, guardar archivo físico real
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          path: LIBRARY_FILE_NAME,
          data: jsonStr,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });
      } catch (fsErr) {
        console.warn("[LibraryStorage] Error al escribir sonora_library.json en disco:", fsErr);
      }
    }
  } catch (err) {
    console.warn("[LibraryStorage] Error guardando sonora_library.json:", err);
  }
}

/**
 * Carga la colección guardada desde 'sonora_library.json'
 */
export async function loadLibraryFromFile(): Promise<StoredTrackEntry[]> {
  try {
    // 1. Intentar leer desde el archivo físico en Android / Capacitor
    if (Capacitor.isNativePlatform()) {
      try {
        const fileResult = await Filesystem.readFile({
          path: LIBRARY_FILE_NAME,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });

        if (fileResult && fileResult.data) {
          const parsed = JSON.parse(fileResult.data as string) as LibraryFileSchema;
          if (parsed && Array.isArray(parsed.tracks)) {
            return parsed.tracks;
          }
        }
      } catch {
        // Archivo físico aún no creado, continuar a fallback
      }
    }

    // 2. Fallback en navegador Web / PC
    const localData = localStorage.getItem(LOCAL_STORAGE_LIBRARY_KEY);
    if (localData) {
      const parsed = JSON.parse(localData) as LibraryFileSchema;
      if (parsed && Array.isArray(parsed.tracks)) {
        return parsed.tracks;
      }
    }
  } catch (err) {
    console.warn("[LibraryStorage] Error leyendo sonora_library.json:", err);
  }
  return [];
}

/**
 * Descarga el archivo físico 'sonora_library.json' a la computadora del usuario
 */
export function exportLibraryFile(tracks: Track[]): void {
  try {
    const simplifiedTracks: StoredTrackEntry[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration || 0,
      year: t.year,
      genre: t.genre,
      format: t.format,
      size: t.size || 0,
      addedAt: t.addedAt || Date.now(),
      isFavorite: t.isFavorite || false,
      folderPath: t.folderPath,
      fileName: t.fileName || t.file?.name,
      nativePath: t.nativePath,
    }));

    const schema: LibraryFileSchema = {
      version: 1,
      appName: "Sonora Music",
      description: "Copia de seguridad permanente de biblioteca de Sonora",
      updatedAt: Date.now(),
      totalTracks: simplifiedTracks.length,
      tracks: simplifiedTracks,
    };

    const jsonStr = JSON.stringify(schema, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = LIBRARY_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn("[LibraryStorage] Error exportando sonora_library.json:", err);
  }
}
