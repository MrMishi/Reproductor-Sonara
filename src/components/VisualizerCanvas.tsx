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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const freqData = new Uint8Array(64);
    const timeData = new Uint8Array(128);

    // Responsive resolution matching bounding box
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }
    };
    updateSize();

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(canvas);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const activeColor =
        color ||
        getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
        "#8B5CF6";

      if (type === "bars") {
        audioEngine.getFrequencyData(freqData);

        const barCount = 36;
        const barWidth = (width / barCount) * 0.75;
        const gap = (width - barWidth * barCount) / (barCount - 1);

        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, `${activeColor}44`);
        gradient.addColorStop(0.6, activeColor);
        gradient.addColorStop(1, "#FFFFFF");

        for (let i = 0; i < barCount; i++) {
          const sampleIndex = Math.floor((i / barCount) * (freqData.length * 0.8));
          let val = isPlaying ? freqData[sampleIndex] : 6 + Math.sin(Date.now() / 300 + i) * 4;
          const barHeight = Math.max(4, (val / 255) * height * 0.95);

          const x = i * (barWidth + gap);
          const y = height - barHeight;

          // Draw rounded pill bar
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [barWidth / 2, barWidth / 2, 0, 0]);
          ctx.fill();
        }
      } else if (type === "wave") {
        audioEngine.getTimeDomainData(timeData);

        ctx.lineWidth = 2.5 * window.devicePixelRatio;
        ctx.strokeStyle = activeColor;
        ctx.beginPath();

        const sliceWidth = width / timeData.length;
        let x = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = isPlaying ? timeData[i] / 128.0 : 1.0 + Math.sin(Date.now() / 400 + i * 0.1) * 0.05;
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
      }

      animFrameId.current = requestAnimationFrame(render);
    };

    animFrameId.current = requestAnimationFrame(render);

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      resizeObserver.disconnect();
    };
  }, [type, color, isPlaying]);

  return <canvas id="audio-visualizer-canvas" ref={canvasRef} className={className} />;
};
