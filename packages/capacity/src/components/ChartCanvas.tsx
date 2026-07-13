// Chart.js を React で使うためのラッパー。
// config が変わるたびに Chart インスタンスを作り直す（元HTML版の mkChart/destroyChart 相当）。
import { useEffect, useRef, type CSSProperties } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";

export type ChartCanvasProps = {
  config: ChartConfiguration;
  ariaLabel?: string;
  style?: CSSProperties;
};

export function ChartCanvas({ config, ariaLabel, style }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(el, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config]);

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} style={style} />;
}
