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
      {/* Dynamic Sonora Sonic Emblem */}
      <div
        className="relative flex items-center justify-center shrink-0 rounded-2xl shadow-lg transition-transform hover:scale-105"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #7C3AED 0%, #6366F1 50%, #06B6D4 100%)",
          boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4)",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-[72%] h-[72%]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Sonic concentric wave arcs */}
          <path
            d="M20 50C20 33.4315 33.4315 20 50 20"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeOpacity="0.45"
          />
          <path
            d="M80 50C80 66.5685 66.5685 80 50 80"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeOpacity="0.45"
          />
          <path
            d="M30 50C30 38.9543 38.9543 30 50 30"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
          <path
            d="M70 50C70 61.0457 61.0457 70 50 70"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
          {/* Center Play Core with acoustic wave bars */}
          <polygon
            points="46,38 46,62 66,50"
            fill="white"
            className="drop-shadow-md"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black text-lg tracking-tight text-white ${textClassName}`}
              style={{ letterSpacing: "-0.03em" }}
            >
              Sonora
            </span>
            <span
              className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-cyan-300 border border-cyan-400/30"
              style={{
                background: "linear-gradient(90deg, rgba(124,58,237,0.3) 0%, rgba(6,182,212,0.3) 100%)",
              }}
            >
              Hi-Fi
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
