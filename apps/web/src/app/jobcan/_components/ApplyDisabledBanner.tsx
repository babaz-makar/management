"use client";

import { COLORS } from "../_lib/tokens";

/**
 * 本反映が無効(サーバー env JOBCAN_APPLY_ENABLED 未設定)の告知。
 * apply POST の結果が dryRun:true で返ったときに表示する。
 */
export function ApplyDisabledBanner() {
  return (
    <section
      style={{
        padding: "0.9rem 1.1rem",
        background: COLORS.warningBg,
        border: `1px solid ${COLORS.warningBorder}`,
        borderRadius: 6,
        marginBottom: "1.25rem",
        color: COLORS.warning,
      }}
    >
      <strong>本反映は有効化されていません。</strong>
      <p style={{ margin: ".4rem 0 0" }}>
        サーバー側の本反映スイッチが無効のため、カレンダーは変更されていません(dry-run
        のまま)。反映を行うには管理者に有効化を依頼してください。
      </p>
    </section>
  );
}
