import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Search lyrics endpoint
app.post("/api/lyrics/search", async (req, res) => {
  const { track, artist, album, duration } = req.body;

  if (!track || typeof track !== "string") {
    res.status(400).json({ error: "Track title is required" });
    return;
  }

  const cleanTrack = track.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i, "").trim();
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
            plainLyrics: best.plainLyrics || "",
            syncedLyrics: best.syncedLyrics || null,
            instrumental: Boolean(best.instrumental),
          });
          return;
        }
      }
    }
  } catch (err) {
    console.warn("LrcLib lookup failed, falling back to Gemini:", err);
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

  // 3. Fallback to Gemini 3.8 Flash
  const ai = getAI();
  if (ai) {
    try {
      const prompt = `Busca y proporciona la letra completa y fidedigna de la siguiente canción:
Título: "${cleanTrack}"
Artista: "${cleanArtist || "Desconocido"}"

Instrucciones:
1. Proporciona la letra oficial original sin inventar palabras.
2. Organiza los versos claramente con saltos de línea legibles (separando estrofas, coro, etc.).
3. Si la canción es puramente instrumental, responde únicamente con "[Instrumental]".
4. NO agregues introducciones conversacionales ni comentarios extras como "Aquí está la letra...". Empieza directamente con los versos.`;

      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      const lyricsText = geminiResponse.text?.trim() || "";
      if (lyricsText && lyricsText.length > 15) {
        res.json({
          source: "gemini",
          track: cleanTrack,
          artist: cleanArtist,
          plainLyrics: lyricsText,
          syncedLyrics: null,
          instrumental: lyricsText.toLowerCase().includes("[instrumental]"),
        });
        return;
      }
    } catch (err: any) {
      console.error("Gemini lyrics lookup error:", err?.message || err);
    }
  }

  // If nothing found
  res.json({
    source: "none",
    track: cleanTrack,
    artist: cleanArtist,
    plainLyrics: "",
    syncedLyrics: null,
    instrumental: false,
    message: "No se encontraron letras en internet para este tema.",
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
    console.log(`YouTube Music Player running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
});
