/**
 * ============================================================================
 * SONARA MUSIC - SERVICIO DE BÚSQUEDA DE CARÁTULAS ONLINE (coverService.ts)
 * ============================================================================
 * Propósito y función del archivo:
 * Este servicio busca y descarga automáticamente la portada/carátula en alta
 * resolución para canciones locales o archivadas a partir del artista y título.
 * 
 * Estrategia de búsqueda resiliente:
 * 1. Limpieza de texto: Remueve sufijos innecesarios como "(feat. ...)", 
 *    "[Official Video]", extensiones ".mp3", etc., para optimizar la coincidencia.
 * 2. Motor principal (Deezer API): Consulta directa a la API de Deezer.
 * 3. Respaldo transparente (iTunes Search API con soporte CORS nativo): Si Deezer
 *    es bloqueado por CORS en el navegador o no retorna resultados, se consulta
 *    automáticamente a iTunes para obtener la carátula en alta definición (600x600).
 * 4. Caché en memoria para evitar llamadas redundantes de red para la misma pista.
 */

import { getCoverFromCache, saveCoverToFile, isCoverExplicitlyRemoved } from "./coverStorageService";

// Caché en memoria para búsquedas recientes de la sesión activa
const coverCache = new Map<string, string | null>();

/**
 * Interfaz para los resultados visuales de selección de carátulas (Estilo Poweramp)
 */
export interface CandidateCover {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  artist: string;
  album: string;
  source: string;
  resolution: string;
  year?: string;
}

/**
 * Limpia el título y artista para maximizar la probabilidad de acierto en APIs públicas
 */
export function cleanQueryTerm(term: string): string {
  if (!term) return "";
  return term
    .replace(/\.[a-zA-Z0-9]{2,4}$/, "") // Quitar extensión .mp3, .flac, etc.
    .replace(/\s*[\(\[](?:feat|ft|official|audio|video|remastered|version|lyric)[^\)\]]*[\)\]]/gi, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/**
 * Busca y obtiene la URL de la carátula en línea para una canción dada su artista y título.
 * 1. Verifica si fue eliminada explícitamente por el usuario (si fue eliminada, no sobreescribe).
 * 2. Consulta primero el archivo persistente sonora_covers.json. Si ya existe, retorna en 0ms sin internet.
 * 3. Si no existe, consulta Deezer e iTunes.
 * 4. Al encontrarla, la guarda permanentemente en sonora_covers.json.
 */
