"use client";

import { COLORS } from "../../_lib/tokens";

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

const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 1000,
};

/** 汎用確認ダイアログ(削除確認 / 上書き確認で共用)。 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const accent = danger ? COLORS.danger : COLORS.text;
  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true">
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "1.5rem",
          maxWidth: 440,
          width: "100%",
          border: `2px solid ${danger ? COLORS.danger : COLORS.border}`,
        }}
      >
        <h3 style={{ marginTop: 0, color: accent }}>{title}</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{message}</p>
        <div
          style={{
            display: "flex",
            gap: ".75rem",
            justifyContent: "flex-end",
            marginTop: "1rem",
          }}
        >
          <button type="button" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              background: accent,
              color: "#fff",
              border: "none",
              padding: ".5rem 1rem",
              borderRadius: 4,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "処理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
