/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE BASE DE DATOS LOCAL (db.ts)
 * ============================================================================
 * Propósito y función del archivo:
 * Este archivo gestiona la persistencia de datos local de la aplicación utilizando
 * dos motores del navegador/dispositivo:
 * 1. IndexedDB: Almacena la colección de pistas de música (`tracks`), metadatos ID3,
 *    listas de reproducción (`playlists`) y favoritos (`favorites`).
 * 2. LocalStorage: Almacena la lista negra de pistas ocultas por el usuario (`ytm_hidden_tracks_list`).
 *
 * ¿Cómo funciona?:
 * - Para evitar saturar la memoria o violar cuotas de almacenamiento del navegador,
 *   NO se persisten objetos Blob gigantes ni ArrayBuffers en IndexedDB.
 * - En su lugar, se guardan los metadatos y la ruta física nativa (`nativePath`).
 * - Al cargar las pistas en Android/Capacitor, `loadTracksFromDB()` convierte
 *   dinámicamente las rutas nativas en URLs accesibles mediante `Capacitor.convertFileSrc(nativePath)`.
 *
 * Guía para futuras actualizaciones:
 * - Si se añade una nueva propiedad a la interfaz `Track`, incluirla en los mapeos
 *   de `saveTracksToDB()`, `addSingleTrackToDB()` y `loadTracksFromDB()`.
 * - Si se altera la estructura de los almacenes (ObjectStores), incrementar `DB_VERSION`.
 */

import { Capacitor } from "@capacitor/core";
import { Track, HiddenTrackRecord } from "../types";

const DB_NAME = "YouTubeMusicWebPlayerDB";
const DB_VERSION = 2; // Incrementar si se añaden nuevos ObjectStores
const STORE_TRACKS = "tracks";
const STORE_PLAYLISTS = "playlists";
const STORE_FAVORITES = "favorites";
const HIDDEN_TRACKS_STORAGE_KEY = "ytm_hidden_tracks_list";

/**
 * Función: getHiddenTracks
 * Propósito: Lee y devuelve la lista de pistas que el usuario ha decidido ocultar.
 * ¿Cómo funciona?:
 * Consulta `localStorage` bajo la clave `HIDDEN_TRACKS_STORAGE_KEY`.
 * Si existen registros, los deserializa desde JSON; si falla o no hay nada, devuelve un array vacío.
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
 * Función: addHiddenTrack
 * Propósito: Agrega una canción a la lista de pistas ocultas para no mostrarla en la biblioteca ni en escaneos.
 * ¿Cómo funciona?:
 * 1. Obtiene la lista actual de pistas ocultas.
 * 2. Comprueba duplicados evaluando: ID, nombre de archivo físico o combinación de título y artista normalizados.
 * 3. Si no existe, crea un registro `HiddenTrackRecord` con timestamp y lo guarda serializado en `localStorage`.
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
 * Función: removeHiddenTrack
 * Propósito: Desoculta una canción para que vuelva a estar visible en la biblioteca musical.
 * ¿Cómo funciona?:
 * Filtra el array de `localStorage` eliminando la coincidencia por ID, título o nombre de archivo,
 * y reescribe la clave en `localStorage`.
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
 * Función: clearAllHiddenTracks
 * Propósito: Restaura todas las canciones ocultas eliminando por completo la lista negra de LocalStorage.
 */
export function clearAllHiddenTracks(): void {
  try {
    localStorage.removeItem(HIDDEN_TRACKS_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear hidden tracks:", err);
  }
}

/**
 * Función: isTrackHidden
 * Propósito: Determina si un objeto Track o una canción específica está en la lista de exclusión.
 * ¿Cómo funciona?:
 * Compara por ID único, nombre de archivo o coincidencia estricta de título y artista en minúsculas.
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
 * Función: openDB
 * Propósito: Inicializa y abre la conexión asíncrona con la base de datos IndexedDB.
 * ¿Cómo funciona?:
 * Lanza `indexedDB.open(DB_NAME, DB_VERSION)`. Si se requiere actualización de esquema
 * (`onupgradeneeded`), crea los almacenes 'tracks', 'playlists' y 'favorites' si no existen.
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
 * Función: saveTracksToDB
 * Propósito: Persiste una colección completa de pistas en IndexedDB mediante una transacción readwrite.
 * ¿Cómo funciona?:
 * Itera el array de pistas, extrae la ruta nativa y almacena un registro ligero sin Blobs de memoria.
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
 * Función: saveTracksInChunks
 * Propósito: Guarda datos procesados en lotes (chunks) en IndexedDB para completar el escaneo de cientos de canciones en pocos segundos.
 * ¿Cómo funciona?:
 * Divide la lista de canciones en lotes de tamaño configurable (por defecto 25 o 50) y procesa cada lote
 * en una transacción atómica separada con un breve respiro para el hilo principal, garantizando alta velocidad
 * y sin congelar la interfaz de usuario.
 */
export async function saveTracksInChunks(
  tracks: Track[],
  chunkSize: number = 25,
  onProgress?: (savedCount: number, total: number) => void
): Promise<void> {
  if (!tracks || tracks.length === 0) return;

  for (let i = 0; i < tracks.length; i += chunkSize) {
    const chunk = tracks.slice(i, i + chunkSize);
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_TRACKS, "readwrite");
      const store = tx.objectStore(STORE_TRACKS);

      for (const track of chunk) {
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

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const currentCount = Math.min(i + chunk.length, tracks.length);
      onProgress?.(currentCount, tracks.length);

      // Breve respiro para no saturar el event loop en escaneos masivos
      await new Promise((r) => setTimeout(r, 0));
    } catch (chunkErr) {
      console.warn(`[IndexedDB] Error guardando lote en chunks (${i} a ${i + chunk.length}):`, chunkErr);
    }
  }
}

/**
 * Función: addSingleTrackToDB
 * Propósito: Guarda o actualiza una sola pista en IndexedDB al instante durante el escaneo en vivo.
 * ¿Cómo funciona?:
 * Ejecuta un `store.put(record)` inmediato para que el usuario no pierda el progreso si interrumpe el escaneo.
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
 * Función: loadTracksFromDB
 * Propósito: Recupera todas las pistas almacenadas previamente en la base de datos IndexedDB.
 * ¿Cómo funciona?:
 * 1. Obtiene todos los registros del almacén 'tracks'.
 * 2. Si se ejecuta en plataforma nativa (Capacitor Android/iOS), toma `nativePath` o la URL `file://`
 *    y la transforma con `Capacitor.convertFileSrc(...)` para que el elemento `<audio>` pueda reproducirla.
 * 3. Retorna un array ordenado de objetos `Track`.
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
          if (item.blob) {
            delete item.blob;
          }

          let finalUrl = item.url || "";
          const nativePath =
            item.nativePath ||
            (item.url?.startsWith("file://") || item.url?.startsWith("/storage/") ? item.url : undefined);

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
 * Función: removeTrackFromDB
 * Propósito: Elimina una canción específica de IndexedDB a partir de su ID único.
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
 * Función: removeMultipleTracksFromDB
 * Propósito: Elimina un conjunto de canciones de forma masiva en una sola transacción atómica.
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
 * Función: clearTracksDB
 * Propósito: Vacía por completo la tabla de pistas en IndexedDB (útil para restablecer la biblioteca).
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
 * Función: updateTrackInDb
 * Propósito: Actualiza los datos o etiquetas ID3 modificadas de una pista ya existente.
 */
export async function updateTrackInDb(track: Track): Promise<void> {
  return saveTracksToDB([track]);
}

