"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffDirectoryEntry } from "@management/shift-management";
import {
  IosButton,
  IosCallout,
  IosIcon,
  IosLoading,
  JobcanHeader,
  PageHeader,
  Screen,
} from "../_components/ios";
import {
  deleteStaff,
  fetchStaff,
  upsertStaff,
  isValidStaffCode,
} from "./_lib/staff-client";
import { StaffTable } from "./_components/StaffTable";
import { StaffConfirmCard } from "./_components/StaffConfirmCard";
import { UnregisteredList } from "./_components/UnregisteredList";
import { ConfirmDialog } from "./_components/ConfirmDialog";

/** 削除・上書きの保留アクション。 */
type PendingDelete = { kind: "delete"; staffCode: string };
type PendingOverwrite = {
  kind: "overwrite";
  staffCode: string;
  email: string;
  existingEmail: string;
};
type Pending = PendingDelete | PendingOverwrite | null;

export default function StaffDirectoryPage() {
  const [entries, setEntries] = useState<StaffDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialCode, setInitialCode] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  // 登録フォームの開閉(表示のみ)。既定は畳む。?code= 流入時のみ自動展開。
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchStaff();
    if (result.ok) {
      setEntries(result.entries);
      setError(null);
    } else {
      setError(result.errorMessage);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // 取込画面(email 未登録 warning)から ?code= で渡された staffCode を初期表示。
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") ?? "";
    if (isValidStaffCode(code)) {
      setInitialCode(code);
      // 取込→名簿の中核導線: ?code= 流入時は登録フォームを開いておく(従来どおり)。
      setShowForm(true);
    }
    void reload();
  }, [reload]);

  async function submitUpsert(staffCode: string, email: string, overwrite: boolean) {
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await upsertStaff(staffCode, email, overwrite);
    setBusy(false);
    if (result.ok) {
      setNotice(`${result.entry.staffCode} を登録しました。`);
      setPending(null);
      await reload();
      return;
    }
    if (result.conflict) {
      setPending({ kind: "overwrite", staffCode, email, existingEmail: result.existingEmail });
      return;
    }
    setError(result.errorMessage);
  }

  function requestDelete(staffCode: string) {
    setPending({ kind: "delete", staffCode });
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === "delete") {
      setBusy(true);
      setNotice(null);
      setError(null);
      const result = await deleteStaff(pending.staffCode);
      setBusy(false);
      if (result.ok) {
        setNotice(`${pending.staffCode} を削除しました。`);
        setPending(null);
        await reload();
      } else {
        setError(result.errorMessage);
        setPending(null);
      }
      return;
    }
    // overwrite
    await submitUpsert(pending.staffCode, pending.email, true);
  }

  const alreadyRegistered =
    initialCode.length > 0 && entries.some((e) => e.staffCode === initialCode);

  return (
    <>
      <JobcanHeader />
      <Screen>
        <PageHeader
          title="スタッフ名簿"
          description="社員コードとメールの対応表です。"
        />

        {notice && (
          <IosCallout tone="success" style={{ marginBottom: 16 }}>
            {notice}
          </IosCallout>
        )}
        {error && (
          <IosCallout tone="danger" style={{ marginBottom: 16 }}>
            {error}
          </IosCallout>
        )}

        <UnregisteredList staffCode={initialCode} alreadyRegistered={alreadyRegistered} />

        {/* 登録は「＋追加」を押した時だけ開く(既定は畳む。?code= 流入時は自動展開)。 */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <IosButton
            variant={showForm ? "plain" : "tinted"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? (
              "閉じる"
            ) : (
              <>
                <IosIcon name="plus" size={16} />
                追加
              </>
            )}
          </IosButton>
        </div>

        {showForm && (
          <StaffConfirmCard
            entries={entries}
            initialStaffCode={initialCode}
            busy={busy}
            onSubmit={(staffCode, email) => void submitUpsert(staffCode, email, false)}
          />
        )}

        {loading ? (
          <IosLoading label="名簿を読み込み中…" />
        ) : (
          <StaffTable
            entries={entries}
            query={query}
            onQueryChange={setQuery}
            onDelete={requestDelete}
          />
        )}

        {pending?.kind === "delete" && (
        <ConfirmDialog
          title="削除の確認"
          message={`${pending.staffCode} を名簿から削除します。よろしいですか?`}
          confirmLabel="削除する"
          danger
          busy={busy}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}

      {pending?.kind === "overwrite" && (
        <ConfirmDialog
          title="既存の登録を上書きしますか?"
          message={`${pending.staffCode} には既に別の email が登録されています。\n既存: ${pending.existingEmail}\n新規: ${pending.email}\n上書きすると既存の対応は失われます。`}
          confirmLabel="上書きする"
          danger
          busy={busy}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
      </Screen>
    </>
  );
}
