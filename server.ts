/**
 * ============================================================================
 * SONARA MUSIC - SERVIDOR BACKEND EXPRESS Y PROXY DE LETRAS (server.ts)
 * ============================================================================
 * Propósito y función del archivo:
 * Este archivo constituye el servidor HTTP backend de Sonora Music.
 * Actúa como middleware de desarrollo con Vite (en local/preview) y servidor
 * de archivos estáticos (en producción), además de exponer endpoints API para
 * búsqueda de letras, verificación de salud (`/api/health`) y llamadas seguras
 * a la API de Gemini sin exponer claves al navegador.
 *
 * ¿Cómo funciona?:
 * 1. Endpoint `/api/health`: Permite comprobar la disponibilidad y estado del servidor.
 * 2. Endpoint `/api/lyrics/search`:
 *    - Limpia metadatos ruidosos de cadenas de texto (ej. "(Official Video)", "HD", etc.).
 *    - Nivel 1: Consulta la API abierta LRCLIB (`https://lrclib.net/api/get` o `/api/search`)
 *      para obtener letras con timestamps sincronizados (.lrc).
 *    - Nivel 2: Si falla o no hay datos, consulta Lyrics.ovh como proveedor secundario.
 *    - Nivel 3: Si no hay letras en bases abiertas, utiliza Google Gemini AI (`fetchGeminiLyrics`)
 *      para generar y transcribir fielmente los versos (con soporte nativo para kanji y romaji).
 * 3. Middleware de Vite: En desarrollo monta `createViteServer` en modo `middlewareMode`,
 *    y en producción sirve la compilación estática desde `/dist`.
 *
 * Guía para futuras actualizaciones:
 * - Toda nueva ruta de API debe registrarse antes de la llamada a `start()`.
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

/**
 * Cliente perezoso (lazy-initialization) de Google GenAI SDK.
 * Garantiza que la app no falle al arrancar si falta la clave en el entorno.
 */
let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return aiClient;
}

/**
 * Ruta de comprobación de salud del servidor
 */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In-memory cache for server-side lyrics searches
const serverLyricsCache = new Map<string, any>();

/**
 * Función: fetchGeminiLyrics
 * Propósito: Consulta a Gemini AI para transcribir la letra fiel de una canción.
 * ¿Cómo funciona?:
 * Envía un prompt estructurado exigiendo preservación Unicode UTF-8 de caracteres
 * nativos asiáticos y transliteración fonética Romaji, recorriendo modelos candidatos.
 * Prioriza 'gemini-3.1-flash-lite' por su alta disponibilidad y velocidad,
 * con fallback a 'gemini-3.8-flash'.
 */
async function fetchGeminiLyrics(cleanTrack: string, cleanArtist: string): Promise<string | null> {
  const ai = getAI();
  if (!ai) return null;

  const prompt = `Busca y proporciona la letra completa y fidedigna de la siguiente canción:
Título: "${cleanTrack}"
Artista: "${cleanArtist || "Desconocido"}"

Instrucciones:
1. PRESERVACIÓN ESTRICTA UTF-8: Si la canción es en japonés, coreano u otro idioma no latino, conserva con total fidelidad los caracteres nativos (Kanji, Hiragana, Katakana, Hangul) en codificación UTF-8 pura.
2. FORMATO INTERLINEAL ESTRICTO (LÍNEA POR LÍNEA): Si la canción es en japonés, coloca la lectura fonética Romaji LÍNEA POR LÍNEA inmediatamente debajo de cada verso original en caracteres nativos (Kanji/Kana). PROHIBIDO separar la canción en dos bloques o mitades como '**[Kanji / Kana]**' o '**[Romaji]**'. NO uses encabezados ni etiquetas de bloque.
3. Organiza los versos claramente con saltos de línea legibles entre estrofas.
4. Si la canción es puramente instrumental, responde únicamente con "[Instrumental]".
5. NO agregues introducciones conversacionales ni comentarios extras como "Aquí está la letra...". Empieza directamente con los versos.`;

  // Fallback chain: gemini-3.1-flash-lite (fast, highly available, separate quota) -> gemini-3.8-flash
  const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];

  for (const model of candidateModels) {
    try {
      const geminiCall = ai.models.generateContent({
        model,
        contents: prompt,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini timeout after 8s")), 8000)
      );

      const geminiResponse: any = await Promise.race([geminiCall, timeoutPromise]);
      const lyricsText = geminiResponse?.text?.trim() || "";
      if (lyricsText && lyricsText.length > 15) {
        return lyricsText;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("503") || errMsg.includes("high demand")) {
        console.log(`[Lyrics AI] ${model} en alta demanda temporal, pasando al siguiente modelo disponible...`);
      } else if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        console.log(`[Lyrics AI] ${model} con límite de cuota alcanzado, usando siguiente modelo...`);
      } else {
        console.log(`[Lyrics AI] ${model} no disponible (${errMsg.slice(0, 80)}), continuando...`);
      }
    }
  }

  return null;
}

