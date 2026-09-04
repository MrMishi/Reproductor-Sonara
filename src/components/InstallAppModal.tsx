import React, { useState, useEffect } from "react";
import {
  X,
  Smartphone,
  Download,
  CheckCircle2,
  ExternalLink,
  WifiOff,
  Zap,
  HardDrive,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstallSuccess?: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [installStatus, setInstallStatus] = useState<string>("");

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setInstallStatus("¡Instalación aceptada! La aplicación se está añadiendo a tu dispositivo.");
          if (onInstallSuccess) onInstallSuccess();
          setTimeout(() => onClose(), 2000);
        } else {
          setInstallStatus("Instalación cancelada por el usuario.");
        }
      } catch (err) {
        console.warn("Install error:", err);
      }
    }
  };

  const handleCopyUrl = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="install-app-modal"
        className="w-full max-w-xl rounded-3xl border shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto no-scrollbar"
        style={{
          backgroundColor: "var(--color-surface-elevated, #1a1a1a)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
          color: "var(--color-text-primary, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b pb-4"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0"
              style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Instalar en tu Teléfono (PWA / APK)
              </h2>
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Úsala como app nativa 100% offline sin consumir datos móviles
              </p>
            </div>
          </div>

          <button
            id="close-install-modal-btn"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Highlight Perks Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1.5">
            <WifiOff className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white">0 Consumo de Datos</span>
            <span className="text-[11px] opacity-70">
              La app se guarda en tu teléfono y reproduce tu música local sin internet.
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1.5">
            <HardDrive className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white">App Nativa e Icono</span>
            <span className="text-[11px] opacity-70">
              Se abre desde la pantalla de inicio a pantalla completa sin barra de navegador.
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white">Carga Instantánea</span>
            <span className="text-[11px] opacity-70">
              Inicia inmediatamente gracias al Service Worker y almacenamiento local.
            </span>
          </div>
        </div>

        {/* Direct Install Button if supported */}
        {deferredPrompt && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/50 to-neutral-900 border border-red-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">Tu navegador soporta instalación directa</p>
              <p className="text-xs opacity-70">Presiona el botón para añadir la aplicación a tu móvil ahora.</p>
            </div>
            <button
              id="direct-install-pwa-btn"
              onClick={handleInstallClick}
              className="px-5 py-2.5 rounded-full font-bold text-xs text-white shadow-lg transition-all hover:scale-105 shrink-0 flex items-center gap-2 cursor-pointer"
              style={{ backgroundColor: "var(--color-accent, #FF0000)" }}
            >
              <Download className="w-4 h-4" />
              <span>Instalar Aplicación</span>
            </button>
          </div>
        )}

        {installStatus && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{installStatus}</span>
          </div>
        )}

        {/* Step-by-Step Instructions */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-wider opacity-70">
            ¿Cómo instalarlo en tu teléfono móvil?
          </h3>

          {/* Option 1: Chrome / Android Direct PWA */}
          <div className="p-4 rounded-2xl border bg-white/5 border-white/10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full text-white font-bold text-xs flex items-center justify-center shadow-sm"
                style={{ backgroundColor: "var(--color-accent, #7C3AED)" }}
              >
                1
              </span>
              <span className="text-sm font-bold text-white">
                Método Oficial: Instalar como PWA (Recomendado)
              </span>
            </div>

            <ol className="text-xs space-y-2 pl-8 list-decimal opacity-85">
              <li>
                Abre esta misma dirección en <strong>Google Chrome</strong>, <strong>Brave</strong> o{" "}
                <strong>Samsung Internet</strong> desde tu teléfono.
              </li>
              <li>
                Toca el menú de opciones (los <strong>tres puntos verticales ⋮</strong> en la esquina superior derecha del navegador).
              </li>
              <li>
                Selecciona la opción <strong>"Instalar aplicación"</strong> o{" "}
                <strong>"Añadir a la pantalla de inicio"</strong>.
              </li>
              <li>
                ¡Listo! Aparecerá el icono de <strong>Sonora</strong> en tu teléfono. Al abrirlo, se ejecuta como una aplicación nativa, almacena los archivos en la memoria interna y <strong>no gastará tus datos móviles</strong>.
              </li>
            </ol>
          </div>

          {/* Option 2: APK Installer (.apk) */}
          <div className="p-4 rounded-2xl border bg-white/5 border-white/10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-neutral-700 text-white font-bold text-xs flex items-center justify-center">
                2
              </span>
              <span className="text-sm font-bold text-white">
                Generar archivo instalador APK (.apk)
              </span>
            </div>

            <p className="text-xs opacity-80 pl-8">
              Si necesitas obligatoriamente un archivo con extensión <strong>.apk</strong> para instalarlo manualmente o compartirlo:
            </p>

            <div className="pl-8 flex flex-col gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-neutral-900 border border-white/10 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] truncate opacity-75">
                  {window.location.href}
                </span>
                <button
                  onClick={handleCopyUrl}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copiado" : "Copiar URL"}</span>
                </button>
              </div>

              <p className="opacity-80">
                1. Entra en <strong>PWABuilder</strong> (herramienta oficial de Microsoft para convertir PWAs en APK de Android).
              </p>
              <p className="opacity-80">
                2. Pega la URL de tu reproductor y haz clic en <strong>"Start"</strong>.
              </p>
              <p className="opacity-80">
                3. Selecciona <strong>"Package for Android"</strong> y descarga tu paquete <strong>.apk</strong> para instalarlo en tu móvil con un solo clic.
              </p>

              <a
                href="https://www.pwabuilder.com"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-semibold"
              >
                <span>Abrir PWABuilder.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Privacy & Offline Banner */}
        <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center gap-2.5 text-[11px] text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>
            Todo el código, interfaz y reproductor quedan guardados en la memoria de tu móvil. No necesitas conexión a internet para disfrutar tu biblioteca.
          </span>
        </div>
      </div>
    </div>
  );
};
