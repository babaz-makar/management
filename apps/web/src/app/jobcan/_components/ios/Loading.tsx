"use client";

import { IOS, iosType } from "../../_lib/tokens";

interface IosLoadingProps {
  /** 表示メッセージ(文言は各画面が渡す。変更しない)。 */
  label: string;
}

/** ローディング表示: 小さな回転リング + secondaryLabel の文言を中央に。 */
export function IosLoading({ label }: IosLoadingProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "36px 16px",
        color: IOS.color.secondaryLabel,
      }}
    >
      <span
        className="ios-spin"
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: `2px solid ${IOS.gray.g4}`,
          borderTopColor: IOS.gray.g1,
          display: "inline-block",
        }}
      />
      <span style={iosType("subhead")}>{label}</span>
    </div>
  );
}
