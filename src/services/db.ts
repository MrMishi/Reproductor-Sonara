/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE BASE DE DATOS LOCAL (IndexedDB & LocalStorage)
 * ============================================================================
 * Persistencia nativa sin caché:
 * - NO almacena Blobs ni ArrayBuffers en IndexedDB.
 * - Guarda metadatos y la ruta nativa física absoluta ('file://...' o URI).
 * - En plataformas nativas, regenera la URL de reproducción directa con Capacitor.convertFileSrc.
 */

import { Capacitor } from "@capacitor/core";
import { Track, HiddenTrackRecord } from "../types";

const DB_NAME = "YouTubeMusicWebPlayerDB";
const DB_VERSION = 2; // Incremented for clean native-only schema
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
    const fileName = track.fileName || track.file?.name || "";
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
export function isTrackHidden(trackOrTitle: Track | string, artist?: string, fileName?: string): boolean {
  try {
    const list = getHiddenTracks();
    if (typeof trackOrTitle === "object" && trackOrTitle !== null) {
      const track = trackOrTitle as Track;
      const cleanT = (track.title || "").toLowerCase().trim();
      const cleanA = (track.artist || "").toLowerCase().trim();
      const cleanF = (track.fileName || track.file?.name || "").toLowerCase().trim();
      return list.some((h) => {
        if (h.id === track.id) return true;
        if (cleanF && h.fileName && h.fileName.toLowerCase().trim() === cleanF) return true;
        if (cleanT && h.title.toLowerCase().trim() === cleanT && cleanA && h.artist.toLowerCase().trim() === cleanA) return true;
        return false;
      });
    }

    const titleStr = typeof trackOrTitle === "string" ? trackOrTitle : "";
    const cleanT = (titleStr || "").toLowerCase().trim();
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
 * Guarda o actualiza un array de pistas en IndexedDB sin almacenar Blobs ni ArrayBuffers
 * Guarda únicamente la ruta nativa absoluta ('file://...' o URI) y los metadatos
 */
export async function saveTracksToDB(tracks: Track[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);

    for (const track of tracks) {
      const nativePath = track.nativePath || (track.url?.startsWith("file://") ? track.url : undefined);

      const record: any = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration || 0,
        coverUrl: track.coverUrl,
        year: track.year,
        genre: track.genre,
        format: track.format,
        size: track.size || 0,
        addedAt: track.addedAt || Date.now(),
        isFavorite: track.isFavorite || false,
        folderPath: track.folderPath,
        fileName: track.fileName || track.file?.name,
        lyrics: track.lyrics,
        nativePath: nativePath || track.nativePath,
        url: track.url,
      };

      store.put(record);
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
 * Guarda o actualiza una única pista en IndexedDB de forma inmediata
 * Registra la URL directa de Capacitor.convertFileSrc y la ruta nativa sin Blobs
 */
export async function addSingleTrackToDB(track: Track): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);

    const nativePath = track.nativePath || (track.url?.startsWith("file://") ? track.url : undefined);

    const record: any = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration || 0,
      coverUrl: track.coverUrl,
      year: track.year,
      genre: track.genre,
      format: track.format,
      size: track.size || 0,
      addedAt: track.addedAt || Date.now(),
      isFavorite: track.isFavorite || false,
      folderPath: track.folderPath,
      fileName: track.fileName || track.file?.name,
      lyrics: track.lyrics,
      nativePath: nativePath || track.nativePath,
      url: track.url,
    };

    store.put(record);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Error saving single track to IndexedDB:", err);
  }
}

/**
 * Carga todas las pistas persistidas desde IndexedDB
 * Para rutas nativas de dispositivo, regenera la URL válida con Capacitor.convertFileSrc
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
        const isNative = Capacitor.isNativePlatform();

        for (const item of records) {
          // Limpieza de datos heredados si existieran blobs de versiones anteriores
          if (item.blob) {
            delete item.blob;
          }

          let finalUrl = item.url || "";
          const nativePath =
            item.nativePath ||
            (item.url?.startsWith("file://") || item.url?.startsWith("/storage/") ? item.url : undefined);

          // Si estamos en entorno nativo y tenemos la ruta física o file://, regenerar URL válida con Capacitor.convertFileSrc
          if (isNative && nativePath) {
            finalUrl = Capacitor.convertFileSrc(nativePath);
          } else if (isNative && finalUrl && (finalUrl.startsWith("file://") || finalUrl.startsWith("/storage/"))) {
            finalUrl = Capacitor.convertFileSrc(finalUrl);
          }

          if (finalUrl) {
            const trackObj: Track = {
              id: item.id,
              title: item.title || "Sin título",
              artist: item.artist || "Artista desconocido",
              album: item.album || "Álbum desconocido",
              duration: item.duration || 0,
              url: finalUrl,
              nativePath: nativePath || item.nativePath,
              coverUrl: item.coverUrl,
              year: item.year,
              genre: item.genre,
              format: item.format,
              size: item.size || 0,
              addedAt: item.addedAt || Date.now(),
              isFavorite: item.isFavorite || false,
              lyrics: item.lyrics,
              folderPath: item.folderPath,
              fileName: item.fileName,
            };

            loaded.push(trackObj);
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

/**
 * Actualiza las etiquetas o metadatos de una pista existente en IndexedDB
 */
export async function updateTrackInDb(track: Track): Promise<void> {
  return saveTracksToDB([track]);
}
