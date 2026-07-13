// Chart.js の共通スタイル。元HTML版の CHART_DEFAULTS / axisStyle を移植。

export const CHART_DEFAULTS = {
  color: "rgba(35,42,77,0.80)",
  gridColor: "rgba(60,72,140,0.10)",
  teal: "#00c9a7",
  amber: "#f59e0b",
  red: "#f0506e",
  muted: "#8a90b0",
};

export function axisStyle() {
  return {
    ticks: { color: CHART_DEFAULTS.muted, font: { size: 11, family: "Inter" } },
    grid: { color: CHART_DEFAULTS.gridColor },
  };
}
