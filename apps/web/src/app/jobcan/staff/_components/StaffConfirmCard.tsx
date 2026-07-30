"use client";

import { useMemo, useState } from "react";
import { findSimilarStaffNames } from "@management/shift-management/ui";
import type { StaffDirectoryEntry } from "@management/shift-management";
import { isValidStaffCode, type SlackCheckResult } from "../_lib/staff-client";
import { SlackCheckButton } from "./SlackCheckButton";
import { COLORS } from "../../_lib/tokens";

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

  const canSubmit = codeValid && emailLooksValid && agreed && !busy;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(staffCode, emailTrimmed);
  }

  return (
    <section
      style={{
        padding: "1.1rem 1.3rem",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        marginBottom: "1.5rem",
        background: COLORS.surface,
      }}
    >
      <h2 style={{ marginTop: 0 }}>新規登録 / 更新</h2>

      <div style={{ marginBottom: ".75rem" }}>
        <label>
          staffCode(例 A0187)
          <br />
          <input
            type="text"
            value={staffCode}
            onChange={(e) => setStaffCode(e.target.value)}
            placeholder="A0187"
            style={{ padding: ".35rem .5rem", width: 160 }}
          />
        </label>
        {staffCode.length > 0 && !codeValid && (
          <div style={{ color: COLORS.danger, marginTop: ".25rem" }}>
            形式が不正です(大文字英字1文字 + 数字4桁)。
          </div>
        )}
      </div>

      <div style={{ marginBottom: ".5rem" }}>
        <label>
          email
          <br />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSlackResult(null);
              setAgreed(false);
            }}
            placeholder="name@example.com"
            style={{ padding: ".35rem .5rem", width: 280 }}
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
        <div
          style={{
            padding: ".6rem .9rem",
            background: COLORS.warningBg,
            border: `1px solid ${COLORS.warningBorder}`,
            borderRadius: 4,
            color: COLORS.warning,
            margin: ".5rem 0",
          }}
        >
          <strong>紛らわしい既存登録があります(取り違えに注意):</strong>
          <ul style={{ margin: ".25rem 0 0", paddingLeft: "1.2rem" }}>
            {similar.map((match) => (
              <li key={match.staffCode}>
                {match.staffCode} — {match.staffName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <label style={{ display: "block", margin: ".5rem 0" }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={!codeValid || !emailLooksValid}
          style={{ marginRight: ".5rem" }}
        />
        この対応(staffCode ⇄ email)で間違いない
      </label>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          background: canSubmit ? COLORS.text : COLORS.border,
          color: "#fff",
          border: "none",
          padding: ".5rem 1rem",
          borderRadius: 4,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {busy ? "登録中…" : "この内容で登録する"}
      </button>
    </section>
  );
}
