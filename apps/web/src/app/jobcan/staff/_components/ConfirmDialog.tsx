"use client";

import { IosDialog, IosDialogButton } from "../../_components/ios";

interface ConfirmDialogProps {
  title: string;
  /** 本文(text ノードで描画。HTML は挿入しない)。 */
  message: string;
  confirmLabel: string;
  danger: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 汎用確認ダイアログ(削除確認 / 上書き確認で共用)。iOS アラート風シェル。
 * email 対比の複数行表示(whiteSpace: pre-wrap)・フォーカストラップは不変。
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <IosDialog
      title={title}
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
            disabled={busy}
            emphasized
            danger={danger}
            withDivider
          >
            {busy ? "処理中…" : confirmLabel}
          </IosDialogButton>
        </>
      }
    >
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message}</p>
    </IosDialog>
  );
}