export async function buscarYObtenerCaratula(artist: string, title: string, fileName?: string): Promise<string | null> {
  const cleanArtist = cleanQueryTerm(artist);
  const cleanTitle = cleanQueryTerm(title);

  if (!cleanTitle && !cleanArtist) {
    return null;
  }

  // Si el usuario eliminó expresamente la carátula de esta canción, no buscar automáticamente
  if (isCoverExplicitlyRemoved(artist, title)) {
    return null;
  }

  // 0. VERIFICAR ARCHIVO PERMANENTE sonora_covers.json PRIMERO:
  // Si la portada ya fue guardada en el archivo físico o caché permanente, retornar de inmediato
  const savedCover = getCoverFromCache(artist, title, fileName);
  if (savedCover) {
    return savedCover;
  }

  const cacheKey = `${cleanArtist.toLowerCase()}:::${cleanTitle.toLowerCase()}`;
  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey) || null;
  }

  // 1. Intento con Deezer API
  try {
    const query = encodeURIComponent(`artist:"${cleanArtist}" track:"${cleanTitle}"`);
    const deezerUrl = `https://api.deezer.com/search?q=${query}&limit=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(deezerUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.data && data.data.length > 0 && data.data[0].album) {
        const album = data.data[0].album;
        const coverUrl = album.cover_xl || album.cover_big || album.cover_medium || album.cover;
        if (coverUrl) {
          coverCache.set(cacheKey, coverUrl);
          // Guardar permanentemente en sonora_covers.json
          saveCoverToFile(artist, title, coverUrl, fileName, undefined, "online");
          return coverUrl;
        }
      }
    }
  } catch (_deezerErr) {
    // Deezer puede fallar por restricciones CORS del navegador o timeout.
    // Continuamos silenciosamente al respaldo de iTunes.
  }

  // 2. Respaldo con iTunes Search API (Soporta CORS nativo sin restricciones y entrega arte de alta fidelidad)
  try {
    const searchTerm = encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim());
    const itunesUrl = `https://itunes.apple.com/search?term=${searchTerm}&entity=song&limit=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const itunesRes = await fetch(itunesUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData && itunesData.results && itunesData.results.length > 0) {
        const item = itunesData.results[0];
        const rawArtwork = item.artworkUrl100 || item.artworkUrl60;
        if (rawArtwork) {
          // Escalar a resolución de 600x600 para máxima nitidez en reproductor expandido
          const highResCover = rawArtwork.replace(/100x100bb\.(jpg|png|webp)/i, "600x600bb.$1");
          coverCache.set(cacheKey, highResCover);
          // Guardar permanentemente en sonora_covers.json
          saveCoverToFile(artist, title, highResCover, fileName, undefined, "online");
          return highResCover;
        }
      }
    }
  } catch (itunesErr) {
    console.warn("No se pudo obtener carátula en línea para:", cleanArtist, cleanTitle, itunesErr);
  }

  // Si no se encontró en ninguno, guardamos null en caché para evitar reintentos continuos
  coverCache.set(cacheKey, null);
  return null;
}

/**
 * Función: buscarMultiplesCaratulas (Selector estilo Poweramp)
 * Propósito: Busca y devuelve una lista de carátulas candidatas en alta resolución (600x600)
 * para que el usuario pueda ver todas las opciones en pantalla y elegir la portada exacta deseada.
 */
