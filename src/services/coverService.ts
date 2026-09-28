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

// Caché en memoria para búsquedas recientes
const coverCache = new Map<string, string | null>();

/**
 * Limpia el título y artista para maximizar la probabilidad de acierto en APIs públicas
 */
function cleanQueryTerm(term: string): string {
  if (!term) return "";
  return term
    .replace(/\.[a-zA-Z0-9]{2,4}$/, "") // Quitar extensión .mp3, .flac, etc.
    .replace(/\s*[\(\[](?:feat|ft|official|audio|video|remastered|version|lyric)[^\)\]]*[\)\]]/gi, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/**
 * Busca y obtiene la URL de la carátula en línea para una canción dada su artista y título.
 */
export async function buscarYObtenerCaratula(artist: string, title: string): Promise<string | null> {
  const cleanArtist = cleanQueryTerm(artist);
  const cleanTitle = cleanQueryTerm(title);

  if (!cleanTitle && !cleanArtist) {
    return null;
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
