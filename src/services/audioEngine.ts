/**
 * ============================================================================
 * SONARA MUSIC - MOTOR DE AUDIO Y ECUALIZADOR (audioEngine.ts)
 * ============================================================================
 * Propósito y arquitectura técnica:
 * Este módulo gestiona la cadena de procesamiento de audio en tiempo real utilizando
 * la Web Audio API del navegador. Modela un rack de efectos Hi-Fi modular conectado
 * directamente a la etiqueta `<audio>` de HTML5:
 *
 * Cadena de nodos de audio (Audio Graph):
 * [HTMLAudioElement]
 *   -> MediaElementAudioSourceNode (Captura de señal limpia)
 *   -> GainNode (Preamplificador: -6 dB a +6 dB)
 *   -> BiquadFilterNode[] (10 Bandas paramétricas: 31 Hz a 16 kHz)
 *   -> BiquadFilterNode (Bass Boost: Filtro Low-shelf centrado en 80 Hz)
 *   -> AnalyserNode (FFT para visualizadores de espectro y forma de onda)
 *   -> AudioDestinationNode (Salida a altavoces / auriculares)
 *
 * Características para futuras actualizaciones:
 * - Compatible con navegadores móviles y políticas de reproducción automática (Auto-play).
 * - Modulación de parámetros en rampa asíncrona (`setTargetAtTime`) para evitar chasquidos (audio clicks/pops).
 * - Pausa con rampa de desvanecimiento suave (Fade Out de 2s) para el temporizador de sueño.
 */

import { EqualizerBand, EqualizerPreset } from "../types";

/**
 * Configuración predeterminada de las 10 bandas del ecualizador.
 * Abarca desde sub-graves (31 Hz) hasta agudos cristalinos (16 kHz).
 */
export const DEFAULT_BANDS: EqualizerBand[] = [
  { frequency: 31, gain: 0, type: "lowshelf", label: "31 Hz" },
  { frequency: 62, gain: 0, type: "peaking", label: "62 Hz" },
  { frequency: 125, gain: 0, type: "peaking", label: "125 Hz" },
  { frequency: 250, gain: 0, type: "peaking", label: "250 Hz" },
  { frequency: 500, gain: 0, type: "peaking", label: "500 Hz" },
  { frequency: 1000, gain: 0, type: "peaking", label: "1 kHz" },
  { frequency: 2000, gain: 0, type: "peaking", label: "2 kHz" },
  { frequency: 4000, gain: 0, type: "peaking", label: "4 kHz" },
  { frequency: 8000, gain: 0, type: "peaking", label: "8 kHz" },
  { frequency: 16000, gain: 0, type: "highshelf", label: "16 kHz" },
];

/**
 * Catálogo de perfiles de ecualización acústica predefinidos (Presets).
 */
export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { id: "flat", name: "Plano (Por defecto)", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bassBoost: 0 },
  { id: "bass-boost", name: "Refuerzo de graves (Bass Boost)", gains: [8, 7, 5, 2, 0, 0, 0, 0, -1, -2], bassBoost: 6 },
  { id: "treble-boost", name: "Refuerzo de agudos", gains: [-2, -1, 0, 0, 1, 2, 4, 6, 8, 9], bassBoost: 0 },
  { id: "rock", name: "Rock & Metal", gains: [5, 4, 2, -1, -2, 0, 2, 4, 5, 6], bassBoost: 2 },
  { id: "pop", name: "Pop", gains: [-1, 1, 3, 4, 3, 1, 1, 2, 3, 3], bassBoost: 1 },
  { id: "electronic", name: "Electrónica / EDM", gains: [6, 6, 4, 1, 0, 1, 3, 5, 6, 7], bassBoost: 4 },
  { id: "hiphop", name: "Hip-Hop / Trap", gains: [7, 6, 4, 1, 0, -1, 1, 3, 4, 4], bassBoost: 5 },
  { id: "jazz", name: "Jazz & Blues", gains: [3, 2, 1, 1, -1, 1, 2, 3, 4, 4], bassBoost: 0 },
  { id: "acoustic", name: "Acústico", gains: [4, 3, 2, 1, 2, 3, 3, 4, 4, 3], bassBoost: 0 },
  { id: "vocal", name: "Claridad vocal", gains: [-3, -2, 0, 2, 4, 5, 4, 2, 1, 0], bassBoost: 0 },
  { id: "classical", name: "Clásica", gains: [5, 4, 3, 2, 0, 1, 2, 3, 4, 5], bassBoost: 0 },
  { id: "custom", name: "Personalizado", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bassBoost: 0 },
];

