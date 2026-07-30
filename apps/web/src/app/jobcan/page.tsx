"use client";

import { useMemo, useState } from "react";
import { COLORS, PAGE_STYLE } from "./_lib/tokens";
import {
  checkClientLimits,
  postImport,
  type ClientLimitWarning,
  type ImportResponse,
} from "./_lib/import-client";
import { FileDropZone } from "./_components/FileDropZone";
import { DryRunSummaryBar } from "./_components/DryRunSummaryBar";
import { FileErrorList } from "./_components/FileErrorList";
import { WarningList } from "./_components/WarningList";
import { DangerZone } from "./_components/DangerZone";
import { ApplyConfirmDialog } from "./_components/ApplyConfirmDialog";
import { ApplyDisabledBanner } from "./_components/ApplyDisabledBanner";

type Phase = "idle" | "drying" | "reviewed" | "applying" | "done" | "error";

/** dry-run 結果に「危険な変更(削除 or 取り違え)」が含まれるか。 */
function hasDanger(result: ImportResponse): boolean {
  const mismatch = result.fileErrors.some((e) => e.reason === "staff_code_mismatch");
  return result.summary.totalDeletes > 0 || mismatch;
}

export default function JobcanImportPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const limitWarnings: ClientLimitWarning[] = useMemo(
    () => checkClientLimits(files),
    [files],
  );

  const busy = phase === "drying" || phase === "applying";
  const mismatchFiles = result
    ? result.fileErrors.filter((e) => e.reason === "staff_code_mismatch")
    : [];
  const danger = result ? hasDanger(result) : false;
  // 反映後に dryRun:true が返る = サーバー側 apply スイッチ未有効。
  const applyDisabled = phase === "done" && result?.dryRun === true;
  const applied = phase === "done" && result?.dryRun === false;

  function resetResult() {
    setResult(null);
    setErrorMessage(null);
  }

  function addFiles(added: File[]) {
    setFiles((prev) => [...prev, ...added]);
    setPhase("idle");
    resetResult();
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPhase("idle");
    resetResult();
  }

  function clearFiles() {
    setFiles([]);
    setPhase("idle");
    resetResult();
  }

  async function runDryRun() {
    if (files.length === 0) return;
    setPhase("drying");
    resetResult();
    const response = await postImport(files, false);
    if (response.ok) {
      setResult(response.result);
      setPhase("reviewed");
    } else {
      setErrorMessage(response.errorMessage);
      setPhase("error");
    }
  }

  async function runApply() {
    setShowConfirm(false);
    setPhase("applying");
    const response = await postImport(files, true);
    if (response.ok) {
      setResult(response.result);
      setPhase("done");
    } else {
      setErrorMessage(response.errorMessage);
      setPhase("error");
    }
  }

  const staffHref = (staffCode: string) =>
    `/jobcan/staff?code=${encodeURIComponent(staffCode)}`;

  return (
    <main style={PAGE_STYLE}>
      <h1 style={{ marginBottom: ".25rem" }}>ジョブカン確定シフト取込</h1>
      <p style={{ color: COLORS.muted, marginTop: 0 }}>
        xlsx をアップロードし、まず dry-run で内容を確認してから本反映します。dry-run
        の間はカレンダーを一切変更しません。
        <a href="/jobcan/staff" style={{ marginLeft: ".75rem" }}>
          スタッフ名簿へ
        </a>
      </p>

      <FileDropZone
        files={files}
        limitWarnings={limitWarnings}
        disabled={busy}
        onAdd={addFiles}
        onRemove={removeFile}
        onClear={clearFiles}
      />

      <div style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={runDryRun}
          disabled={files.length === 0 || busy}
        >
          dry-run で確認(カレンダーは変更しません)
        </button>
      </div>

      {phase === "drying" && (
        <p style={{ color: COLORS.muted }}>
          {files.length}件を照合中… カレンダーはまだ変更していません。
        </p>
      )}

      {phase === "applying" && (
        <p style={{ color: COLORS.muted }}>本反映中… カレンダーへ書き込んでいます。</p>
      )}

      {phase === "error" && errorMessage && (
        <section
          style={{
            padding: "0.9rem 1.1rem",
            background: COLORS.dangerBg,
            border: `1px solid ${COLORS.dangerBorder}`,
            borderRadius: 6,
            color: COLORS.danger,
            marginBottom: "1.25rem",
          }}
        >
          <strong>エラー</strong>
          <p style={{ margin: ".4rem 0 0" }}>{errorMessage}</p>
        </section>
      )}

      {result && (phase === "reviewed" || phase === "done") && (
        <>
          {applyDisabled && <ApplyDisabledBanner />}
          <DryRunSummaryBar summary={result.summary} applied={applied} danger={danger} />
          <DangerZone
            totalDeletes={result.summary.totalDeletes}
            mismatchFiles={mismatchFiles}
          />
          <FileErrorList
            fileErrors={result.fileErrors}
            conversionErrors={result.conversionErrors}
          />
          <WarningList warnings={result.warnings} staffHref={staffHref} />
          {result.reconcileError && (
            <section
              style={{
                padding: "0.9rem 1.1rem",
                background: COLORS.dangerBg,
                border: `1px solid ${COLORS.dangerBorder}`,
                borderRadius: 6,
                color: COLORS.danger,
                marginBottom: "1.25rem",
              }}
            >
              <strong>突合でエラーが発生しました</strong>
              <p style={{ margin: ".4rem 0 0" }}>{result.reconcileError}</p>
            </section>
          )}

          {phase === "reviewed" && (
            <div>
              <p style={{ color: COLORS.muted }}>
                ここまでで変更は加えていません。内容を確認して本反映してください。
              </p>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                style={{
                  background: danger ? COLORS.danger : COLORS.text,
                  color: "#fff",
                  border: "none",
                  padding: ".55rem 1.1rem",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                本反映する{danger ? "(危険な変更あり)" : ""}
              </button>
            </div>
          )}
        </>
      )}

      {showConfirm && result && (
        <ApplyConfirmDialog
          danger={danger}
          totalDeletes={result.summary.totalDeletes}
          busy={phase === "applying"}
          onConfirm={runApply}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </main>
  );
}
