import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Sliders,
  Palette,
  Music2,
  Heart,
  X,
  PictureInPicture2,
  EyeOff,
  Settings,
  ChevronDown,
  Plus,
  FileAudio,
  FolderPlus,
  DownloadCloud,
} from "lucide-react";
import { ActiveTab } from "../types";
import { SonoraLogo } from "./SonoraLogo";

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenScanner?: () => void;
  onOpenAddFiles: () => void;
  onOpenAddFolder: () => void;
  onOpenDownloadModal: () => void;
  onOpenEqualizer: () => void;
  onOpenTheme: () => void;
  onOpenHiddenTracks?: () => void;
  hiddenCount?: number;
  trackCount: number;
  isMiniMode?: boolean;
  onToggleMiniMode?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  onOpenAddFiles,
  onOpenAddFolder,
  onOpenDownloadModal,
  onOpenEqualizer,
  onOpenTheme,
  onOpenHiddenTracks,
  hiddenCount,
  trackCount,
  isMiniMode,
  onToggleMiniMode,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking or touching outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
      if (addMenuRef.current && !addMenuRef.current.contains(target)) {
        setIsAddMenuOpen(false);
      }
    }
    if (isSettingsOpen || isAddMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isSettingsOpen, isAddMenuOpen]);
  return (
    <>
      <header
        id="ytm-navbar"
        className="sticky top-0 z-30 w-full px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3 border-b flex items-center justify-between gap-2 sm:gap-4 backdrop-blur-xl transition-colors"
        style={{
          backgroundColor: "var(--color-surface, #030303)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
        }}
      >
        {/* Brand Logo & Nav Tabs */}
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <div
            id="sonora-logo"
            onClick={() => onSelectTab("home")}
            className="cursor-pointer select-none transition-transform active:scale-95"
          >
            <SonoraLogo size={32} />
          </div>

          {/* Primary Tabs (desktop/tablet) */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              id="nav-tab-home"
              onClick={() => onSelectTab("home")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeTab === "home"
                  ? "bg-white text-black shadow-sm"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              Principal
            </button>
            <button
              id="nav-tab-library"
              onClick={() => onSelectTab("library")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "library"
                  ? "bg-white text-black shadow-sm"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>Biblioteca ({trackCount})</span>
            </button>
            <button
              id="nav-tab-favorites"
              onClick={() => onSelectTab("favorites")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "favorites"
                  ? "bg-white text-black shadow-sm"
                  : "text-neutral-300 hover:text-white hover:bg-white/10"
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-red-500" />
              <span>Favoritas</span>
            </button>
          </nav>
        </div>

        {/* Center Search Input */}
        <div className="flex-1 max-w-md mx-1 sm:mx-2 min-w-0">
          <div
            className="relative flex items-center rounded-full border px-3 sm:px-3.5 py-1.5 transition-all focus-within:ring-2 focus-within:ring-purple-500/40"
            style={{
              backgroundColor: "var(--color-bg, #141414)",
              borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
            }}
          >
            <Search className="w-4 h-4 opacity-50 shrink-0" />
            <input
              id="navbar-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar música, artistas..."
              className="w-full bg-transparent text-xs sm:text-sm pl-2 sm:pl-2.5 pr-1 sm:pr-2 focus:outline-none placeholder:opacity-50 min-w-0"
              style={{ color: "var(--color-text-primary)" }}
            />
            {searchQuery && (
              <button
                id="navbar-search-clear-btn"
                onClick={() => onSearchChange("")}
                className="p-1 rounded-full hover:bg-white/10 opacity-60 hover:opacity-100 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Hidden Tracks Quick Access Button (desktop only to save mobile space) */}
          {hiddenCount !== undefined && hiddenCount > 0 && onOpenHiddenTracks && (
            <button
              id="navbar-hidden-tracks-btn"
              onClick={onOpenHiddenTracks}
              title="Ver archivos y canciones ocultas"
              className="hidden md:flex p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 items-center gap-1.5 transition-all shrink-0 cursor-pointer"
            >
              <EyeOff className="w-4 h-4 text-red-400" />
              <span className="hidden xl:inline">Ocultas ({hiddenCount})</span>
            </button>
          )}

          {/* Modo Mini Gadget Button (desktop/tablet only) */}
          {onToggleMiniMode && (
            <button
              id="navbar-mini-mode-btn"
              onClick={onToggleMiniMode}
              title={
                isMiniMode
                  ? "Restaurar barra de reproducción normal (Tecla M)"
                  : "Activar Modo Mini (Gadget flotante) [Tecla M]"
              }
              className={`hidden sm:flex p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border items-center gap-1.5 transition-all shrink-0 ${
                isMiniMode
                  ? "bg-white text-black shadow-md border-white"
                  : "hover:bg-white/10 text-neutral-300 hover:text-white"
              }`}
              style={{
                borderColor: isMiniMode ? "transparent" : "var(--color-border-subtle)",
              }}
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span className="hidden xl:inline">{isMiniMode ? "Modo Mini Activo" : "Modo Mini"}</span>
            </button>
          )}

          {/* Add / Download Music Dropdown Button */}
          <div className="relative" ref={addMenuRef}>
            <button
              id="navbar-add-music-btn"
              onClick={() => setIsAddMenuOpen((prev) => !prev)}
              title="Añadir / Descargar música"
              aria-label="Añadir / Descargar música"
              className={`w-8.5 h-8.5 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md select-none border shrink-0 ${
                isAddMenuOpen
                  ? "bg-purple-600 text-white border-purple-400 shadow-purple-500/30 scale-105"
                  : "bg-white/10 hover:bg-purple-600/20 text-white hover:border-purple-500/40 border-white/10 hover:scale-105 active:scale-95"
              }`}
              style={{
                boxShadow: isAddMenuOpen ? "0 0 15px rgba(124, 58, 237, 0.4)" : undefined,
              }}
            >
              <Plus
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200 ${
                  isAddMenuOpen ? "rotate-45 text-white" : "text-white"
                }`}
              />
            </button>

            {/* Add Music Dropdown Menu */}
            {isAddMenuOpen && (
              <div
                id="navbar-add-music-dropdown"
                className="absolute right-0 mt-2 w-72 rounded-2xl p-2 shadow-2xl border backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
                style={{
                  backgroundColor: "var(--color-surface, #181818)",
                  borderColor: "var(--color-border-subtle, rgba(255,255,255,0.15))",
                  boxShadow: "0 20px 45px rgba(0, 0, 0, 0.75), 0 0 25px rgba(124, 58, 237, 0.15)",
                }}
              >
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider opacity-50 select-none text-neutral-400">
                  Añadir Música
                </div>

                {/* Option a) Añadir archivos locales */}
                <button
                  id="navbar-add-files-btn"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAddFiles();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/10 group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:scale-105 transition-transform shrink-0">
                    <FileAudio className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                      Añadir archivos locales
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      Seleccionar pistas (MP3, FLAC, WAV...)
                    </div>
                  </div>
                </button>

                {/* Option b) Añadir carpeta */}
                <button
                  id="navbar-add-folder-btn"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAddFolder();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/10 group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                    <FolderPlus className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors">
                      Añadir carpeta
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      Escanear directorio completo de música
                    </div>
                  </div>
                </button>

                <div className="my-1.5 border-t border-white/10" />

                {/* Option c) Descargar desde URL */}
                <button
                  id="navbar-download-url-btn"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenDownloadModal();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-purple-500/15 group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 group-hover:scale-105 transition-transform shrink-0">
                    <DownloadCloud className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white group-hover:text-purple-300 transition-colors flex items-center gap-1.5">
                      Descargar desde URL
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200">
                        Nuevo
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      YouTube, enlaces directos y web
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Settings Menu Dropdown */}
          <div className="relative" ref={settingsRef}>
            <button
              id="navbar-settings-btn"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              title="Configuración"
              className={`p-2 sm:px-3.5 sm:py-2 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all shrink-0 cursor-pointer select-none ${
                isSettingsOpen
                  ? "bg-white/15 text-white border-white/30 shadow-sm"
                  : "hover:bg-white/10 text-neutral-200"
              }`}
              style={{
                borderColor: isSettingsOpen ? undefined : "var(--color-border-subtle)",
                color: "var(--color-text-primary)",
              }}
            >
              <Settings
                className={`w-4 h-4 transition-transform duration-300 ${
                  isSettingsOpen ? "rotate-90 text-white" : "opacity-80"
                }`}
              />
              <span className="hidden sm:inline">Configuración</span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 hidden sm:inline ${
                  isSettingsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isSettingsOpen && (
              <div
                id="navbar-settings-dropdown"
                className="absolute right-0 mt-2 w-64 rounded-2xl p-2 shadow-2xl border backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
                style={{
                  backgroundColor: "var(--color-surface, #181818)",
                  borderColor: "var(--color-border-subtle, rgba(255,255,255,0.15))",
                  boxShadow: "0 20px 45px rgba(0, 0, 0, 0.65)",
                }}
              >
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider opacity-50 select-none">
                  Configuración
                </div>

                {/* Botón Tema */}
                <button
                  id="settings-theme-btn"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onOpenTheme();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors text-left group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400 group-hover:bg-purple-500/25 transition-colors">
                    <Palette className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium text-xs">Tema</div>
                    <div className="text-[11px] opacity-60">Personalizar colores y estilo visual</div>
                  </div>
                </button>

                {/* Botón Ecualizador */}
                <button
                  id="settings-equalizer-btn"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onOpenEqualizer();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors text-left group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25 transition-colors">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium text-xs">Ecualizador</div>
                    <div className="text-[11px] opacity-60">Ajustar ecualización y bandas de audio</div>
                  </div>
                </button>

                {/* Canciones Ocultas en menú (fácil acceso en móvil) */}
                {hiddenCount !== undefined && hiddenCount > 0 && onOpenHiddenTracks && (
                  <button
                    id="settings-hidden-tracks-btn"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      onOpenHiddenTracks();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-red-500/15 transition-colors text-left group cursor-pointer"
                  >
                    <div className="p-2 rounded-lg bg-red-500/15 text-red-400 group-hover:bg-red-500/25 transition-colors">
                      <EyeOff className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-medium text-xs">Canciones Ocultas ({hiddenCount})</div>
                      <div className="text-[11px] opacity-60">Ver o restaurar pistas ocultas</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Tabs (visible on mobile screens < md) */}
      <nav
        id="mobile-nav-tabs"
        aria-label="Navegación móvil principal"
        className="flex md:hidden items-center justify-around px-3 py-2 border-b sticky top-[53px] z-25 backdrop-blur-xl"
        style={{
          backgroundColor: "var(--color-surface, #0c0c0c)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
        }}
      >
        <button
          id="mobile-nav-tab-home"
          onClick={() => onSelectTab("home")}
          className={`flex-1 py-2 px-2.5 rounded-full text-xs font-bold transition-all text-center ${
            activeTab === "home"
              ? "bg-white text-black shadow-sm"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Principal
        </button>
        <button
          id="mobile-nav-tab-library"
          onClick={() => onSelectTab("library")}
          className={`flex-1 py-2 px-2.5 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1 text-center ${
            activeTab === "library"
              ? "bg-white text-black shadow-sm"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Music2 className="w-3.5 h-3.5" />
          <span>Biblioteca</span>
        </button>
        <button
          id="mobile-nav-tab-favorites"
          onClick={() => onSelectTab("favorites")}
          className={`flex-1 py-2 px-2.5 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1 text-center ${
            activeTab === "favorites"
              ? "bg-white text-black shadow-sm"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500/20" />
          <span>Favoritas</span>
        </button>
      </nav>
    </>
  );
};