// Search lyrics endpoint
app.post("/api/lyrics/search", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const { track, artist, album, duration } = req.body;

  if (!track || typeof track !== "string") {
    res.status(400).json({ error: "Track title is required" });
    return;
  }

  const rawCleanTrack = track.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|webm)$/i, "").trim();
  // Strip common YouTube / video clutter like (Official Video), [Audio Oficial], etc.
  const cleanTrack = rawCleanTrack
    .replace(/\s*[\(\[](official\s*(music\s*)?video|official\s*audio|video\s*oficial|audio\s*oficial|remastered\s*\d*|lyrics\s*video|letra|4k|hd)[\)\]]/gi, "")
    .trim();
  const cleanArtist = (artist || "").trim();
  const cacheKey = `${cleanArtist.toLowerCase()}:::${cleanTrack.toLowerCase()}`;

  // Comprobar si ya existe en la caché en memoria del servidor
  if (serverLyricsCache.has(cacheKey)) {
    res.json(serverLyricsCache.get(cacheKey));
    return;
  }

  const reply = (payload: any) => {
    if (payload.plainLyrics || payload.syncedLyrics) {
      serverLyricsCache.set(cacheKey, payload);
    }
    res.json(payload);
  };

  // 1. Try LRCLib API (Open source lyrics database with synced timestamps)
  try {
    const queryParams = new URLSearchParams();
    if (cleanArtist) queryParams.set("artist_name", cleanArtist);
    queryParams.set("track_name", cleanTrack);
    if (album) queryParams.set("album_name", album);
    if (duration && Number(duration) > 0) queryParams.set("duration", Math.round(Number(duration)).toString());

    // PRIORIZAR LETRAS SINCRONIZADAS (SYNCED LYRICS)
    // 1. Primer intento: consulta exacta por metadatos en LRCLIB
    let exactData: any = null;
    let lrcResponse = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" },
    });

    if (lrcResponse.ok) {
      exactData = await lrcResponse.json();
      // Si la consulta exacta ya contiene letras sincronizadas con marcas de tiempo, devolverla de inmediato
      if (exactData && exactData.syncedLyrics) {
        reply({
          source: "lrclib",
          track: exactData.trackName || cleanTrack,
          artist: exactData.artistName || cleanArtist,
          plainLyrics: exactData.plainLyrics || "",
          syncedLyrics: exactData.syncedLyrics,
          instrumental: Boolean(exactData.instrumental),
        });
        return;
      }
    }

    // 2. Segundo intento: búsqueda amplia en LRCLIB priorizando estrictamente cualquier resultado sincronizado
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTrack}`.trim())}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" },
    });

    if (searchResponse.ok) {
      const list = await searchResponse.json();
      if (Array.isArray(list) && list.length > 0) {
        // Priorizar estrictamente canciones con syncedLyrics
        const syncedItem = list.find((item: any) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
        if (syncedItem) {
          reply({
            source: "lrclib-search",
            track: syncedItem.trackName || cleanTrack,
            artist: syncedItem.artistName || cleanArtist,
            album: syncedItem.albumName || undefined,
            plainLyrics: syncedItem.plainLyrics || "",
            syncedLyrics: syncedItem.syncedLyrics,
            instrumental: Boolean(syncedItem.instrumental),
          });
          return;
        }

        // Si no hay versión sincronizada pero la consulta exacta tenía texto plano, usar la exacta
        if (exactData && exactData.plainLyrics) {
          reply({
            source: "lrclib",
            track: exactData.trackName || cleanTrack,
            artist: exactData.artistName || cleanArtist,
            plainLyrics: exactData.plainLyrics,
            syncedLyrics: null,
            instrumental: Boolean(exactData.instrumental),
          });
          return;
        }

        // Fallback a texto plano del listado de búsqueda
        const plainItem = list.find((item: any) => item.plainLyrics && item.plainLyrics.trim().length > 0);
        if (plainItem) {
          reply({
            source: "lrclib-search",
            track: plainItem.trackName || cleanTrack,
            artist: plainItem.artistName || cleanArtist,
            album: plainItem.albumName || undefined,
            plainLyrics: plainItem.plainLyrics,
            syncedLyrics: null,
            instrumental: Boolean(plainItem.instrumental),
          });
          return;
        }
      }
    }

    // Si la búsqueda no arrojó resultados pero exactData tenía texto plano
    if (exactData && exactData.plainLyrics) {
      reply({
        source: "lrclib",
        track: exactData.trackName || cleanTrack,
        artist: exactData.artistName || cleanArtist,
        plainLyrics: exactData.plainLyrics,
        syncedLyrics: null,
        instrumental: Boolean(exactData.instrumental),
      });
      return;
    }
  } catch (err) {
    console.warn("LrcLib lookup failed, falling back to alternatives:", err);
  }

  // 2. Try lyrics.ovh as secondary open API
  if (cleanArtist) {
    try {
      const ovhRes = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTrack)}`
      );
      if (ovhRes.ok) {
        const ovhData = await ovhRes.json();
        if (ovhData && ovhData.lyrics) {
          reply({
            source: "lyrics.ovh",
            track: cleanTrack,
            artist: cleanArtist,
            plainLyrics: ovhData.lyrics.trim(),
            syncedLyrics: null,
            instrumental: false,
          });
          return;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Resilient Gemini AI Lookup with auto-retries and model failover
  const geminiLyrics = await fetchGeminiLyrics(cleanTrack, cleanArtist);
  if (geminiLyrics) {
    reply({
      source: "gemini",
      track: cleanTrack,
      artist: cleanArtist,
      plainLyrics: geminiLyrics,
      syncedLyrics: null,
      instrumental: geminiLyrics.toLowerCase().includes("[instrumental]"),
    });
    return;
  }

  // If nothing found or temporary AI demand spike
  res.json({
    source: "none",
    track: cleanTrack,
    artist: cleanArtist,
    plainLyrics: "",
    syncedLyrics: null,
    instrumental: false,
    message: "No se encontraron letras en este momento o el servicio de IA está con alta demanda. Puedes agregar la letra manualmente.",
  });
});

