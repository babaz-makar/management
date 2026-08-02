"use client";

import { IosCallout } from "./ios";

/**
 * 本反映が無効(サーバー env JOBCAN_APPLY_ENABLED 未設定)の告知。
 * apply POST の結果が dryRun:true で返ったときに表示する。
 */
export function ApplyDisabledBanner() {
  return (
    <IosCallout
      tone="warning"
      title="本反映は有効化されていません。"
      style={{ marginBottom: 20 }}
    >
      サーバー側の反映スイッチが無効のため、カレンダーは変更されていません(確認のみ
      実行された状態)。反映を行うには管理者に有効化を依頼してください。
    </IosCallout>
  );
}
