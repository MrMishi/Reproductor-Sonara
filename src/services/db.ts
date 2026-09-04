import { Track, Playlist, HiddenTrackRecord } from "../types";

const DB_NAME = "YouTubeMusicWebPlayerDB";
const DB_VERSION = 1;
const STORE_TRACKS = "tracks";
const STORE_PLAYLISTS = "playlists";
const STORE_FAVORITES = "favorites";
const HIDDEN_TRACKS_STORAGE_KEY = "ytm_hidden_tracks_list";

export function getHiddenTracks(): HiddenTrackRecord[] {
  try {
    const raw = localStorage.getItem(HIDDEN_TRACKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("Failed reading hidden tracks:", err);
    return [];
  }
}

export function addHiddenTrack(track: Track): void {
  try {
    const list = getHiddenTracks();
    const fileName = track.file?.name || "";
    // Avoid duplicate entries
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

export function clearAllHiddenTracks(): void {
  try {
    localStorage.removeItem(HIDDEN_TRACKS_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear hidden tracks:", err);
  }
}

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

export async function saveTracksToDB(tracks: Track[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    const store = tx.objectStore(STORE_TRACKS);

    for (const track of tracks) {
      // Create a serializable clone (omit file / url if object url)
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

      // If file exists, IndexedDB can store File/Blob in modern browsers!
      if (track.file) {
        serializable.blob = track.file;
        serializable.fileName = track.file.name;
        serializable.fileType = track.file.type;
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

export async function loadTracksFromDB(): Promise<Track[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readonly");
    const store = tx.objectStore(STORE_TRACKS);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = request.result || [];
        const loaded: Track[] = records.map((item: any) => {
          let url = "";
          let file: File | undefined = undefined;

          if (item.blob) {
            file = new File([item.blob], item.fileName || "track.mp3", {
              type: item.fileType || "audio/mpeg",
            });
            url = URL.createObjectURL(file);
          }

          return {
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
            size: item.size,
            addedAt: item.addedAt,
            isFavorite: item.isFavorite,
            lyrics: item.lyrics,
          };
        });

        // Filter out those with valid playable urls
        resolve(loaded.filter((t) => t.url));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Error loading tracks from IndexedDB:", err);
    return [];
  }
}

export async function removeTrackFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    tx.objectStore(STORE_TRACKS).delete(id);
  } catch (e) {
    console.warn("Error removing track from db:", e);
  }
}

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

export async function clearTracksDB(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TRACKS, "readwrite");
    tx.objectStore(STORE_TRACKS).clear();
  } catch (e) {
    console.warn("Error clearing tracks db:", e);
  }
}
