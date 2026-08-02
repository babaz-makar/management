"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APPLY_OFF_BANNER_MESSAGE,
  formatImportDate,
  resolveHomeState,
  type HomeSnapshot,
  type HomeState,
} from "@management/shift-management/ui";
import { IOS, iosType } from "../_lib/tokens";
import {
  Bento,
  IosButton,
  IosCard,
  IosIcon,
  IosLoading,
  JobcanHeader,
  PageHeader,
  Screen,
  StatCard,
} from "../_components/ios";
import { loadHomeSnapshot } from "./_lib/home-client";

export default function JobcanHomePage() {
  const [state, setState] = useState<HomeState | null>(null);
  // 表示用に取得済みスナップショットも保持する(bento の名簿人数・未登録数の表示に使う。
  // 状態判定は resolveHomeState が唯一の権威で、ここは既に fetch した値の表示のみ)。
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const snap = await loadHomeSnapshot();
    setSnapshot(snap);
    setState(resolveHomeState(snap));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isError = state?.primary.kind === "error";
  const latest = state?.primary.latestImport ?? null;
  const lastImportLabel = latest ? formatImportDate(latest.executedAt) : "—";
  const createsCount = latest?.totalCreates ?? 0;
  const staffCount = snapshot?.staffCount ?? 0;
  const unregisteredCount = snapshot?.summary?.unregisteredCount ?? 0;

  return (
    <>
      <JobcanHeader />
      <Screen>
        <PageHeader
          title="ジョブカン連携"
          description="取込の状況をまとめて確認できます。"
        />

        {loading || !state ? (
          <IosLoading label="状態を確認中…" />
        ) : (
          <>
            {/* 主役: ヒーローアクションカード(primary は resolveHomeState 由来で不変)。 */}
            <IosCard
              tone={isError ? "danger" : "default"}
              radius={IOS.metrics.radiusHero}
              padding={20}
              style={{ marginBottom: 16 }}
            >
              <div
                style={{
                  ...iosType("caption"),
                  color: IOS.color.secondaryLabel,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {isError ? "エラー" : "取込ステータス"}
              </div>
              <p
                style={{
                  ...iosType("title3"),
                  margin: "6px 0 4px",
                  color: isError ? IOS.color.redText : IOS.color.label,
                }}
              >
                {state.primary.message}
              </p>
              <div style={{ marginTop: 14 }}>
                {isError ? (
                  <IosButton variant="tinted" onClick={() => void reload()}>
                    再読み込み
                  </IosButton>
                ) : (
                  state.primary.ctaHref &&
                  state.primary.ctaLabel && (
                    <IosButton
                      variant="filled"
                      fullWidth
                      size="primary"
                      href={state.primary.ctaHref}
                    >
                      {state.primary.ctaLabel}
                      <IosIcon name="arrow" size={17} />
                    </IosButton>
                  )
                )}
              </div>
            </IosCard>

            {/* 数値サマリ(bento)。取得済みスナップショットの表示。 */}
            {!isError && (
              <Bento>
                <StatCard label="前回反映" value={lastImportLabel} />
                <StatCard label="追加" value={createsCount} unit="件" tone="good" />
                <StatCard label="名簿" value={staffCount} unit="人" />
                <StatCard
                  label="未登録"
                  value={unregisteredCount}
                  unit="人"
                  tone={unregisteredCount > 0 ? "warn" : "good"}
                />
              </Bento>
            )}

            {/* apply オフ: 最上部バナーをやめ、サマリ下の控えめ注記に降格。 */}
            {state.showApplyOffBanner && (
              <p
                style={{
                  ...iosType("caption"),
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 14,
                  color: IOS.color.secondaryLabel,
                }}
              >
                <span style={{ color: IOS.color.orange, display: "flex" }}>
                  <IosIcon name="info" size={15} />
                </span>
                {APPLY_OFF_BANNER_MESSAGE}
              </p>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
