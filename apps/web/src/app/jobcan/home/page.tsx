"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APPLY_OFF_BANNER_MESSAGE,
  resolveHomeState,
  type HomeState,
} from "@management/shift-management/ui";
import { IOS, iosType } from "../_lib/tokens";
import {
  GroupedList,
  IosButton,
  IosCallout,
  IosCard,
  IosLoading,
  ListRow,
  PageHeader,
  Screen,
} from "../_components/ios";
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
    <Screen>
      <PageHeader
        title="ジョブカン連携ホーム"
        description="取込の状況をまとめて確認できます。"
      />

      {state?.showApplyOffBanner && (
        <IosCallout tone="warning" style={{ marginBottom: 16 }}>
          {APPLY_OFF_BANNER_MESSAGE}
        </IosCallout>
      )}

      {loading || !state ? (
        <IosLoading label="状態を確認中…" />
      ) : (
        <IosCard
          tone={isError ? "danger" : "default"}
          radius={IOS.metrics.radiusHero}
          padding={20}
          style={{ marginBottom: 24 }}
        >
          <p
            style={{
              margin: 0,
              color: isError ? IOS.color.redText : IOS.color.label,
              ...iosType("title3"),
            }}
          >
            {state.primary.message}
          </p>

          {summary && (
            <p
              style={{
                margin: "8px 0 0",
                color: IOS.color.secondaryLabel,
                ...iosType("subhead"),
              }}
            >
              {summary}
            </p>
          )}

          <div style={{ marginTop: 16 }}>
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
                </IosButton>
              )
            )}
          </div>
        </IosCard>
      )}

      <GroupedList>
        <ListRow title="取込画面へ" href="/jobcan" />
        <ListRow title="スタッフ名簿へ" href="/jobcan/staff" last />
      </GroupedList>
    </Screen>
  );
}
