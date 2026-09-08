import React, { useEffect, useRef } from "react";
import { audioEngine } from "../services/audioEngine";

interface VisualizerCanvasProps {
  className?: string;
  type?: "bars" | "wave" | "circle";
  color?: string;
  isPlaying?: boolean;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({
  className = "w-full h-24",
  type = "bars",
  color,
  isPlaying = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const freqData = new Uint8Array(64);
    const timeData = new Uint8Array(128);

    // Responsive resolution matching bounding box with retina support capped for performance
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const newWidth = Math.floor(rect.width * dpr);
        const newHeight = Math.floor(rect.height * dpr);
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          canvas.width = newWidth;
          canvas.height = newHeight;
        }
      }
    };
    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
      if (!isPlaying) drawFrame(false);
    });
    resizeObserver.observe(canvas);

    // Dibuja un cuadro específico (activo o en reposo estático)
    const drawFrame = (activeAudio: boolean) => {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);

      const activeColor =
        color ||
        getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
        "#8B5CF6";

      if (type === "bars") {
        if (activeAudio) {
          audioEngine.getFrequencyData(freqData);
        }

        const barCount = 32; // Reducido a 32 barras para máximo rendimiento en móviles
        const barWidth = (width / barCount) * 0.72;
        const gap = (width - barWidth * barCount) / (barCount - 1);

        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, `${activeColor}33`);
        gradient.addColorStop(0.7, activeColor);
        gradient.addColorStop(1, "#FFFFFF");

        for (let i = 0; i < barCount; i++) {
          const sampleIndex = Math.floor((i / barCount) * (freqData.length * 0.8));
          const val = activeAudio ? freqData[sampleIndex] : 12;
          const barHeight = Math.max(3, (val / 255) * height * 0.9);

          const x = i * (barWidth + gap);
          const y = height - barHeight;

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 0, 0]);
          ctx.fill();
        }
      } else if (type === "wave") {
        if (activeAudio) {
          audioEngine.getTimeDomainData(timeData);
        }

        ctx.lineWidth = 2 * Math.min(window.devicePixelRatio || 1, 2);
        ctx.strokeStyle = activeColor;
        ctx.beginPath();

        const sliceWidth = width / timeData.length;
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = activeAudio ? timeData[i] / 128.0 : 1.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      } else if (type === "circle") {
        if (activeAudio) {
          audioEngine.getFrequencyData(freqData);
        }

        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.22;
        const barCount = 36;

        let avgFreq = 0;
        if (activeAudio) {
          for (let i = 0; i < 16; i++) avgFreq += freqData[i];
          avgFreq = avgFreq / 16;
        }
        const pulse = activeAudio ? (avgFreq / 255) * 10 : 0;

        // Anillo central
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + pulse, 0, Math.PI * 2);
        ctx.fillStyle = `${activeColor}22`;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = activeColor;
        ctx.stroke();

        // Barras radiales
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
          const sampleIndex = Math.floor((i / barCount) * (freqData.length * 0.7));
          const val = activeAudio ? freqData[sampleIndex] : 10;
          const barLen = Math.max(3, (val / 255) * (Math.min(width, height) * 0.22));

          const startX = centerX + Math.cos(angle) * (baseRadius + 4);
          const startY = centerY + Math.sin(angle) * (baseRadius + 4);
          const endX = centerX + Math.cos(angle) * (baseRadius + 4 + barLen);
          const endY = centerY + Math.sin(angle) * (baseRadius + 4 + barLen);

          ctx.lineWidth = 2.5;
          ctx.strokeStyle = activeColor;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      }
    };

    // Si NO está reproduciendo, dibuja un cuadro estático de reposo y DETIENE el bucle por completo
    if (!isPlaying) {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
        animFrameId.current = null;
      }
      drawFrame(false);
      return () => {
        resizeObserver.disconnect();
      };
    }

    // Bucle animado eficiente controlado a ~35 FPS para no saturar el hilo principal
    let lastTime = 0;
    const targetInterval = 28; // ~35 FPS: fluidez visual idéntica con -70% de consumo CPU

    const loop = (now: number) => {
      if (!isMountedRef.current) return;

      // Si la pestaña o pantalla está minimizada, no calcules nada
      if (document.hidden) {
        animFrameId.current = requestAnimationFrame(loop);
        return;
      }

      const delta = now - lastTime;
      if (delta >= targetInterval) {
        lastTime = now - (delta % targetInterval);
        drawFrame(true);
      }

      animFrameId.current = requestAnimationFrame(loop);
    };

    animFrameId.current = requestAnimationFrame(loop);

    // Event listener para suspender el bucle cuando la app/pestaña se minimiza
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animFrameId.current) {
          cancelAnimationFrame(animFrameId.current);
          animFrameId.current = null;
        }
      } else if (isPlaying) {
        if (!animFrameId.current) {
          lastTime = performance.now();
          animFrameId.current = requestAnimationFrame(loop);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
        animFrameId.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
    };
  }, [type, color, isPlaying]);

  return <canvas id="audio-visualizer-canvas" ref={canvasRef} className={className} />;
};
