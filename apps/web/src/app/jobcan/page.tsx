"use client";

import { useMemo, useState } from "react";
import {
  JOBCAN_UI_TERMS,
  importPhaseToStep,
} from "@management/shift-management/ui";
import { IOS, iosType } from "./_lib/tokens";
import {
  IosButton,
  IosCallout,
  JobcanHeader,
  PageHeader,
  Screen,
  Stepper,
} from "./_components/ios";
import {
  checkClientLimits,
  postImport,
  type ClientLimitWarning,
  type ImportResponse,
} from "./_lib/import-client";
import { FileDropZone } from "./_components/FileDropZone";
import { ImportResult } from "./_components/ImportResult";
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
    <>
      <JobcanHeader />
      <Screen>
        <PageHeader
          title="シフトを取り込む"
          description="ファイルを選ぶと、まず確認だけします。カレンダーはこの時点では変えません。"
        />

        <Stepper current={importPhaseToStep(phase)} />

        <FileDropZone
          files={files}
          limitWarnings={limitWarnings}
          disabled={busy}
          onAdd={addFiles}
          onRemove={removeFile}
          onClear={clearFiles}
        />

        <div style={{ marginBottom: 24 }}>
          <IosButton
            variant="filled"
            fullWidth
            size="primary"
            onClick={runDryRun}
            disabled={files.length === 0 || busy}
          >
            {JOBCAN_UI_TERMS.dryRunAction}
          </IosButton>
        </div>

        {phase === "drying" && (
          <p style={{ color: IOS.color.secondaryLabel, ...iosType("subhead") }}>
            {files.length}件を照合中… カレンダーはまだ変更していません。
          </p>
        )}

        {phase === "applying" && (
          <p style={{ color: IOS.color.secondaryLabel, ...iosType("subhead") }}>
            本反映中… カレンダーへ書き込んでいます。
          </p>
        )}

        {phase === "error" && errorMessage && (
          <IosCallout tone="danger" title="エラー" style={{ marginBottom: 20 }}>
            {errorMessage}
          </IosCallout>
        )}

        {result && (phase === "reviewed" || phase === "done") && (
          <>
            {applyDisabled && <ApplyDisabledBanner />}
            <ImportResult
              result={result}
              applied={applied}
              danger={danger}
              mismatchFiles={mismatchFiles}
              staffHref={staffHref}
            />

            {phase === "reviewed" && (
              <div>
                <p style={{ color: IOS.color.secondaryLabel, ...iosType("subhead") }}>
                  ここまでで変更は加えていません。内容を確認して反映してください。
                </p>
                <IosButton
                  variant={danger ? "destructive" : "filled"}
                  fullWidth
                  size="primary"
                  onClick={() => setShowConfirm(true)}
                >
                  {JOBCAN_UI_TERMS.applyAction}
                  {danger ? "(削除・取り違えあり)" : ""}
                </IosButton>
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
      </Screen>
    </>
  );
}