export async function buscarMultiplesCaratulas(
  artist: string,
  title: string,
  customQuery?: string
): Promise<CandidateCover[]> {
  const cleanA = cleanQueryTerm(artist);
  const cleanT = cleanQueryTerm(title);
  
  // Construir término de búsqueda efectivo
  let searchTerm = "";
  if (customQuery && customQuery.trim().length > 0) {
    searchTerm = customQuery.trim();
  } else if (cleanA && cleanT) {
    searchTerm = `${cleanA} ${cleanT}`;
  } else {
    searchTerm = cleanT || cleanA || "";
  }

  if (!searchTerm) {
    return [];
  }

  const resultsMap = new Map<string, CandidateCover>();

  // 1. Intento principal: Servidor Backend Proxy (/api/covers/search) - Sin bloqueos CORS
  try {
    const proxyRes = await fetch(`/api/covers/search?q=${encodeURIComponent(searchTerm)}`);
    if (proxyRes.ok) {
      const pData = await proxyRes.json();
      if (pData && Array.isArray(pData.results) && pData.results.length > 0) {
        for (const item of pData.results) {
          if (item && item.url && !resultsMap.has(item.url)) {
            resultsMap.set(item.url, item);
          }
        }
      }
    }
  } catch (_proxyErr) {
    // Si no está disponible el proxy, continuar a consultas directas
  }

  // 2. Consulta directa a iTunes (Canciones y Álbumes con soporte CORS total)
  if (resultsMap.size === 0) {
    try {
      const encodedTerm = encodeURIComponent(searchTerm);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      const [songsRes, albumsRes] = await Promise.allSettled([
        fetch(`https://itunes.apple.com/search?term=${encodedTerm}&entity=song&limit=30`, {
          signal: controller.signal,
        }),
        fetch(`https://itunes.apple.com/search?term=${encodedTerm}&entity=album&limit=20`, {
          signal: controller.signal,
        }),
      ]);
      clearTimeout(timeoutId);

      // Procesar canciones de iTunes
      if (songsRes.status === "fulfilled" && songsRes.value.ok) {
        const data = await songsRes.value.json();
        if (data && Array.isArray(data.results)) {
          for (const item of data.results) {
            const rawArt = item.artworkUrl100 || item.artworkUrl60;
            if (!rawArt) continue;

            const highRes = rawArt.replace(/100x100bb\.(jpg|png|webp)/i, "600x600bb.$1");
            const thumb = rawArt.replace(/100x100bb\.(jpg|png|webp)/i, "240x240bb.$1");

            if (!resultsMap.has(highRes)) {
              resultsMap.set(highRes, {
                id: `itunes-track-${item.trackId || Math.random().toString(36).substring(7)}`,
                url: highRes,
                thumbnailUrl: thumb,
                title: item.trackName || item.collectionName || searchTerm,
                artist: item.artistName || "Desconocido",
                album: item.collectionName || item.collectionCensoredName || "Sencillo / Álbum",
                source: "iTunes / Apple Music",
                resolution: "600 × 600",
                year: item.releaseDate ? item.releaseDate.slice(0, 4) : undefined,
              });
            }
          }
        }
      }

      // Procesar álbumes de iTunes
      if (albumsRes.status === "fulfilled" && albumsRes.value.ok) {
        const data = await albumsRes.value.json();
        if (data && Array.isArray(data.results)) {
          for (const item of data.results) {
            const rawArt = item.artworkUrl100 || item.artworkUrl60;
            if (!rawArt) continue;

            const highRes = rawArt.replace(/100x100bb\.(jpg|png|webp)/i, "600x600bb.$1");
            const thumb = rawArt.replace(/100x100bb\.(jpg|png|webp)/i, "240x240bb.$1");

            if (!resultsMap.has(highRes)) {
              resultsMap.set(highRes, {
                id: `itunes-album-${item.collectionId || Math.random().toString(36).substring(7)}`,
                url: highRes,
                thumbnailUrl: thumb,
                title: item.collectionName || item.collectionCensoredName || searchTerm,
                artist: item.artistName || "Desconocido",
                album: item.collectionName || "Álbum",
                source: "iTunes / Apple Music",
                resolution: "600 × 600",
                year: item.releaseDate ? item.releaseDate.slice(0, 4) : undefined,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("[coverService] Error buscando carátulas en iTunes:", err);
    }
  }

  // 2. Búsqueda en Deezer como fuente adicional
  try {
    const encodedDeezer = encodeURIComponent(searchTerm);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const deezerRes = await fetch(`https://api.deezer.com/search?q=${encodedDeezer}&limit=15`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (deezerRes.ok) {
      const data = await deezerRes.json();
      if (data && Array.isArray(data.data)) {
        for (const item of data.data) {
          if (!item.album) continue;
          const coverUrl =
            item.album.cover_xl || item.album.cover_big || item.album.cover_medium || item.album.cover;
          if (!coverUrl || resultsMap.has(coverUrl)) continue;

          resultsMap.set(coverUrl, {
            id: `deezer-${item.id || Math.random().toString(36).substring(7)}`,
            url: coverUrl,
            thumbnailUrl: item.album.cover_medium || coverUrl,
            title: item.title || searchTerm,
            artist: item.artist?.name || "Desconocido",
            album: item.album.title || "Álbum",
            source: "Deezer",
            resolution: "HD (1000 × 1000)",
          });
        }
      }
    }
  } catch (_deezerErr) {
    // Deezer puede bloquear CORS en navegadores, se omite silenciosamente
  }

  const allResults = Array.from(resultsMap.values());

  // Priorizar resultados que coincidan de manera más exacta con el artista buscado
  if (cleanA) {
    const lowerArtist = cleanA.toLowerCase();
    allResults.sort((a, b) => {
      const aMatches = a.artist.toLowerCase().includes(lowerArtist);
      const bMatches = b.artist.toLowerCase().includes(lowerArtist);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return 0;
    });
  }

  return allResults;
}
