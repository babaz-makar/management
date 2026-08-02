"use client";

import { useState } from "react";
import { checkSlack, type SlackCheckResult } from "../_lib/staff-client";
import { IOS, iosType } from "../../_lib/tokens";
import { IosButton } from "../../_components/ios";

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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        margin: "8px 0",
      }}
    >
      <IosButton
        variant="tinted"
        onClick={handleClick}
        disabled={disabled || checking}
      >
        {checking ? "確認中…" : "Slack に居るか確認"}
      </IosButton>
      {result && (
        <span style={iosType("subhead")}>
          {result.status === "present" && (
            <span style={{ color: IOS.color.greenText }}>Slack に在籍を確認しました</span>
          )}
          {result.status === "absent" && (
            <span style={{ color: IOS.color.orangeText }}>
              Slack で見つかりませんでした(未在籍の可能性)
            </span>
          )}
          {result.status === "unknown" && (
            <span style={{ color: IOS.color.redText }}>{result.errorMessage}</span>
          )}
        </span>
      )}
    </div>
  );
}
