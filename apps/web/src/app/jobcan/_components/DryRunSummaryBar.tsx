"use client";

import type { JobcanImportSummary } from "@management/shift-management";
import { IOS, iosType } from "../_lib/tokens";
import { GroupedList, ListRow } from "./ios";

interface DryRunSummaryBarProps {
  summary: JobcanImportSummary;
  /** 反映後(dryRun:false)なら完了トーン、dry-run なら「まだ変更していません」トーン。 */
  applied: boolean;
  /** 危険(削除あり・取り違え)なら赤帯にする。 */
  danger: boolean;
}

interface StatRowProps {
  label: string;
  value: number;
  emphasize?: boolean;
  last?: boolean;
}

/** ラベル左(グレー)…値右(強調時 headline 赤)の 1 行。 */
function StatRow({ label, value, emphasize, last }: StatRowProps) {
  return (
    <ListRow
      title={label}
      last={last}
      detail={
        <span
          style={{
            color: emphasize ? IOS.color.redText : IOS.color.label,
            ...(emphasize ? iosType("headline") : iosType("subhead")),
          }}
        >
          {value}
        </span>
      }
    />
  );
}

/** 合計件数サマリ(per-staff/per-日の明細は出さない=最小プレビュー)。 */
export function DryRunSummaryBar({ summary, applied, danger }: DryRunSummaryBarProps) {
  const headline = applied
    ? "本反映が完了しました(カレンダーを更新しました)"
    : "dry-run 結果 — カレンダーはまだ変更していません";
  const headlineColor = danger
    ? IOS.color.redText
    : applied
      ? IOS.color.greenText
      : IOS.color.label;

  return (
    <section style={{ marginBottom: 20 }}>
      <p
        style={{
          margin: "0 0 8px",
          padding: "0 4px",
          color: headlineColor,
          ...iosType("headline"),
        }}
      >
        {headline}
      </p>
      <GroupedList>
        <StatRow label="対象ファイル" value={summary.totalFiles} />
        <StatRow label="取込成功" value={summary.importedFiles} />
        <StatRow
          label="エラー"
          value={summary.erroredFiles}
          emphasize={summary.erroredFiles > 0}
        />
        <StatRow label="総エントリ" value={summary.totalEntries} />
        <StatRow label="対象(人×月)" value={summary.staffMonthCount} />
        <StatRow label="作成予定" value={summary.totalCreates} />
        <StatRow
          label="削除予定"
          value={summary.totalDeletes}
          emphasize={summary.totalDeletes > 0}
        />
        <StatRow
          label="警告"
          value={summary.warningCount}
          emphasize={summary.warningCount > 0}
          last
        />
      </GroupedList>
    </section>
  );
}
