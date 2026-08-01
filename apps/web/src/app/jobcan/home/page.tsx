"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APPLY_OFF_BANNER_MESSAGE,
  resolveHomeState,
  type HomeState,
} from "@management/shift-management/ui";
import { COLORS, PAGE_STYLE } from "../_lib/tokens";
import { loadHomeSnapshot } from "./_lib/home-client";

/** 直近取込のサマリ(件数)を1行に整形する(PII なし)。 */
function summaryLine(state: HomeState): string | null {
  const latest = state.primary.latestImport;
  if (!latest) return null;
  return (
    `対象ファイル ${latest.totalFiles}件 / 取込 ${latest.importedFiles}件 / ` +
    `作成 ${latest.totalCreates}件 / 削除 ${latest.totalDeletes}件` +
    (latest.warningCount > 0 ? ` / 警告 ${latest.warningCount}件` : "")
  );
}

export default function JobcanHomePage() {
  const [state, setState] = useState<HomeState | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const snapshot = await loadHomeSnapshot();
    setState(resolveHomeState(snapshot));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isError = state?.primary.kind === "error";
  const summary = state ? summaryLine(state) : null;

  return (
    <main style={PAGE_STYLE}>
      <h1 style={{ marginBottom: ".25rem" }}>ジョブカン連携ホーム</h1>
      <p style={{ color: COLORS.muted, marginTop: 0 }}>
        取込の状況をまとめて確認できます。
        <a href="/jobcan" style={{ marginLeft: ".75rem" }}>
          取込画面へ
        </a>
        <a href="/jobcan/staff" style={{ marginLeft: ".75rem" }}>
          スタッフ名簿へ
        </a>
      </p>

      {state?.showApplyOffBanner && (
        <div
          style={{
            padding: ".6rem .9rem",
            background: COLORS.warningBg,
            border: `1px solid ${COLORS.warningBorder}`,
            borderRadius: 4,
            color: COLORS.warning,
            marginBottom: "1rem",
          }}
        >
          {APPLY_OFF_BANNER_MESSAGE}
        </div>
      )}

      {loading || !state ? (
        <p style={{ color: COLORS.muted }}>状態を確認中…</p>
      ) : (
        <section
          style={{
            padding: "1rem 1.2rem",
            background: isError ? COLORS.dangerBg : COLORS.surface,
            border: `1px solid ${isError ? COLORS.dangerBorder : COLORS.border}`,
            borderRadius: 6,
            marginBottom: "1.25rem",
          }}
        >
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              color: isError ? COLORS.danger : COLORS.text,
            }}
          >
            {state.primary.message}
          </p>

          {summary && (
            <p style={{ margin: ".5rem 0 0", color: COLORS.muted }}>{summary}</p>
          )}

          <div style={{ marginTop: ".9rem" }}>
            {isError ? (
              <button type="button" onClick={() => void reload()}>
                再読み込み
              </button>
            ) : (
              state.primary.ctaHref &&
              state.primary.ctaLabel && (
                <a
                  href={state.primary.ctaHref}
                  style={{
                    display: "inline-block",
                    background: COLORS.text,
                    color: "#fff",
                    padding: ".5rem 1rem",
                    borderRadius: 4,
                    textDecoration: "none",
                  }}
                >
                  {state.primary.ctaLabel}
                </a>
              )
            )}
          </div>
        </section>
      )}
    </main>
  );
}
