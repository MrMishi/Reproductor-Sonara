import { EqualizerBand, EqualizerPreset } from "../types";

export const DEFAULT_BANDS: EqualizerBand[] = [
  { frequency: 60, gain: 0, type: "lowshelf", label: "60 Hz" },
  { frequency: 170, gain: 0, type: "peaking", label: "170 Hz" },
  { frequency: 420, gain: 0, type: "peaking", label: "420 Hz" },
  { frequency: 1000, gain: 0, type: "peaking", label: "1 kHz" },
  { frequency: 2500, gain: 0, type: "peaking", label: "2.5 kHz" },
  { frequency: 6000, gain: 0, type: "peaking", label: "6 kHz" },
  { frequency: 14000, gain: 0, type: "highshelf", label: "14 kHz" },
];

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { id: "flat", name: "Plano (Por defecto)", gains: [0, 0, 0, 0, 0, 0, 0], bassBoost: 0 },
  { id: "bass-boost", name: "Refuerzo de graves", gains: [7, 5, 2, 0, 0, 0, -1], bassBoost: 6 },
  { id: "rock", name: "Rock & Metal", gains: [4, 2, -1, 0, 2, 4, 5], bassBoost: 2 },
  { id: "pop", name: "Pop", gains: [-1, 2, 4, 3, 2, 1, 2], bassBoost: 1 },
  { id: "electronic", name: "Electrónica / EDM", gains: [6, 5, 1, 0, 2, 5, 6], bassBoost: 4 },
  { id: "hiphop", name: "Hip-Hop / Trap", gains: [6, 4, 0, 1, -1, 2, 3], bassBoost: 5 },
  { id: "jazz", name: "Jazz & Blues", gains: [3, 2, -1, 1, 2, 3, 4], bassBoost: 0 },
  { id: "acoustic", name: "Acústico", gains: [3, 2, 1, 2, 3, 4, 3], bassBoost: 0 },
  { id: "vocal", name: "Claridad vocal", gains: [-3, -1, 1, 4, 5, 3, 1], bassBoost: 0 },
  { id: "classical", name: "Clásica", gains: [4, 3, 2, 1, -1, 2, 4], bassBoost: 0 },
  { id: "custom", name: "Personalizado", gains: [0, 0, 0, 0, 0, 0, 0], bassBoost: 0 },
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private bassBoostNode: BiquadFilterNode | null = null;
  private preampGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private connectedElement: HTMLAudioElement | null = null;
  private isInitialized = false;

  private currentGains: number[] = [0, 0, 0, 0, 0, 0, 0];
  private currentBassBoost: number = 0;
  private currentPreamp: number = 0;
  private currentPresetId: string = "flat";
  private isEnabled: boolean = true;

  public init(audioElement: HTMLAudioElement) {
    if (this.isInitialized && this.connectedElement === audioElement) {
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.ctx) {
        this.ctx = new AudioContextClass();
      }

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
        this.source = this.ctx.createMediaElementSource(audioElement);
        this.connectedElement = audioElement;

        // Preamp gain
        this.preampGainNode = this.ctx.createGain();
        this.preampGainNode.gain.value = 1.0;

        // Create EQ filter chain
        this.filters = DEFAULT_BANDS.map((band) => {
          const filter = this.ctx!.createBiquadFilter();
          filter.type = band.type;
          filter.frequency.value = band.frequency;
          filter.gain.value = 0;
          return filter;
        });

        // Dedicated Bass Boost Node (Low-shelf 80Hz)
        this.bassBoostNode = this.ctx.createBiquadFilter();
        this.bassBoostNode.type = "lowshelf";
        this.bassBoostNode.frequency.value = 80;
        this.bassBoostNode.gain.value = 0;

        // Analyser node for spectrum and waveform visualization
        this.analyserNode = this.ctx.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.85;

        // Connect chain: source -> preamp -> filters[0..N] -> bassBoost -> analyser -> destination
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

  public resumeContext() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public setBandGain(bandIndex: number, gainDb: number) {
    if (bandIndex >= 0 && bandIndex < this.currentGains.length) {
      this.currentGains[bandIndex] = gainDb;
      if (this.filters[bandIndex] && this.isEnabled) {
        this.filters[bandIndex].gain.setTargetAtTime(gainDb, this.ctx?.currentTime || 0, 0.05);
      }
    }
  }

  public setBassBoost(level: number) {
    // level: 0 to 10 -> maps to 0 to 12 dB
    this.currentBassBoost = level;
    const gainDb = (level / 10) * 12;
    if (this.bassBoostNode && this.isEnabled) {
      this.bassBoostNode.gain.setTargetAtTime(gainDb, this.ctx?.currentTime || 0, 0.05);
    }
  }

  public setPreamp(gainDb: number) {
    // gainDb: -6 to +6 dB -> linear amplitude = 10^(dB / 20)
    this.currentPreamp = gainDb;
    const linearGain = Math.pow(10, gainDb / 20);
    if (this.preampGainNode && this.isEnabled) {
      this.preampGainNode.gain.setTargetAtTime(linearGain, this.ctx?.currentTime || 0, 0.05);
    }
  }

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

  public toggleEqualizer(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      // Flatten filters
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
      // Re-apply current values
      this.currentGains.forEach((gain, idx) => {
        if (this.filters[idx]) {
          this.filters[idx].gain.setTargetAtTime(gain, this.ctx?.currentTime || 0, 0.05);
        }
      });
      this.setBassBoost(this.currentBassBoost);
      this.setPreamp(this.currentPreamp);
    }
  }

  public getFrequencyData(array: Uint8Array) {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(array);
    } else {
      array.fill(0);
    }
  }

  public getTimeDomainData(array: Uint8Array) {
    if (this.analyserNode) {
      this.analyserNode.getByteTimeDomainData(array);
    } else {
      array.fill(128);
    }
  }

  public getState() {
    return {
      isEnabled: this.isEnabled,
      presetId: this.currentPresetId,
      gains: [...this.currentGains],
      bassBoost: this.currentBassBoost,
      preamp: this.currentPreamp,
    };
  }
}

export const audioEngine = new AudioEngine();
