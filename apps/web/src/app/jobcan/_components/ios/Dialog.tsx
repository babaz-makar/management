"use client";

import { useId, type ReactNode } from "react";
import { IOS, iosType } from "../../_lib/tokens";
import { useDialogFocus } from "../../_lib/use-dialog-focus";

interface IosDialogProps {
  /** タイトル(headline 中央)。 */
  title: string;
  /** 本文スロット(footnote 中央想定。チェックボックス等の機能もここへ)。 */
  children: ReactNode;
  /** 下部ボタン行(IosDialogButton を並べる)。 */
  actions: ReactNode;
  /** Escape/背景では閉じない busy 中の誤操作防止。 */
  busy: boolean;
  onClose: () => void;
  /** 危険トーンなら枠を赤寄りに(タイトル色は利用点で調整)。 */
  danger?: boolean;
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
 * iOS アラート風ダイアログのシェル(白角丸 14・幅 280-320・中央)。
 * フォーカストラップ/Escape は既存 useDialogFocus をそのまま使う(機能不変)。
 * タイトル headline 中央、本文は children、ボタンは下部横並び(hairline 分割)。
 */
export function IosDialog({
  title,
  children,
  actions,
  busy,
  onClose,
  danger = false,
}: IosDialogProps) {
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(() => {
    if (!busy) onClose();
  });

  return (
    <div style={OVERLAY_STYLE} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          background: IOS.color.cardBg,
          borderRadius: IOS.metrics.radiusDialog,
          width: "100%",
          maxWidth: 320,
          overflow: "hidden",
          outline: "none",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ padding: "20px 18px 16px", textAlign: "center" }}>
          <h3
            id={titleId}
            style={{
              margin: 0,
              color: danger ? IOS.color.redText : IOS.color.label,
              ...iosType("headline"),
            }}
          >
            {title}
          </h3>
          <div
            style={{
              marginTop: 8,
              color: IOS.color.secondaryLabel,
              textAlign: "left",
              ...iosType("footnote"),
            }}
          >
            {children}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            borderTop: `0.5px solid ${IOS.color.separator}`,
          }}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}

interface IosDialogButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** 実行系(太字・危険なら赤)。キャンセルは false。 */
  emphasized?: boolean;
  danger?: boolean;
  /** 2 つ以上並ぶ時の hairline 縦区切り(2 つ目以降に付ける)。 */
  withDivider?: boolean;
}

/** ダイアログ下部の等幅ボタン(青 plain、実行は太字/赤)。 */
export function IosDialogButton({
  children,
  onClick,
  disabled = false,
  emphasized = false,
  danger = false,
  withDivider = false,
}: IosDialogButtonProps) {
  const color = disabled
    ? IOS.gray.g1
    : danger
      ? IOS.color.redText
      : IOS.color.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 48,
        border: "none",
        borderLeft: withDivider ? `0.5px solid ${IOS.color.separator}` : "none",
        background: "transparent",
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        ...iosType("body"),
        fontWeight: emphasized ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}
