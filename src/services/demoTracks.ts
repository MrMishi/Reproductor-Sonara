import { Track } from "../types";
import { generateCoverArt } from "./metadataParser";

/**
 * Encodes an AudioBuffer into a WAV Blob
 */
function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels: Float32Array[] = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF chunk descriptor
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // FMT sub-chunk
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // subchunk1size (16 for PCM)
  setUint16(1); // audio format (1 = PCM)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample

  // data sub-chunk
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // data length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], { type: "audio/wav" });
}

/**
 * Synthesizes a melodic music piece using OfflineAudioContext
 */
async function synthesizeSong(
  style: "lofi" | "synthwave" | "acoustic",
  bpm: number,
  durationSec: number
): Promise<string> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, sampleRate * durationSec, sampleRate);

  const beatLen = 60 / bpm;
  const totalBeats = Math.floor(durationSec / beatLen);

  // Master bus
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.85;
  masterGain.connect(ctx.destination);

  // Scales
  const minorScale = [130.81, 146.83, 155.56, 174.61, 196.0, 207.65, 233.08, 261.63]; // C minor
  const synthScale = [110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 246.94, 293.66]; // A minor
  const chordRoots = style === "synthwave" ? [110, 87.3, 98, 130.8] : [130.8, 116.5, 98, 103.8];

  // 1. Kick & Snare / Percussion
  for (let b = 0; b < totalBeats; b++) {
    const t = b * beatLen;

    // Kick on 1 and 3 (or standard 4-on-floor for synthwave)
    if (style === "synthwave" || b % 2 === 0) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.frequency.setValueAtTime(140, t);
      kickOsc.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      kickGain.gain.setValueAtTime(0.7, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      kickOsc.connect(kickGain);
      kickGain.connect(masterGain);
      kickOsc.start(t);
      kickOsc.stop(t + 0.25);
    }

    // Snare / Clap on 2 and 4
    if (b % 2 === 1) {
      const snareNoise = ctx.createBuffer(1, sampleRate * 0.15, sampleRate);
      const output = snareNoise.getChannelData(0);
      for (let i = 0; i < output.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = snareNoise;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1000;
      const snareGain = ctx.createGain();
      snareGain.gain.setValueAtTime(0.35, t);
      snareGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      noiseSrc.connect(filter);
      filter.connect(snareGain);
      snareGain.connect(masterGain);
      noiseSrc.start(t);
      noiseSrc.stop(t + 0.16);
    }

    // Hi-hats every half-beat
    const hatTime = t + beatLen / 2;
    const hatBuffer = ctx.createBuffer(1, sampleRate * 0.04, sampleRate);
    const hatOut = hatBuffer.getChannelData(0);
    for (let i = 0; i < hatOut.length; i++) {
      hatOut[i] = Math.random() * 2 - 1;
    }
    const hatSrc = ctx.createBufferSource();
    hatSrc.buffer = hatBuffer;
    const hatFilter = ctx.createBiquadFilter();
    hatFilter.type = "bandpass";
    hatFilter.frequency.value = 7500;
    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(0.12, hatTime);
    hatGain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.035);
    hatSrc.connect(hatFilter);
    hatFilter.connect(hatGain);
    hatGain.connect(masterGain);
    hatSrc.start(hatTime);
    hatSrc.stop(hatTime + 0.04);
  }

  // 2. Chords & Bass
  for (let b = 0; b < totalBeats; b += 4) {
    const chordIdx = Math.floor(b / 4) % chordRoots.length;
    const root = chordRoots[chordIdx];
    const t = b * beatLen;

    // Bass note
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = style === "synthwave" ? "sawtooth" : "triangle";
    bassOsc.frequency.setValueAtTime(root / 2, t);
    bassGain.gain.setValueAtTime(0.4, t);
    bassGain.gain.exponentialRampToValueAtTime(0.01, t + beatLen * 3.8);
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = style === "synthwave" ? 380 : 250;
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start(t);
    bassOsc.stop(t + beatLen * 4);

    // Warm Chord pads (root, minor 3rd, 5th, 7th)
    const chordFreqs = [root, root * 1.1892, root * 1.4983, root * 1.7818];
    chordFreqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.005, t + beatLen * 3.9);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + beatLen * 4);
    });
  }

  // 3. Arpeggiated Melody
  const activeScale = style === "synthwave" ? synthScale : minorScale;
  for (let b = 0; b < totalBeats; b++) {
    if (b % 2 === 0 || style === "synthwave") {
      const t = b * beatLen;
      const noteFreq = activeScale[(b * 3 + 2) % activeScale.length] * 2;
      const leadOsc = ctx.createOscillator();
      const leadGain = ctx.createGain();
      leadOsc.type = style === "acoustic" ? "triangle" : "sine";
      leadOsc.frequency.setValueAtTime(noteFreq, t);

      leadGain.gain.setValueAtTime(0.15, t);
      leadGain.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 0.9);

      leadOsc.connect(leadGain);
      leadGain.connect(masterGain);
      leadOsc.start(t);
      leadOsc.stop(t + beatLen);
    }
  }

  const renderedBuffer = await ctx.startRendering();
  const wavBlob = bufferToWav(renderedBuffer);
  return URL.createObjectURL(wavBlob);
}

/**
 * Returns initial demo tracks with pre-configured lyrics and metadata
 */
