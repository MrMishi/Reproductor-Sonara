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

import React, { useState, useMemo, useRef, useEffect } from "react";
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
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  Check,
  Calendar,
  Clock,
  User,
  X,
  ListMusic,
  History,
  Flame,
  Trash2,
} from "lucide-react";
import { Track, LibrarySection, LibrarySortOption, SortDirection, Playlist } from "../types";
import { TrackList } from "./TrackList";

const STORAGE_KEY_SORT_BY = "sonora_library_sort_by";
const STORAGE_KEY_SORT_DIR = "sonora_library_sort_direction";

// Instancia única y compartida de Collator para ordenamiento ultra-rápido sin crear instancias en bucle
const standardCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

// Función de normalización de cadenas de búsqueda estilo Lark Player / Poweramp
// Remueve acentos, tildes (á->a, é->e, etc.), caracteres diacríticos y pasa a minúsculas
function normalizeSearchText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface SortConfigOption {
  id: LibrarySortOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const SORT_OPTIONS: SortConfigOption[] = [
  { id: "title", label: "Nombre", icon: Music, description: "Título de la canción (A-Z)" },
  { id: "artist", label: "Artista", icon: User, description: "Nombre del cantante o grupo" },
  { id: "addedAt", label: "Fecha de agregado", icon: Calendar, description: "Más recientes o antiguas" },
  { id: "duration", label: "Duración", icon: Clock, description: "Tiempo total de reproducción" },
];

interface LibraryViewProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying: boolean;
  onPlayTrack: (track: Track, index: number) => void;
  onToggleFavorite: (id: string) => void;
  onOpenLyricsSearchForTrack: (track: Track) => void;
  onOpenScanner: () => void;
  onLoadDemos: () => void;
  onHideTrack?: (track: Track) => void;
  onOpenHiddenTracks?: () => void;
  hiddenCount?: number;
  onDeleteTracks?: (trackIds: string[]) => void;
  onOpenID3Editor?: (track: Track) => void;
  onSwapTitleArtist?: (track: Track) => void;
  searchQuery?: string;
  isFavoritesView?: boolean;
  activeSection?: LibrarySection;
  onSectionChange?: (section: LibrarySection) => void;
  selectedArtist?: string | null;
  onSelectArtist?: (artist: string | null) => void;
  selectedAlbum?: string | null;
  onSelectAlbum?: (album: string | null) => void;
  selectedFolder?: string | null;
  onSelectFolder?: (folder: string | null) => void;
  playlists?: Playlist[];
  onCreatePlaylist?: () => void;
  onSelectPlaylist?: (playlist: Playlist) => void;
  onAddToPlaylist?: (track: Track) => void;
  onDeletePlaylist?: (playlistId: string) => void;
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const LibraryView: React.FC<LibraryViewProps> = React.memo(({
  tracks,
  currentTrackId,
  isPlaying,
  onPlayTrack,
  onToggleFavorite,
  onOpenLyricsSearchForTrack,
  onOpenScanner,
  onLoadDemos,
  onHideTrack,
  onOpenHiddenTracks,
  hiddenCount,
  onDeleteTracks,
  onOpenID3Editor,
  onSwapTitleArtist,
  searchQuery = "",
  isFavoritesView = false,
  activeSection: propActiveSection,
  onSectionChange: propOnSectionChange,
  selectedArtist: propSelectedArtist,
  onSelectArtist: propOnSelectArtist,
  selectedAlbum: propSelectedAlbum,
  onSelectAlbum: propOnSelectAlbum,
  selectedFolder: propSelectedFolder,
  onSelectFolder: propOnSelectFolder,
  playlists = [],
  onCreatePlaylist,
  onSelectPlaylist,
  onAddToPlaylist,
  onDeletePlaylist,
}) => {
  // Pestaña activa dentro de la biblioteca: "songs" | "artists" | "albums" | "folders"
  const [internalSection, setInternalSection] = useState<LibrarySection>("songs");

  // Estado de navegación detallada (drill-down)
  const [internalArtist, setInternalArtist] = useState<string | null>(null);
  const [internalAlbum, setInternalAlbum] = useState<string | null>(null);
  const [internalFolder, setInternalFolder] = useState<string | null>(null);

  const activeSection = propActiveSection ?? internalSection;
  const setActiveSection = propOnSectionChange ?? setInternalSection;

  const selectedArtist = propSelectedArtist !== undefined ? propSelectedArtist : internalArtist;
  const setSelectedArtist = propOnSelectArtist ?? setInternalArtist;

  const selectedAlbum = propSelectedAlbum !== undefined ? propSelectedAlbum : internalAlbum;
  const setSelectedAlbum = propOnSelectAlbum ?? setInternalAlbum;

  const selectedFolder = propSelectedFolder !== undefined ? propSelectedFolder : internalFolder;
  const setSelectedFolder = propOnSelectFolder ?? setInternalFolder;

  // Si el usuario escribe una búsqueda y estaba dentro de una vista en detalle,
  // restablecer la selección para mostrar la lista completa de resultados de búsqueda
  const prevSearchRef = useRef(searchQuery);
  useEffect(() => {
    if (searchQuery.trim() && !prevSearchRef.current.trim()) {
      setSelectedArtist(null);
      setSelectedAlbum(null);
      setSelectedFolder(null);
    }
    prevSearchRef.current = searchQuery;
  }, [searchQuery, setSelectedArtist, setSelectedAlbum, setSelectedFolder]);

  // Estado de ordenación de canciones con persistencia en localStorage
  const [sortBy, setSortBy] = useState<LibrarySortOption>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SORT_BY);
      if (saved === "title" || saved === "artist" || saved === "addedAt" || saved === "duration") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "title";
  });

  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SORT_DIR);
      if (saved === "asc" || saved === "desc") {
        return saved;
      }
    } catch {
      // ignore
    }
    return "asc";
  });

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  // Posicionamiento inteligente del menú desplegable: evita desbordes fuera de la pantalla en móviles
  const [dropdownAlign, setDropdownAlign] = useState<"left" | "right">("left");

  useEffect(() => {
    if (!isSortMenuOpen || !sortMenuRef.current) return;
    const updateAlign = () => {
      if (!sortMenuRef.current) return;
      const rect = sortMenuRef.current.getBoundingClientRect();
      const spaceOnRight = window.innerWidth - rect.left;
      // Si a la derecha no cabe el menú (260px) pero a la izquierda sí, alinear a la derecha
      if (spaceOnRight < 260 && rect.right >= 260) {
        setDropdownAlign("right");
      } else {
        setDropdownAlign("left");
      }
    };
    updateAlign();
    window.addEventListener("resize", updateAlign);
    return () => window.removeEventListener("resize", updateAlign);
  }, [isSortMenuOpen]);

  // Cerrar menú de ordenación al hacer clic afuera
  useEffect(() => {
    if (!isSortMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [isSortMenuOpen]);

  const handleSelectSort = (option: LibrarySortOption) => {
    let newDir = sortDirection;
    if (sortBy === option) {
      // Alternar dirección si presiona la misma opción
      newDir = sortDirection === "asc" ? "desc" : "asc";
    } else {
      // Por defecto: Fecha y Duración se ordenan desc (más recientes / más largas), Nombre y Artista asc (A-Z)
      newDir = option === "addedAt" || option === "duration" ? "desc" : "asc";
      setSortBy(option);
      try {
        localStorage.setItem(STORAGE_KEY_SORT_BY, option);
      } catch {}
    }
    setSortDirection(newDir);
    try {
      localStorage.setItem(STORAGE_KEY_SORT_DIR, newDir);
    } catch {}
    setIsSortMenuOpen(false);
  };

  const handleToggleSortDirection = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDir = sortDirection === "asc" ? "desc" : "asc";
    setSortDirection(newDir);
    try {
      localStorage.setItem(STORAGE_KEY_SORT_DIR, newDir);
    } catch {}
  };

  // Índice de búsqueda optimizado estilo Lark Player / Poweramp:
  // Pre-normaliza título, artista, álbum, archivo y ruta en minúsculas y sin acentos.
  // Se calcula únicamente cuando la colección de pistas cambia, nunca en cada pulsación.
  const indexedTracks = useMemo(() => {
    return tracks.map((t) => {
      const rawFileName = t.fileName || t.file?.name || (t.url ? t.url.split("/").pop() : "") || "";
      const normTitle = normalizeSearchText(t.title || "");
      const normArtist = normalizeSearchText(t.artist || "");
      const normAlbum = normalizeSearchText(t.album || "");
      const normFile = normalizeSearchText(rawFileName);
      const normFolder = normalizeSearchText(t.folderPath || "");
      const fullSearchKey = `${normTitle} ${normArtist} ${normAlbum} ${normFile} ${normFolder}`;

      return {
        track: t,
        normTitle,
        normArtist,
        normAlbum,
        fullSearchKey,
      };
    });
  }, [tracks]);

  // Filtrar según búsqueda inteligente, instantánea y tolerante a tildes estilo Lark Player
  const filteredTracks = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return tracks;

    const normQuery = normalizeSearchText(trimmed);
    const terms = normQuery.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return tracks;

    // Recorrido de alto rendimiento en un solo pase O(N) sin crear cadenas temporales
    const matchesWithScore: { track: Track; score: number }[] = [];

    for (let i = 0; i < indexedTracks.length; i++) {
      const item = indexedTracks[i];
      let allMatched = true;

      for (let j = 0; j < terms.length; j++) {
        if (!item.fullSearchKey.includes(terms[j])) {
          allMatched = false;
          break;
        }
      }

      if (allMatched) {
        // Puntuación de relevancia estilo Lark Player:
        // Prioriza si el título o artista empieza con el término buscado
        let score = 0;
        if (item.normTitle.startsWith(normQuery)) score += 100;
        else if (item.normTitle.includes(normQuery)) score += 50;

        if (item.normArtist.startsWith(normQuery)) score += 80;
        else if (item.normArtist.includes(normQuery)) score += 40;

        matchesWithScore.push({ track: item.track, score });
      }
    }

    matchesWithScore.sort((a, b) => b.score - a.score);
    return matchesWithScore.map((m) => m.track);
  }, [tracks, indexedTracks, searchQuery]);

  // Estadísticas globales de biblioteca (Artistas y Álbumes) calculadas únicamente cuando cambia `tracks`
  // Evita re-calcular Maps y bucles en cada tecla escrita
  const totalStats = useMemo(() => {
    const artSet = new Set<string>();
    const albSet = new Set<string>();
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (t.artist && t.artist.trim()) artSet.add(t.artist.trim());
      if (t.album && t.album.trim()) albSet.add(`${t.album.trim()}:::${t.artist || ""}`);
    }
    return { artists: artSet.size, albums: albSet.size };
  }, [tracks]);

  // 1. Agrupación por Artista (Calculado únicamente si la pestaña 'artists' está activa)
  const artistsMap = useMemo(() => {
    if (activeSection !== "artists") return [];
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
    return Array.from(map.values()).sort((a, b) => standardCollator.compare(a.artist, b.artist));
  }, [filteredTracks, activeSection]);

  // 2. Agrupación por Álbum (Calculado únicamente si la pestaña 'albums' está activa)
  const albumsMap = useMemo(() => {
    if (activeSection !== "albums") return [];
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
    return Array.from(map.values()).sort((a, b) => standardCollator.compare(a.album, b.album));
  }, [filteredTracks, activeSection]);

  // 3. Agrupación por Carpetas del Dispositivo (Calculado únicamente si la pestaña 'folders' está activa)
  const foldersMap = useMemo(() => {
    if (activeSection !== "folders") return [];
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
    return Array.from(map.values()).sort((a, b) => standardCollator.compare(a.path, b.path));
  }, [filteredTracks, activeSection]);

  // Función para reproducir la primera canción de una lista
  const handlePlayGroup = (groupTracks: Track[]) => {
    if (groupTracks.length > 0) {
      onPlayTrack(groupTracks[0], 0);
    }
  };

  // Tracks para la vista de detalle
  const activeDetailTracks = useMemo(() => {
    const sourceList = tracks;
    if (selectedArtist) {
      return sourceList.filter(
        (t) => (t.artist && t.artist.trim() ? t.artist.trim() : "Artista Desconocido") === selectedArtist
      );
    }
    if (selectedAlbum) {
      return sourceList.filter(
        (t) => (t.album && t.album.trim() ? t.album.trim() : "Álbum Desconocido") === selectedAlbum
      );
    }
    if (selectedFolder) {
      return sourceList.filter((t) => (t.folderPath || "Música del Dispositivo") === selectedFolder);
    }
    return [];
  }, [selectedArtist, selectedAlbum, selectedFolder, tracks]);

  // Volver a la vista general de la sección
  const handleBackToSection = () => {
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedFolder(null);
  };

  // Canciones filtradas y ordenadas según la preferencia del usuario (Nombre, Artista, Fecha, Duración)
  const sortedTracks = useMemo(() => {
    // Si hay una búsqueda activa, filteredTracks ya viene ordenado por relevancia de búsqueda estilo Lark Player
    if (searchQuery.trim()) {
      return filteredTracks;
    }

    const list = [...filteredTracks];
    const isAsc = sortDirection === "asc";

    list.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "title":
          comparison = standardCollator.compare(a.title || "", b.title || "");
          break;
        case "artist": {
          const artA = a.artist || "Artista Desconocido";
          const artB = b.artist || "Artista Desconocido";
          comparison = standardCollator.compare(artA, artB);
          if (comparison === 0) {
            comparison = standardCollator.compare(a.title || "", b.title || "");
          }
          break;
        }
        case "addedAt":
          comparison = (a.addedAt || 0) - (b.addedAt || 0);
          break;
        case "duration":
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
      }

      return isAsc ? comparison : -comparison;
    });

    return list;
  }, [filteredTracks, sortBy, sortDirection, searchQuery]);

  // Canciones de la vista en detalle ordenadas
  const sortedDetailTracks = useMemo(() => {
    const list = [...activeDetailTracks];
    const isAsc = sortDirection === "asc";

    list.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "title":
          comparison = standardCollator.compare(a.title || "", b.title || "");
          break;
        case "artist":
          comparison = standardCollator.compare(a.artist || "", b.artist || "");
          break;
        case "addedAt":
          comparison = (a.addedAt || 0) - (b.addedAt || 0);
          break;
        case "duration":
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
      }
      return isAsc ? comparison : -comparison;
    });

    return list;
  }, [activeDetailTracks, sortBy, sortDirection]);

  const currentSortObj = SORT_OPTIONS.find((s) => s.id === sortBy) || SORT_OPTIONS[0];

  // Componente del Menú Desplegable de Ordenación con diseño Cyberpunk HUD adaptado a teléfonos
  const renderSortDropdown = () => (
    <div className="relative" ref={sortMenuRef}>
      <div className="flex items-center gap-1.5">
        <button
          id="library-sort-dropdown-btn"
          type="button"
          onClick={() => setIsSortMenuOpen((prev) => !prev)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/[0.05] hover:bg-white/10 border border-white/10 text-neutral-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95"
          title="Ordenar canciones por Nombre, Artista, Fecha de agregado o Duración"
          aria-haspopup="true"
          aria-expanded={isSortMenuOpen}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="text-neutral-400 font-normal">Ordenar:</span>
          <span className="font-bold text-white">{currentSortObj.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 shrink-0 ${
              isSortMenuOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Botón para alternar rápidamente dirección Ascendente / Descendente */}
        <button
          id="library-sort-dir-toggle-btn"
          type="button"
          onClick={handleToggleSortDirection}
          className="p-1.5 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer shadow-sm active:scale-90 shrink-0"
          title={
            sortDirection === "asc"
              ? "Orden actual: Ascendente (A-Z / Menor). Clic para invertir a Descendente."
              : "Orden actual: Descendente (Z-A / Mayor). Clic para invertir a Ascendente."
          }
        >
          {sortDirection === "asc" ? (
            <ArrowUpAZ className="w-3.5 h-3.5 text-fuchsia-400" />
          ) : (
            <ArrowDownAZ className="w-3.5 h-3.5 text-cyan-400" />
          )}
        </button>
      </div>

      {/* Menú Desplegable con Estilo Cyberpunk HUD */}
      {isSortMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none transition-opacity duration-150"
            onClick={() => setIsSortMenuOpen(false)}
          />
          <div
            id="library-sort-dropdown-menu"
            className={`absolute mt-2 w-64 max-w-[calc(100vw-24px)] rounded-2xl p-2 shadow-2xl border backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150 ${
              dropdownAlign === "right" ? "right-0 left-auto" : "left-0 right-auto"
            }`}
            style={{
              backgroundColor: "rgba(18, 18, 24, 0.98)",
              borderColor: "rgba(255, 255, 255, 0.14)",
              boxShadow: "0 16px 40px -4px rgba(0, 0, 0, 0.8), 0 0 20px rgba(124, 58, 237, 0.3)",
            }}
          >
            <div className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-neutral-400 border-b border-white/10 mb-1.5 flex items-center justify-between">
              <span className="font-semibold text-neutral-300">Criterio de orden</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleSortDirection}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-violet-300 hover:text-violet-200 text-[10px] font-bold transition-colors cursor-pointer border border-white/10"
                  title="Cambiar dirección de orden"
                >
                  {sortDirection === "asc" ? (
                    <>
                      <ArrowUpAZ className="w-3 h-3 text-fuchsia-400" />
                      <span>Ascendente</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownAZ className="w-3 h-3 text-cyan-400" />
                      <span>Descendente</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSortMenuOpen(false)}
                  className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors sm:hidden cursor-pointer"
                  title="Cerrar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {SORT_OPTIONS.map((opt) => {
                const isSelected = sortBy === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    id={`sort-option-${opt.id}`}
                    type="button"
                    onClick={() => handleSelectSort(opt.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-violet-600/30 text-violet-100 border border-violet-500/40 shadow-sm"
                        : "text-neutral-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-neutral-400"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col text-left min-w-0">
                        <span className="truncate font-bold">{opt.label}</span>
                        <span className="text-[10px] opacity-70 font-normal truncate">
                          {opt.description}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-violet-400 stroke-[2.5] shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 pb-12 animate-in fade-in duration-200">
      {/* Encabezado Principal */}
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
            {searchQuery ? (
              `${filteredTracks.length} ${filteredTracks.length === 1 ? "canción encontrada" : "canciones encontradas"}`
            ) : (
              `${tracks.length} ${tracks.length === 1 ? "canción" : "canciones"} · ${totalStats.artists} artistas · ${totalStats.albums} álbumes`
            )}
          </p>
        </div>
      </div>

      {/* Pestañas / Filtros Superiores de Biblioteca: Pequeñas, Limpias y Minimalistas */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && (
        <div className="flex flex-wrap items-center justify-between gap-3 select-none">
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

          {/* Menú Desplegable de Ordenación */}
          {activeSection === "songs" && renderSortDropdown()}
        </div>
      )}

      {/* Vista en detalle cuando se hace clic en un Artista, Álbum o Carpeta */}
      {(selectedArtist || selectedAlbum || selectedFolder) && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
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

            <div className="flex items-center gap-2">
              {renderSortDropdown()}
              <button
                onClick={() => handlePlayGroup(sortedDetailTracks)}
                className="px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 text-white shadow transition-transform hover:scale-105 cursor-pointer"
                style={{ backgroundColor: "var(--color-accent, #7C3AED)" }}
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Reproducir Todo ({sortedDetailTracks.length})</span>
              </button>
            </div>
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
                {sortedDetailTracks.length} {sortedDetailTracks.length === 1 ? "canción" : "canciones"} · Duración total:{" "}
                {formatDuration(sortedDetailTracks.reduce((acc, cur) => acc + (cur.duration || 0), 0))}
              </p>
            </div>
          </div>

          {/* Lista de pistas del grupo seleccionado */}
          <TrackList
            tracks={sortedDetailTracks}
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
            onOpenID3Editor={onOpenID3Editor}
            onSwapTitleArtist={onSwapTitleArtist}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SECCIÓN: CANCIONES (Lista General de Reproducción) */}
      {/* ========================================================================= */}
      {!selectedArtist && !selectedAlbum && !selectedFolder && activeSection === "songs" && (
        <TrackList
          tracks={sortedTracks}
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
          onOpenID3Editor={onOpenID3Editor}
          onSwapTitleArtist={onSwapTitleArtist}
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
});
