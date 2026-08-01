"use client";

import { useState } from "react";
import { IOS, iosType } from "../_lib/tokens";
import { IosDialog, IosDialogButton } from "./ios";

interface ApplyConfirmDialogProps {
  /** 危険確認(削除>0 or 取り違え)なら二段確認(削除件数の明示 + 追加チェック)。 */
  danger: boolean;
  totalDeletes: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 本反映の確認ダイアログ(iOS アラート風シェル)。
 * - 通常(danger=false): 「□この対応で間違いない」+ 反映ボタンの軽い確認。
 * - 危険(danger=true): 削除件数を明示し、追加の危険同意チェックを課す二段確認。
 * フォーカストラップ・Escape・二段チェックの機能は不変(見た目のみ iOS 化)。
 */
export function ApplyConfirmDialog({
  danger,
  totalDeletes,
  busy,
  onConfirm,
  onCancel,
}: ApplyConfirmDialogProps) {
  const [agreed, setAgreed] = useState(false);
  const [dangerAgreed, setDangerAgreed] = useState(false);

  const canConfirm = agreed && (!danger || dangerAgreed) && !busy;

  return (
    <IosDialog
      title={danger ? "本反映(危険な変更を含む)" : "本反映の確認"}
      busy={busy}
      danger={danger}
      onClose={onCancel}
      actions={
        <>
          <IosDialogButton onClick={onCancel} disabled={busy}>
            キャンセル
          </IosDialogButton>
          <IosDialogButton
            onClick={onConfirm}
            disabled={!canConfirm}
            emphasized
            danger={danger}
            withDivider
          >
            {busy ? "反映中…" : "本反映を実行"}
          </IosDialogButton>
        </>
      }
    >
      <p style={{ margin: "0 0 10px" }}>
        カレンダーへ実際に書き込みます。この操作は取り消せません。内容を確認してください。
      </p>

      {danger && (
        <div
          style={{
            padding: "10px 12px",
            background: IOS.color.redTintBg,
            borderRadius: IOS.metrics.radiusList,
            marginBottom: 12,
            color: IOS.color.redText,
          }}
        >
          {totalDeletes > 0 && (
            <p style={{ margin: 0, ...iosType("headline") }}>
              {totalDeletes} 件の予定を削除します。
            </p>
          )}
        </div>
      )}

      <label style={{ display: "block", marginBottom: 10, color: IOS.color.label }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginRight: ".5rem" }}
        />
        この内容で本反映することを確認しました
      </label>

      {danger && (
        <label style={{ display: "block", marginBottom: 4, color: IOS.color.redText }}>
          <input
            type="checkbox"
            checked={dangerAgreed}
            onChange={(e) => setDangerAgreed(e.target.checked)}
            style={{ marginRight: ".5rem" }}
          />
          削除・取り違えのリスクを理解した上で実行します
        </label>
      )}
    </IosDialog>
  );
}
