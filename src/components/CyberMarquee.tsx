import React, { useRef, useState, useEffect, useLayoutEffect } from "react";

interface CyberMarqueeProps {
  text: string;
  className?: string;
  active?: boolean;
  animateOnHover?: boolean;
  alwaysAnimate?: boolean;
  title?: string;
}

/**
 * CyberMarquee: Componente de texto con desplazamiento horizontal suave (Marquee)
 * para títulos de canciones y artistas largos con estética Cyberpunk.
 * 
 * - Si el texto cabe en el espacio disponible, se muestra estático sin animaciones.
 * - Si el texto desborda, calcula la distancia exacta y activa un scroll horizontal fluido
 *   (ping-pong con pausa inicial y final para lectura óptima).
 * - Se activa en canciones en reproducción (active=true), al pasar el cursor o al tocar.
 */
export const CyberMarquee: React.FC<CyberMarqueeProps> = ({
  text,
  className = "",
  active = false,
  animateOnHover = true,
  alwaysAnimate = false,
  title,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDist, setOverflowDist] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Medir desbordamiento cada vez que cambia el texto o el tamaño de la ventana
  const measure = () => {
    if (containerRef.current && textRef.current) {
      const cWidth = containerRef.current.clientWidth;
      const tWidth = textRef.current.scrollWidth;
      const diff = tWidth - cWidth;
      setOverflowDist(diff > 2 ? diff : 0);
    }
  };

  useLayoutEffect(() => {
    measure();
  }, [text]);

  useEffect(() => {
    const handleResize = () => measure();
    window.addEventListener("resize", handleResize);

    let observer: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (observer) observer.disconnect();
    };
  }, [text]);

  const isOverflowing = overflowDist > 0;
  const shouldAnimate = isOverflowing && (alwaysAnimate || active || (animateOnHover && isHovered));

  // Velocidad constante legible: ~28px por segundo + pausas en extremos
  const durationSec = Math.max(3.5, overflowDist / 26) + 1.5;

  return (
    <div
      ref={containerRef}
      title={title || text}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => {
        // En móvil, mantener unos segundos tras el toque y restaurar
        setTimeout(() => setIsHovered(false), 2500);
      }}
      className={`overflow-hidden relative max-w-full block select-none ${className}`}
      style={
        {
          "--marquee-dist": `${overflowDist + 6}px`,
        } as React.CSSProperties
      }
    >
      <span
        ref={textRef}
        className={`inline-block whitespace-nowrap will-change-transform ${
          !isOverflowing ? "truncate" : ""
        }`}
        style={
          shouldAnimate
            ? {
                animation: `cyber-marquee-pingpong ${durationSec}s cubic-bezier(0.42, 0, 0.58, 1) infinite alternate`,
              }
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
};
