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

// Media Download Info & Metadata extractor
app.post("/api/download/info", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL inválida o vacía" });
    return;
  }

  const cleanUrl = url.trim();

  try {
    // 1. YouTube Detection
    const ytMatch = cleanUrl.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v|shorts)\/))([a-zA-Z0-9_-]{11})/i
    );

    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      let title = "Audio de YouTube";
      let artist = "YouTube Creator";
      let thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          { headers: { "User-Agent": "SonoraMusicPlayer/2.0" } }
        );
        if (oembedRes.ok) {
          const data: any = await oembedRes.json();
          if (data.title) {
            title = data.title;
          }
          if (data.author_name) {
            artist = data.author_name.replace(/ - Topic$/i, "").trim();
          }
        }
      } catch (oeErr) {
        console.warn("YouTube oEmbed fetch error:", oeErr);
      }

      // Clean typical YouTube music video labels: "(Official Music Video)", "[Audio 4K]", etc.
      let cleanedTitle = title;
      if (title.includes(" - ")) {
        const parts = title.split(" - ");
        if (parts.length >= 2) {
          artist = parts[0].trim();
          cleanedTitle = parts.slice(1).join(" - ");
        }
      }
      cleanedTitle = cleanedTitle
        .replace(/\s*(\(|\[)(?:official\s*(?:video|audio|music\s*video)|lyric\s*video|audio|video\s*oficial|visualizer|remastered|4k|hd|hq|live|en\s*vivo).*?(\)|\])/gi, "")
        .replace(/["“”]/g, "")
        .trim();

      res.json({
        success: true,
        videoId,
        title: cleanedTitle || title,
        artist: artist || "YouTube Music",
        album: "YouTube Music",
        duration: 215, // standard radio duration approximation
        coverUrl: thumbnail,
        fallbackCoverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: "youtube",
        isDirectMedia: false,
      });
      return;
    }

    // 2. Direct Audio / Video Files
    const isDirectAudio = /\.(mp3|flac|wav|m4a|aac|ogg|opus)(\?.*)?$/i.test(cleanUrl);
    const isDirectVideo = /\.(mp4|webm|mkv)(\?.*)?$/i.test(cleanUrl);

    if (isDirectAudio || isDirectVideo) {
      const pathname = new URL(cleanUrl).pathname;
      const filename = decodeURIComponent(pathname.split("/").pop() || "audio.mp3");
      const withoutExt = filename.replace(/\.[^/.]+$/, "");
      let title = withoutExt;
      let artist = "Descarga Directa";

      if (withoutExt.includes(" - ")) {
        const parts = withoutExt.split(" - ");
        artist = parts[0].trim();
        title = parts.slice(1).join(" - ").trim();
      }

      res.json({
        success: true,
        title: title || "Canción Descargada",
        artist: artist || "Artista Web",
        album: "Descargas Directas",
        duration: 195,
        coverUrl: null,
        source: isDirectAudio ? "direct_audio" : "direct_video",
        isDirectMedia: true,
      });
      return;
    }

    // 3. Generic Web or Music Page
    let pageTitle = "";
    let ogImage = "";
    let ogArtist = "";

    try {
      const htmlRes = await fetch(cleanUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
        const ogSiteName = html.match(/<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i);

        pageTitle = ogTitleMatch?.[1] || titleMatch?.[1] || "";
        ogImage = ogImageMatch?.[1] || "";
        ogArtist = ogSiteName?.[1] || "";
      }
    } catch (scrapErr) {
      console.warn("Could not fetch page html for metadata:", scrapErr);
    }

    let finalTitle = pageTitle ? pageTitle.replace(/[\r\n\t]+/g, " ").trim() : "Pista de Audio Web";
    let finalArtist = ogArtist || "Artista Web";

    if (finalTitle.includes(" - ")) {
      const parts = finalTitle.split(" - ");
      finalArtist = parts[0].trim();
      finalTitle = parts.slice(1).join(" - ").trim();
    }

    res.json({
      success: true,
      title: finalTitle.substring(0, 100) || "Audio de Internet",
      artist: finalArtist || "Web Audio",
      album: "Descargas Web",
      duration: 180,
      coverUrl: ogImage || null,
      source: "web",
      isDirectMedia: false,
    });
  } catch (err: any) {
    console.error("Error in download info:", err);
    res.status(500).json({ error: "Error procesando el enlace: " + (err?.message || "Desconocido") });
  }
});

