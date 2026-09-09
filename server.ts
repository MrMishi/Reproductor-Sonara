import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return aiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Helper function to query Gemini for lyrics with resilient retry and fallback models
async function fetchGeminiLyrics(cleanTrack: string, cleanArtist: string): Promise<string | null> {
  const ai = getAI();
  if (!ai) return null;

  const prompt = `Busca y proporciona la letra completa y fidedigna de la siguiente canción:
Título: "${cleanTrack}"
Artista: "${cleanArtist || "Desconocido"}"

Instrucciones:
1. PRESERVACIÓN ESTRICTA UTF-8: Si la canción es en japonés, coreano u otro idioma no latino, conserva con total fidelidad los caracteres nativos (Kanji, Hiragana, Katakana, Hangul) en codificación UTF-8 pura.
2. Para canciones en japonés o asiático: Si es posible, incluye el verso en caracteres nativos (Kanji/Hiragana) y a continuación o debajo su lectura fonética en Romaji para lectura de karaoke.
3. Organiza los versos claramente con saltos de línea legibles (separando estrofas, coro, etc.).
4. Si la canción es puramente instrumental, responde únicamente con "[Instrumental]".
5. NO agregues introducciones conversacionales ni comentarios extras como "Aquí está la letra...". Empieza directamente con los versos.`;

  // Fallback chain for text tasks using supported current Gemini models
  const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

  for (const model of candidateModels) {
    try {
      const geminiCall = ai.models.generateContent({
        model,
        contents: prompt,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini timeout after 7s")), 7000)
      );

      const geminiResponse: any = await Promise.race([geminiCall, timeoutPromise]);
      const lyricsText = geminiResponse?.text?.trim() || "";
      if (lyricsText && lyricsText.length > 15) {
        return lyricsText;
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[Lyrics AI] ${model} unavailable: ${errMsg.slice(0, 100)}`);
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

  // 1. Try LRCLib API (Open source lyrics database with synced timestamps)
  try {
    const queryParams = new URLSearchParams();
    if (cleanArtist) queryParams.set("artist_name", cleanArtist);
    queryParams.set("track_name", cleanTrack);
    if (album) queryParams.set("album_name", album);
    if (duration && Number(duration) > 0) queryParams.set("duration", Math.round(Number(duration)).toString());

    // First try exact get
    let lrcResponse = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" },
    });

    if (lrcResponse.ok) {
      const data = await lrcResponse.json();
      if (data && (data.syncedLyrics || data.plainLyrics)) {
        res.json({
          source: "lrclib",
          track: data.trackName || cleanTrack,
          artist: data.artistName || cleanArtist,
          plainLyrics: data.plainLyrics || "",
          syncedLyrics: data.syncedLyrics || null,
          instrumental: Boolean(data.instrumental),
        });
        return;
      }
    }

    // Fallback: LRCLib search query
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTrack}`.trim())}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" },
    });

    if (searchResponse.ok) {
      const list = await searchResponse.json();
      if (Array.isArray(list) && list.length > 0) {
        const best = list.find((item: any) => item.syncedLyrics || item.plainLyrics) || list[0];
        if (best && (best.syncedLyrics || best.plainLyrics)) {
          res.json({
            source: "lrclib-search",
            track: best.trackName || cleanTrack,
            artist: best.artistName || cleanArtist,
            album: best.albumName || undefined,
            plainLyrics: best.plainLyrics || "",
            syncedLyrics: best.syncedLyrics || null,
            instrumental: Boolean(best.instrumental),
          });
          return;
        }
      }
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
          res.json({
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
    res.json({
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
