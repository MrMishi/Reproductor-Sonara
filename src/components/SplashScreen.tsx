/**
 * ============================================================================
 * SONARÁ - PANTALLA DE CARGA INICIAL (SplashScreen.tsx)
 * ============================================================================
 * Estilo: Lark Player / Minimalista Hi-Fi
 * Duración: 1.8 segundos con transición suave (fade-out).
 * Muestra el logo oficial neón animado de Sonará y el texto "Sonará".
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Temporizador de 1.7 segundos para iniciar la transición de salida
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, 1700);

    // Finalizar completamente tras la animación de desvanecimiento
    const finishTimer = setTimeout(() => {
      onFinish();
    }, 2100);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          id="sonora-splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeInOut" } }}
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#070709] select-none overflow-hidden"
          style={{
            backgroundImage: `
              radial-gradient(circle at 50% 45%, rgba(147, 51, 234, 0.18) 0%, transparent 60%),
              radial-gradient(circle at 50% 50%, rgba(236, 72, 153, 0.1) 0%, transparent 45%)
            `,
          }}
        >
          {/* Contenedor central con animación de entrada y pulso suave */}
          <div className="flex flex-col items-center justify-center gap-5 relative z-10 px-6">
            {/* Contenedor del logotipo neón */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              {/* Resplandor neón pulsante sutil */}
              <div
                className="absolute -inset-3 rounded-[32px] opacity-70 blur-2xl animate-pulse"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(236, 72, 153, 0.5) 0%, rgba(147, 51, 234, 0.7) 50%, rgba(59, 130, 246, 0.5) 100%)",
                }}
              />

              {/* Imagen del icono oficial */}
              <img
                src="/icon.png"
                alt="Sonora Logo"
                className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl object-cover shadow-[0_0_40px_rgba(147,51,234,0.4)] border border-white/20"
              />
            </motion.div>

            {/* Texto "Sonora" estilizado */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center text-center gap-1.5"
            >
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider text-white">
                <span className="bg-gradient-to-r from-white via-neutral-100 to-neutral-300 bg-clip-text text-transparent">
                  Sonora
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs font-semibold tracking-widest uppercase text-purple-300/80">
                Hi-Fi Music Player
              </p>
            </motion.div>
          </div>

          {/* Barra de progreso sutil inferior estilo Lark Player */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="absolute bottom-10 flex flex-col items-center gap-2"
          >
            <div className="w-24 h-1 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  ease: "easeInOut",
                }}
                className="w-1/2 h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