// YouTube Audio Extraction & Stream Resolver with Cobalt -> Piped -> Invidious Fallback
app.post("/api/download/youtube-audio", async (req, res) => {
  const { url, videoId, format, quality, provider } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({
      success: false,
      error: "No se pudo extraer el audio de YouTube. Verifica el enlace o prueba con un enlace directo de audio",
    });
    return;
  }

  const cleanUrl = url.trim();
  const ytMatch = cleanUrl.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v|shorts|live)\/))([a-zA-Z0-9_-]{11})/i
  );

  const resolvedVideoId = videoId || (ytMatch ? ytMatch[1] : null);
  if (!resolvedVideoId) {
    res.status(400).json({
      success: false,
      error: "No se pudo extraer el audio de YouTube. Verifica el enlace o prueba con un enlace directo de audio",
    });
    return;
  }

  const targetFormat = (format === "m4a" ? "m4a" : "mp3") as "mp3" | "m4a";
  const bitrateNum = quality === "128k" ? "128" : quality === "192k" ? "192" : "320";

  // Helper to sanitize and normalize mirror/API URLs
  const sanitizeApiUrl = (raw?: string): string | null => {
    if (!raw || typeof raw !== "string") return null;
    const match = raw.match(/https?:\/\/[^\s\)\>\]'"]+/);
    if (!match) return null;
    try {
      const parsed = new URL(match[0]);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname !== "/" ? parsed.pathname.replace(/\/$/, "") : ""}`;
    } catch {
      return null;
    }
  };

  // Step 1: Try Cobalt API (if provider is cobalt or auto)
  if (!provider || provider === "cobalt" || provider === "auto") {
    const rawCobalt = [
      process.env.COBALT_API_URL,
      "https://api.cobalt.tools/api/json",
      "https://api.cobalt.tools",
      "https://cobalt.tools/api/json",
      "https://cobalt.tools",
      "https://cobalt-api.kwiatekm.com/api/json",
      "https://cobalt.canine.tools/api/json",
    ];
    const cobaltInstances = rawCobalt
      .map(sanitizeApiUrl)
      .filter((u): u is string => Boolean(u));

    for (const instance of cobaltInstances) {
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "SonoraMusicPlayer/2.0",
        };
        if (process.env.COBALT_API_KEY) {
          headers["Authorization"] = `Bearer ${process.env.COBALT_API_KEY}`;
        }

        const cobaltRes = await fetch(instance, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: cleanUrl,
            downloadMode: "audio",
            audioFormat: "mp3",
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (cobaltRes.ok) {
          const cType = cobaltRes.headers.get("content-type") || "";
          if (cType.includes("application/json")) {
            const data: any = await cobaltRes.json().catch(() => null);
            const streamUrl = data?.url || data?.stream;
            if (streamUrl && typeof streamUrl === "string" && !streamUrl.includes("error")) {
              res.json({
                success: true,
                streamUrl,
                format: "mp3",
                bitrate: `${bitrateNum}k`,
                source: "cobalt",
              });
              return;
            }
          }
        }
      } catch {
        // Fallback silently to next mirror
      }
    }

    if (provider === "cobalt") {
      res.status(502).json({
        success: false,
        error: "Cobalt extraction failed",
      });
      return;
    }
  }

  // Helper to shuffle array for load-balancing / rotation
  function shuffleArray<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function appendTimestamp(url: string): string {
    if (!url) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}t=${Date.now()}`;
  }

  // Step 2: Try Piped API instances with dynamic rotation & fresh stream
  if (!provider || provider === "piped" || provider === "auto") {
    const rawPiped = [
      "https://pipedapi.kavin.rocks",
      "https://api.piped.privacydev.net",
      "https://pipedapi.adminforge.de",
      "https://pipedapi.leptons.xyz",
      "https://pipedapi.reallyaweso.me",
      "https://pipedapi.drgns.space",
      "https://api.piped.yt",
    ];
    const pipedInstances = shuffleArray(
      rawPiped
        .map(sanitizeApiUrl)
        .filter((u): u is string => Boolean(u))
    );

    for (const pipedHost of pipedInstances) {
      try {
        const freshUrl = appendTimestamp(`${pipedHost}/streams/${resolvedVideoId}`);
        const pipedRes = await fetch(freshUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "SonoraMusicPlayer/2.0",
          },
          signal: AbortSignal.timeout(4500),
        });

        if (pipedRes.ok) {
          const cType = pipedRes.headers.get("content-type") || "";
          if (cType.includes("application/json")) {
            const data: any = await pipedRes.json().catch(() => null);
            if (data) {
              const audioStreams: any[] = data.audioStreams || [];
              
              if (audioStreams.length > 0) {
                // Sort by bitrate descending to select highest quality
                const sorted = [...audioStreams].sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
                const best = sorted[0];
                if (best && best.url) {
                  const bestFormat = (best.format?.toLowerCase().includes("m4a") || best.mimeType?.includes("mp4"))
                    ? "m4a"
                    : "mp3";
                  const bitrateLabel = best.quality || (best.bitrate ? `${Math.round(best.bitrate / 1000)}k` : "160k");

                  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                  res.json({
                    success: true,
                    streamUrl: appendTimestamp(best.url),
                    format: bestFormat,
                    bitrate: bitrateLabel,
                    title: data.title,
                    artist: data.uploader,
                    duration: data.duration,
                    source: "piped",
                  });
                  return;
                }
              }

              // If no separate audioStream, check for progressive videoStream with audio
              const videoStreams: any[] = data.videoStreams || [];
              const withAudio = videoStreams.find((s: any) => !s.videoOnly && s.url && (s.itag === 18 || s.mimeType?.includes("mp4")));
              if (withAudio && withAudio.url) {
                res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                res.json({
                  success: true,
                  streamUrl: appendTimestamp(withAudio.url),
                  format: "m4a",
                  bitrate: "128k",
                  title: data.title,
                  artist: data.uploader,
                  duration: data.duration,
                  source: "piped",
                });
                return;
              }
            }
          }
        }
      } catch {
        // Fallback silently to next mirror
      }
    }

    if (provider === "piped") {
      res.status(502).json({
        success: false,
        error: "Piped extraction failed",
      });
      return;
    }
  }

  // Step 3: Try Invidious API instances with dynamic rotation & fresh stream
  const rawInvidious = [
    "https://invidious.nerdvpn.de",
    "https://inv.nadeko.net",
    "https://yewtu.be",
    "https://invidious.projectsegfau.lt",
    "https://invidious.private.coffee",
    "https://inv.tux.pizza",
    "https://invidious.asir.dev",
  ];
  const invidiousInstances = shuffleArray(
    rawInvidious
      .map(sanitizeApiUrl)
      .filter((u): u is string => Boolean(u))
  );

  for (const invHost of invidiousInstances) {
    try {
      // 1. Try Invidious Video API endpoint with cache buster
      const freshInvUrl = appendTimestamp(`${invHost}/api/v1/videos/${resolvedVideoId}`);
      const invRes = await fetch(freshInvUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });

      if (invRes.ok) {
        const cType = invRes.headers.get("content-type") || "";
        if (cType.includes("application/json")) {
          const invData: any = await invRes.json().catch(() => null);
          if (invData) {
            const adaptive: any[] = invData?.adaptiveFormats || [];
            const audioFormats = adaptive.filter((f: any) => f.type?.includes("audio") && f.url);
            if (audioFormats.length > 0) {
              audioFormats.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
              const best = audioFormats[0];
              const fmt = (best.container === "m4a" || best.type?.includes("mp4")) ? "m4a" : "mp3";
              res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
              res.json({
                success: true,
                streamUrl: appendTimestamp(best.url),
                format: fmt,
                bitrate: best.bitrate ? `${Math.round(best.bitrate / 1000)}k` : "128k",
                title: invData.title,
                artist: invData.author,
                duration: invData.lengthSeconds,
                source: "invidious",
              });
              return;
            }
          }
        }
      }

      // 2. Direct Invidious local stream check (itag 140 m4a)
      const streamCheck = await fetch(`${invHost}/latest_version?id=${resolvedVideoId}&itag=140&local=true`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3500),
      });

      if (streamCheck.ok) {
        const cType = streamCheck.headers.get("content-type") || "";
        const cLen = streamCheck.headers.get("content-length");
        const bytes = cLen ? parseInt(cLen, 10) : 0;
        if ((cType.includes("audio") || cType.includes("video")) && !cType.includes("text") && (!cLen || bytes > 100 * 1024)) {
          res.json({
            success: true,
            streamUrl: `${invHost}/latest_version?id=${resolvedVideoId}&itag=140&local=true`,
            format: "m4a",
            bitrate: "128k",
            source: "invidious",
          });
          return;
        }
      }
    } catch {
      // Fallback silently to next mirror
    }
  }

  // 4. If all external conversion/extraction APIs fail, return explicit error notice
  res.status(422).json({
    success: false,
    error: "No se pudo extraer el audio de YouTube. Verifica el enlace o prueba con un enlace directo de audio",
  });
});

