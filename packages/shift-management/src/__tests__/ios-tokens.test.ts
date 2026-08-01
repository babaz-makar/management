import { describe, expect, it } from "vitest";
import {
  IOS,
  IOS_FONT_FAMILY,
  iosButtonColors,
  iosCalloutColors,
  iosRowBackground,
  iosType,
  type IosButtonVariant,
  type IosTypeLevel,
} from "../logic/ios-tokens";

describe("iosType: タイポ階層の値を固定する", () => {
  it("largeTitle は 34/700、letterSpacing/lineHeight を px 文字列で返す", () => {
    expect(iosType("largeTitle")).toEqual({
      fontSize: 34,
      fontWeight: 700,
      letterSpacing: "-0.4px",
      lineHeight: "41px",
    });
  });

  it("body は 17/400・letterSpacing 0px", () => {
    expect(iosType("body")).toEqual({
      fontSize: 17,
      fontWeight: 400,
      letterSpacing: "0px",
      lineHeight: "22px",
    });
  });

  it("footnote は 13/400/18px(グレー説明・ヘッダに使う階層)", () => {
    expect(iosType("footnote")).toEqual({
      fontSize: 13,
      fontWeight: 400,
      letterSpacing: "0px",
      lineHeight: "18px",
    });
  });

  it.each<[IosTypeLevel, number, number]>([
    ["largeTitle", 34, 700],
    ["title2", 22, 700],
    ["title3", 20, 600],
    ["headline", 17, 600],
    ["body", 17, 400],
    ["callout", 16, 400],
    ["subhead", 15, 400],
    ["footnote", 13, 400],
    ["caption", 12, 400],
  ])("%s の fontSize/fontWeight を固定", (level, size, weight) => {
    const style = iosType(level);
    expect(style.fontSize).toBe(size);
    expect(style.fontWeight).toBe(weight);
  });

  it("全レベルで letterSpacing/lineHeight は px 付き文字列", () => {
    const levels: IosTypeLevel[] = [
      "largeTitle",
      "title2",
      "title3",
      "headline",
      "body",
      "callout",
      "subhead",
      "footnote",
      "caption",
    ];
    for (const level of levels) {
      const style = iosType(level);
      expect(style.letterSpacing).toMatch(/px$/);
      expect(style.lineHeight).toMatch(/px$/);
    }
  });
});

describe("IOS トークン定数: iOS 標準ライト値を固定する", () => {
  it("アクセントは systemBlue #007AFF(1 色に統一)", () => {
    expect(IOS.color.blue).toBe("#007AFF");
    expect(IOS.color.bluePressed).toBe("#0062CC");
  });

  it("床/カード/分割線", () => {
    expect(IOS.color.groupedBg).toBe("#F2F2F7");
    expect(IOS.color.cardBg).toBe("#FFFFFF");
    expect(IOS.color.cardBgPressed).toBe("#D1D1D6");
    expect(IOS.color.separator).toBe("#C6C6C8");
  });

  it("危険/警告/成功の階調", () => {
    expect(IOS.color.red).toBe("#FF3B30");
    expect(IOS.color.redText).toBe("#D70015");
    expect(IOS.color.orange).toBe("#FF9500");
    expect(IOS.color.green).toBe("#34C759");
    expect(IOS.color.greenText).toBe("#248A3D");
  });

  it("systemGray1-6(濃→淡)", () => {
    expect(IOS.gray).toEqual({
      g1: "#8E8E93",
      g2: "#AEAEB2",
      g3: "#C7C7CC",
      g4: "#D1D1D6",
      g5: "#E5E5EA",
      g6: "#F2F2F7",
    });
  });

  it("1 カラム前提の最大幅を 640-700 に絞る", () => {
    expect(IOS.metrics.maxWidth).toBeGreaterThanOrEqual(640);
    expect(IOS.metrics.maxWidth).toBeLessThanOrEqual(700);
  });

  it("行高/入力高は 44pt", () => {
    expect(IOS.metrics.rowMinHeight).toBe(44);
    expect(IOS.metrics.controlHeight).toBe(44);
  });

  it("フォントは -apple-system 始まり(SF Pro → 日本語フォールバック)", () => {
    expect(IOS_FONT_FAMILY.startsWith("-apple-system")).toBe(true);
    expect(IOS.fontFamily).toBe(IOS_FONT_FAMILY);
    expect(IOS_FONT_FAMILY).toContain("Hiragino Sans");
  });
});

describe("iosButtonColors: variant × state の色割り当てを固定する", () => {
  it("filled/default は青地・白文字", () => {
    expect(iosButtonColors("filled", "default")).toEqual({
      background: "#007AFF",
      color: "#FFFFFF",
    });
  });

  it("filled/pressed は一段濃い青", () => {
    expect(iosButtonColors("filled", "pressed").background).toBe("#0062CC");
  });

  it("destructive/default は赤地・白文字(削除など危険操作)", () => {
    expect(iosButtonColors("destructive", "default")).toEqual({
      background: "#FF3B30",
      color: "#FFFFFF",
    });
  });

  it("tinted は淡青地・青文字(補助)", () => {
    expect(iosButtonColors("tinted", "default")).toEqual({
      background: "#E7F0FF",
      color: "#007AFF",
    });
  });

  it("plain は地なし・青文字", () => {
    expect(iosButtonColors("plain", "default")).toEqual({
      background: "transparent",
      color: "#007AFF",
    });
  });

  it.each<IosButtonVariant>(["filled", "destructive"])(
    "%s/disabled は gray4 地・gray1 文字",
    (variant) => {
      expect(iosButtonColors(variant, "disabled")).toEqual({
        background: "#D1D1D6",
        color: "#8E8E93",
      });
    },
  );

  it.each<IosButtonVariant>(["plain", "tinted"])(
    "%s/disabled は地なし・gray1 文字",
    (variant) => {
      expect(iosButtonColors(variant, "disabled")).toEqual({
        background: "transparent",
        color: "#8E8E93",
      });
    },
  );
});

describe("iosCalloutColors: トーン別の帯配色を固定する", () => {
  it("danger は赤系(redTintBg 地・redText 文字・red バー)", () => {
    expect(iosCalloutColors("danger")).toEqual({
      background: "#FFEBE9",
      color: "#D70015",
      bar: "#FF3B30",
    });
  });

  it("warning はオレンジ系", () => {
    const c = iosCalloutColors("warning");
    expect(c.color).toBe("#8F5B00");
    expect(c.bar).toBe("#FF9500");
  });

  it("success はグリーン系", () => {
    const c = iosCalloutColors("success");
    expect(c.color).toBe("#248A3D");
    expect(c.bar).toBe("#34C759");
  });

  it("info はブルー系", () => {
    expect(iosCalloutColors("info").bar).toBe("#007AFF");
  });
});

describe("iosRowBackground: タップ可能行の押下だけ地を変える", () => {
  it("tappable かつ pressed なら cardBgPressed", () => {
    expect(iosRowBackground(true, true)).toBe("#D1D1D6");
  });

  it("pressed でも tappable でなければ透明", () => {
    expect(iosRowBackground(true, false)).toBe("transparent");
  });

  it("非 pressed は透明(カード地を透かす)", () => {
    expect(iosRowBackground(false, true)).toBe("transparent");
  });
});
