var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_genai = require("@google/genai");
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "10mb" }));
var aiClient = null;
function getAI() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new import_genai.GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }
  return aiClient;
}
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
async function fetchGeminiLyrics(cleanTrack, cleanArtist) {
  const ai = getAI();
  if (!ai) return null;
  const prompt = `Busca y proporciona la letra completa y fidedigna de la siguiente canci\xF3n:
T\xEDtulo: "${cleanTrack}"
Artista: "${cleanArtist || "Desconocido"}"

Instrucciones:
1. PRESERVACI\xD3N ESTRICTA UTF-8: Si la canci\xF3n es en japon\xE9s, coreano u otro idioma no latino, conserva con total fidelidad los caracteres nativos (Kanji, Hiragana, Katakana, Hangul) en codificaci\xF3n UTF-8 pura.
2. Para canciones en japon\xE9s o asi\xE1tico: Si es posible, incluye el verso en caracteres nativos (Kanji/Hiragana) y a continuaci\xF3n o debajo su lectura fon\xE9tica en Romaji para lectura de karaoke.
3. Organiza los versos claramente con saltos de l\xEDnea legibles (separando estrofas, coro, etc.).
4. Si la canci\xF3n es puramente instrumental, responde \xFAnicamente con "[Instrumental]".
5. NO agregues introducciones conversacionales ni comentarios extras como "Aqu\xED est\xE1 la letra...". Empieza directamente con los versos.`;
  const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  for (const model of candidateModels) {
    try {
      const geminiCall = ai.models.generateContent({
        model,
        contents: prompt
      });
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Gemini timeout after 7s")), 7e3)
      );
      const geminiResponse = await Promise.race([geminiCall, timeoutPromise]);
      const lyricsText = geminiResponse?.text?.trim() || "";
      if (lyricsText && lyricsText.length > 15) {
        return lyricsText;
      }
    } catch (err) {
      const errMsg = err?.message || String(err);
      console.warn(`[Lyrics AI] ${model} unavailable: ${errMsg.slice(0, 100)}`);
    }
  }
  return null;
}
app.post("/api/lyrics/search", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const { track, artist, album, duration } = req.body;
  if (!track || typeof track !== "string") {
    res.status(400).json({ error: "Track title is required" });
    return;
  }
  const rawCleanTrack = track.replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|webm)$/i, "").trim();
  const cleanTrack = rawCleanTrack.replace(/\s*[\(\[](official\s*(music\s*)?video|official\s*audio|video\s*oficial|audio\s*oficial|remastered\s*\d*|lyrics\s*video|letra|4k|hd)[\)\]]/gi, "").trim();
  const cleanArtist = (artist || "").trim();
  try {
    const queryParams = new URLSearchParams();
    if (cleanArtist) queryParams.set("artist_name", cleanArtist);
    queryParams.set("track_name", cleanTrack);
    if (album) queryParams.set("album_name", album);
    if (duration && Number(duration) > 0) queryParams.set("duration", Math.round(Number(duration)).toString());
    let lrcResponse = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" }
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
          instrumental: Boolean(data.instrumental)
        });
        return;
      }
    }
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTrack}`.trim())}`;
    const searchResponse = await fetch(searchUrl, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" }
    });
    if (searchResponse.ok) {
      const list = await searchResponse.json();
      if (Array.isArray(list) && list.length > 0) {
        const best = list.find((item) => item.syncedLyrics || item.plainLyrics) || list[0];
        if (best && (best.syncedLyrics || best.plainLyrics)) {
          res.json({
            source: "lrclib-search",
            track: best.trackName || cleanTrack,
            artist: best.artistName || cleanArtist,
            album: best.albumName || void 0,
            plainLyrics: best.plainLyrics || "",
            syncedLyrics: best.syncedLyrics || null,
            instrumental: Boolean(best.instrumental)
          });
          return;
        }
      }
    }
  } catch (err) {
    console.warn("LrcLib lookup failed, falling back to alternatives:", err);
  }
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
            instrumental: false
          });
          return;
        }
      }
    } catch (e) {
    }
  }
  const geminiLyrics = await fetchGeminiLyrics(cleanTrack, cleanArtist);
  if (geminiLyrics) {
    res.json({
      source: "gemini",
      track: cleanTrack,
      artist: cleanArtist,
      plainLyrics: geminiLyrics,
      syncedLyrics: null,
      instrumental: geminiLyrics.toLowerCase().includes("[instrumental]")
    });
    return;
  }
  res.json({
    source: "none",
    track: cleanTrack,
    artist: cleanArtist,
    plainLyrics: "",
    syncedLyrics: null,
    instrumental: false,
    message: "No se encontraron letras en este momento o el servicio de IA est\xE1 con alta demanda. Puedes agregar la letra manualmente."
  });
});
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sonora Music Player running on http://0.0.0.0:${PORT}`);
  });
}
start().catch((err) => {
  console.error("Failed to start server:", err);
});
//# sourceMappingURL=server.cjs.map