/**
 * ============================================================================
 * ENDPOINT: /api/lyrics/translate
 * ============================================================================
 * Propósito:
 * Recibe un conjunto de líneas o versos de canciones y devuelve su significado
 * traducido al español, preservando estrictamente la correspondencia línea a línea.
 * 
 * ¿Cómo funciona?:
 * 1. Comprueba si hay cliente Gemini configurado (`getAI()`) y prueba con
 *    'gemini-3.1-flash-lite' y failover a 'gemini-3.8-flash'.
 * 2. Exige correspondencia 1:1 de líneas para no alterar la estructura de estrofas.
 * 3. En caso de timeout o cuota excedida de IA, utiliza un fallback con MyMemory API
 *    para garantizar que el usuario siempre reciba su traducción sin interrupciones.
 */
app.post("/api/lyrics/translate", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const { lines, text } = req.body;

  let inputLines: string[] = [];
  if (Array.isArray(lines)) {
    inputLines = lines.map((l) => (typeof l === "string" ? l : ""));
  } else if (typeof text === "string") {
    inputLines = text.split(/\r?\n/);
  }

  if (inputLines.length === 0) {
    res.json({ translations: [] });
    return;
  }

  // 1. Intentar traducción con Gemini AI
  const ai = getAI();
  if (ai) {
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
    const prompt = `Traduce las siguientes líneas de versos musicales al español de manera natural, poética y fiel al significado de la canción.
REGLAS ESTRICTAS:
1. Devuelve EXACTAMENTE una línea traducida por cada línea de entrada (mismo número de líneas).
2. Si una línea de entrada está vacía, devuelve una línea vacía.
3. NO añadas introducciones conversacionales, notas, números de verso ni explicaciones adicionales.
4. Responde ÚNICAMENTE con los versos traducidos, línea por línea.

Líneas a traducir:
${inputLines.join("\n")}`;

    for (const model of candidateModels) {
      try {
        const geminiCall = ai.models.generateContent({
          model,
          contents: prompt,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini translation timeout")), 12000)
        );

        const response: any = await Promise.race([geminiCall, timeoutPromise]);
        const outputText = response?.text || "";
        if (outputText && outputText.trim().length > 0) {
          const rawTranslatedLines = outputText.split(/\r?\n/);
          if (rawTranslatedLines.length >= inputLines.length) {
            const translations = inputLines.map((orig, i) => {
              if (!orig.trim()) return "";
              return (rawTranslatedLines[i] || "").trim();
            });
            res.json({ translations });
            return;
          } else {
            const translations = inputLines.map((orig, i) => {
              if (!orig.trim()) return "";
              return (rawTranslatedLines[i] || "").trim() || orig;
            });
            res.json({ translations });
            return;
          }
        }
      } catch (err: any) {
        console.warn(`[Lyrics Translation] Advertencia con modelo ${model}:`, err?.message || err);
      }
    }
  }

  // 2. Fallback de traducción resiliente en caso de indisponibilidad de IA
  try {
    const translations: string[] = [];
    for (const line of inputLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        translations.push("");
        continue;
      }
      try {
        const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=auto|es`;
        const fbRes = await fetch(fallbackUrl);
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          if (fbData?.responseData?.translatedText) {
            translations.push(fbData.responseData.translatedText);
            continue;
          }
        }
      } catch {
        // Fallback por línea individual
      }
      translations.push(trimmed);
    }
    res.json({ translations });
    return;
  } catch (fbErr) {
    console.warn("[Lyrics Translation] Fallback translation error:", fbErr);
  }

  // 3. Si todo lo demás falla, responder con las líneas originales
  res.json({ translations: inputLines });
});

// Start server with Vite or static
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sonora Music Player running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
});
