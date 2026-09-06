import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Track,
  PlaybackMode,
  ActiveTab,
  ThemeConfig,
  HiddenTrackRecord,
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
import { HomeView } from "./components/HomeView";
import { TrackList } from "./components/TrackList";
import { FloatingMiniPlayer } from "./components/FloatingMiniPlayer";
import { InstallAppModal } from "./components/InstallAppModal";
import { HiddenTracksModal } from "./components/HiddenTracksModal";
import { DownloadModal } from "./components/DownloadModal";
import { parseAudioFile } from "./services/metadataParser";
import { Trash2, AlertCircle } from "lucide-react";
import {
  loadTracksFromDB,
  saveTracksToDB,
  removeTrackFromDB,
  removeMultipleTracksFromDB,
  addHiddenTrack,
  getHiddenTracks,
  removeHiddenTrack,
  clearAllHiddenTracks,
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
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
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
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isExpandedPlayerOpen, setIsExpandedPlayerOpen] = useState(false);
  const [expandedSubTab, setExpandedSubTab] = useState<"cover" | "queue" | "lyrics" | "details">("cover");
  const [lyricsSearchTrack, setLyricsSearchTrack] = useState<Track | null>(null);

  // Hidden File and Folder Input Refs for '+' menu
  const localFilesInputRef = useRef<HTMLInputElement | null>(null);
  const localFolderInputRef = useRef<HTMLInputElement | null>(null);

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
      if (savedTracks.length > 0) {
        setTracks(savedTracks);
      } else {
        // Load initial synthesized demo tracks so player is immediately functional
        const demos = await getInitialDemoTracks();
        setTracks(demos);
        saveTracksToDB(demos);
      }
    }

    initLibrary();
  }, []);

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

  // Helper para verificar si una pista es inválida, tiene 0 bytes o duración 0
  const isTrackCorrupted = (t?: Track | null): boolean => {
    if (!t) return true;
    if (!t.url) return true;
    if (t.duration !== undefined && t.duration <= 0) return true;
    if (t.size !== undefined && t.size === 0) return true;
    if (t.file && t.file.size === 0) return true;
    return false;
  };

  // 3. Corrección del Reproductor:
  // Al hacer clic en Play sobre una pista inválida o de 0 bytes, muestra Toast:
  // 'Esta canción está dañada o no se pudo descargar el archivo de audio'
  // y limpia automáticamente de la biblioteca cualquier pista que tenga 0 bytes guardados
  const handleCorruptedTrack = (corruptedTrack: Track) => {
    setToastMessage("Esta canción está dañada o no se pudo descargar el archivo de audio");
    setTimeout(() => {
      setToastMessage((curr) =>
        curr === "Esta canción está dañada o no se pudo descargar el archivo de audio" ? null : curr
      );
    }, 4500);

    const damagedId = corruptedTrack.id;
    setTracks((prev) => {
      const updated = prev.filter((t) => t.id !== damagedId);
      saveTracksToDB(updated);
      return updated;
    });
    removeTrackFromDB(damagedId);

    if (currentTrack?.id === damagedId) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
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

    // Si la pista actual está dañada, tiene 0 bytes o duración 0
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
          handleCorruptedTrack(currentTrack);
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
    // Al hacer clic en Play sobre una canción cuyo archivo sea inválido, tenga duración 0 o 0 bytes:
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
            handleCorruptedTrack(track);
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

  // Handle downloaded track from DownloadModal
  const handleTrackDownloaded = (newTrack: Track, shouldPlayNow: boolean = false) => {
    setTracks((prev) => {
      const filtered = prev.filter((t) => t.id !== newTrack.id);
      const updated = [newTrack, ...filtered];
      saveTracksToDB(updated);
      return updated;
    });

    setToastMessage(`"${newTrack.title}" descargada e integrada con éxito`);

    if (shouldPlayNow) {
      setTimeout(() => {
        setCurrentTrackIndex(0);
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.src = newTrack.url;
          audioRef.current.play().catch(() => {});
        }
      }, 100);
    }
  };

  // Load demos helper
  const handleLoadDemos = async () => {
    const demos = await getInitialDemoTracks();
    handleTracksImported(demos);
  };

  // Lyrics applied from search
  const handleLyricsApplied = (trackId: string, lyrics: Track["lyrics"]) => {
    const updated = tracks.map((t) => (t.id === trackId ? { ...t, lyrics } : t));
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
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onEnded={handleNext}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          const mediaErr = audioRef.current?.error;
          if (mediaErr) {
            console.warn(`Audio playback issue (code ${mediaErr.code}): ${mediaErr.message || "media load failed"}`);
          }
          if (currentTrack) {
            handleCorruptedTrack(currentTrack);
          }
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
        onOpenDownloadModal={() => setIsDownloadModalOpen(true)}
        onOpenScanner={() => setIsScannerOpen(true)}
        onOpenEqualizer={() => setIsEqualizerOpen(true)}
        onOpenTheme={() => setIsThemeOpen(true)}
        onOpenHiddenTracks={() => setIsHiddenTracksOpen(true)}
        hiddenCount={hiddenTracks.length}
        trackCount={tracks.length}
        isMiniMode={isMiniMode}
        onToggleMiniMode={() => setIsMiniMode((prev) => !prev)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6">
        {activeTab === "home" && !searchQuery ? (
          <HomeView
            tracks={tracks}
            currentTrackId={currentTrack?.id}
            isPlaying={isPlaying}
            onPlayTrack={handlePlayTrack}
            onOpenScanner={() => setIsScannerOpen(true)}
            onOpenLyricsSearchForTrack={(track) => setLyricsSearchTrack(track)}
            onToggleFavorite={handleToggleFavorite}
            onDeleteTrack={(track) => handleDeleteTracks([track.id])}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--color-border-subtle)" }}>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                  {searchQuery
                    ? `Resultados para "${searchQuery}"`
                    : activeTab === "favorites"
                    ? "Canciones Favoritas"
                    : "Biblioteca de Canciones"}
                </h1>
                <p className="text-xs opacity-70 mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  {displayedTracks.length} {displayedTracks.length === 1 ? "canción encontrada" : "canciones encontradas"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="library-scan-more-btn"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-4 py-2 rounded-full font-bold text-xs text-white shadow transition-all hover:scale-105"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  + Añadir Canciones
                </button>
              </div>
            </div>

            <TrackList
              tracks={displayedTracks}
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
            />
          </div>
        )}
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
        queue={tracks}
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

      {/* Download from URL Modal */}
      <DownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onTrackDownloaded={handleTrackDownloaded}
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
    </div>
  );
}