// Audio proxy endpoint for direct media streams
app.get("/api/download/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).send("Target URL parameter is required");
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!upstream.ok || upstream.status !== 200) {
      res.status(upstream.status || 502).send(`Upstream returned ${upstream.status}`);
      return;
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    const contentLength = upstream.headers.get("content-length");

    // Si upstream devuelve HTML o JSON en vez de audio, rechazar
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      res.status(422).send("Upstream returned non-audio payload");
      return;
    }

    // Si Content-Length es menor a 100 KB, abortar para evitar archivos vacíos o corruptos
    if (contentLength && parseInt(contentLength, 10) < 100 * 1024) {
      res.status(422).send("Audio stream is smaller than 100 KB");
      return;
    }

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    const xTitle = upstream.headers.get("x-audio-title");
    const xThumb = upstream.headers.get("x-audio-thumbnail");
    const xArtist = upstream.headers.get("x-audio-artist");
    const xDuration = upstream.headers.get("x-audio-duration");
    if (xTitle) res.setHeader("X-Audio-Title", xTitle);
    if (xThumb) res.setHeader("X-Audio-Thumbnail", xThumb);
    if (xArtist) res.setHeader("X-Audio-Artist", xArtist);
    if (xDuration) res.setHeader("X-Audio-Duration", xDuration);
    res.setHeader("Access-Control-Expose-Headers", "X-Audio-Title, X-Audio-Thumbnail, X-Audio-Artist, X-Audio-Duration");

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.status(500).send("No readable stream");
      return;
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: any) {
    console.error("Proxy error:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).send("Proxy error: " + err?.message);
    }
  }
});

// JSON Proxy with CORS and extended 75s timeout for Render API
app.get("/api/download/proxy-json", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).json({ error: "Target URL is required" });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SonoraMusicPlayer/2.0",
      },
      signal: AbortSignal.timeout(75000), // Render container spin-up allowance
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      res.status(upstream.status).send(errText || `Upstream status ${upstream.status}`);
      return;
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err: any) {
    console.warn("Proxy JSON error:", err?.message || err);
    res.status(502).json({ error: "No se pudo conectar con el servidor: " + (err?.message || "Desconocido") });
  }
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
