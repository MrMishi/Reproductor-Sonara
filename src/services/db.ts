/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE BASE DE DATOS LOCAL (IndexedDB & LocalStorage)
 * ============================================================================
 * Responsabilidad:
 * Gestiona el almacenamiento local persistente de pistas de audio, metadatos,
 * archivos binarios (Audio Blobs y Letras .LRC), listas de reproducción y
 * registros de pistas ocultas.
 *
 * Características principales:
 * - Persistencia de Blobs de audio y archivos .LRC en IndexedDB ("YouTubeMusicWebPlayerDB").
 * - Restauración transparente de URLs temporales mediante URL.createObjectURL().
 * - Limpieza automática de pistas de 0 bytes o audio corrupto.
 * - Lista negra y filtrado de canciones ocultas en LocalStorage.
 */

import { Track, Playlist, HiddenTrackRecord } from "../types";

const DB_NAME = "YouTubeMusicWebPlayerDB";
const DB_VERSION = 1;
const STORE_TRACKS = "tracks";
const STORE_PLAYLISTS = "playlists";
const STORE_FAVORITES = "favorites";
const HIDDEN_TRACKS_STORAGE_KEY = "ytm_hidden_tracks_list";

/**
 * Obtiene la lista de pistas marcadas como ocultas por el usuario
 */
