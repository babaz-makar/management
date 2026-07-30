"use client";

import { useState } from "react";
import { checkSlack, type SlackCheckResult } from "../_lib/staff-client";
import { COLORS } from "../../_lib/tokens";

interface SlackCheckButtonProps {
  email: string;
  disabled: boolean;
  onResult: (result: SlackCheckResult | null) => void;
  result: SlackCheckResult | null;
}

/** email が Slack に居るかを確認するボタン + 結果表示(present/absent/unknown)。 */
export function SlackCheckButton({
  email,
  disabled,
  onResult,
  result,
}: SlackCheckButtonProps) {
  const [checking, setChecking] = useState(false);

  async function handleClick() {
    setChecking(true);
    onResult(null);
    const outcome = await checkSlack(email);
    onResult(outcome);
    setChecking(false);
  }

  return (
    <div style={{ margin: ".5rem 0" }}>
      <button type="button" onClick={handleClick} disabled={disabled || checking}>
        {checking ? "確認中…" : "Slack に居るか確認"}
      </button>
      {result && (
        <span style={{ marginLeft: ".75rem" }}>
          {result.status === "present" && (
            <span style={{ color: COLORS.success }}>Slack に在籍を確認しました</span>
          )}
          {result.status === "absent" && (
            <span style={{ color: COLORS.warning }}>
              Slack で見つかりませんでした(未在籍の可能性)
            </span>
          )}
          {result.status === "unknown" && (
            <span style={{ color: COLORS.danger }}>{result.errorMessage}</span>
          )}
        </span>
      )}
    </div>
  );
}
