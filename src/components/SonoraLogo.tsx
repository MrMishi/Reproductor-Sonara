import React from "react";

interface SonoraLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

export const SonoraLogo: React.FC<SonoraLogoProps> = ({
  size = 36,
  className = "",
  showText = true,
  textClassName = "",
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Icono oficial de Sonará (S con audífonos neón) */}
      <img
        src="/icon.png"
        alt="Sonora"
        className="shrink-0 object-cover rounded-xl shadow-lg border border-white/10 transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
        }}
      />

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black text-lg tracking-tight text-white ${textClassName}`}
              style={{ letterSpacing: "-0.03em" }}
            >
              Sonora
            </span>
          </div>
          <span className="text-[10px] font-medium tracking-wide text-neutral-400">
            Music Player
          </span>
        </div>
      )}
    </div>
  );
};
