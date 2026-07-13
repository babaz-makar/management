// メンバー一覧ビュー。元HTML版 renderOverview を React 化。
import { useMemo } from "react";
import type { ChartConfiguration } from "chart.js";
import { useCapacity } from "../store";
import { ChartCanvas } from "../components/ChartCanvas";
import { axisStyle } from "../lib/chart";
import { allMonthKeys, barCol, clientCount, diffCls, latestEntry, pct, rnd } from "../lib/utils";

export function OverviewView() {
  const { allData, openDetail } = useCapacity();

  const model = useMemo(() => {
    const loaded = Object.keys(allData).filter((n) => Object.keys(allData[n] || {}).length > 0);
    let totalA = 0, totalR = 0, alertC = 0;
    loaded.forEach((n) => {
      const [, d] = latestEntry(allData, n);
      if (!d) return;
      totalA += d.actual || 0;
      totalR += d.rec || 0;
      if (pct(d.actual || 0, d.rec || 1) < 60) alertC++;
    });
    return { loaded, totalA, alertC, uRate: pct(totalA, totalR), months: allMonthKeys(allData) };
  }, [allData]);

  const { loaded, totalA, alertC, uRate, months } = model;

  const overviewConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "bar",
      data: {
        labels: loaded,
        datasets: [
          {
            label: "充足率(%)",
            data: loaded.map((n) => { const [, d] = latestEntry(allData, n); return pct(d?.actual || 0, d?.rec || 1); }),
            backgroundColor: loaded.map((n) => { const [, d] = latestEntry(allData, n); return barCol(pct(d?.actual || 0, d?.rec || 1)); }),
            borderRadius: 4,
            barPercentage: 0.55,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `充足率: ${c.raw}%` } } },
        scales: { y: { ...axisStyle(), beginAtZero: true, max: 120, ticks: { ...axisStyle().ticks, callback: (v) => v + "%" } }, x: { ...axisStyle(), grid: { display: false } } },
      },
    }),
    [allData, loaded]
  );

  const trendConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        labels: months,
        datasets: [
          { label: "実績", data: months.map((mo) => Object.keys(allData).reduce((s, n) => s + (allData[n]?.[mo]?.actual || 0), 0)), borderColor: "#00c9a7", backgroundColor: "rgba(0,201,167,.08)", fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2 },
          { label: "推奨", data: months.map((mo) => Object.keys(allData).reduce((s, n) => s + (allData[n]?.[mo]?.rec || 0), 0)), borderColor: "rgba(92,122,150,.6)", borderDash: [4, 3], fill: false, tension: 0, pointRadius: 3, borderWidth: 1.5 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${rnd(c.raw as number, 0)}h` } } },
        scales: { y: { ...axisStyle(), beginAtZero: true, ticks: { ...axisStyle().ticks, callback: (v) => v + "h" } }, x: { ...axisStyle(), grid: { display: false } } },
      },
    }),
    [allData, months]
  );

  return (
    <div className="main">
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="kpi"><div className="kpi-label">Unit 合計実績</div><div className="kpi-val teal">{rnd(totalA, 0)}h</div></div>
        <div className="kpi"><div className="kpi-label">Unit 充足率</div><div className={"kpi-val " + (uRate >= 80 ? "teal" : uRate >= 60 ? "amber" : "red")}>{uRate}%</div></div>
        <div className="kpi"><div className="kpi-label">注意メンバー</div><div className={"kpi-val " + (alertC > 0 ? "red" : "teal")}>{alertC}名</div><div className="kpi-sub">充足率60%未満</div></div>
      </div>

      <p className="sec">メンバー別 最新月キャパ</p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: "13%" }}>メンバー</th><th style={{ width: "10%" }}>対象月</th>
              <th style={{ width: "10%" }}>シフト(h)</th><th style={{ width: "10%" }}>実績(h)</th>
              <th style={{ width: "10%" }}>推奨(h)</th><th style={{ width: "8%" }}>差分(h)</th>
              <th style={{ width: "22%" }}>充足率</th><th style={{ width: "9%" }}>担当社数</th>
              <th style={{ width: "8%" }}>状態</th>
            </tr>
          </thead>
          <tbody>
            {loaded.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>設定画面でメンバーを登録してください</td></tr>
            ) : (
              loaded.map((n) => {
                const [month, d] = latestEntry(allData, n);
                if (!d) return null;
                const diff = d.diff ?? rnd((d.actual || 0) - (d.rec || 0), 1);
                const rate = pct(d.actual || 0, d.rec || 1);
                const ds = diff >= 0 ? "+" : "";
                const bCls = (d.actual || 0) > (d.rec || 0) ? "b-over" : rate >= 80 ? "b-ok" : rate >= 60 ? "b-warn" : "b-crit";
                const bLbl = (d.actual || 0) > (d.rec || 0) ? "超過" : rate >= 80 ? "適正" : rate >= 60 ? "注意" : "要確認";
                return (
                  <tr key={n}>
                    <td><span className="name-link" onClick={() => openDetail(n)}>{n}</span></td>
                    <td className="muted" style={{ fontSize: 11 }}>{month || "—"}</td>
                    <td>{d.shift || "—"}</td>
                    <td className="fw6">{(d.actual || 0).toFixed(1)}</td>
                    <td className="muted">{d.rec || "—"}</td>
                    <td className={diffCls(diff)} style={{ fontWeight: 600 }}>{ds}{diff}</td>
                    <td>
                      <span style={{ fontSize: 12 }}>{rate}%</span>
                      <div className="bar-bg"><div className="bar-fill" style={{ width: `${rate}%`, background: barCol(rate) }} /></div>
                    </td>
                    <td style={{ textAlign: "center" }}>{clientCount(d) || "—"}</td>
                    <td><span className={`badge ${bCls}`}>{bLbl}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="sec">充足率比較</p>
      <div className="card"><div className="chart-box"><div className="chart-canvas-wrap" style={{ height: 240 }}><ChartCanvas config={overviewConfig} ariaLabel="充足率" /></div></div></div>

      <p className="sec">月別稼働推移 — unit合計</p>
      <div className="card"><div className="chart-box"><div className="chart-canvas-wrap" style={{ height: 180 }}><ChartCanvas config={trendConfig} ariaLabel="推移" /></div></div></div>
    </div>
  );
}
