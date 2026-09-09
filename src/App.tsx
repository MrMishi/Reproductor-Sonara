import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Track,
  PlaybackMode,
  ActiveTab,
  ThemeConfig,
  HiddenTrackRecord,
  SleepTimerConfig,
} from "./types";
import { audioEngine } from "./services/audioEngine";
import { getInitialDemoTracks } from "./services/demoTracks";
import { loadSavedTheme, applyThemeToDocument } from "./services/themeEngine";
import { Navbar } from "./components/Navbar";
import { BottomPlayer } from "./components/BottomPlayer";
import { ExpandedPlayer } from "./components/ExpandedPlayer";
import { EqualizerModal } from "./components/EqualizerModal";
import { ThemeModal } from "./components/ThemeModal";
import { DeviceScannerModal } from "./components/DeviceScannerModal";
import { LyricsSearchModal } from "./components/LyricsSearchModal";
import { LibraryView } from "./components/LibraryView";
import { FloatingMiniPlayer } from "./components/FloatingMiniPlayer";
import { InstallAppModal } from "./components/InstallAppModal";
import { HiddenTracksModal } from "./components/HiddenTracksModal";
import { SleepTimerModal } from "./components/SleepTimerModal";
import { Capacitor } from "@capacitor/core";
import { autoScanStartup } from "./services/nativeScanner";
import { ID3EditorModal } from "./components/ID3EditorModal";
import { parseAudioFile } from "./services/metadataParser";
import { AlertCircle } from "lucide-react";
import {
  loadTracksFromDB,
  saveTracksToDB,
  removeTrackFromDB,
  removeMultipleTracksFromDB,
  addHiddenTrack,
  getHiddenTracks,
  removeHiddenTrack,
  clearAllHiddenTracks,
  updateTrackInDb,
} from "./services/db";

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("repeat-all");
  const [activeTab, setActiveTab] = useState<ActiveTab>("library");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modo Mini (Floating Gadget)
  const [isMiniMode, setIsMiniMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ytm_mini_mode_active") === "true";
    } catch {
      return false;
    }
  });

  // Save mini mode preference
  useEffect(() => {
    try {
      localStorage.setItem("ytm_mini_mode_active", String(isMiniMode));
    } catch {
      // ignore
    }
  }, [isMiniMode]);

  // Modals
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isExpandedPlayerOpen, setIsExpandedPlayerOpen] = useState(false);
  const [expandedSubTab, setExpandedSubTab] = useState<"cover" | "queue" | "lyrics" | "details">("cover");
  const [lyricsSearchTrack, setLyricsSearchTrack] = useState<Track | null>(null);

  // Hidden File and Folder Input Refs for '+' menu
  const localFilesInputRef = useRef<HTMLInputElement | null>(null);
  const localFolderInputRef = useRef<HTMLInputElement | null>(null);

  // ID3 Metadata Editor Modal state
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  // Temporizador de Apagado (Sleep Timer)
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerConfig>({
    isActive: false,
    mode: "minutes",
    targetTimestamp: null,
    remainingSeconds: 0,
    selectedMinutes: undefined,
    fadeOut: true,
  });

  // Filtro de audios cortos (< 30 segundos: notas de voz, tonos y audios breves)
  const [filterShortAudios, setFilterShortAudios] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("sonora_filter_short_audios");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const handleToggleFilterShortAudios = (enabled: boolean) => {
    setFilterShortAudios(enabled);
    try {
      localStorage.setItem("sonora_filter_short_audios", String(enabled));
    } catch {
      // ignore
    }
    setToastMessage(enabled ? "Filtro activo: audios < 30s ocultos" : "Filtro desactivado: mostrando todos los audios");
  };

  // Guardar cambios del editor de etiquetas ID3
  const handleSaveEditedTrack = async (updatedTrack: Track) => {
    setTracks((prev) => prev.map((t) => (t.id === updatedTrack.id ? updatedTrack : t)));
    await updateTrackInDb(updatedTrack);
    setEditingTrack(null);
    setToastMessage(`Etiquetas ID3 guardadas: "${updatedTrack.title}"`);
  };

  // Hidden Tracks & Mobile PWA / APK installation
  const [isHiddenTracksOpen, setIsHiddenTracksOpen] = useState(false);
  const [hiddenTracks, setHiddenTracks] = useState<HiddenTrackRecord[]>(() => getHiddenTracks());
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-dismiss toast notification
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Capture PWA beforeinstallprompt event if browser fires it
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  // Theme
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(() => {
    const saved = loadSavedTheme();
    applyThemeToDocument(saved);
    return saved;
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize theme and load initial tracks from DB or synthesized demos
  useEffect(() => {
    applyThemeToDocument(currentTheme);

    async function initLibrary() {
      const savedTracks = await loadTracksFromDB();
      let currentList = savedTracks;

      if (savedTracks.length > 0) {
        setTracks(savedTracks);
      } else {
        // En entorno web, cargar pistas de demostración iniciales
        if (!Capacitor.isNativePlatform()) {
          const demos = await getInitialDemoTracks();
          currentList = demos;
          setTracks(demos);
          saveTracksToDB(demos);
        }
      }

      // ESCANEO AUTOMÁTICO PREDETERMINADO EN ANDROID:
      // Al iniciar la app, solicita permisos de almacenamiento ('@capacitor/filesystem')
      // y escanea automáticamente la carpeta '/Music' (y '/Download').
      // Agrega de forma automática las pistas encontradas a la biblioteca.
      if (Capacitor.isNativePlatform()) {
        try {
          const newDiscovered = await autoScanStartup(currentList, filterShortAudios);
          if (newDiscovered.length > 0) {
            setTracks((prev) => {
              const existingIds = new Set(prev.map((t) => t.id));
              const filteredNew = newDiscovered.filter((t) => !existingIds.has(t.id));
              if (filteredNew.length === 0) return prev;
              const merged = [...prev, ...filteredNew];
              saveTracksToDB(merged);
              return merged;
            });
            setToastMessage(`Biblioteca actualizada: ${newDiscovered.length} canción(es) detectada(s)`);
          }
        } catch (scanErr) {
          console.warn("Auto-escaneo al inicio falló:", scanErr);
        }
      }
    }

    initLibrary();
  }, []);

  // Pistas visibles con filtro de audios cortos (< 30s) opcional
  const visibleTracks = useMemo(() => {
    if (!filterShortAudios) return tracks;
    return tracks.filter((t) => !t.duration || t.duration >= 30);
  }, [tracks, filterShortAudios]);

  const currentTrack = tracks[currentTrackIndex] || null;

  // Initialize AudioEngine when audio element is ready
  useEffect(() => {
    if (audioRef.current) {
      audioEngine.init(audioRef.current);
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, []);

  // Update audio source when currentTrack changes
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;

    audioRef.current.src = currentTrack.url;
    audioRef.current.load();

    if (isPlaying) {
      audioEngine.resumeContext();
      audioRef.current
        .play()
        .catch((err) => console.warn("Audio play prevented:", err?.message || "playback blocked"));
    }
  }, [currentTrack?.id]);

  // Helper para verificar si una pista es inválida
  const isTrackCorrupted = (t?: Track | null): boolean => {
    if (!t) return true;
    if (!t.url && !t.nativePath) return true;
    return false;
  };

  const handleCorruptedTrack = (corruptedTrack: Track) => {
    setToastMessage("No se pudo reproducir este archivo de audio.");
    setTimeout(() => {
      setToastMessage((curr) =>
        curr === "No se pudo reproducir este archivo de audio." ? null : curr
      );
    }, 4500);

    const damagedId = corruptedTrack.id;
    if (currentTrack?.id === damagedId) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  };

  // Handle Play/Pause
  const handleTogglePlay = () => {
    if (!audioRef.current || !currentTrack) {
      if (tracks.length > 0) {
        handlePlayTrack(tracks[0], 0);
      } else {
        setIsScannerOpen(true);
      }
      return;
    }

    if (isTrackCorrupted(currentTrack)) {
      handleCorruptedTrack(currentTrack);
      return;
    }

    audioEngine.resumeContext();

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.warn("Error playing audio:", e?.message || "playback failed");
          setToastMessage("No se pudo iniciar la reproducción del archivo.");
          setIsPlaying(false);
        });
    }
  };

  // Next Track
  const handleNext = () => {
    if (tracks.length === 0) return;

    if (playbackMode === "shuffle") {
      const nextIdx = Math.floor(Math.random() * tracks.length);
      setCurrentTrackIndex(nextIdx);
    } else if (playbackMode === "repeat-one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } else {
      // Normal or repeat-all
      const nextIdx = (currentTrackIndex + 1) % tracks.length;
      setCurrentTrackIndex(nextIdx);
    }
    setIsPlaying(true);
  };

  // Previous Track
  const handlePrev = () => {
    if (tracks.length === 0) return;

    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }

    const prevIdx = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    setCurrentTrackIndex(prevIdx);
    setIsPlaying(true);
  };

  // Seek
  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Integración completa con MediaSession API para notificaciones y pantalla de bloqueo de Android
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (currentTrack) {
      try {
        const coverSrc = currentTrack.coverUrl || "/icon.svg";
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title || "Sonora Music",
          artist: currentTrack.artist || "Artista Desconocido",
          album: currentTrack.album || "Sonora",
          artwork: [
            { src: coverSrc, sizes: "96x96", type: "image/png" },
            { src: coverSrc, sizes: "128x128", type: "image/png" },
            { src: coverSrc, sizes: "192x192", type: "image/png" },
            { src: coverSrc, sizes: "256x256", type: "image/png" },
            { src: coverSrc, sizes: "512x512", type: "image/png" },
          ],
        });
      } catch (e) {
        console.warn("Error setting MediaSession metadata:", e);
      }
    }

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (!isPlaying) handleTogglePlay();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (isPlaying) handleTogglePlay();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        handlePrev();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        handleNext();
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          handleSeek(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const offset = details.seekOffset || 10;
        const cur = audioRef.current?.currentTime || 0;
        handleSeek(Math.max(0, cur - offset));
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const offset = details.seekOffset || 10;
        const cur = audioRef.current?.currentTime || 0;
        const dur = audioRef.current?.duration || duration || 0;
        handleSeek(Math.min(dur, cur + offset));
      });
    } catch (err) {
      console.warn("Error setting MediaSession action handlers:", err);
    }
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.coverUrl, isPlaying, duration]);

  // Sincronizar estado de reproducción y barra de progreso en MediaSession
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

      if ("setPositionState" in navigator.mediaSession && duration > 0 && !isNaN(duration) && isFinite(duration)) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: audioRef.current?.playbackRate || 1,
          position: Math.min(Math.max(0, currentTime), duration),
        });
      }
    } catch (e) {
      // Ignorar advertencias menores en navegadores que limitan frecuencia de actualización
    }
  }, [isPlaying, currentTime, duration]);

  // Volume
  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    setIsMuted(vol === 0);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  const handleToggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // Cycle playback mode
  const handleCyclePlaybackMode = () => {
    const modes: PlaybackMode[] = ["normal", "repeat-all", "repeat-one", "shuffle"];
    const currentIdx = modes.indexOf(playbackMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    setPlaybackMode(nextMode);
  };

  // Direct play from list
  const handlePlayTrack = (track: Track, _index: number) => {
    if (isTrackCorrupted(track)) {
      handleCorruptedTrack(track);
      return;
    }

    const foundIndex = tracks.findIndex((t) => t.id === track.id);
    if (foundIndex !== -1) {
      if (foundIndex === currentTrackIndex && isPlaying) {
        handleTogglePlay();
      } else {
        setCurrentTrackIndex(foundIndex);
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.src = track.url;
          audioRef.current.play().catch((err) => {
            console.warn("Playback error:", err);
            setToastMessage("No se pudo iniciar la reproducción del archivo.");
            setIsPlaying(false);
          });
        }
      }
    }
  };

  // Toggle favorite
  const handleToggleFavorite = (id: string) => {
    const updated = tracks.map((t) => (t.id === id ? { ...t, isFavorite: !t.isFavorite } : t));
    setTracks(updated);
    saveTracksToDB(updated);
  };

  // Import newly scanned tracks from device
  const handleTracksImported = (newTracks: Track[]) => {
    setTracks((prev) => {
      // Append unique by title + artist
      const existing = new Set(prev.map((t) => `${t.title.toLowerCase()}-${t.artist.toLowerCase()}`));
      const filtered = newTracks.filter(
        (t) => !existing.has(`${t.title.toLowerCase()}-${t.artist.toLowerCase()}`)
      );
      const combined = [...prev, ...filtered];
      saveTracksToDB(combined);
      return combined;
    });

    if (newTracks.length > 0 && tracks.length === 0) {
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    }
  };

  // Handle local files selected directly from "+" menu
  const handleLocalFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imported: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const track = await parseAudioFile(file);
        if (track) imported.push(track);
      } catch (err) {
        console.warn("Error parsing file:", file.name, err);
      }
    }

    if (imported.length > 0) {
      handleTracksImported(imported);
      setToastMessage(`Se añadieron ${imported.length} canción(es) a tu biblioteca`);
    }
    e.target.value = "";
  };

  // Handle local folder selected directly from "+" menu
  const handleLocalFolderSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const audioExts = [".mp3", ".m4a", ".flac", ".wav", ".aac", ".ogg", ".opus", ".webm"];
    const audioFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (audioExts.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        audioFiles.push(f);
      }
    }

    const imported: Track[] = [];
    for (const f of audioFiles) {
      try {
        const track = await parseAudioFile(f);
        if (track) imported.push(track);
      } catch (err) {
        console.warn("Error parsing folder file:", f.name, err);
      }
    }

    if (imported.length > 0) {
      handleTracksImported(imported);
      setToastMessage(`Se importaron ${imported.length} canciones de la carpeta`);
    } else {
      setToastMessage("No se encontraron archivos de audio compatibles en la carpeta");
    }
    e.target.value = "";
  };

  // Load demos helper
  const handleLoadDemos = async () => {
    const demos = await getInitialDemoTracks();
    handleTracksImported(demos);
  };

  // Lyrics applied from search
  const handleLyricsApplied = (trackId: string, lyrics: Track["lyrics"], album?: string) => {
    const updated = tracks.map((t) => {
      if (t.id === trackId) {
        return {
          ...t,
          lyrics,
          album: t.album || album,
        };
      }
      return t;
    });
    setTracks(updated);
    saveTracksToDB(updated);
  };

  // Ocultar canción (omitir permanentemente de la biblioteca y de futuros escaneos)
  const handleHideTrack = (track: Track) => {
    addHiddenTrack(track);
    setHiddenTracks(getHiddenTracks());
    setTracks((prev) => {
      const updated = prev.filter((t) => t.id !== track.id);
      saveTracksToDB(updated);
      return updated;
    });
    removeTrackFromDB(track.id);

    if (currentTrack?.id === track.id) {
      if (tracks.length > 1) {
        handleNext();
      } else {
        setIsPlaying(false);
      }
    }
  };

  // Restaurar canción oculta
  const handleUnhideTrack = (idOrTitle: string) => {
    removeHiddenTrack(idOrTitle);
    setHiddenTracks(getHiddenTracks());
  };

  // Restaurar todas las canciones ocultas
  const handleUnhideAll = () => {
    clearAllHiddenTracks();
    setHiddenTracks([]);
  };

  // Eliminar canciones seleccionadas del reproductor y de la base de datos
  const handleDeleteTracks = async (trackIds: string[]) => {
    if (!trackIds || trackIds.length === 0) return;
    const idSet = new Set(trackIds);

    const isCurrentDeleted = currentTrack && idSet.has(currentTrack.id);
    const updatedTracks = tracks.filter((t) => !idSet.has(t.id));

    if (updatedTracks.length === 0) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = "";
      }
      setIsPlaying(false);
      setCurrentTrackIndex(0);
    } else if (isCurrentDeleted) {
      const curIdx = tracks.findIndex((t) => t.id === currentTrack.id);
      const nextIdx = Math.min(curIdx, updatedTracks.length - 1);
      setCurrentTrackIndex(nextIdx);
    } else if (currentTrack) {
      const newIdx = updatedTracks.findIndex((t) => t.id === currentTrack.id);
      if (newIdx !== -1) {
        setCurrentTrackIndex(newIdx);
      }
    }

    setTracks(updatedTracks);
    await removeMultipleTracksFromDB(trackIds);
    saveTracksToDB(updatedTracks);

    setToastMessage(
      trackIds.length === 1
        ? "Canción eliminada del reproductor"
        : `${trackIds.length} canciones eliminadas del reproductor`
    );
  };

  // =========================================================================
  // FUNCIONES DEL TEMPORIZADOR DE APAGADO (SLEEP TIMER)
  // =========================================================================

  // Ejecuta la pausa del audio al expirar el temporizador
  const handleExecuteSleepTimer = () => {
    setSleepTimer((prev) => ({
      ...prev,
      isActive: false,
      targetTimestamp: null,
      remainingSeconds: 0,
    }));
    audioEngine.setSleepTimerActive(false);

    audioEngine.pausePlayback(audioRef.current, sleepTimer.fadeOut, () => {
      setIsPlaying(false);
      setToastMessage("💤 Temporizador de apagado: la música se ha pausado.");
    });
  };

  // Activa el temporizador para pausar tras N minutos
  const handleSetSleepTimerMinutes = (minutes: number, fadeOut: boolean) => {
    const remainingSeconds = minutes * 60;
    const targetTimestamp = Date.now() + remainingSeconds * 1000;
    setSleepTimer({
      isActive: true,
      mode: "minutes",
      targetTimestamp,
      remainingSeconds,
      selectedMinutes: minutes,
      fadeOut,
    });
    audioEngine.setSleepTimerActive(true);
    setToastMessage(`💤 Temporizador configurado: apagado en ${minutes} min`);
  };

  // Activa el temporizador para pausar al finalizar la canción actual
  const handleSetSleepTimerEndOfSong = (fadeOut: boolean) => {
    const rem = Math.max(0, Math.floor(duration - currentTime));
    setSleepTimer({
      isActive: true,
      mode: "end-of-song",
      targetTimestamp: null,
      remainingSeconds: rem,
      selectedMinutes: undefined,
      fadeOut,
    });
    audioEngine.setSleepTimerActive(true);
    setToastMessage("💤 Temporizador configurado: al terminar esta canción");
  };

  // Desactiva y cancela el temporizador
  const handleCancelSleepTimer = () => {
    setSleepTimer((prev) => ({
      ...prev,
      isActive: false,
      targetTimestamp: null,
      remainingSeconds: 0,
      selectedMinutes: undefined,
    }));
    audioEngine.setSleepTimerActive(false);
    setToastMessage("Temporizador de apagado desactivado");
  };

  // Añade minutos adicionales al temporizador en curso
  const handleAddSleepTimerMinutes = (extraMinutes: number) => {
    if (!sleepTimer.isActive) {
      handleSetSleepTimerMinutes(extraMinutes, sleepTimer.fadeOut);
      return;
    }
    const extraSeconds = extraMinutes * 60;
    const currentTarget =
      sleepTimer.targetTimestamp || Date.now() + sleepTimer.remainingSeconds * 1000;
    const newTarget = currentTarget + extraSeconds * 1000;
    const newRem = Math.max(0, Math.round((newTarget - Date.now()) / 1000));
    setSleepTimer((prev) => ({
      ...prev,
      mode: "minutes",
      targetTimestamp: newTarget,
      remainingSeconds: newRem,
      selectedMinutes: (prev.selectedMinutes || 0) + extraMinutes,
    }));
    setToastMessage(`💤 Se añadieron +${extraMinutes} min al temporizador`);
  };

  // Cambia la preferencia de fade out
  const handleToggleFadeOut = (fadeOut: boolean) => {
    setSleepTimer((prev) => ({ ...prev, fadeOut }));
  };

  // Efecto del reloj regresivo del temporizador de apagado
  useEffect(() => {
    if (!sleepTimer.isActive) return;

    if (sleepTimer.mode === "end-of-song") {
      const rem = Math.max(0, Math.floor(duration - currentTime));
      setSleepTimer((prev) => {
        if (prev.remainingSeconds !== rem) {
          return { ...prev, remainingSeconds: rem };
        }
        return prev;
      });
      return;
    }

    const timerInterval = setInterval(() => {
      if (!sleepTimer.targetTimestamp) return;
      const now = Date.now();
      const diffSec = Math.max(0, Math.round((sleepTimer.targetTimestamp - now) / 1000));

      if (diffSec <= 0) {
        clearInterval(timerInterval);
        handleExecuteSleepTimer();
      } else {
        setSleepTimer((prev) => {
          if (!prev.isActive) return prev;
          return { ...prev, remainingSeconds: diffSec };
        });
      }
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [sleepTimer.isActive, sleepTimer.mode, sleepTimer.targetTimestamp, duration, currentTime]);

  // Filtered tracks for Library / Search / Favorites
  const displayedTracks = useMemo(() => {
    let list = tracks;

    if (activeTab === "favorites") {
      list = list.filter((t) => t.isFavorite);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      );
    }

    return list;
  }, [tracks, activeTab, searchQuery]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid if user is typing in an input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (audioRef.current) {
          handleSeek(Math.min(duration, audioRef.current.currentTime + 5));
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        if (audioRef.current) {
          handleSeek(Math.max(0, audioRef.current.currentTime - 5));
        }
      } else if (e.code === "KeyL") {
        setIsExpandedPlayerOpen(true);
        setExpandedSubTab("lyrics");
      } else if (e.code === "KeyE") {
        setIsEqualizerOpen(true);
      } else if (e.code === "KeyM") {
        setIsMiniMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, duration, currentTrackIndex, tracks]);

  return (
    <div
      id="ytm-app-root"
      className={`w-full min-h-screen flex flex-col transition-colors duration-300 select-none ${
        isMiniMode && currentTrack ? "pb-8" : "pb-28"
      }`}
      style={{
        backgroundColor: "var(--color-bg, #030303)",
        color: "var(--color-text-primary, #ffffff)",
      }}
    >
      {/* Hidden Audio Tag */}
      <audio
        ref={audioRef}
        id="native-audio-element"
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            const realDuration = audioRef.current.duration;
            if (realDuration && !isNaN(realDuration) && isFinite(realDuration) && realDuration > 0) {
              setDuration(realDuration);
              // Actualizar duración de la pista si era 0
              setTracks((prev) => {
                const target = prev[currentTrackIndex];
                if (target && (!target.duration || target.duration <= 0)) {
                  const updated = prev.map((t, idx) => (idx === currentTrackIndex ? { ...t, duration: realDuration } : t));
                  saveTracksToDB(updated);
                  return updated;
                }
                return prev;
              });
            }
          }
        }}
        onEnded={() => {
          if (sleepTimer.isActive && sleepTimer.mode === "end-of-song") {
            handleExecuteSleepTimer();
          } else {
            handleNext();
          }
        }}
        onPlay={() => {
          setIsPlaying(true);
          audioEngine.setPlaybackState(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          audioEngine.setPlaybackState(false);
        }}
        onError={() => {
          const mediaErr = audioRef.current?.error;
          if (mediaErr) {
            console.warn(`Audio playback issue (code ${mediaErr.code}): ${mediaErr.message || "media load failed"}`);
          }
          setToastMessage("No se pudo cargar el archivo de audio.");
          setIsPlaying(false);
        }}
      />

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenAddFiles={() => localFilesInputRef.current?.click()}
        onOpenAddFolder={() => setIsScannerOpen(true)}
        onOpenScanner={() => setIsScannerOpen(true)}
        onOpenEqualizer={() => setIsEqualizerOpen(true)}
        onOpenTheme={() => setIsThemeOpen(true)}
        onOpenHiddenTracks={() => setIsHiddenTracksOpen(true)}
        hiddenCount={hiddenTracks.length}
        trackCount={visibleTracks.length}
        isMiniMode={isMiniMode}
        onToggleMiniMode={() => setIsMiniMode((prev) => !prev)}
        filterShortAudios={filterShortAudios}
        onToggleFilterShortAudios={handleToggleFilterShortAudios}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <LibraryView
          tracks={visibleTracks}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          onPlayTrack={handlePlayTrack}
          onToggleFavorite={handleToggleFavorite}
          onOpenLyricsSearchForTrack={(track) => setLyricsSearchTrack(track)}
          onOpenScanner={() => setIsScannerOpen(true)}
          onLoadDemos={handleLoadDemos}
          onHideTrack={handleHideTrack}
          onOpenHiddenTracks={() => setIsHiddenTracksOpen(true)}
          hiddenCount={hiddenTracks.length}
          onDeleteTracks={handleDeleteTracks}
          searchQuery={searchQuery}
          isFavoritesView={activeTab === "favorites"}
          onOpenID3Editor={(track) => setEditingTrack(track)}
        />
      </main>

      {/* Bottom Sticky YouTube Music Player Bar (when not in Mini Mode) */}
      {!isMiniMode || !currentTrack ? (
        <BottomPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          playbackMode={playbackMode}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onCyclePlaybackMode={handleCyclePlaybackMode}
          onToggleFavorite={handleToggleFavorite}
          onOpenExpanded={() => {
            setExpandedSubTab("cover");
            setIsExpandedPlayerOpen(true);
          }}
          onOpenEqualizer={() => setIsEqualizerOpen(true)}
          onOpenLyrics={() => {
            setExpandedSubTab("lyrics");
            setIsExpandedPlayerOpen(true);
          }}
          onToggleMiniMode={() => setIsMiniMode(true)}
        />
      ) : (
        /* Floating Mini Gadget Player */
        <FloatingMiniPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          playbackMode={playbackMode}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onCyclePlaybackMode={handleCyclePlaybackMode}
          onToggleFavorite={handleToggleFavorite}
          onRestoreBottomPlayer={() => setIsMiniMode(false)}
          onOpenExpanded={() => {
            setExpandedSubTab("queue");
            setIsExpandedPlayerOpen(true);
          }}
          onCloseMiniMode={() => setIsMiniMode(false)}
        />
      )}

      {/* Full Screen Expanded Player */}
      <ExpandedPlayer
        isOpen={isExpandedPlayerOpen}
        onClose={() => setIsExpandedPlayerOpen(false)}
        currentTrack={currentTrack}
        queue={visibleTracks}
        currentTrackIndex={currentTrackIndex}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        playbackMode={playbackMode}
        onSelectTrack={handlePlayTrack}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={handleSeek}
        onToggleFavorite={handleToggleFavorite}
        onCyclePlaybackMode={handleCyclePlaybackMode}
        onOpenLyricsSearch={() => setLyricsSearchTrack(currentTrack)}
        onOpenEqualizer={() => setIsEqualizerOpen(true)}
        onToggleMiniMode={() => setIsMiniMode(true)}
        onHideTrack={handleHideTrack}
        onDeleteTracks={handleDeleteTracks}
        activeSubTab={expandedSubTab}
        onOpenID3Editor={(track) => setEditingTrack(track)}
        sleepTimer={sleepTimer}
        onOpenSleepTimer={() => setIsSleepTimerOpen(true)}
      />

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div
          id="sonora-toast-feedback"
          className="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-neutral-900/95 border border-white/20 text-white shadow-2xl flex items-center gap-2.5 text-xs font-semibold backdrop-blur-xl animate-fade-in max-w-[90vw]"
        >
          <div className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
          <span className="whitespace-normal sm:whitespace-nowrap text-center">{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <EqualizerModal
        isOpen={isEqualizerOpen}
        onClose={() => setIsEqualizerOpen(false)}
        isPlaying={isPlaying}
      />

      <ThemeModal
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={(newTheme) => setCurrentTheme(newTheme)}
      />

      <DeviceScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onTracksImported={handleTracksImported}
      />

      <LyricsSearchModal
        isOpen={Boolean(lyricsSearchTrack)}
        onClose={() => setLyricsSearchTrack(null)}
        track={lyricsSearchTrack}
        onLyricsApplied={handleLyricsApplied}
      />

      {/* Hidden Tracks & Blacklist Management Modal */}
      <HiddenTracksModal
        isOpen={isHiddenTracksOpen}
        onClose={() => setIsHiddenTracksOpen(false)}
        hiddenTracks={hiddenTracks}
        onUnhideTrack={handleUnhideTrack}
        onUnhideAll={handleUnhideAll}
      />

      {/* Hidden File and Folder Inputs for '+' menu */}
      <input
        ref={localFilesInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.webm"
        className="hidden"
        onChange={handleLocalFilesSelected}
      />
      <input
        ref={localFolderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleLocalFolderSelected}
      />

      {/* Mobile APK / PWA Local Installation Modal */}
      <InstallAppModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        deferredPrompt={deferredPrompt}
      />

      {/* ID3 Tag & Metadata Editor Modal */}
      <ID3EditorModal
        isOpen={Boolean(editingTrack)}
        track={editingTrack}
        onClose={() => setEditingTrack(null)}
        onSave={handleSaveEditedTrack}
      />

      {/* Temporizador de Apagado (Sleep Timer) Modal */}
      <SleepTimerModal
        isOpen={isSleepTimerOpen}
        onClose={() => setIsSleepTimerOpen(false)}
        sleepTimer={sleepTimer}
        currentTrack={currentTrack}
        currentTime={currentTime}
        duration={duration}
        onSetTimerMinutes={handleSetSleepTimerMinutes}
        onSetTimerEndOfSong={handleSetSleepTimerEndOfSong}
        onCancelTimer={handleCancelSleepTimer}
        onAddMinutes={handleAddSleepTimerMinutes}
        onToggleFadeOut={handleToggleFadeOut}
      />
    </div>
  );
}
