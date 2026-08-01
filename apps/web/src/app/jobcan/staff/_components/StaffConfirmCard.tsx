"use client";

import { useEffect, useMemo, useState } from "react";
import {
  JOBCAN_UI_TERMS,
  canSubmitStaffEntry,
  consentAfterInputChange,
  findSimilarStaffNames,
} from "@management/shift-management/ui";
import type { StaffDirectoryEntry } from "@management/shift-management";
import { isValidStaffCode, type SlackCheckResult } from "../_lib/staff-client";
import { SlackCheckButton } from "./SlackCheckButton";
import { IOS, iosType } from "../../_lib/tokens";
import { IosButton, IosCallout, IosCard } from "../../_components/ios";

/** iOS 風の入力欄 style(高さ 44・角丸 10・薄グレー地)。 */
const inputStyle: React.CSSProperties = {
  height: IOS.metrics.controlHeight,
  padding: "0 12px",
  borderRadius: IOS.metrics.radiusControl,
  border: `0.5px solid ${IOS.color.separator}`,
  background: IOS.color.cardBg,
  color: IOS.color.label,
  boxSizing: "border-box",
  outline: "none",
  ...iosType("body"),
};

interface StaffConfirmCardProps {
  entries: StaffDirectoryEntry[];
  initialStaffCode: string;
  busy: boolean;
  onSubmit: (staffCode: string, email: string) => void;
}

/**
 * 新規登録=照合カード。
 * staffCode 即バリデーション → email → Slack 在籍確認 → 似名(取り違え)警告 →
 * 「□この対応で間違いない」→ 確定。
 *
 * 注: 名簿(StaffDirectoryEntry)は氏名を持たないため、findSimilarStaffNames の
 * 比較対象には既存 email を用いる(入力 email と紛らわしい既存 email を検出し
 * 取り違え登録を抑止する)。氏名フィールド追加時はここを氏名比較へ差し替える。
 */
export function StaffConfirmCard({
  entries,
  initialStaffCode,
  busy,
  onSubmit,
}: StaffConfirmCardProps) {
  const [staffCode, setStaffCode] = useState(initialStaffCode);
  const [email, setEmail] = useState("");

  // ?code= 流入時のみ staffCode 欄を埋める(取込→名簿の中核導線)。
  // useState 初期化子はマウント時のみ評価されるため、マウント後に届く prop を同期する。
  // 空 code では上書きしない=ユーザーが手編集した値を prop 変化で消さない。
  useEffect(() => {
    if (initialStaffCode) setStaffCode(initialStaffCode);
  }, [initialStaffCode]);
  const [slackResult, setSlackResult] = useState<SlackCheckResult | null>(null);
  const [agreed, setAgreed] = useState(false);

  const codeValid = isValidStaffCode(staffCode);
  const emailTrimmed = email.trim();
  const emailLooksValid = emailTrimmed.includes("@") && emailTrimmed.length >= 3;

  // 似名(取り違え)警告: 入力 email と紛らわしい既存 email を洗う。
  const similar = useMemo(() => {
    if (!emailLooksValid) return [];
    const candidates = entries.map((entry) => ({
      staffCode: entry.staffCode,
      staffName: entry.email,
    }));
    return findSimilarStaffNames(emailTrimmed, candidates);
  }, [entries, emailTrimmed, emailLooksValid]);

  const canSubmit = canSubmitStaffEntry({
    codeValid,
    emailLooksValid,
    agreed,
    busy,
  });

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(staffCode, emailTrimmed);
  }

  return (
    <IosCard style={{ marginBottom: IOS.metrics.sectionGap }} padding={20}>
      <h2 style={{ marginTop: 0, marginBottom: 12, ...iosType("title3") }}>
        新規登録 / 更新
      </h2>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block" }}>
          <span
            style={{
              display: "block",
              color: IOS.color.secondaryLabel,
              ...iosType("footnote"),
            }}
          >
            {JOBCAN_UI_TERMS.staffCodeLabel}(例 A0187)
          </span>
          <input
            type="text"
            value={staffCode}
            onChange={(e) => {
              setStaffCode(e.target.value);
              // O-1: 対応が変わったら同意を無効化(email 変更と対称)。
              setAgreed(consentAfterInputChange());
            }}
            placeholder="A0187"
            style={{ ...inputStyle, width: 180, marginTop: 4 }}
          />
        </label>
        {staffCode.length > 0 && !codeValid && (
          <div style={{ color: IOS.color.redText, marginTop: 4, ...iosType("footnote") }}>
            形式が不正です(大文字英字1文字 + 数字4桁)。
          </div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block" }}>
          <span
            style={{
              display: "block",
              color: IOS.color.secondaryLabel,
              ...iosType("footnote"),
            }}
          >
            {JOBCAN_UI_TERMS.emailLabel}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSlackResult(null);
              // O-1: 対応が変わったら同意を無効化(staffCode 変更と対称)。
              setAgreed(consentAfterInputChange());
            }}
            placeholder="name@example.com"
            style={{ ...inputStyle, width: 300, maxWidth: "100%", marginTop: 4 }}
          />
        </label>
      </div>

      <SlackCheckButton
        email={emailTrimmed}
        disabled={!emailLooksValid}
        onResult={setSlackResult}
        result={slackResult}
      />

      {similar.length > 0 && (
        <IosCallout
          tone="warning"
          title="紛らわしい既存登録があります(取り違えに注意):"
          style={{ margin: "8px 0" }}
        >
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {similar.map((match) => (
              <li key={match.staffCode}>
                {match.staffCode} — {match.staffName}
              </li>
            ))}
          </ul>
        </IosCallout>
      )}

      <label
        style={{
          display: "block",
          margin: "10px 0",
          color: IOS.color.label,
          ...iosType("callout"),
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={!codeValid || !emailLooksValid}
          style={{ marginRight: ".5rem" }}
        />
        {JOBCAN_UI_TERMS.consentLabel}
      </label>

      <IosButton
        variant="filled"
        size="primary"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {busy ? "登録中…" : "この内容で登録する"}
      </IosButton>
    </IosCard>
  );
}
