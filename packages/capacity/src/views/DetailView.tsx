// メンバー詳細ビュー。元HTML版 renderDetail を React 化。
import { useMemo } from "react";
import type { ChartConfiguration } from "chart.js";
import { useCapacity } from "../store";
import { ChartCanvas } from "../components/ChartCanvas";
import { axisStyle } from "../lib/chart";
import { barCol, diffCls, pct, rnd } from "../lib/utils";

export function DetailView() {
  const { allData, memberMeta, currentMember, currentMonth, setCurrentMonth, setPage } = useCapacity();

  const m = currentMember ? allData[currentMember] : undefined;
  const months = m ? Object.keys(m) : [];
  const d = m && currentMonth ? m[currentMonth] : undefined;

  const detailConfig = useMemo<ChartConfiguration | null>(() => {
    if (!m) return null;
    const mons = Object.keys(m);
    return {
      type: "bar",
      data: {
        labels: mons,
        datasets: [
          { label: "実績", data: mons.map((mo) => m[mo].actual || 0), backgroundColor: "rgba(0,201,167,.7)", borderRadius: 4, barPercentage: 0.5 },
          { label: "推奨", data: mons.map((mo) => m[mo].rec || 0), backgroundColor: "rgba(92,122,150,.2)", borderRadius: 4, barPercentage: 0.5 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${(c.raw as number).toFixed(1)}h` } } },
        scales: { y: { ...axisStyle(), beginAtZero: true, ticks: { ...axisStyle().ticks, callback: (v) => v + "h" } }, x: { ...axisStyle(), grid: { display: false } } },
      },
    };
  }, [m]);

  if (!currentMember || !m || !d) {
    return (
      <div className="main">
        <div className="card"><div className="empty-msg">メンバーを選択してください。</div></div>
      </div>
    );
  }

  const meta = memberMeta[currentMember] || {};
  const rate = pct(d.actual || 0, d.rec || 1);
  const diff = d.diff ?? rnd((d.actual || 0) - (d.rec || 0), 1);
  const ds = diff >= 0 ? "+" : "";
  const cols = Math.min(months.length, 6);

  return (
    <div className="main">
      <div className="detail-header">
        <div className="d-av">{currentMember[0]}</div>
        <div>
          <div className="d-name">{currentMember}</div>
          <div className="d-sub">{months.length}ヶ月分 · {meta.file_name || ""}</div>
        </div>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setPage("manager")}>← 戻る</button>
      </div>

      <div className="month-tabs">
        {months.map((mo) => (
          <button key={mo} className={"tab" + (mo === currentMonth ? " active" : "")} onClick={() => setCurrentMonth(mo)}>{mo}</button>
        ))}
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="kpi"><div className="kpi-label">実績稼働時間</div><div className="kpi-val">{(d.actual || 0).toFixed(1)}<span className="unit">h</span></div><div className="kpi-sub">シフト {d.shift || "—"}h</div></div>
        <div className="kpi"><div className="kpi-label">推奨稼働時間</div><div className="kpi-val">{d.rec || "—"}<span className="unit">h</span></div><div className="kpi-sub">目標上限</div></div>
        <div className="kpi"><div className="kpi-label">差分</div><div className={"kpi-val " + diffCls(diff)}>{ds}{diff}<span className="unit">h</span></div><div className="kpi-sub">実績 − 推奨</div></div>
        <div className="kpi"><div className="kpi-label">充足率</div><div className={"kpi-val " + (rate >= 80 ? "teal" : rate >= 55 ? "amber" : "red")}>{rate}<span className="unit">%</span></div><div className="kpi-sub">実績 / 推奨</div></div>
      </div>

      <p className="sec">稼働時間推移</p>
      <div className="card"><div className="chart-box"><div className="chart-canvas-wrap" style={{ height: 200 }}>{detailConfig && <ChartCanvas config={detailConfig} ariaLabel="推移" />}</div></div></div>

      <p className="sec">カテゴリ別内訳（当月）</p>
      <div className="card">
        <table>
          <thead><tr><th style={{ width: "36%" }}>項目</th><th style={{ width: "16%" }}>実績(h)</th><th style={{ width: "16%" }}>推奨(h)</th><th style={{ width: "20%" }}>進捗</th><th style={{ width: "12%" }}>状態</th></tr></thead>
          <tbody>
            {(d.items || []).map((item, i) => {
              const p = pct(item.actual, item.rec);
              const bCls = item.actual > item.rec ? "b-over" : item.actual >= item.rec * 0.7 ? "b-ok" : "b-warn";
              const bLbl = item.actual > item.rec ? "超過" : item.actual >= item.rec * 0.7 ? "適正" : "不足";
              return (
                <tr key={item.name + i}>
                  <td>{item.name}</td>
                  <td>{item.actual.toFixed(1)}</td>
                  <td className="muted">{item.rec || "—"}</td>
                  <td><span style={{ fontSize: 11 }}>{p}%</span><div className="bar-bg"><div className="bar-fill" style={{ width: `${p}%`, background: barCol(p) }} /></div></td>
                  <td><span className={`badge ${bCls}`}>{bLbl}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="sec">月別サマリ</p>
      <div className="card">
        <div className="history-strip" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
          {months.map((mo) => {
            const dd = m[mo];
            const dif = dd.diff ?? rnd((dd.actual || 0) - (dd.rec || 0), 1);
            const ds2 = dif >= 0 ? "+" : "";
            return (
              <div className="hcol" key={mo}>
                <div className="hcol-mo">{mo}</div>
                <div className="hcol-v">{(dd.actual || 0).toFixed(0)}h</div>
                <div className="hcol-r">推奨 {dd.rec || "—"}h</div>
                <div className={"hcol-d " + diffCls(dif)}>{ds2}{dif}h</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
