/**
 * ============================================================================
 * SONORA MUSIC - DIÁLOGO FLOTANTE DE PERMISOS (PermissionRequiredModal.tsx)
 * ============================================================================
 * Propósito y especificación técnica:
 * Este componente se activa cuando los permisos 'READ_MEDIA_AUDIO' / 'READ_EXTERNAL_STORAGE'
 * se encuentran denegados al intentar escanear o importar música o videos.
 *
 * En lugar de emitir mensajes genéricos o suposiciones, presenta un diálogo flotante
 * claro e inequívoco con el texto exacto requerido:
 * "Se requiere acceso a tus archivos de audio para importar música"
 * y un botón "Permitir" que abre directamente la pantalla de Ajustes de la Aplicación
 * en el sistema Android (ACTION_APPLICATION_DETAILS_SETTINGS) para habilitar el permiso.
 */

import React from "react";
import { ShieldAlert, Settings, X, Music } from "lucide-react";
import { openNativeAppSettings } from "../services/nativeFolderPicker";

interface PermissionRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted?: () => void;
}

export const PermissionRequiredModal: React.FC<PermissionRequiredModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleAllowClick = async () => {
    // Abre directamente la pantalla de Ajustes de la Aplicación en Android
    await openNativeAppSettings();
    onClose();
  };

  return (
    <div
      id="permission-required-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="permission-required-dialog"
        className="relative w-full max-w-md p-6 rounded-2xl border shadow-2xl overflow-hidden bg-neutral-900 border-neutral-800 text-white animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: "var(--color-surface, #141414)",
          borderColor: "var(--color-border-subtle, rgba(255,255,255,0.12))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          id="permission-close-x-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Cerrar diálogo"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Icono de advertencia y música */}
          <div className="relative mb-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-purple-600 border-2 border-neutral-900 flex items-center justify-center text-white">
              <Music className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Mensaje mandatorio exacto */}
          <h3
            id="permission-required-title"
            className="text-lg font-bold tracking-tight text-white mb-2 leading-snug"
          >
            Se requiere acceso a tus archivos de audio para importar música
          </h3>

          {/* Explicación concisa y amigable */}
          <p className="text-xs text-neutral-300 mb-6 leading-relaxed">
            Para escanear tu almacenamiento y reproducir canciones o el audio de tus videos locales,
            Sonora necesita autorización para leer los archivos multimedia de tu dispositivo.
          </p>

          {/* Acciones principales */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <button
              id="permission-cancel-btn"
              onClick={onClose}
              className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              id="permission-allow-btn"
              onClick={handleAllowClick}
              className="w-full sm:w-1/2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Permitir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
