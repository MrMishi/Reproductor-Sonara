import React from "react";
import { Search, HardDrive, Sliders, Palette, Music2, Heart, FolderPlus, X, PictureInPicture2, Smartphone, EyeOff } from "lucide-react";
import { ActiveTab } from "../types";
import { SonoraLogo } from "./SonoraLogo";

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenScanner: () => void;
  onOpenEqualizer: () => void;
  onOpenTheme: () => void;
  onOpenInstallModal?: () => void;
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
  onOpenScanner,
  onOpenEqualizer,
  onOpenTheme,
  onOpenInstallModal,
  onOpenHiddenTracks,
  hiddenCount,
  trackCount,
  isMiniMode,
  onToggleMiniMode,
}) => {
  return (
    <header
      id="ytm-navbar"
      className="sticky top-0 z-30 w-full px-4 lg:px-8 py-3 border-b flex items-center justify-between gap-4 backdrop-blur-xl transition-colors"
      style={{
        backgroundColor: "var(--color-surface, #030303)",
        borderColor: "var(--color-border-subtle, rgba(255,255,255,0.08))",
      }}
    >
      {/* Brand Logo & Nav Tabs */}
      <div className="flex items-center gap-6">
        <div
          id="sonora-logo"
          onClick={() => onSelectTab("home")}
          className="cursor-pointer select-none transition-transform active:scale-95"
        >
          <SonoraLogo size={36} />
        </div>

        {/* Primary Tabs */}
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
      <div className="flex-1 max-w-md mx-2">
        <div
          className="relative flex items-center rounded-full border px-3.5 py-1.5 transition-all focus-within:ring-2"
          style={{
            backgroundColor: "var(--color-bg, #141414)",
            borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
            // @ts-ignore
            "--tw-ring-color": "var(--color-accent)",
          }}
        >
          <Search className="w-4 h-4 opacity-50 shrink-0" />
          <input
            id="navbar-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar canciones, artistas o álbumes..."
            className="w-full bg-transparent text-xs sm:text-sm pl-2.5 pr-2 focus:outline-none placeholder:opacity-50"
            style={{ color: "var(--color-text-primary)" }}
          />
          {searchQuery && (
            <button
              id="navbar-search-clear-btn"
              onClick={() => onSearchChange("")}
              className="p-1 rounded-full hover:bg-white/10 opacity-60 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Install App / APK Button */}
        {onOpenInstallModal && (
          <button
            id="navbar-install-app-btn"
            onClick={onOpenInstallModal}
            title="Instalar en tu teléfono móvil (0 consumo de datos / Archivo APK)"
            className="p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span className="hidden lg:inline">Instalar App (APK/PWA)</span>
          </button>
        )}

        {/* Hidden Tracks Quick Access Button */}
        {hiddenCount !== undefined && hiddenCount > 0 && onOpenHiddenTracks && (
          <button
            id="navbar-hidden-tracks-btn"
            onClick={onOpenHiddenTracks}
            title="Ver archivos y canciones ocultas"
            className="p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <EyeOff className="w-4 h-4 text-red-400" />
            <span className="hidden xl:inline">Ocultas ({hiddenCount})</span>
          </button>
        )}

        {/* Modo Mini Gadget Button */}
        {onToggleMiniMode && (
          <button
            id="navbar-mini-mode-btn"
            onClick={onToggleMiniMode}
            title={
              isMiniMode
                ? "Restaurar barra de reproducción normal (Tecla M)"
                : "Activar Modo Mini (Gadget flotante) [Tecla M]"
            }
            className={`p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all shrink-0 ${
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

        {/* Device Scanner Button */}
        <button
          id="navbar-scan-device-btn"
          onClick={onOpenScanner}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full font-bold text-xs text-white shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{
            backgroundColor: "var(--color-accent, #FF0000)",
            boxShadow: "var(--theme-accent-glow)",
          }}
        >
          <HardDrive className="w-4 h-4" />
          <span className="hidden sm:inline">Escanear Dispositivo</span>
        </button>

        {/* Equalizer Quick Button */}
        <button
          id="navbar-equalizer-btn"
          onClick={onOpenEqualizer}
          title="Abrir Ecualizador"
          className="p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all hover:bg-white/10 shrink-0"
          style={{
            borderColor: "var(--color-border-subtle)",
            color: "var(--color-text-primary)",
          }}
        >
          <Sliders className="w-4 h-4" />
          <span className="hidden md:inline">Ecualizador</span>
        </button>

        {/* Theme & Colors Button */}
        <button
          id="navbar-theme-btn"
          onClick={onOpenTheme}
          title="Personalizar Temas y Colores"
          className="p-2 sm:px-3 sm:py-2 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all hover:bg-white/10 shrink-0"
          style={{
            borderColor: "var(--color-border-subtle)",
            color: "var(--color-text-primary)",
          }}
        >
          <Palette className="w-4 h-4" />
          <span className="hidden lg:inline">Colores & Tema</span>
        </button>
      </div>
    </header>
  );
};
