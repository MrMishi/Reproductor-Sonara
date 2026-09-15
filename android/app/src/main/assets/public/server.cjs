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
var serverLyricsCache = /* @__PURE__ */ new Map();
async function fetchGeminiLyrics(cleanTrack, cleanArtist) {
  const ai = getAI();
  if (!ai) return null;
  const prompt = `Busca y proporciona la letra completa y fidedigna de la siguiente canci\xF3n:
T\xEDtulo: "${cleanTrack}"
Artista: "${cleanArtist || "Desconocido"}"

Instrucciones:
1. PRESERVACI\xD3N ESTRICTA UTF-8: Si la canci\xF3n es en japon\xE9s, coreano u otro idioma no latino, conserva con total fidelidad los caracteres nativos (Kanji, Hiragana, Katakana, Hangul) en codificaci\xF3n UTF-8 pura.
2. FORMATO INTERLINEAL ESTRICTO (L\xCDNEA POR L\xCDNEA): Si la canci\xF3n es en japon\xE9s, coloca la lectura fon\xE9tica Romaji L\xCDNEA POR L\xCDNEA inmediatamente debajo de cada verso original en caracteres nativos (Kanji/Kana). PROHIBIDO separar la canci\xF3n en dos bloques o mitades como '**[Kanji / Kana]**' o '**[Romaji]**'. NO uses encabezados ni etiquetas de bloque.
3. Organiza los versos claramente con saltos de l\xEDnea legibles entre estrofas.
4. Si la canci\xF3n es puramente instrumental, responde \xFAnicamente con "[Instrumental]".
5. NO agregues introducciones conversacionales ni comentarios extras como "Aqu\xED est\xE1 la letra...". Empieza directamente con los versos.`;
  const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
  for (const model of candidateModels) {
    try {
      const geminiCall = ai.models.generateContent({
        model,
        contents: prompt
      });
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Gemini timeout after 8s")), 8e3)
      );
      const geminiResponse = await Promise.race([geminiCall, timeoutPromise]);
      const lyricsText = geminiResponse?.text?.trim() || "";
      if (lyricsText && lyricsText.length > 15) {
        return lyricsText;
      }
    } catch (err) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes("503") || errMsg.includes("high demand")) {
        console.log(`[Lyrics AI] ${model} en alta demanda temporal, pasando al siguiente modelo disponible...`);
      } else if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        console.log(`[Lyrics AI] ${model} con l\xEDmite de cuota alcanzado, usando siguiente modelo...`);
      } else {
        console.log(`[Lyrics AI] ${model} no disponible (${errMsg.slice(0, 80)}), continuando...`);
      }
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
  const cacheKey = `${cleanArtist.toLowerCase()}:::${cleanTrack.toLowerCase()}`;
  if (serverLyricsCache.has(cacheKey)) {
    res.json(serverLyricsCache.get(cacheKey));
    return;
  }
  const reply = (payload) => {
    if (payload.plainLyrics || payload.syncedLyrics) {
      serverLyricsCache.set(cacheKey, payload);
    }
    res.json(payload);
  };
  try {
    const queryParams = new URLSearchParams();
    if (cleanArtist) queryParams.set("artist_name", cleanArtist);
    queryParams.set("track_name", cleanTrack);
    if (album) queryParams.set("album_name", album);
    if (duration && Number(duration) > 0) queryParams.set("duration", Math.round(Number(duration)).toString());
    let exactData = null;
    let lrcResponse = await fetch(`https://lrclib.net/api/get?${queryParams.toString()}`, {
      headers: { "User-Agent": "YouTubeMusicWebPlayer/1.0" }
    });
    if (lrcResponse.ok) {
      exactData = await lrcResponse.json();
      if (exactData && exactData.syncedLyrics) {
        reply({
          source: "lrclib",
          track: exactData.trackName || cleanTrack,
          artist: exactData.artistName || cleanArtist,
          plainLyrics: exactData.plainLyrics || "",
          syncedLyrics: exactData.syncedLyrics,
          instrumental: Boolean(exactData.instrumental)
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
        const syncedItem = list.find((item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0);
        if (syncedItem) {
          reply({
            source: "lrclib-search",
            track: syncedItem.trackName || cleanTrack,
            artist: syncedItem.artistName || cleanArtist,
            album: syncedItem.albumName || void 0,
            plainLyrics: syncedItem.plainLyrics || "",
            syncedLyrics: syncedItem.syncedLyrics,
            instrumental: Boolean(syncedItem.instrumental)
          });
          return;
        }
        if (exactData && exactData.plainLyrics) {
          reply({
            source: "lrclib",
            track: exactData.trackName || cleanTrack,
            artist: exactData.artistName || cleanArtist,
            plainLyrics: exactData.plainLyrics,
            syncedLyrics: null,
            instrumental: Boolean(exactData.instrumental)
          });
          return;
        }
        const plainItem = list.find((item) => item.plainLyrics && item.plainLyrics.trim().length > 0);
        if (plainItem) {
          reply({
            source: "lrclib-search",
            track: plainItem.trackName || cleanTrack,
            artist: plainItem.artistName || cleanArtist,
            album: plainItem.albumName || void 0,
            plainLyrics: plainItem.plainLyrics,
            syncedLyrics: null,
            instrumental: Boolean(plainItem.instrumental)
          });
          return;
        }
      }
    }
    if (exactData && exactData.plainLyrics) {
      reply({
        source: "lrclib",
        track: exactData.trackName || cleanTrack,
        artist: exactData.artistName || cleanArtist,
        plainLyrics: exactData.plainLyrics,
        syncedLyrics: null,
        instrumental: Boolean(exactData.instrumental)
      });
      return;
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
          reply({
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
    reply({
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
app.post("/api/lyrics/translate", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const { lines, text } = req.body;
  let inputLines = [];
  if (Array.isArray(lines)) {
    inputLines = lines.map((l) => typeof l === "string" ? l : "");
  } else if (typeof text === "string") {
    inputLines = text.split(/\r?\n/);
  }
  if (inputLines.length === 0) {
    res.json({ translations: [] });
    return;
  }
  const ai = getAI();
  if (ai) {
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];
    const prompt = `Traduce las siguientes l\xEDneas de versos musicales al espa\xF1ol de manera natural, po\xE9tica y fiel al significado de la canci\xF3n.
REGLAS ESTRICTAS:
1. Devuelve EXACTAMENTE una l\xEDnea traducida por cada l\xEDnea de entrada (mismo n\xFAmero de l\xEDneas).
2. Si una l\xEDnea de entrada est\xE1 vac\xEDa, devuelve una l\xEDnea vac\xEDa.
3. NO a\xF1adas introducciones conversacionales, notas, n\xFAmeros de verso ni explicaciones adicionales.
4. Responde \xDANICAMENTE con los versos traducidos, l\xEDnea por l\xEDnea.

L\xEDneas a traducir:
${inputLines.join("\n")}`;
    for (const model of candidateModels) {
      try {
        const geminiCall = ai.models.generateContent({
          model,
          contents: prompt
        });
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Gemini translation timeout")), 12e3)
        );
        const response = await Promise.race([geminiCall, timeoutPromise]);
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
      } catch (err) {
        console.warn(`[Lyrics Translation] Advertencia con modelo ${model}:`, err?.message || err);
      }
    }
  }
  try {
    const isJapanese = inputLines.some((l) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(l));
    const explicitLangpair = isJapanese ? "ja|es" : "en|es";
    const joinedText = inputLines.join("\n");
    if (joinedText.length <= 1e3) {
      const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(joinedText)}&langpair=${explicitLangpair}`;
      const fbRes = await fetch(fallbackUrl);
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        const translatedBlob = fbData?.responseData?.translatedText;
        if (typeof translatedBlob === "string" && translatedBlob.trim().length > 0) {
          const splitLines = translatedBlob.split(/\r?\n/);
          if (splitLines.length === inputLines.length) {
            res.json({ translations: splitLines });
            return;
          }
        }
      }
    }
  } catch (fbErr) {
    console.warn("[Lyrics Translation] Fallback translation error:", fbErr);
  }
  res.json({ translations: inputLines });
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
