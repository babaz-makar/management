// ギャップ分析ビュー。元HTML版 renderVarMatrix/renderCompare/renderTrendItem/renderGap を React 化。
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { useCapacity } from "../store";
import { ChartCanvas } from "../components/ChartCanvas";
import { axisStyle } from "../lib/chart";
import { aggItems, allItemNames, allMonthKeys, barCol, resolveMonth, rnd } from "../lib/utils";

export function GapView() {
  const { allData } = useCapacity();

  const members = useMemo(() => Object.keys(allData), [allData]);
  const months = useMemo(() => allMonthKeys(allData), [allData]);
  const items = useMemo(() => allItemNames(allData), [allData]);

  const [varMonth, setVarMonth] = useState("__latest__");
  const [cmpMonth, setCmpMonth] = useState("__latest__");
  const [cmpItem, setCmpItem] = useState("");
  const [trendMember, setTrendMember] = useState("__all__");
  const [trendItem, setTrendItem] = useState("");
  const [gapMember, setGapMember] = useState("__all__");
  const [gapMonth, setGapMonth] = useState("__latest__");
  const cmpAnchorRef = useRef<HTMLParagraphElement>(null);

  // 項目が読み込まれたら未選択の項目セレクトに初期値を入れる
  useEffect(() => {
    if (items.length && !items.includes(cmpItem)) setCmpItem(items[0]);
    if (items.length && !items.includes(trendItem)) setTrendItem(items[0]);
  }, [items, cmpItem, trendItem]);

  // ① ばらつきマトリクス
  const varMatrix = useMemo(() => {
    const tm = resolveMonth(allData, varMonth);
    const mem = Object.keys(allData).filter((m) => allData[m]?.[tm]);
    const itemSet: string[] = [];
    const seen = new Set<string>();
    mem.forEach((m) => (allData[m][tm].items || []).forEach((it) => { if (!seen.has(it.name)) { seen.add(it.name); itemSet.push(it.name); } }));
    if (!mem.length || !itemSet.length) return { members: mem, rows: [], maxSpread: 1 };
    const rows = itemSet.map((item) => {
      const cells = mem.map((m) => { const it = (allData[m][tm].items || []).find((x) => x.name === item); return it ? { v: rnd(it.actual || 0, 1), has: true } : { v: 0, has: false }; });
      const present = cells.filter((c) => c.has).map((c) => c.v);
      const avg = present.length ? present.reduce((s, v) => s + v, 0) / present.length : 0;
      const pv = present.length ? present : [0];
      const spread = rnd(Math.max(...pv) - Math.min(...pv), 1);
      const maxAbsDev = Math.max(...present.map((v) => Math.abs(v - avg)), 0.0001);
      return { item, cells, avg, spread, maxAbsDev };
    }).sort((a, b) => b.spread - a.spread);
    const maxSpread = Math.max(...rows.map((r) => r.spread), 0.0001);
    return { members: mem, rows, maxSpread };
  }, [allData, varMonth]);

  // ② 1項目比較
  const compare = useMemo(() => {
    const tm = resolveMonth(allData, cmpMonth);
    if (!cmpItem) return null;
    const rows: Array<{ m: string; v: number }> = [];
    Object.keys(allData).forEach((m) => { const d = allData[m]?.[tm]; if (!d) return; const it = (d.items || []).find((x) => x.name === cmpItem); if (!it) return; rows.push({ m, v: rnd(it.actual || 0, 1) }); });
    if (!rows.length) return { rows: [] as Array<{ m: string; v: number }>, avg: 0, top: null, bot: null, spread: 0 };
    rows.sort((a, b) => b.v - a.v);
    const avg = rows.reduce((s, r) => s + r.v, 0) / rows.length;
    const top = rows[0], bot = rows[rows.length - 1];
    return { rows, avg, top, bot, spread: rnd(top.v - bot.v, 1) };
  }, [allData, cmpMonth, cmpItem]);

  const cmpConfig = useMemo<ChartConfiguration | null>(() => {
    if (!compare || !compare.rows.length) return null;
    const avg = compare.avg;
    return {
      type: "bar",
      data: { labels: compare.rows.map((r) => r.m), datasets: [{ label: "実績", data: compare.rows.map((r) => r.v), backgroundColor: compare.rows.map((r) => (r.v >= avg ? "#00c9a7" : "#f4a244")), borderRadius: 4, barPercentage: 0.7 }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw}h（平均 ${rnd(avg, 1)}h）` } } },
        scales: { x: { ...axisStyle(), beginAtZero: true, ticks: { ...axisStyle().ticks, callback: (v) => v + "h" } }, y: { ...axisStyle(), grid: { display: false } } },
      },
    };
  }, [compare]);

  // ③ 項目別トレンド
  const trendItemConfig = useMemo<ChartConfiguration | null>(() => {
    if (!trendItem) return null;
    const mem = trendMember === "__all__" ? Object.keys(allData) : [trendMember];
    const actuals: number[] = [], recs: number[] = [];
    months.forEach((mo) => { let a = 0, r = 0; mem.forEach((m) => { const d = allData[m]?.[mo]; if (!d) return; const it = (d.items || []).find((x) => x.name === trendItem); if (it) { a += it.actual || 0; r += it.rec || 0; } }); actuals.push(rnd(a, 1)); recs.push(rnd(r, 1)); });
    return {
      type: "line",
      data: { labels: months, datasets: [
        { label: "実績", data: actuals, borderColor: "#00c9a7", backgroundColor: "rgba(0,201,167,.08)", fill: true, tension: 0.3, pointRadius: 5, borderWidth: 2, pointBackgroundColor: actuals.map((a, i) => (a > recs[i] ? "#f05d5e" : "#00c9a7")) },
        { label: "推奨", data: recs, borderColor: "rgba(92,122,150,.6)", borderDash: [4, 3], fill: false, tension: 0, pointRadius: 3, borderWidth: 1.5 },
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw}h` } } }, scales: { y: { ...axisStyle(), beginAtZero: true, ticks: { ...axisStyle().ticks, callback: (v) => v + "h" } }, x: { ...axisStyle(), grid: { display: false } } } },
    };
  }, [allData, months, trendMember, trendItem]);

  // ④ ギャップ表
  const gapRows = useMemo(() => {
    const map = aggItems(allData, gapMember, gapMonth);
    return Object.entries(map).sort((a, b) => Math.abs(b[1].actual - b[1].rec) - Math.abs(a[1].actual - a[1].rec));
  }, [allData, gapMember, gapMonth]);

  function jumpToCompare(item: string) {
    setCmpMonth(varMonth);
    if (items.includes(item)) setCmpItem(item);
    cmpAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const monthOptions = (
    <>
      <option value="__latest__">最新月</option>
      {months.map((mo) => (<option key={mo} value={mo}>{mo}</option>))}
    </>
  );

  return (
    <div className="main">
      <div className="legend-box">
        <span style={{ fontWeight: 600, color: "var(--text)" }}>色の見方</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: "rgba(0,201,167,.55)" }} />チーム平均より多い（青）</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: "rgba(244,162,68,.55)" }} />チーム平均より少ない（オレンジ）</span>
        <span className="legend-item">濃いほど平均からの乖離が大きい</span>
      </div>

      {/* ① ばらつきマトリクス */}
      <p className="sec" style={{ marginTop: 4 }}>① メンバー間のばらつき — 項目 × メンバー</p>
      <div className="hint" style={{ marginBottom: 14 }}>どの業務で偏りが起きているかを一覧化。<strong style={{ color: "var(--teal)" }}>ばらつきが大きい項目順</strong>に並びます。項目名をクリックすると下の「②1項目を詳しく比較」へジャンプします。</div>
      <div className="gap-controls">
        <div className="gap-field"><label>対象月</label>
          <select value={varMonth} onChange={(e) => setVarMonth(e.target.value)}>{monthOptions}</select>
        </div>
      </div>
      <div className="card"><div className="var-wrap">
        <table className="var-table">
          {varMatrix.rows.length === 0 ? (
            <tbody><tr><td><div className="empty-msg">この月のデータがありません</div></td></tr></tbody>
          ) : (
            <>
              <thead><tr>
                <th className="var-item-h" style={{ minWidth: 130 }}>項目</th>
                {varMatrix.members.map((m) => (<th key={m} style={{ minWidth: 64 }}>{m}</th>))}
                <th style={{ minWidth: 84 }}>ばらつき<br />(最大−最小)</th>
              </tr></thead>
              <tbody>
                {varMatrix.rows.map((r) => {
                  const sAlpha = (Math.min(r.spread / varMatrix.maxSpread, 1) * 0.45 + 0.1).toFixed(2);
                  return (
                    <tr key={r.item}>
                      <td className="var-item" onClick={() => jumpToCompare(r.item)}>{r.item}</td>
                      {r.cells.map((c, i) => {
                        if (!c.has) return (<td key={i} className="var-cell"><div className="var-pill" style={{ background: "var(--surface2)", color: "var(--muted)" }}>—</div></td>);
                        const dev = c.v - r.avg;
                        const alpha = (Math.min(Math.abs(dev) / r.maxAbsDev, 1) * 0.5 + 0.08).toFixed(2);
                        const bg = dev >= 0 ? `rgba(0,201,167,${alpha})` : `rgba(244,162,68,${alpha})`;
                        return (<td key={i} className="var-cell"><div className="var-pill" style={{ background: bg, color: "var(--text)" }} title={`${varMatrix.members[i]} / ${r.item}: ${c.v}h（平均 ${rnd(r.avg, 1)}h）`}>{c.v}</div></td>);
                      })}
                      <td className="var-cell"><div className="var-pill var-spread" style={{ background: `rgba(244,162,68,${sAlpha})`, color: "var(--text)" }}>{r.spread}h</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          )}
        </table>
      </div></div>

      {/* ② 1項目比較 */}
      <p className="sec" ref={cmpAnchorRef} style={{ marginTop: 24 }}>② 1項目を詳しく比較 — メンバー別</p>
      <div className="gap-controls">
        <div className="gap-field"><label>対象月</label><select value={cmpMonth} onChange={(e) => setCmpMonth(e.target.value)}>{monthOptions}</select></div>
        <div className="gap-field"><label>項目</label><select value={cmpItem} onChange={(e) => setCmpItem(e.target.value)}>{items.map((it) => (<option key={it} value={it}>{it}</option>))}</select></div>
      </div>
      <div className="cmp-summary">
        {!cmpItem ? (
          <div className="empty-msg">項目を選択してください</div>
        ) : !compare || !compare.rows.length ? (
          <div className="empty-msg">この月にこの項目のデータがありません</div>
        ) : (
          <>
            <div className="kpi"><div className="kpi-label">平均</div><div className="kpi-val">{rnd(compare.avg, 1)}<span className="unit">h</span></div><div className="kpi-sub">{compare.rows.length}名</div></div>
            <div className="kpi"><div className="kpi-label">最も多い</div><div className="kpi-val teal">{rnd(compare.top!.v, 1)}<span className="unit">h</span></div><div className="kpi-sub">{compare.top!.m}</div></div>
            <div className="kpi"><div className="kpi-label">最も少ない</div><div className="kpi-val amber">{rnd(compare.bot!.v, 1)}<span className="unit">h</span></div><div className="kpi-sub">{compare.bot!.m}</div></div>
            <div className="kpi"><div className="kpi-label">ばらつき</div><div className="kpi-val">{compare.spread}<span className="unit">h</span></div><div className="kpi-sub">最大 − 最小</div></div>
          </>
        )}
      </div>
      <div className="card"><div className="chart-box"><div className="chart-canvas-wrap" style={{ height: 260 }}>{cmpConfig && <ChartCanvas config={cmpConfig} ariaLabel="メンバー別比較" />}</div></div></div>

      {/* ③ 項目別トレンド */}
      <p className="sec" style={{ marginTop: 24 }}>③ 項目別 月次トレンド</p>
      <div className="gap-controls">
        <div className="gap-field"><label>メンバー</label><select value={trendMember} onChange={(e) => setTrendMember(e.target.value)}><option value="__all__">全メンバー合算</option>{members.map((m) => (<option key={m} value={m}>{m}</option>))}</select></div>
        <div className="gap-field"><label>項目</label><select value={trendItem} onChange={(e) => setTrendItem(e.target.value)}>{items.map((it) => (<option key={it} value={it}>{it}</option>))}</select></div>
      </div>
      <div className="card"><div className="chart-box"><div className="chart-canvas-wrap" style={{ height: 220 }}>{trendItemConfig && <ChartCanvas config={trendItemConfig} ariaLabel="トレンド" />}</div></div></div>

      {/* ④ ギャップ表 */}
      <p className="sec" style={{ marginTop: 24 }}>④ 実績 vs 推奨 — 項目別ギャップ表</p>
      <div className="gap-controls">
        <div className="gap-field"><label>メンバー</label><select value={gapMember} onChange={(e) => setGapMember(e.target.value)}><option value="__all__">全メンバー合算</option>{members.map((m) => (<option key={m} value={m}>{m}</option>))}</select></div>
        <div className="gap-field"><label>対象月</label><select value={gapMonth} onChange={(e) => setGapMonth(e.target.value)}>{monthOptions}</select></div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th style={{ width: "22%" }}>項目</th><th style={{ width: "12%" }}>実績(h)</th><th style={{ width: "12%" }}>推奨(h)</th><th style={{ width: "10%" }}>差分</th><th style={{ width: "32%" }}>充足率</th><th style={{ width: "12%" }}>状態</th></tr></thead>
          <tbody>
            {gapRows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>データなし</td></tr>
            ) : (
              gapRows.map(([name, v]) => {
                const act = v.actual || 0, rec = v.rec || 0;
                const diff = rnd(act - rec, 1);
                const rate = rec ? Math.min(Math.round((act / rec) * 100), 999) : 0;
                const ds = diff >= 0 ? "+" : "";
                const isOver = act > rec;
                const bCls = isOver ? "b-over" : rate >= 90 ? "b-ok" : rate >= 60 ? "b-warn" : "b-crit";
                const bLbl = isOver ? "超過" : rate >= 90 ? "適正" : rate >= 60 ? "不足" : "大幅不足";
                const dCl = diff > 0 ? "red" : diff < 0 ? "amber" : "muted";
                return (
                  <tr key={name}>
                    <td className="fw6">{name}</td>
                    <td>{act.toFixed(1)}</td>
                    <td className="muted">{rec || "—"}</td>
                    <td className={dCl} style={{ fontWeight: 600 }}>{ds}{diff}</td>
                    <td><span style={{ fontSize: 11 }}>{rate}%</span><div className="bar-bg"><div className="bar-fill" style={{ width: `${Math.min(rate, 100)}%`, background: barCol(rate) }} /></div></td>
                    <td><span className={`badge ${bCls}`}>{bLbl}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
