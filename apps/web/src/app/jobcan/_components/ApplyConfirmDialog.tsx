"use client";

import { useId, useState } from "react";
import { COLORS } from "../_lib/tokens";
import { useDialogFocus } from "../_lib/use-dialog-focus";

interface ApplyConfirmDialogProps {
  /** 危険確認(削除>0 or 取り違え)なら二段確認(削除件数の明示 + 追加チェック)。 */
  danger: boolean;
  totalDeletes: number;
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

/**
 * 本反映の確認ダイアログ。
 * - 通常(danger=false): 「□この対応で間違いない」+ 反映ボタンの軽い確認。
 * - 危険(danger=true): 削除件数を明示し、追加の危険同意チェックを課す二段確認。
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
  const titleId = useId();
  // busy 中は Escape での離脱を無効化(反映処理中の誤操作を避ける)。
  const dialogRef = useDialogFocus<HTMLDivElement>(() => {
    if (!busy) onCancel();
  });

  const canConfirm = agreed && (!danger || dangerAgreed) && !busy;
  const accent = danger ? COLORS.danger : COLORS.text;

  return (
    <div style={OVERLAY_STYLE} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "1.5rem",
          maxWidth: 480,
          width: "100%",
          border: `2px solid ${danger ? COLORS.danger : COLORS.border}`,
          outline: "none",
        }}
      >
        <h3 id={titleId} style={{ marginTop: 0, color: accent }}>
          {danger ? "本反映(危険な変更を含む)" : "本反映の確認"}
        </h3>
        <p>
          カレンダーへ実際に書き込みます。この操作は取り消せません。内容を確認してください。
        </p>

        {danger && (
          <div
            style={{
              padding: ".8rem 1rem",
              background: COLORS.dangerBg,
              border: `1px solid ${COLORS.dangerBorder}`,
              borderRadius: 4,
              marginBottom: "1rem",
              color: COLORS.danger,
            }}
          >
            {totalDeletes > 0 && (
              <p style={{ margin: 0, fontWeight: 700 }}>
                {totalDeletes} 件の予定を削除します。
              </p>
            )}
          </div>
        )}

        <label style={{ display: "block", marginBottom: ".6rem" }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginRight: ".5rem" }}
          />
          この内容で本反映することを確認しました
        </label>

        {danger && (
          <label
            style={{ display: "block", marginBottom: ".6rem", color: COLORS.danger }}
          >
            <input
              type="checkbox"
              checked={dangerAgreed}
              onChange={(e) => setDangerAgreed(e.target.checked)}
              style={{ marginRight: ".5rem" }}
            />
            削除・取り違えのリスクを理解した上で実行します
          </label>
        )}

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
            disabled={!canConfirm}
            style={{
              background: canConfirm ? accent : COLORS.border,
              color: "#fff",
              border: "none",
              padding: ".5rem 1rem",
              borderRadius: 4,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "反映中…" : "本反映を実行"}
          </button>
        </div>
      </div>
    </div>
  );
}
