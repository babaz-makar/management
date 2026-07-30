"use client";

import type { JobcanImportSummary } from "@management/shift-management";
import { COLORS } from "../_lib/tokens";

interface DryRunSummaryBarProps {
  summary: JobcanImportSummary;
  /** 反映後(dryRun:false)なら完了トーン、dry-run なら「まだ変更していません」トーン。 */
  applied: boolean;
  /** 危険(削除あり・取り違え)なら赤帯にする。 */
  danger: boolean;
}

interface StatProps {
  label: string;
  value: number;
  emphasize?: boolean;
}

function Stat({ label, value, emphasize }: StatProps) {
  return (
    <span
      style={{
        display: "inline-block",
        marginRight: "1.25rem",
        fontWeight: emphasize ? 700 : 400,
        color: emphasize ? COLORS.danger : COLORS.text,
      }}
    >
      {label}: {value}
    </span>
  );
}

/** 合計件数サマリ帯(per-staff/per-日の明細は出さない=最小プレビュー)。 */
export function DryRunSummaryBar({ summary, applied, danger }: DryRunSummaryBarProps) {
  const bg = danger ? COLORS.dangerBg : applied ? COLORS.successBg : COLORS.surface;
  const border = danger
    ? COLORS.dangerBorder
    : applied
      ? COLORS.successBorder
      : COLORS.border;

  return (
    <section
      style={{
        padding: "0.9rem 1.1rem",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        marginBottom: "1.25rem",
      }}
    >
      <p style={{ margin: "0 0 .5rem", fontWeight: 700 }}>
        {applied
          ? "本反映が完了しました(カレンダーを更新しました)"
          : "dry-run 結果 — カレンダーはまだ変更していません"}
      </p>
      <div style={{ lineHeight: 1.9 }}>
        <Stat label="対象ファイル" value={summary.totalFiles} />
        <Stat label="取込成功" value={summary.importedFiles} />
        <Stat
          label="エラー"
          value={summary.erroredFiles}
          emphasize={summary.erroredFiles > 0}
        />
        <Stat label="総エントリ" value={summary.totalEntries} />
        <Stat label="対象(人×月)" value={summary.staffMonthCount} />
        <Stat label="作成予定" value={summary.totalCreates} />
        <Stat
          label="削除予定"
          value={summary.totalDeletes}
          emphasize={summary.totalDeletes > 0}
        />
        <Stat
          label="警告"
          value={summary.warningCount}
          emphasize={summary.warningCount > 0}
        />
      </div>
    </section>
  );
}
