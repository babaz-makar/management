// マネージャービュー。元HTML版 renderManager を React 化。
import { useMemo } from "react";
import type { ChartConfiguration } from "chart.js";
import { useCapacity } from "../store";
import { ChartCanvas } from "../components/ChartCanvas";
import { axisStyle } from "../lib/chart";
import {
  allMonthKeys,
  barCol,
  clientCount,
  diffCls,
  heatColor,
  itemHours,
  latestEntry,
  pct,
  rnd,
} from "../lib/utils";

const CLIENT_ITEMS = ["スタンダード1社", "スタンダード2社", "スタンダード3社", "アドバンス1社", "アドバンス2社", "ライト"];
const INVEST_ITEMS = ["リーダー", "育成unit", "採用広報unit", "動画TM"];
const MGMT_ITEMS = ["会議", "会議前準備"];

export function ManagerView() {
  const { allData, openDetail } = useCapacity();

  const model = useMemo(() => {
    const names = Object.keys(allData);
    const loaded = names.filter((n) => Object.keys(allData[n] || {}).length > 0);
    const months = allMonthKeys(allData);
    const latestMo = months[months.length - 1];

    // ── KPI ──
    let totalActual = 0, totalRec = 0, totalShift = 0, totalClients = 0, alertCount = 0;
    loaded.forEach((n) => {
      const d = allData[n]?.[latestMo];
      if (!d) return;
      totalActual += d.actual || 0;
      totalRec += d.rec || 0;
      totalShift += d.shift || 0;
      totalClients += clientCount(d);
      if (pct(d.actual || 0, d.rec || 1) < 60) alertCount++;
    });
    const unitRate = pct(totalActual, totalRec);
    const shiftRate = totalShift ? Math.min(Math.round((totalActual / totalShift) * 100), 100) : 0;

    // ── Heatmap ──
    const hmMonths = months.filter((mo) => /^\d+\s*月$/.test(mo)).sort((a, b) => parseInt(a) - parseInt(b));

    // ── Gap ranking (top 6) ──
    const gapMap: Record<string, { actual: number; rec: number }> = {};
    loaded.forEach((n) => {
      const d = allData[n]?.[latestMo];
      if (!d) return;
      (d.items || []).forEach((it) => {
        if (!gapMap[it.name]) gapMap[it.name] = { actual: 0, rec: 0 };
        gapMap[it.name].actual += it.actual || 0;
        gapMap[it.name].rec += it.rec || 0;
      });
    });
    const gapSorted = Object.entries(gapMap)
      .sort((a, b) => Math.abs(b[1].actual - b[1].rec) - Math.abs(a[1].actual - a[1].rec))
      .slice(0, 6);
    const maxRec = Math.max(...gapSorted.map(([, v]) => v.rec || 1), 1);

    // ── Allocation ──
    let clientH = 0, investH = 0, mgmtH = 0, otherH = 0;
    loaded.forEach((n) => {
      const d = allData[n]?.[latestMo];
      if (!d) return;
      (d.items || []).forEach((it) => {
        if (CLIENT_ITEMS.some((c) => it.name.includes(c.replace(/[0-9]/g, "").trim()) || it.name === c)) clientH += it.actual || 0;
        else if (INVEST_ITEMS.includes(it.name)) investH += it.actual || 0;
        else if (MGMT_ITEMS.includes(it.name)) mgmtH += it.actual || 0;
        else otherH += it.actual || 0;
      });
    });

    return {
      loaded, months, latestMo, hmMonths, gapSorted, maxRec,
      totalActual, totalRec, totalShift, totalClients, alertCount, unitRate, shiftRate,
      alloc: { clientH, investH, mgmtH, otherH },
    };
  }, [allData]);

  const {
    loaded, months, hmMonths, gapSorted, maxRec,
    totalActual, totalClients, alertCount, unitRate, shiftRate, alloc,
  } = model;

  const allocLabels = ["クライアント業務", "投資業務（育成・リーダー）", "会議・準備", "その他"];
  const allocColors = ["#00c9a7", "#5b9af5", "#f4a244", "#5c7a96"];
  const allocData = [alloc.clientH, alloc.investH, alloc.mgmtH, alloc.otherH];
  const allocTotal = allocData.reduce((s, v) => s + v, 0) || 1;

  const allocConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "doughnut",
      data: { labels: allocLabels, datasets: [{ data: allocData, backgroundColor: allocColors, borderWidth: 0, hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "68%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${rnd(c.raw as number, 1)}h (${Math.round(((c.raw as number) / allocTotal) * 100)}%)` } },
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alloc.clientH, alloc.investH, alloc.mgmtH, alloc.otherH]
  );

  const trendConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "bar",
      data: {
        labels: months,
        datasets: [
          { label: "実績", data: months.map((mo) => loaded.reduce((s, n) => s + (allData[n]?.[mo]?.actual || 0), 0)), backgroundColor: "rgba(0,201,167,.7)", borderRadius: 4, barPercentage: 0.45, order: 2 },
          { label: "推奨", type: "line", data: months.map((mo) => loaded.reduce((s, n) => s + (allData[n]?.[mo]?.rec || 0), 0)), borderColor: "rgba(244,162,68,.7)", borderDash: [4, 3], borderWidth: 1.5, pointRadius: 3, fill: false, tension: 0.3, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${rnd(c.raw as number, 0)}h` } } },
        scales: { y: { ...axisStyle(), beginAtZero: true, ticks: { ...axisStyle().ticks, callback: (v) => v + "h" } }, x: { ...axisStyle(), grid: { display: false } } },
      },
    }),
    [allData, months, loaded]
  );

  if (!loaded.length) {
    return (
      <div className="main">
        <div className="card">
          <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>設定画面でメンバーを登録してください</div>
        </div>
      </div>
    );
  }

  const kpiClass = (rate: number) => "kpi-val " + (rate >= 80 ? "teal" : rate >= 60 ? "amber" : "red");

  return (
    <div className="main">
      {/* KPI strip */}
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Unit 実績合計</div><div className="kpi-val teal">{rnd(totalActual, 0)}<span className="unit">h</span></div><div className="kpi-sub" /></div>
        <div className="kpi"><div className="kpi-label">Unit 充足率</div><div className={kpiClass(unitRate)}>{unitRate}<span className="unit">%</span></div><div className="kpi-sub">実績 / 推奨</div></div>
        <div className="kpi"><div className="kpi-label">シフト活用率</div><div className={kpiClass(shiftRate)}>{shiftRate}<span className="unit">%</span></div><div className="kpi-sub">実績 / シフト計</div></div>
        <div className="kpi"><div className="kpi-label">要注意メンバー</div><div className={"kpi-val " + (alertCount > 0 ? "red" : "teal")}>{alertCount}<span className="unit">名</span></div><div className="kpi-sub">充足率 60% 未満</div></div>
        <div className="kpi"><div className="kpi-label">担当社数合計</div><div className="kpi-val">{totalClients}<span className="unit">社</span></div><div className="kpi-sub">最新月・unit計</div></div>
      </div>

      {/* Heatmap */}
      <p className="sec">稼働充足率ヒートマップ — メンバー × 月</p>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="heatmap-wrap">
          <table className="heatmap-table">
            <thead>
              <tr>
                <th style={{ minWidth: 80 }}>メンバー</th>
                {hmMonths.map((mo) => (<th key={mo} style={{ textAlign: "center", minWidth: 66 }}>{mo}</th>))}
              </tr>
            </thead>
            <tbody>
              {loaded.map((n) => (
                <tr key={n}>
                  <td className="hm-name" onClick={() => openDetail(n)}>{n}</td>
                  {hmMonths.map((mo) => {
                    const d = allData[n]?.[mo];
                    if (!d) return (<td key={mo} className="hm-cell"><div className="hm-pill" style={{ background: "var(--surface2)" }}><span className="hm-rate muted">—</span></div></td>);
                    const r = pct(d.actual || 0, d.rec || 1);
                    const { bg, txt } = heatColor(r);
                    return (
                      <td key={mo} className="hm-cell">
                        <div className="hm-pill" style={{ background: bg }} title={`${n} ${mo}: ${r}%`}>
                          <span className="hm-rate" style={{ color: txt }}>{r}%</span>
                          <span className="hm-sub" style={{ color: txt }}>{(d.actual || 0).toFixed(0)}h</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2col: gap ranking + allocation */}
      <div className="two-col">
        <div>
          <p className="sec">時間ギャップ Top — 最新月・unit合算</p>
          <div className="card">
            {gapSorted.length === 0 ? (
              <div style={{ padding: 20, color: "var(--muted)" }}>データなし</div>
            ) : (
              gapSorted.map(([name, v], i) => {
                const diff = rnd(v.actual - v.rec, 1);
                const ds = diff >= 0 ? "+" : "";
                const r = pct(v.actual, v.rec);
                const actW = Math.min(Math.round((v.actual / maxRec) * 100), 100);
                const recW = Math.round((v.rec / maxRec) * 100);
                const dCl = diff > 0 ? "red" : diff < 0 ? "amber" : "muted";
                return (
                  <div className="gap-row" key={name}>
                    <span className="gap-rank">{String(i + 1).padStart(2, "0")}</span>
                    <span className="gap-name">{name}</span>
                    <div className="gap-bars">
                      <div className="gap-bar-row"><span style={{ width: 28, color: "var(--teal)", fontWeight: 600 }}>{rnd(v.actual, 0)}h</span><div className="gap-bar-bg"><div className="gap-bar-fill" style={{ width: `${actW}%`, background: barCol(r) }} /></div></div>
                      <div className="gap-bar-row"><span style={{ width: 28 }}>推奨</span><div className="gap-bar-bg"><div className="gap-bar-fill" style={{ width: `${recW}%`, background: "var(--border)" }} /></div></div>
                    </div>
                    <span className={`gap-diff ${dCl}`}>{ds}{diff}h</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <p className="sec">業務時間配分 — 最新月・unit合算</p>
          <div className="card">
            <div className="chart-box" style={{ paddingBottom: 0 }}>
              <div className="chart-canvas-wrap" style={{ height: 180 }}>
                <ChartCanvas config={allocConfig} ariaLabel="業務配分" />
              </div>
            </div>
            <div className="alloc-grid">
              {allocLabels.map((lb, i) => (
                <div className="alloc-item" key={lb}>
                  <span className="alloc-dot" style={{ background: allocColors[i] }} />
                  <span className="alloc-label">{lb}</span>
                  <span className="alloc-val">{Math.round((allocData[i] / allocTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trend */}
      <p className="sec">稼働時間推移 — unit合計・全月</p>
      <div className="card">
        <div className="chart-box">
          <div className="chart-canvas-wrap" style={{ height: 200 }}>
            <ChartCanvas config={trendConfig} ariaLabel="稼働推移" />
          </div>
        </div>
      </div>

      {/* Manager table */}
      <p className="sec">メンバー別ステータス — 最新月</p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: "14%" }}>メンバー</th>
              <th style={{ width: "9%" }}>対象月</th>
              <th style={{ width: "9%" }}>シフト</th>
              <th style={{ width: "9%" }}>実績(h)</th>
              <th style={{ width: "9%" }}>推奨(h)</th>
              <th style={{ width: "8%" }}>差分</th>
              <th style={{ width: "20%" }}>充足率</th>
              <th style={{ width: "8%" }}>社数</th>
              <th style={{ width: "7%" }}>リーダー</th>
              <th style={{ width: "7%" }}>育成</th>
            </tr>
          </thead>
          <tbody>
            {loaded.map((n) => {
              const [month, d] = latestEntry(allData, n);
              if (!d) return null;
              const diff = d.diff ?? rnd((d.actual || 0) - (d.rec || 0), 1);
              const rate = pct(d.actual || 0, d.rec || 1);
              const ds = diff >= 0 ? "+" : "";
              const leaderH = itemHours(d, "リーダー");
              const ikuH = itemHours(d, "育成unit");
              const leaderR = pct(leaderH, (d.items || []).find((x) => x.name === "リーダー")?.rec || 1);
              const ikuR = pct(ikuH, (d.items || []).find((x) => x.name === "育成unit")?.rec || 1);
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
                  <td><span style={{ fontSize: 11, color: barCol(leaderR) }}>{leaderH.toFixed(0)}h</span></td>
                  <td><span style={{ fontSize: 11, color: barCol(ikuR) }}>{ikuH.toFixed(0)}h</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