/**
 * Clase controladora del motor de audio (AudioEngine).
 * Mantiene la instancia singleton y el grafo de nodos de Web Audio API.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private bassBoostNode: BiquadFilterNode | null = null;
  private preampGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private connectedElement: HTMLAudioElement | null = null;
  private isInitialized = false;

  private currentGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private currentBassBoost: number = 0;
  private currentPreamp: number = 0;
  private currentPresetId: string = "flat";
  private isEnabled: boolean = true;
  private isAudioPlaying: boolean = false;
  private isSleepTimerActive: boolean = false;

  /**
   * Conecta e inicializa el grafo de Web Audio API al elemento <audio> principal.
   * Configura listeners de gestos táctiles ('click', 'touchstart') para reactivar
   * el AudioContext si el navegador lo suspende por políticas de ahorro de energía.
   */
  public init(audioElement: HTMLAudioElement) {
    if (this.isInitialized && this.connectedElement === audioElement) {
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.ctx) {
        this.ctx = new AudioContextClass();
      }

      // Si el contexto fue suspendido por falta de interacción del usuario, reanudar en el primer toque
      if (this.ctx.state === "suspended") {
        const resume = () => {
          this.ctx?.resume();
          window.removeEventListener("click", resume);
          window.removeEventListener("touchstart", resume);
        };
        window.addEventListener("click", resume, { once: true });
        window.addEventListener("touchstart", resume, { once: true });
      }

      if (!this.source && this.ctx) {
        // Enlaza el elemento HTML con el grafo de Web Audio
        this.source = this.ctx.createMediaElementSource(audioElement);
        this.connectedElement = audioElement;

        // Nodo de Ganancia del Preamplificador
        this.preampGainNode = this.ctx.createGain();
        this.preampGainNode.gain.value = 1.0;

        // Creación de los filtros biquad de las 10 bandas
        this.filters = DEFAULT_BANDS.map((band) => {
          const filter = this.ctx!.createBiquadFilter();
          filter.type = band.type;
          filter.frequency.value = band.frequency;
          filter.gain.value = 0;
          return filter;
        });

        // Nodo dedicado para Bass Boost (filtro Low-shelf a 80 Hz)
        this.bassBoostNode = this.ctx.createBiquadFilter();
        this.bassBoostNode.type = "lowshelf";
        this.bassBoostNode.frequency.value = 80;
        this.bassBoostNode.gain.value = 0;

        // Analizador FFT para renderizado en canvas de espectro y osciloscopio
        this.analyserNode = this.ctx.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.85;

        // Conexión en serie: fuente -> preamp -> filtros[0..9] -> bassBoost -> analyser -> salida
        let lastNode: AudioNode = this.source;
        lastNode.connect(this.preampGainNode);
        lastNode = this.preampGainNode;

        for (const filter of this.filters) {
          lastNode.connect(filter);
          lastNode = filter;
        }

        lastNode.connect(this.bassBoostNode);
        lastNode = this.bassBoostNode;

        lastNode.connect(this.analyserNode);
        this.analyserNode.connect(this.ctx.destination);

        this.isInitialized = true;
      }
    } catch (e) {
      console.warn("AudioEngine initialization notice:", e);
    }
  }

  /**
   * Reanuda el AudioContext si se encuentra en estado 'suspended'
   */
  public resumeContext() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Ajusta la ganancia en decibelios de una banda de frecuencia específica (0 a 9).
   * Utiliza setTargetAtTime para una transición auditiva suave sin chasquidos.
   */
  public setBandGain(bandIndex: number, gainDb: number) {
    if (bandIndex >= 0 && bandIndex < this.currentGains.length) {
      this.currentGains[bandIndex] = gainDb;
      if (this.filters[bandIndex] && this.isEnabled) {
        this.filters[bandIndex].gain.setTargetAtTime(gainDb, this.ctx?.currentTime || 0, 0.05);
      }
    }
  }

  /**
   * Modifica el refuerzo de frecuencias bajas (Bass Boost).
   * @param level Valor de 0 a 10 que se escala proporcionalmente a un realce de 0 a 12 dB.
   */
  public setBassBoost(level: number) {
    this.currentBassBoost = level;
    const gainDb = (level / 10) * 12;
    if (this.bassBoostNode && this.isEnabled) {
      this.bassBoostNode.gain.setTargetAtTime(gainDb, this.ctx?.currentTime || 0, 0.05);
    }
  }

  /**
   * Configura la ganancia del preamplificador.
   * @param gainDb Nivel en dB (-6 dB a +6 dB), convertido a ganancia lineal: 10^(dB/20).
   */
  public setPreamp(gainDb: number) {
    this.currentPreamp = gainDb;
    const linearGain = Math.pow(10, gainDb / 20);
    if (this.preampGainNode && this.isEnabled) {
      this.preampGainNode.gain.setTargetAtTime(linearGain, this.ctx?.currentTime || 0, 0.05);
    }
  }

  /**
   * Aplica todas las ganancias y valores de Bass Boost de un preset predefinido.
   */
  public applyPreset(preset: EqualizerPreset) {
    this.currentPresetId = preset.id;
    this.currentGains = [...preset.gains];
    this.currentGains.forEach((gain, idx) => {
      if (this.filters[idx] && this.isEnabled) {
        this.filters[idx].gain.setTargetAtTime(gain, this.ctx?.currentTime || 0, 0.05);
      }
    });
    if (preset.bassBoost !== undefined) {
      this.setBassBoost(preset.bassBoost);
    }
  }

  /**
   * Activa o desactiva los efectos del ecualizador.
   * Al desactivarlo (bypass), aplana todas las bandas a 0 dB sin romper el grafo de audio.
   */
  public toggleEqualizer(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      // Pone en plano los filtros (0 dB)
      this.filters.forEach((filter) => {
        filter.gain.setTargetAtTime(0, this.ctx?.currentTime || 0, 0.05);
      });
      if (this.bassBoostNode) {
        this.bassBoostNode.gain.setTargetAtTime(0, this.ctx?.currentTime || 0, 0.05);
      }
      if (this.preampGainNode) {
        this.preampGainNode.gain.setTargetAtTime(1.0, this.ctx?.currentTime || 0, 0.05);
      }
    } else {
      // Restaura las ganancias configuradas por el usuario
      this.currentGains.forEach((gain, idx) => {
        if (this.filters[idx]) {
          this.filters[idx].gain.setTargetAtTime(gain, this.ctx?.currentTime || 0, 0.05);
        }
      });
      this.setBassBoost(this.currentBassBoost);
      this.setPreamp(this.currentPreamp);
    }
  }

  /**
   * Copia los datos de frecuencias actuales en un buffer de bytes para graficar espectros de barras.
   */
  public getFrequencyData(array: Uint8Array) {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(array);
    } else {
      array.fill(0);
    }
  }

  /**
   * Copia los datos de forma de onda en el dominio del tiempo para visualizadores tipo osciloscopio.
   */
  public getTimeDomainData(array: Uint8Array) {
    if (this.analyserNode) {
      this.analyserNode.getByteTimeDomainData(array);
    } else {
      array.fill(128);
    }
  }

  /**
   * Retorna una instantánea del estado actual del motor de ecualización.
   */
  public getState() {
    return {
      isEnabled: this.isEnabled,
      presetId: this.currentPresetId,
      gains: [...this.currentGains],
      bassBoost: this.currentBassBoost,
      preamp: this.currentPreamp,
      isAudioPlaying: this.isAudioPlaying,
      isSleepTimerActive: this.isSleepTimerActive,
    };
  }

  /**
   * Actualiza el estado de reproducción en el motor de audio
   */
  public setPlaybackState(isPlaying: boolean) {
    this.isAudioPlaying = isPlaying;
  }

  /**
   * Obtiene si el audio se encuentra en reproducción
   */
  public getPlaybackState(): boolean {
    return this.isAudioPlaying;
  }

  /**
   * Marca o desmarca si el temporizador de apagado está activo
   */
  public setSleepTimerActive(active: boolean) {
    this.isSleepTimerActive = active;
  }

  /**
   * Comprueba si el temporizador de apagado está activo
   */
  public isSleepTimerRunning(): boolean {
    return this.isSleepTimerActive;
  }

  /**
   * Pausa la reproducción de música actualizando el estado del motor de audio.
   * Si fadeOut es true, atenúa suavemente el volumen mediante Web Audio API antes de pausar.
   */
  public pausePlayback(
    audioElement: HTMLAudioElement | null,
    fadeOut: boolean = true,
    onPaused?: () => void
  ) {
    if (!audioElement) {
      this.isAudioPlaying = false;
      this.isSleepTimerActive = false;
      onPaused?.();
      return;
    }

    if (!fadeOut || !this.preampGainNode || !this.ctx || this.ctx.state !== "running") {
      try {
        audioElement.pause();
      } catch (err) {
        console.warn("Error pausing audio element:", err);
      }
      this.isAudioPlaying = false;
      this.isSleepTimerActive = false;
      onPaused?.();
      return;
    }

    // Atenuación suave progresiva (fade out de 2 segundos)
    try {
      const now = this.ctx.currentTime;
      const currentGain = this.preampGainNode.gain.value;
      this.preampGainNode.gain.cancelScheduledValues(now);
      this.preampGainNode.gain.setValueAtTime(currentGain, now);
      this.preampGainNode.gain.linearRampToValueAtTime(0.0001, now + 2.0);

      setTimeout(() => {
        try {
          audioElement.pause();
        } catch (err) {
          console.warn("Error pausing audio element after fade:", err);
        }

        // Restaurar ganancia original de preamplificación para futuras reproducciones
        if (this.preampGainNode && this.ctx) {
          const originalGain = Math.pow(10, this.currentPreamp / 20);
          this.preampGainNode.gain.cancelScheduledValues(this.ctx.currentTime);
          this.preampGainNode.gain.setValueAtTime(originalGain, this.ctx.currentTime + 0.05);
        }

        this.isAudioPlaying = false;
        this.isSleepTimerActive = false;
        onPaused?.();
      }, 2050);
    } catch (e) {
      // Fallback inmediato si falla la rampa Web Audio
      audioElement.pause();
      this.isAudioPlaying = false;
      this.isSleepTimerActive = false;
      onPaused?.();
    }
  }
}

/**
 * Instancia única exportada del motor de audio (Singleton).
 */
export const audioEngine = new AudioEngine();

