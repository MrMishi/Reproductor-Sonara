/**
 * ============================================================================
 * SONARA MUSIC - VISTA DE BIBLIOTECA MULTI-CATEGORÍA (LibraryView.tsx)
 * ============================================================================
 * Responsabilidad:
 * Vista central de Sonora con diseño nativo, minimalista e independiente.
 * Provee navegación por pestañas superiores:
 * - "Canciones": Lista general de pistas con selección múltiple y ordenación.
 * - "Artistas": Cuadrícula de artistas con conteo de canciones y reproducción rápida.
 * - "Álbumes": Cuadrícula de carátulas de álbumes con autodetección de metadatos.
 * - "Carpetas": Explorador de directorios del dispositivo y descargas web.
 *
 * Incluye cabecera discreta para importar archivos locales o descargar por URL.
 */

import React, { useState, useMemo } from "react";
import {
  Music,
  Users,
  Disc3,
  Folder,
  Play,
  Heart,
  Plus,
  DownloadCloud,
  ChevronLeft,
  FolderOpen,
  EyeOff,
  Sparkles,
  Search,
  FolderPlus,
} from "lucide-react";
import { Track, LibrarySection } from "../types";
import { TrackList } from "./TrackList";

interface LibraryViewProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, index: number) => void;
  onToggleFavorite: (id: string) => void;
  onOpenLyricsSearchForTrack: (track: Track) => void;
  onOpenScanner: () => void;
  onOpenDownloadModal: () => void;
  onLoadDemos: () => void;
  onHideTrack?: (track: Track) => void;
  onOpenHiddenTracks?: () => void;
  hiddenCount?: number;
  onDeleteTracks?: (trackIds: string[]) => void;
  searchQuery?: string;
  isFavoritesView?: boolean;
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onToggleFavorite,
  onOpenLyricsSearchForTrack,
  onOpenScanner,
  onOpenDownloadModal,
  onLoadDemos,
  onHideTrack,
  onOpenHiddenTracks,
  hiddenCount,
  onDeleteTracks,
  searchQuery = "",
  isFavoritesView = false,
}) => {
  // Pestaña activa dentro de la biblioteca: "songs" | "artists" | "albums" | "folders"
  const [activeSection, setActiveSection] = useState<LibrarySection>("songs");

  // Estado de navegación detallada (drill-down)
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Menú flotante discreto de añadir música (+)
  const [showAddMenu, setShowAddMenu] = useState(false);

  React.useEffect(() => {
    if (!showAddMenu) return;
    const handleOutsideClick = () => setShowAddMenu(false);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [showAddMenu]);

  // Filtrar según búsqueda global
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase().trim();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album && t.album.toLowerCase().includes(q)) ||
        (t.folderPath && t.folderPath.toLowerCase().includes(q))
    );
  }, [tracks, searchQuery]);

  // 1. Agrupación por Artista
  const artistsMap = useMemo(() => {
    const map = new Map<string, { artist: string; tracks: Track[]; coverUrl?: string }>();
    filteredTracks.forEach((t) => {
      const art = t.artist && t.artist.trim() ? t.artist.trim() : "Artista Desconocido";
      if (!map.has(art)) {
        map.set(art, { artist: art, tracks: [], coverUrl: t.coverUrl });
      }
      const entry = map.get(art)!;
      entry.tracks.push(t);
      if (!entry.coverUrl && t.coverUrl) {
        entry.coverUrl = t.coverUrl;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.artist.localeCompare(b.artist));
  }, [filteredTracks]);

  // 2. Agrupación por Álbum
  const albumsMap = useMemo(() => {
    const map = new Map<
      string,
      { album: string; artist: string; tracks: Track[]; coverUrl?: string; year?: string }
    >();
    filteredTracks.forEach((t) => {
      const alb = t.album && t.album.trim() ? t.album.trim() : "Álbum Desconocido";
      const key = `${alb}-${t.artist || ""}`;
      if (!map.has(key)) {
        map.set(key, {
          album: alb,
          artist: t.artist || "Varios Artistas",
          tracks: [],
          coverUrl: t.coverUrl,
          year: t.year,
        });
      }
      const entry = map.get(key)!;
      entry.tracks.push(t);
      if (!entry.coverUrl && t.coverUrl) {
        entry.coverUrl = t.coverUrl;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album));
  }, [filteredTracks]);

  // 3. Agrupación por Carpetas del Dispositivo
  const foldersMap = useMemo(() => {
    const map = new Map<string, { folderName: string; path: string; tracks: Track[] }>();
    filteredTracks.forEach((t) => {
      let path = t.folderPath;
      if (!path) {
        if (t.file && (t.file as any).webkitRelativePath) {
          const parts = (t.file as any).webkitRelativePath.split("/");
          if (parts.length > 1) {
            path = parts.slice(0, -1).join(" / ");
          }
        }
      }
      const finalPath = path || "Música del Dispositivo";
      const folderName = finalPath.split("/").pop()?.trim() || finalPath;

      if (!map.has(finalPath)) {
        map.set(finalPath, { folderName, path: finalPath, tracks: [] });
      }
      map.get(finalPath)!.tracks.push(t);
    });
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [filteredTracks]);

  // Función para reproducir la primera canción de una lista
  const handlePlayGroup = (groupTracks: Track[]) => {
    if (groupTracks.length > 0) {
      onPlayTrack(groupTracks[0], 0);
    }
  };

  // Tracks para la vista de detalle
  const activeDetailTracks = useMemo(() => {
    if (selectedArtist) {
      return filteredTracks.filter(
        (t) => (t.artist && t.artist.trim() ? t.artist.trim() : "Artista Desconocido") === selectedArtist
      );
    }
    if (selectedAlbum) {
      return filteredTracks.filter(
        (t) => (t.album && t.album.trim() ? t.album.trim() : "Álbum Desconocido") === selectedAlbum
      );
    }
    if (selectedFolder) {
      return filteredTracks.filter((t) => (t.folderPath || "Música del Dispositivo") === selectedFolder);
    }
    return [];
  }, [selectedArtist, selectedAlbum, selectedFolder, filteredTracks]);

  // Volver a la vista general de la sección
  const handleBackToSection = () => {
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedFolder(null);
  };

  return (
    <div className="flex flex-col gap-6 pb-12 animate-in fade-in duration-200">
      {/* Encabezado Principal y Acciones Discretas */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b"
        style={{ borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: "var(--color-text-primary)" }}>
              {isFavoritesView
                ? "Canciones Favoritas"
                : searchQuery
                ? `Resultados para "${searchQuery}"`
                : "Mi Biblioteca"}
            </h1>
            {isFavoritesView && <Heart className="w-5 h-5 text-red-500 fill-red-500" />}
          </div>
          <p className="text-xs opacity-65 mt-1 font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {tracks.length} {tracks.length === 1 ? "canción" : "canciones"} · {artistsMap.length} artistas ·{" "}
            {albumsMap.length} álbumes
          </p>
        </div>

        {/* Botón discreto único de '+' para añadir/importar/descargar música */}
        <div className="relative">
          <button
            id="library-add-menu-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMenu((prev) => !prev);
            }}
            title="Añadir música"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              backgroundColor: "var(--color-accent, #7C3AED)",
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Añadir</span>
          </button>

          {showAddMenu && (
            <div
              id="library-add-dropdown"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-2 w-56 rounded-2xl p-1.5 shadow-2xl border backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
              style={{
                backgroundColor: "var(--color-surface-elevated, #1c1c1c)",
                borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
              }}
            >
              <button
                id="menu-import-local-btn"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenScanner();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-white/10 text-left transition-colors cursor-pointer text-white"
              >
                <FolderOpen className="w-4 h-4 text-violet-400" />
                <div className="flex flex-col">
                  <span>Importar Música Local</span>
                  <span className="text-[10px] opacity-60">Escanear archivos de audio</span>
                </div>
              </button>

              <button
                id="menu-download-url-btn"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenDownloadModal();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-white/10 text-left transition-colors cursor-pointer text-white"
              >
                <DownloadCloud className="w-4 h-4 text-purple-400" />
                <div className="flex flex-col">
                  <span>Descargar desde URL</span>
                  <span className="text-[10px] opacity-60">YouTube, SoundCloud o enlace</span>
                </div>
              </button>

              {onLoadDemos && (
                <button
                  id="menu-load-demos-btn"
                  onClick={() => {
                    setShowAddMenu(false);
                    onLoadDemos();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-white/10 text-left transition-colors cursor-pointer text-neutral-300 hover:text-white"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <div className="flex flex-col">
                    <span>Cargar Pistas Demo</span>
                    <span className="text-[10px] opacity-60">Música libre de muestra</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pestañas / Filtros Superiores de Biblioteca: Pequeñas, Limpias y Minimalistas */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && (
        <div className="flex items-center gap-1 sm:gap-2 p-1 rounded-full bg-white/[0.04] border border-white/5 max-w-fit select-none">
          <button
            id="tab-section-songs"
            onClick={() => setActiveSection("songs")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === "songs"
                ? "bg-white text-black shadow-sm font-bold"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Canciones</span>
          </button>

          <button
            id="tab-section-artists"
            onClick={() => setActiveSection("artists")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === "artists"
                ? "bg-white text-black shadow-sm font-bold"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Artistas</span>
          </button>

          <button
            id="tab-section-albums"
            onClick={() => setActiveSection("albums")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === "albums"
                ? "bg-white text-black shadow-sm font-bold"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Disc3 className="w-3.5 h-3.5" />
            <span>Álbumes</span>
          </button>

          <button
            id="tab-section-folders"
            onClick={() => setActiveSection("folders")}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSection === "folders"
                ? "bg-white text-black shadow-sm font-bold"
                : "text-neutral-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Carpetas</span>
          </button>
        </div>
      )}

      {/* Floating Action Button (FAB) discreto en la esquina inferior */}
      <div className="fixed bottom-24 right-5 sm:right-8 z-30">
        <button
          id="floating-add-btn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAddMenu((prev) => !prev);
          }}
          title="Añadir música a Sonora"
          className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all cursor-pointer border border-white/10"
          style={{
            backgroundColor: "var(--color-accent, #7C3AED)",
            boxShadow: "0 8px 24px rgba(124, 58, 237, 0.45)",
          }}
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {/* Vista en detalle cuando se hace clic en un Artista, Álbum o Carpeta */}
      {(selectedArtist || selectedAlbum || selectedFolder) && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToSection}
              className="flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 px-2 -ml-2 rounded-lg hover:bg-white/5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>
                Volver a{" "}
                {selectedArtist ? "Artistas" : selectedAlbum ? "Álbumes" : "Carpetas"}
              </span>
            </button>

            <button
              onClick={() => handlePlayGroup(activeDetailTracks)}
              className="px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 text-white shadow transition-transform hover:scale-105 cursor-pointer"
              style={{ backgroundColor: "var(--color-accent, #7C3AED)" }}
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Reproducir Todo ({activeDetailTracks.length})</span>
            </button>
          </div>

          <div
            className="p-4 sm:p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6"
            style={{
              backgroundColor: "var(--color-surface, #141414)",
              borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
            }}
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-lg border border-white/10 shrink-0 bg-neutral-900 flex items-center justify-center">
              {activeDetailTracks[0]?.coverUrl ? (
                <img
                  src={activeDetailTracks[0].coverUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : selectedFolder ? (
                <FolderOpen className="w-10 h-10 text-purple-400" />
              ) : (
                <Disc3 className="w-10 h-10 text-purple-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[11px] uppercase tracking-wider font-bold text-purple-400">
                {selectedArtist ? "Artista" : selectedAlbum ? "Álbum" : "Carpeta de origen"}
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight truncate text-white mt-0.5">
                {selectedArtist || selectedAlbum || selectedFolder}
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                {activeDetailTracks.length} {activeDetailTracks.length === 1 ? "canción" : "canciones"} · Duración total:{" "}
                {formatDuration(activeDetailTracks.reduce((acc, cur) => acc + (cur.duration || 0), 0))}
              </p>
            </div>
          </div>

          {/* Lista de pistas del grupo seleccionado */}
          <TrackList
            tracks={activeDetailTracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            onPlayTrack={onPlayTrack}
            onToggleFavorite={onToggleFavorite}
            onOpenLyricsSearchForTrack={onOpenLyricsSearchForTrack}
            onOpenScanner={onOpenScanner}
            onLoadDemos={onLoadDemos}
            onHideTrack={onHideTrack}
            onOpenHiddenTracks={onOpenHiddenTracks}
            hiddenCount={hiddenCount}
            onDeleteTracks={onDeleteTracks}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SECCIÓN: CANCIONES (Lista General de Reproducción) */}
      {/* ========================================================================= */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && activeSection === "songs" && (
        <TrackList
          tracks={filteredTracks}
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          onPlayTrack={onPlayTrack}
          onToggleFavorite={onToggleFavorite}
          onOpenLyricsSearchForTrack={onOpenLyricsSearchForTrack}
          onOpenScanner={onOpenScanner}
          onLoadDemos={onLoadDemos}
          onHideTrack={onHideTrack}
          onOpenHiddenTracks={onOpenHiddenTracks}
          hiddenCount={hiddenCount}
          onDeleteTracks={onDeleteTracks}
        />
      )}

      {/* ========================================================================= */}
      {/* 2. SECCIÓN: ARTISTAS (Cuadrícula agrupada por Artista) */}
      {/* ========================================================================= */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && activeSection === "artists" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {artistsMap.map((entry) => (
            <div
              key={entry.artist}
              onClick={() => setSelectedArtist(entry.artist)}
              className="group p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col items-center text-center hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--color-surface, #141414)",
                borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))",
              }}
            >
              {/* Avatar de Artista */}
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden shadow-lg border border-white/10 mb-3 bg-neutral-900 flex items-center justify-center">
                {entry.coverUrl ? (
                  <img
                    src={entry.coverUrl}
                    alt={entry.artist}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Users className="w-10 h-10 text-neutral-500" />
                )}
                {/* Botón flotante de reproducción rápida */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayGroup(entry.tracks);
                  }}
                  title={`Reproducir música de ${entry.artist}`}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                </button>
              </div>

              <span className="text-xs sm:text-sm font-bold text-white truncate w-full group-hover:text-purple-300 transition-colors">
                {entry.artist}
              </span>
              <span className="text-[11px] text-neutral-400 mt-0.5">
                {entry.tracks.length} {entry.tracks.length === 1 ? "canción" : "canciones"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SECCIÓN: ÁLBUMES (Cuadrícula agrupada por Álbum) */}
      {/* ========================================================================= */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && activeSection === "albums" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {albumsMap.map((entry) => (
            <div
              key={`${entry.album}-${entry.artist}`}
              onClick={() => setSelectedAlbum(entry.album)}
              className="group p-3 rounded-2xl border transition-all cursor-pointer flex flex-col hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: "var(--color-surface, #141414)",
                borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))",
              }}
            >
              {/* Carátula del Álbum */}
              <div className="relative aspect-square w-full rounded-xl overflow-hidden shadow-lg border border-white/10 mb-2.5 bg-neutral-900 flex items-center justify-center">
                {entry.coverUrl ? (
                  <img
                    src={entry.coverUrl}
                    alt={entry.album}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Disc3 className="w-12 h-12 text-neutral-500" />
                )}
                {/* Botón flotante de reproducción rápida */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayGroup(entry.tracks);
                  }}
                  title={`Reproducir álbum ${entry.album}`}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                </button>
              </div>

              <span className="text-xs sm:text-sm font-bold text-white truncate w-full group-hover:text-purple-300 transition-colors">
                {entry.album}
              </span>
              <span className="text-[11px] text-neutral-400 truncate w-full">
                {entry.artist}
              </span>
              <span className="text-[10px] text-neutral-500 mt-1">
                {entry.tracks.length} {entry.tracks.length === 1 ? "canción" : "canciones"}
                {entry.year ? ` · ${entry.year}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SECCIÓN: CARPETAS (Directorios de Origen del Dispositivo) */}
      {/* ========================================================================= */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && activeSection === "folders" && (
        <div className="flex flex-col gap-2">
          {foldersMap.map((entry) => (
            <div
              key={entry.path}
              onClick={() => setSelectedFolder(entry.path)}
              className="p-3 sm:p-4 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer hover:bg-white/5 group"
              style={{
                backgroundColor: "var(--color-surface, #141414)",
                borderColor: "var(--color-border-subtle, rgba(255,255,255,0.06))",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 group-hover:scale-105 transition-transform shrink-0">
                  <Folder className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white group-hover:text-purple-300 transition-colors truncate">
                    {entry.folderName}
                  </div>
                  <div className="text-[11px] text-neutral-400 font-mono truncate">
                    {entry.path}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
                  {entry.tracks.length} {entry.tracks.length === 1 ? "canción" : "canciones"}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayGroup(entry.tracks);
                  }}
                  title={`Reproducir carpeta ${entry.folderName}`}
                  className="p-2 rounded-full hover:bg-purple-600/30 text-purple-400 hover:text-white transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
