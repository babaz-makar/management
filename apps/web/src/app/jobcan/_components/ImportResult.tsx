"use client";

import { describeImportReason } from "@management/shift-management/ui";
import type { JobcanImportFileError } from "@management/shift-management";
import { IOS, iosType } from "../_lib/tokens";
import type { ImportResponse } from "../_lib/import-client";
import {
  DetailRow,
  DetailToggle,
  IosCallout,
  IosCard,
  Result3,
  ResultCard,
} from "./ios";

interface ImportResultProps {
  result: ImportResponse;
  /** 反映後(dryRun:false)なら完了トーン。 */
  applied: boolean;
  /** 危険(削除あり・取り違え)。 */
  danger: boolean;
  /** 取り違え兆候ファイル(staff_code_mismatch)。 */
  mismatchFiles: JobcanImportFileError[];
  /** email 未登録の staffCode を名簿へ渡す導線。 */
  staffHref: (staffCode: string) => string;
}

/**
 * 取込の確認結果ビュー(見た目のみ・判定は page.tsx が保持)。
 * 主要 3 指標を大カードに集約し、削除/エラー/反映できない人の具体は
 * details トグルで開閉表示する。集計の細目は「詳しく見る」へ退避(消さず保持)。
 */
export function ImportResult({
  result,
  applied,
  danger,
  mismatchFiles,
  staffHref,
}: ImportResultProps) {
  const { summary, warnings, fileErrors, conversionErrors } = result;
  const errorTotal = fileErrors.length + conversionErrors.length;

  return (
    <section style={{ marginBottom: 20 }}>
      <IosCallout tone="success" style={{ marginBottom: 6 }}>
        {applied ? (
          <b>カレンダーに反映しました。</b>
        ) : (
          <>
            <b>確認しました。</b>カレンダーはまだ変えていません。
          </>
        )}
      </IosCallout>

      {/* 主役: 大カード 3 枚(追加 / 削除 / 反映できない人)。 */}
      <Result3>
        <ResultCard value={summary.totalCreates} label="追加" tone="add" />
        <ResultCard
          value={summary.totalDeletes}
          label="削除"
          tone={summary.totalDeletes > 0 ? "del-hot" : "del"}
        />
        <ResultCard value={summary.warningCount} label="反映できない人" tone="warn" />
      </Result3>

      {/* 削除・取り違えの具体(危険時のみ)。個別予定は本画面のデータに含まれないため件数+取り違えファイル名を提示。 */}
      {danger && (
        <IosCallout tone="danger" style={{ marginBottom: 8 }}>
          <b>削除・取り違えの確認が必要です。</b>
          {summary.totalDeletes > 0 &&
            ` カレンダーから ${summary.totalDeletes} 件の予定を削除します。`}
        </IosCallout>
      )}
      {danger && (
        <IosCard padding={14} style={{ marginBottom: 8 }}>
          <DetailToggle
            danger
            defaultOpen
            summary={`削除・取り違えの内訳を確認する`}
          >
            {summary.totalDeletes > 0 && (
              <DetailRow
                tone="danger"
                icon="trash"
                title={`削除される予定: ${summary.totalDeletes} 件`}
                meta="個別の予定はこの画面では一覧できません。反映前にカレンダー側でも確認してください。"
                last={mismatchFiles.length === 0}
              />
            )}
            {mismatchFiles.map((file, index) => (
              <DetailRow
                key={`${file.fileName}-${index}`}
                tone="danger"
                icon="alert"
                title={file.fileName}
                meta="ファイル取り違えの兆候(社員コード不一致)"
                last={index === mismatchFiles.length - 1}
              />
            ))}
          </DetailToggle>
        </IosCard>
      )}

      {/* 反映できない人(具体)。 */}
      {warnings.length > 0 && (
        <IosCard padding={14} style={{ marginBottom: 8 }}>
          <DetailToggle defaultOpen summary={`反映できない人(${warnings.length}人)を確認する`}>
            {warnings.map((warning, index) => (
              <div key={`${warning.staffCode}-${warning.sourceMonth}-${index}`}>
                <DetailRow
                  tone="warn"
                  icon="alert"
                  title={
                    <>
                      {warning.staffCode}
                      <span style={{ color: IOS.color.secondaryLabel, marginLeft: 8 }}>
                        {warning.email ?? "(メール未登録)"}
                      </span>
                    </>
                  }
                  meta={`${describeImportReason(warning.reason)} — 対象月 ${warning.sourceMonth}`}
                  last
                />
                {warning.reason === "email_not_registered" && (
                  <div style={{ padding: "0 4px 8px 32px" }}>
                    <a
                      href={staffHref(warning.staffCode)}
                      style={{ color: IOS.color.blue, textDecoration: "none", ...iosType("footnote") }}
                    >
                      → 名簿でこの社員コードを登録する
                    </a>
                  </div>
                )}
              </div>
            ))}
          </DetailToggle>
        </IosCard>
      )}

      {/* 取り込めなかった明細(具体)。 */}
      {errorTotal > 0 && (
        <IosCard padding={14} style={{ marginBottom: 8 }}>
          <DetailToggle danger defaultOpen summary={`取り込めなかった明細(${errorTotal}件)`}>
            {fileErrors.map((error, index) => (
              <DetailRow
                key={`fe-${error.fileName}-${index}`}
                tone="danger"
                icon="alert"
                title={error.fileName}
                meta={
                  error.message
                    ? `${describeImportReason(error.reason)} — ${error.message}`
                    : describeImportReason(error.reason)
                }
                last={index === fileErrors.length - 1 && conversionErrors.length === 0}
              />
            ))}
            {conversionErrors.map((error, index) => (
              <DetailRow
                key={`ce-${error.fileName}-${index}`}
                tone="danger"
                icon="alert"
                title={error.fileName}
                meta={
                  error.message
                    ? `${describeImportReason("conversion_error")} — ${error.message}`
                    : describeImportReason("conversion_error")
                }
                last={index === conversionErrors.length - 1}
              />
            ))}
          </DetailToggle>
        </IosCard>
      )}

      {/* 集計の細目は退避(消さず「詳しく見る」へ)。 */}
      <IosCard padding={14}>
        <DetailToggle summary="詳しく見る(内部の集計値)">
          <Kv k="対象ファイル" v={summary.totalFiles} />
          <Kv k="取込成功" v={summary.importedFiles} />
          <Kv k="エラー" v={summary.erroredFiles} />
          <Kv k="総エントリ" v={summary.totalEntries} />
          <Kv k="対象(人×月)" v={summary.staffMonthCount} />
        </DetailToggle>
      </IosCard>

      {result.reconcileError && (
        <IosCallout tone="danger" title="突合でエラーが発生しました" style={{ marginTop: 12 }}>
          {result.reconcileError}
        </IosCallout>
      )}
    </section>
  );
}

function Kv({ k, v }: { k: string; v: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 2px",
        borderTop: `0.5px solid ${IOS.color.separator}`,
        ...iosType("footnote"),
      }}
    >
      <span style={{ color: IOS.color.secondaryLabel }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