export async function getInitialDemoTracks(): Promise<Track[]> {
  try {
    const [url1, url2, url3] = await Promise.all([
      synthesizeSong("synthwave", 120, 48),
      synthesizeSong("lofi", 85, 52),
      synthesizeSong("acoustic", 95, 45),
    ]);

    const track1: Track = {
      id: "demo-neon-nights",
      title: "Midnight Drive (Synthwave)",
      artist: "Cyber Cruiser",
      album: "Neon Horizons",
      duration: 48,
      url: url1,
      coverUrl: generateCoverArt("Midnight Drive", "Cyber Cruiser"),
      genre: "Synthwave / Electronic",
      format: "WAV High-Res",
      addedAt: Date.now() - 30000,
      isFavorite: true,
      lyrics: {
        plain: `[Estrofa 1]
Luces de neón reflejadas en el asfalto mojado
La ciudad duerme pero el motor sigue acelerando
Bajo el cielo violeta dejamos el pasado atrás
El ecualizador vibra en cada curva y compás.

[Coro]
Midnight drive, cruzando la frontera digital
Sonidos ochenteros en una noche sin final
Siente el bajo retumbar en tu pecho
La carretera infinita es nuestro techo.

[Estrofa 2]
Radares que brillan en el horizonte lejano
El sintetizador responde al toque de mi mano
Sonora encendido, la noche es eterna
Siente la frecuencia, la señal moderna.`,
        synced: [
          { time: 0, text: "♪ (Sintetizadores de apertura) ♪" },
          { time: 4, text: "Luces de neón reflejadas en el asfalto mojado" },
          { time: 9, text: "La ciudad duerme pero el motor sigue acelerando" },
          { time: 14, text: "Bajo el cielo violeta dejamos el pasado atrás" },
          { time: 18, text: "El ecualizador vibra en cada curva y compás." },
          { time: 24, text: "★ Midnight drive, cruzando la frontera digital" },
          { time: 29, text: "Sonidos ochenteros en una noche sin final" },
          { time: 34, text: "Siente el bajo retumbar en tu pecho" },
          { time: 38, text: "La carretera infinita es nuestro techo." },
          { time: 43, text: "♪ (Solo de arpegios y desvanecimiento) ♪" },
        ],
        source: "Demo Studio",
      },
    };

    const track2: Track = {
      id: "demo-lofi-coffee",
      title: "Café en la Lluvia (Lo-Fi Chill)",
      artist: "Luna Beats",
      album: "Sesiones de Medianoche",
      duration: 52,
      url: url2,
      coverUrl: generateCoverArt("Café en la Lluvia", "Luna Beats"),
      genre: "Lo-Fi / Chillhop",
      format: "WAV 24-bit",
      addedAt: Date.now() - 20000,
      isFavorite: true,
      lyrics: {
        plain: `Gotas de lluvia golpean suavemente el cristal
Una taza caliente y melodías de vinilo ambiental
Notas de piano suspendidas en el aire
El tiempo se detiene sin ningún afán.

Relaja la mente, ajusta el ecualizador
Los graves profundos ahogan todo dolor
Un compás tranquilo para respirar
Canciones guardadas listas para sonar.`,
        synced: [
          { time: 0, text: "♪ (Crujido de vinilo y piano suave) ♪" },
          { time: 5, text: "Gotas de lluvia golpean suavemente el cristal" },
          { time: 12, text: "Una taza caliente y melodías de vinilo ambiental" },
          { time: 20, text: "Notas de piano suspendidas en el aire" },
          { time: 27, text: "El tiempo se detiene sin ningún afán." },
          { time: 35, text: "Relaja la mente, ajusta el ecualizador" },
          { time: 42, text: "Los graves profundos ahogan todo dolor" },
          { time: 48, text: "♪ (Desvanecimiento relajante) ♪" },
        ],
        source: "Demo Studio",
      },
    };

    const track3: Track = {
      id: "demo-sunset-groove",
      title: "Atardecer Dorado (Groove & Bass)",
      artist: "Solsticio Project",
      album: "Vibraciones Cálidas",
      duration: 45,
      url: url3,
      coverUrl: generateCoverArt("Atardecer Dorado", "Solsticio Project"),
      genre: "Funk / Nu-Disco",
      format: "WAV Stereo",
      addedAt: Date.now() - 10000,
      isFavorite: false,
      lyrics: {
        plain: `El sol se oculta en un halo carmesí
Siente el ritmo fluyendo directo hacia ti
Las frecuencias medias suben la emoción
Canta las palabras de esta canción.

Baila con el bajo, gira en derredor
Un nuevo matiz en cada color
Sonora sonando en tu pantalla
La música libre nunca se apaga.`,
        synced: [
          { time: 0, text: "♪ (Línea de bajo y batería funk) ♪" },
          { time: 4, text: "El sol se oculta en un halo carmesí" },
          { time: 10, text: "Siente el ritmo fluyendo directo hacia ti" },
          { time: 17, text: "Las frecuencias medias suben la emoción" },
          { time: 23, text: "Canta las palabras de esta canción." },
          { time: 30, text: "Baila con el bajo, gira en derredor" },
          { time: 37, text: "Un nuevo matiz en cada color" },
          { time: 42, text: "♪ (Ritmo final brillante) ♪" },
        ],
        source: "Demo Studio",
      },
    };

    return [track1, track2, track3];
  } catch (e) {
    console.error("Error synthesizing demo audio:", e);
    return [];
  }
}
