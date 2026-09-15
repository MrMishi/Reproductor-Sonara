/**
 * ============================================================================
 * SONORA MUSIC - PANTALLA DE BIENVENIDA / ONBOARDING (WelcomeScreen.tsx)
 * ============================================================================
 * Responsabilidad:
 * Pantalla de introducción visual para nuevos usuarios de Sonará.
 * Se muestra si 'hasSeenWelcome' no está configurado como 'true' en localStorage.
 * Incluye el nuevo logo oficial neón, presentación del reproductor Hi-Fi y
 * transición suave (fade-out) hacia la biblioteca principal.
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Music, Sparkles, Sliders, ArrowRight } from "lucide-react";

interface WelcomeScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="welcome-screen-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: "easeInOut" } }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-[#0A0915] select-none overflow-hidden"
          style={{
            backgroundImage: `
              radial-gradient(circle at 50% 30%, rgba(124, 58, 237, 0.25) 0%, transparent 60%),
              radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 20% 70%, rgba(59, 130, 246, 0.15) 0%, transparent 50%)
            `,
          }}
        >
          {/* Luz ambiental de fondo */}
          <div className="absolute inset-0 pointer-events-none backdrop-blur-3xl" />

          {/* Tarjeta central de bienvenida */}
          <motion.div
            initial={{ scale: 0.92, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: -10, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg flex flex-col items-center text-center px-4 py-8 sm:px-8"
          >
            {/* Contenedor del Logotipo Oficial con brillo neón y animación de pulso */}
            <div className="relative mb-6 sm:mb-8 group">
              {/* Resplandor neón exterior */}
              <div
                className="absolute -inset-2 rounded-[28px] opacity-75 blur-xl transition-all duration-1000 group-hover:opacity-100 animate-pulse"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(249, 115, 22, 0.6) 0%, rgba(168, 85, 247, 0.8) 50%, rgba(99, 102, 241, 0.6) 100%)",
                }}
              />

              {/* Imagen del nuevo ícono oficial */}
              <img
                src="/icon.png"
                alt="Sonará Music Logo"
                className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-3xl object-cover shadow-2xl border border-white/20 transition-transform duration-300 hover:scale-105"
              />
            </div>

            {/* Título Principal */}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2.5">
              ¡Bienvenido a <span className="bg-gradient-to-r from-amber-300 via-purple-300 to-pink-400 bg-clip-text text-transparent">Sonará</span>!
            </h1>

            {/* Subtítulo descriptivo */}
            <p className="text-sm sm:text-base text-neutral-300 max-w-md font-medium leading-relaxed mb-7 sm:mb-8">
              Tu reproductor de música Hi-Fi ligero, moderno y personalizado.
            </p>

            {/* Características destacadas (Pills informativas sutiles) */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-md mb-8">
              <div className="flex flex-col items-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                <Music className="w-5 h-5 text-purple-400 mb-1.5" />
                <span className="text-[11px] font-semibold text-neutral-200">Hi-Fi Local</span>
                <span className="text-[9px] text-neutral-400">Audio sin pérdida</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                <Sliders className="w-5 h-5 text-indigo-400 mb-1.5" />
                <span className="text-[11px] font-semibold text-neutral-200">Ecualizador</span>
                <span className="text-[9px] text-neutral-400">10 bandas + Bass</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
                <Sparkles className="w-5 h-5 text-pink-400 mb-1.5" />
                <span className="text-[11px] font-semibold text-neutral-200">Letras Sinc</span>
                <span className="text-[9px] text-neutral-400">LRC & Traducción</span>
              </div>
            </div>

            {/* Botón Principal de Acción */}
            <button
              id="welcome-start-btn"
              onClick={onClose}
              className="w-full max-w-xs py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base text-white flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-xl"
              style={{
                background: "linear-gradient(135deg, #7C3AED 0%, #6366F1 50%, #EC4899 100%)",
                boxShadow: "0 8px 30px rgba(124, 58, 237, 0.45)",
              }}
            >
              <span>Explorar mi Música</span>
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
