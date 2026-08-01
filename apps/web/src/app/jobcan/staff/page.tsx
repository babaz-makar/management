"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffDirectoryEntry } from "@management/shift-management";
import { IOS } from "../_lib/tokens";
import {
  IosCallout,
  IosLoading,
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
    if (isValidStaffCode(code)) setInitialCode(code);
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
    <Screen>
      <PageHeader
        title="スタッフ名簿(staffCode ⇄ email)"
        description={
          <>
            取込で email を引き当てるための対応表です。
            <a
              href="/jobcan"
              style={{ marginLeft: ".75rem", color: IOS.color.blue, textDecoration: "none" }}
            >
              取込画面へ戻る
            </a>
          </>
        }
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

      <StaffConfirmCard
        entries={entries}
        initialStaffCode={initialCode}
        busy={busy}
        onSubmit={(staffCode, email) => void submitUpsert(staffCode, email, false)}
      />

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
  );
}
