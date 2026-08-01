import { describe, expect, it } from "vitest";
import {
  JOBCAN_TABS,
  JOBCAN_UI_TERMS,
  importPhaseToStep,
  importStepLabel,
} from "../logic/jobcan-ui-terms";

/**
 * UX 再設計で「画面に表示する文字列」を日本語へ言い換える(内部の変数名/prop/API は不変)。
 * 表示語の回帰をここで固定する(apps/web にテストランナーが無いため packages 側で被覆)。
 */
describe("JOBCAN_UI_TERMS: 表示用語の言い換えを固定", () => {
  it("取込の主要アクション語(内部 dryRun/apply は不変)", () => {
    expect(JOBCAN_UI_TERMS.dryRunAction).toBe("選んだ内容を確認する");
    expect(JOBCAN_UI_TERMS.applyAction).toBe("カレンダーに反映する");
  });

  it("名簿の項目語(変数は staffCode/email のまま)", () => {
    expect(JOBCAN_UI_TERMS.staffCodeLabel).toBe("社員コード");
    expect(JOBCAN_UI_TERMS.emailLabel).toBe("メール");
  });

  it("同意チェックの文言", () => {
    expect(JOBCAN_UI_TERMS.consentLabel).toBe("この社員コードとメールで正しい");
  });

  it("名簿の検索プレースホルダ", () => {
    expect(JOBCAN_UI_TERMS.searchPlaceholder).toBe("社員コード / メールで検索");
  });
});

describe("JOBCAN_TABS: 共通タブの定義(ルーティングは既存維持)", () => {
  it("3タブが home/import/staff の順で既存ルートを指す", () => {
    expect(JOBCAN_TABS).toEqual([
      { key: "home", label: "ホーム", href: "/jobcan/home" },
      { key: "import", label: "取込", href: "/jobcan" },
      { key: "staff", label: "名簿", href: "/jobcan/staff" },
    ]);
  });
});

describe("importStepLabel: ステッパーの各段ラベル", () => {
  it("1→3 の段ラベル", () => {
    expect(importStepLabel(1)).toBe("ファイルを選ぶ");
    expect(importStepLabel(2)).toBe("内容を確認");
    expect(importStepLabel(3)).toBe("カレンダーに反映");
  });
});

describe("importPhaseToStep: phase(内部状態)→ 表示段の写像", () => {
  it.each([
    ["idle", 1],
    ["error", 1],
    ["drying", 2],
    ["reviewed", 2],
    ["applying", 2],
    ["done", 3],
  ] as const)("%s は段 %d", (phase, step) => {
    expect(importPhaseToStep(phase)).toBe(step);
  });
});