export function getHiddenTracks(): HiddenTrackRecord[] {
  try {
    const raw = localStorage.getItem(HIDDEN_TRACKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("Failed reading hidden tracks:", err);
    return [];
  }
}

/**
 * Agrega una pista a la lista de pistas ocultas (evita duplicados)
 */
export function addHiddenTrack(track: Track): void {
  try {
    const list = getHiddenTracks();
    const fileName = track.file?.name || "";
    // Evitar registros duplicados por ID, nombre de archivo o título/artista
    const exists = list.some(
      (h) =>
        h.id === track.id ||
        (fileName && h.fileName === fileName) ||
        (h.title.toLowerCase().trim() === track.title.toLowerCase().trim() &&
          h.artist.toLowerCase().trim() === track.artist.toLowerCase().trim())
    );

    if (!exists) {
      const record: HiddenTrackRecord = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        fileName,
        duration: track.duration,
        hiddenAt: Date.now(),
      };
      list.push(record);
      localStorage.setItem(HIDDEN_TRACKS_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (err) {
    console.warn("Failed to add hidden track:", err);
  }
}

/**
 * Remueve una pista de la lista de pistas ocultas
 */
export function removeHiddenTrack(idOrTitle: string): void {
  try {
    const list = getHiddenTracks().filter(
      (h) => h.id !== idOrTitle && h.title !== idOrTitle && h.fileName !== idOrTitle
    );
    localStorage.setItem(HIDDEN_TRACKS_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("Failed to remove hidden track:", err);
  }
}

/**
 * Vacía completamente la lista de pistas ocultas
 */
export function clearAllHiddenTracks(): void {
  try {
    localStorage.removeItem(HIDDEN_TRACKS_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear hidden tracks:", err);
  }
}

/**
 * Comprueba si una pista está en la lista de ocultas
 */
export function isTrackHidden(title: string, artist: string, fileName?: string): boolean {
  try {
    const list = getHiddenTracks();
    const cleanT = (title || "").toLowerCase().trim();
    const cleanA = (artist || "").toLowerCase().trim();
    const cleanF = (fileName || "").toLowerCase().trim();

    return list.some((h) => {
      if (cleanF && h.fileName && h.fileName.toLowerCase().trim() === cleanF) {
        return true;
      }
      if (
        cleanT &&
        h.title.toLowerCase().trim() === cleanT &&
        cleanA &&
        h.artist.toLowerCase().trim() === cleanA
      ) {
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Inicializa y abre la conexión con la base de datos IndexedDB local
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
        db.createObjectStore(STORE_FAVORITES, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Guarda o actualiza un array de pistas de audio y sus archivos binarios (.lrc y audio) en IndexedDB
 */
export async function saveTracksToDB(tracks: Track[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);

    for (const track of tracks) {
      // Clon serializable con todos los metadatos de la pista
      const serializable: any = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        coverUrl: track.coverUrl,
        year: track.year,
        genre: track.genre,
        format: track.format,
        size: track.size,
        addedAt: track.addedAt,
        isFavorite: track.isFavorite,
        lyrics: track.lyrics,
      };

      // Si existe un archivo o Blob de audio, se almacena directamente en IndexedDB
      if (track.file) {
        serializable.blob = track.file;
        serializable.fileName = track.file.name;
        serializable.fileType = track.file.type;
      }

      // Persistencia de archivo .lrc en IndexedDB
      if (track.lrcBlob) {
        serializable.lrcBlob = track.lrcBlob;
        serializable.lrcFileName = track.lrcFileName || `${track.artist} - ${track.title}.lrc`;
      } else if (track.lyrics?.rawLrc) {
        // Generar Blob .lrc a partir del texto de la letra si no existe el blob
        serializable.lrcBlob = new Blob([track.lyrics.rawLrc], { type: "text/plain;charset=utf-8" });
        serializable.lrcFileName = track.lrcFileName || `${track.artist} - ${track.title}.lrc`;
      }

      store.put(serializable);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Error saving tracks to IndexedDB:", err);
  }
}

/**
 * Carga todas las pistas persistidas desde IndexedDB y regenera los ObjectURLs
 */
export async function loadTracksFromDB(): Promise<Track[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = request.result || [];
        const loaded: Track[] = [];

        for (const item of records) {
          // Limpia automáticamente de la base de datos cualquier pista con 0 bytes o duración 0
          const isZeroBytes =
            (item.size !== undefined && item.size === 0) ||
            (item.blob && item.blob.size === 0);

          if (isZeroBytes || item.duration === 0) {
            console.warn(`Limpiando pista corrupta o de 0 bytes de IndexedDB: ${item.title} (${item.id})`);
            store.delete(item.id);
            continue;
          }

          let url = "";
          let file: File | undefined = undefined;

          // Reconstruir el archivo de audio desde el Blob
          if (item.blob) {
            file = new File([item.blob], item.fileName || "track.mp3", {
              type: item.fileType || "audio/mpeg",
            });
            url = URL.createObjectURL(file);
          }

          // Reconstruir archivo de letras .lrc si existe en el registro
          const lrcBlob: Blob | undefined = item.lrcBlob || undefined;
          const lrcFileName: string | undefined = item.lrcFileName || undefined;

          if (url || item.url) {
            loaded.push({
              id: item.id,
              title: item.title,
              artist: item.artist,
              album: item.album,
              duration: item.duration,
              url: url || item.url || "",
              file,
              coverUrl: item.coverUrl,
              year: item.year,
              genre: item.genre,
              format: item.format,
              size: item.size || file?.size,
              addedAt: item.addedAt,
              isFavorite: item.isFavorite,
              lyrics: item.lyrics,
              lrcBlob,
              lrcFileName,
            });
          }
        }

        resolve(loaded);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Error loading tracks from IndexedDB:", err);
    return [];
  }
}

/**
 * Elimina una pista de la base de datos IndexedDB por su ID
 */
export async function removeTrackFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    tx.objectStore(STORE_TRACKS).delete(id);
  } catch (e) {
    console.warn("Error removing track from db:", e);
  }
}

/**
 * Elimina múltiples pistas por sus IDs en una única transacción de IndexedDB
 */
export async function removeMultipleTracksFromDB(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);
    for (const id of ids) {
      store.delete(id);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("Error removing multiple tracks from db:", e);
  }
}

/**
 * Limpia y vacía por completo el almacén de pistas de la base de datos
 */
export async function clearTracksDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    tx.objectStore(STORE_TRACKS).clear();
  } catch (e) {
    console.warn("Error clearing tracks db:", e);
  }
}

