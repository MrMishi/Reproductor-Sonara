import { Track } from "../types";

/**
 * Generate a deterministic colorful SVG gradient cover art for tracks that lack embedded album art
 */
export function generateCoverArt(title: string, artist: string): string {
  const seed = `${title}-${artist}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 45 + (Math.abs(hash) % 70)) % 360;
  const initial1 = (title.trim()[0] || "M").toUpperCase();
  const initial2 = (artist.trim()[0] || "").toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="grad-${Math.abs(hash)}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 75%, 45%)" />
        <stop offset="100%" stop-color="hsl(${hue2}, 85%, 25%)" />
      </linearGradient>
      <radialGradient id="disc-${Math.abs(hash)}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.15)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.4)" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#grad-${Math.abs(hash)})" />
    <circle cx="150" cy="150" r="110" fill="url(#disc-${Math.abs(hash)})" stroke="rgba(255,255,255,0.08)" stroke-width="6" />
    <circle cx="150" cy="150" r="40" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
    <circle cx="150" cy="150" r="14" fill="#111" />
    <text x="150" y="270" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${initial1}${initial2 ? " · " + initial2 : ""}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Parses ID3v2 tags from an ArrayBuffer slice (first 128KB of audio file)
 */
function parseID3v2(buffer: ArrayBuffer): {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  coverUrl?: string;
} {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return {};

  // Check header 'ID3'
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return {};
  }

  const version = bytes[3];
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);

  const maxLen = Math.min(bytes.length, 10 + size);
  let pos = 10;
  const result: {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    coverUrl?: string;
  } = {};

  const decoderUtf8 = new TextDecoder("utf-8");
  const decoderLatin1 = new TextDecoder("iso-8859-1");
  const decoderUtf16 = new TextDecoder("utf-16le");

  function decodeText(data: Uint8Array): string {
    if (data.length === 0) return "";
    const encoding = data[0];
    const textBytes = data.slice(1);
    try {
      if (encoding === 1 || encoding === 2) {
        return decoderUtf16.decode(textBytes).replace(/\0/g, "").trim();
      } else if (encoding === 3) {
        return decoderUtf8.decode(textBytes).replace(/\0/g, "").trim();
      } else {
        return decoderLatin1.decode(textBytes).replace(/\0/g, "").trim();
      }
    } catch {
      return decoderLatin1.decode(textBytes).replace(/\0/g, "").trim();
    }
  }

  while (pos + 10 < maxLen) {
    let frameId = "";
    let frameSize = 0;

    if (version === 3 || version === 4) {
      frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      if (version === 4) {
        frameSize =
          ((bytes[pos + 4] & 0x7f) << 21) |
          ((bytes[pos + 5] & 0x7f) << 14) |
          ((bytes[pos + 6] & 0x7f) << 7) |
          (bytes[pos + 7] & 0x7f);
      } else {
        frameSize =
          (bytes[pos + 4] << 24) |
          (bytes[pos + 5] << 16) |
          (bytes[pos + 6] << 8) |
          bytes[pos + 7];
      }
      pos += 10;
    } else {
      break;
    }

    if (frameSize <= 0 || pos + frameSize > maxLen || !/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameData = bytes.slice(pos, pos + frameSize);

    if (frameId === "TIT2" && !result.title) {
      result.title = decodeText(frameData);
    } else if ((frameId === "TPE1" || frameId === "TPE2") && !result.artist) {
      result.artist = decodeText(frameData);
    } else if (frameId === "TALB" && !result.album) {
      result.album = decodeText(frameData);
    } else if ((frameId === "TYER" || frameId === "TDRC") && !result.year) {
      result.year = decodeText(frameData);
    } else if (frameId === "APIC" && !result.coverUrl) {
      // Extract picture
      try {
        let p = 1;
        // Skip mime type
        let mime = "image/jpeg";
        const mimeEnd = frameData.indexOf(0, p);
        if (mimeEnd > p) {
          mime = decoderLatin1.decode(frameData.slice(p, mimeEnd)).trim();
          p = mimeEnd + 1;
        } else {
          p += 1;
        }
        // Skip picture type byte
        p += 1;
        // Skip description string
        const descEnd = frameData.indexOf(0, p);
        if (descEnd >= p) {
          p = descEnd + 1;
          // In some encodings, null is 2 bytes
          if (frameData[p] === 0) p += 1;
        }
        if (p < frameData.length) {
          const imgBytes = frameData.slice(p);
          const blob = new Blob([imgBytes], { type: mime || "image/jpeg" });
          result.coverUrl = URL.createObjectURL(blob);
        }
      } catch (e) {
        // cover parse fallback
      }
    }

    pos += frameSize;
  }

  return result;
}

/**
 * Cleans filename into structured title and artist
 */
function cleanFilename(fileName: string): { title: string; artist: string } {
  // Remove extension
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

  // Common patterns: "Artist - Title", "01 - Artist - Title", "01. Title", "Artist - 01 - Title"
  const splitDash = nameWithoutExt.split(/\s+-\s+/);
  if (splitDash.length >= 2) {
    // Check if first is track number
    if (/^\d+$/.test(splitDash[0].trim()) && splitDash.length >= 3) {
      return {
        artist: splitDash[1].trim(),
        title: splitDash.slice(2).join(" - ").trim(),
      };
    }
    return {
      artist: splitDash[0].replace(/^\d+[\s._-]+/, "").trim(),
      title: splitDash.slice(1).join(" - ").trim(),
    };
  }

  // "01 Title" or "01. Title"
  const cleanTitle = nameWithoutExt.replace(/^\d+[\s._-]+/, "").trim();
  return {
    title: cleanTitle || nameWithoutExt,
    artist: "Artista Desconocido",
  };
}

/**
 * Calculates audio duration asynchronously by loading metadata with fast timeout & estimation
 */
function getAudioDuration(url: string, fileSize?: number): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    let resolved = false;

    // Estimate duration based on file size (~128kbps = ~16KB/s) if metadata read is unavailable or slow
    const estimatedSec = fileSize && fileSize > 0
      ? Math.max(1, Math.min(900, Math.round(fileSize / (16 * 1024))))
      : 60;

    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.onerror = null;
      try {
        audio.src = "";
      } catch {
        // ignore
      }
    };

    const finish = (sec: number) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        cleanup();
        resolve(sec && !isNaN(sec) && isFinite(sec) && sec > 0 ? sec : estimatedSec);
      }
    };

    const timer = setTimeout(() => {
      finish(estimatedSec);
    }, 1500);

    audio.onloadedmetadata = () => {
      finish(audio.duration);
    };

    audio.ondurationchange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        finish(audio.duration);
      }
    };

    audio.onerror = () => {
      finish(estimatedSec);
    };

    try {
      audio.src = url;
      audio.load();
    } catch {
      finish(estimatedSec);
    }
  });
}

/**
 * Parses a File object into a rich Track object
 */
export async function parseAudioFile(file: File): Promise<Track> {
  const url = URL.createObjectURL(file);
  const { title: fallbackTitle, artist: fallbackArtist } = cleanFilename(file.name);

  let id3: { title?: string; artist?: string; album?: string; year?: string; coverUrl?: string } = {};

  try {
    // Read first 128KB for ID3v2 tags
    const slice = file.slice(0, 131072);
    const buffer = await slice.arrayBuffer();
    id3 = parseID3v2(buffer);
  } catch (err) {
    console.warn("Failed reading ID3 tags:", err);
  }

  const duration = await getAudioDuration(url, file.size);
  const finalTitle = id3.title || fallbackTitle;
  const finalArtist = id3.artist || fallbackArtist;
  const coverUrl = id3.coverUrl || generateCoverArt(finalTitle, finalArtist);

  return {
    id: `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: finalTitle,
    artist: finalArtist,
    album: id3.album || "Álbum del dispositivo",
    year: id3.year,
    duration,
    url,
    file,
    coverUrl,
    format: file.type || file.name.split(".").pop()?.toUpperCase() || "AUDIO",
    size: file.size,
    addedAt: Date.now(),
    isFavorite: false,
  };
}
