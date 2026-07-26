import { describe, expect, it } from "vitest";
import { parseJobcanSheet } from "../parsers/jobcan-sheet";
import type { JobcanSheetInput } from "../parsers/jobcan-sheet";

// 個人情報を含まないダミー構造でジョブカン実シートの構造を再現する。
// 氏名 "試 太郎" / コード "Z9999" / 所属 "TEST DIV->Test TM->テスト" / 対象月 2026年8月
const MONTH_HEADER = "2026年8月度 シフト表";
const IDENTITY_ROW = [
  "試 太郎",
  "",
  "Z9999",
  "",
  "TEST DIV->Test TM->テスト",
  "",
  "",
];
const DATA_HEADER_ROW = ["日付", "曜日", "区分", "", "", "出勤", "退勤"];

/** header + identity(index3) + データヘッダ + データ行 を組み立てる */
function makeRows(
  dataRows: string[][],
  monthHeader: string = MONTH_HEADER,
  identity: string[] = IDENTITY_ROW,
): string[][] {
  return [
    [monthHeader, "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    identity,
    ["", "", "", "", "", "", ""],
    DATA_HEADER_ROW,
    ...dataRows,
  ];
}

function parse(dataRows: string[][], extra?: Partial<JobcanSheetInput>) {
  return parseJobcanSheet({ rows: makeRows(dataRows), ...extra });
}

describe("parseJobcanSheet: 通常シフト", () => {
  it("出勤/退勤ありの1行を1コマとして取り込む", () => {
    // Arrange
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    // Act
    const entries = parse(rows);
    // Assert
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      jobcanShiftId: "Z9999:2026-08-01",
      staffCode: "Z9999",
      staffName: "試 太郎",
      affiliation: "TEST DIV->Test TM->テスト",
      sourceMonth: "2026-08",
      shift: { date: "2026-08-01", startTime: "09:00", endTime: "18:00" },
    });
  });
});

describe("parseJobcanSheet: 休日区分は見ずに時刻だけで判定", () => {
  it("公休区分でも時刻があれば取り込む", () => {
    const rows = [["8/2(日)", "", "公休", "", "", "10:00", "15:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift).toEqual({
      date: "2026-08-02",
      startTime: "10:00",
      endTime: "15:00",
    });
  });

  it("祝日区分でも時刻があれば取り込む", () => {
    const rows = [["8/11(月)", "", "祝日", "", "", "9:00", "17:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift.date).toBe("2026-08-11");
  });

  it("公休で 00:00/00:00 の行は除外する", () => {
    const rows = [["8/3(月)", "", "公休", "", "", "0:00", "0:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });
});

describe("parseJobcanSheet: 異常時刻の扱い(社長確定v1)", () => {
  it("開始のみ 00:00 の行は除外する", () => {
    const rows = [["8/6(水)", "", "", "", "", "0:00", "18:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });

  it("終了のみ 00:00 の行は除外する", () => {
    const rows = [["8/6(水)", "", "", "", "", "9:00", "0:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });

  it("時刻列が非HH:MM文字列(休/遅刻等)の行は除外する", () => {
    const rows = [
      ["8/6(水)", "", "", "", "", "休", "休"],
      ["8/7(木)", "", "", "", "", "9:00", "遅刻"],
    ];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });

  it("終了<開始の深夜跨ぎは同日verbatimで記録し日跨ぎ変換しない", () => {
    const rows = [["8/7(木)", "", "", "", "", "22:00", "5:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift).toEqual({
      date: "2026-08-07",
      startTime: "22:00",
      endTime: "05:00",
    });
  });
});

describe("parseJobcanSheet: 時刻の範囲検証(①)", () => {
  it.each([
    ["時が範囲外(24:00)", "24:00", "18:00"],
    ["時が範囲外(25:70)", "25:70", "18:00"],
    ["分が範囲外(23:60)", "9:00", "23:60"],
    ["分が範囲外(9:99→09:99)", "9:99", "18:00"],
  ])("%s の行は ShiftEntry を生まない", (_label, start, end) => {
    const rows = [["8/10(日)", "", "", "", "", start, end]];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });

  it("境界値 23:59 / 00:01 は採用する", () => {
    const rows = [["8/10(日)", "", "", "", "", "0:01", "23:59"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift).toEqual({
      date: "2026-08-10",
      startTime: "00:01",
      endTime: "23:59",
    });
  });
});

describe("parseJobcanSheet: 実在日検証(②)", () => {
  it("存在しない日(2/30)はスキップし 3/2 へ繰り上げない", () => {
    const rows = [["2/30", "", "", "", "", "9:00", "18:00"]];
    const entries = parseJobcanSheet({
      rows: makeRows(rows, "2026年2月度 シフト表"),
    });
    expect(entries).toHaveLength(0);
  });

  it("存在しない日(4/31)はスキップする", () => {
    const rows = [["4/31", "", "", "", "", "9:00", "18:00"]];
    const entries = parseJobcanSheet({
      rows: makeRows(rows, "2026年4月度 シフト表"),
    });
    expect(entries).toHaveLength(0);
  });

  it("非うるう年の 2/29(2026) はスキップする", () => {
    const rows = [["2/29", "", "", "", "", "9:00", "18:00"]];
    const entries = parseJobcanSheet({
      rows: makeRows(rows, "2026年2月度 シフト表"),
    });
    expect(entries).toHaveLength(0);
  });

  it("うるう年の 2/29(2028) は採用する", () => {
    const rows = [["2/29", "", "", "", "", "9:00", "18:00"]];
    const entries = parseJobcanSheet({
      rows: makeRows(rows, "2028年2月度 シフト表"),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].shift.date).toBe("2028-02-29");
  });

  it("通常の実在日(8/31)は不変で採用する", () => {
    const rows = [["8/31", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries[0].shift.date).toBe("2026-08-31");
  });
});

describe("parseJobcanSheet: 列位置と表記揺れ", () => {
  it("出勤/退勤列(5,6)以外の遅刻等の時刻は無視する", () => {
    // 列7以降に実打刻(遅刻)が入っていても採用時刻は列5/6のみ
    const rows = [["8/8(金)", "", "", "", "", "9:00", "18:00", "9:45", "18:10"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift.startTime).toBe("09:00");
    expect(entries[0].shift.endTime).toBe("18:00");
  });

  it("全角の日付・時刻を半角に正規化する", () => {
    const rows = [["８/５(火)", "", "", "", "", "９:００", "18:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift).toEqual({
      date: "2026-08-05",
      startTime: "09:00",
      endTime: "18:00",
    });
  });

  it("時を必ずゼロ埋めする", () => {
    const rows = [["8/9(土)", "", "", "", "", "9:30", "17:05"]];
    const entries = parse(rows);
    expect(entries[0].shift.startTime).toBe("09:30");
    expect(entries[0].shift.endTime).toBe("17:05");
  });
});

describe("parseJobcanSheet: 行フィルタ", () => {
  it("日付でない合計行はスキップする", () => {
    const rows = [
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
      ["合計", "", "", "", "", "160:00", ""],
    ];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
  });

  it("空行はスキップする", () => {
    const rows = [
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
      ["", "", "", "", "", "", ""],
    ];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
  });

  it("月が範囲外(13以上)の行は日付として扱わずスキップする", () => {
    const rows = [
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
      ["18/45", "", "", "", "", "9:00", "18:00"],
    ];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift.date).toBe("2026-08-01");
  });

  it("日が範囲外(32以上)の行はスキップする", () => {
    const rows = [["8/32", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });

  it("月0・日0の行はスキップする", () => {
    const rows = [["0/0", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(0);
  });

  it("桁こぼれ(8/123)は日付行と見なさずスキップする(⑤)", () => {
    const rows = [
      ["8/12(水)", "", "", "", "", "9:00", "18:00"],
      ["8/123", "", "", "", "", "9:00", "18:00"],
    ];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].shift.date).toBe("2026-08-12");
  });
});

describe("parseJobcanSheet: 月またぎ・前年", () => {
  it("対象月内の前半月(7月)は同年で補完する", () => {
    const rows = [["7/20(日)", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries[0].shift.date).toBe("2026-07-20");
    // sourceMonth は対象年月(header)基準
    expect(entries[0].sourceMonth).toBe("2026-08");
  });

  it("対象月(1月)より大きい月(12月)は前年で補完する", () => {
    const rows = [["12/28(月)", "", "", "", "", "9:00", "18:00"]];
    const entries = parseJobcanSheet({
      rows: makeRows(rows, "2027年1月度 シフト表"),
    });
    expect(entries[0].shift.date).toBe("2026-12-28");
    expect(entries[0].sourceMonth).toBe("2027-01");
  });
});

describe("parseJobcanSheet: identity 抽出", () => {
  it("氏名・コード・所属を4行目から取り込む", () => {
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries[0].staffCode).toBe("Z9999");
    expect(entries[0].staffName).toBe("試 太郎");
    expect(entries[0].affiliation).toBe("TEST DIV->Test TM->テスト");
  });

  it("jobcanShiftId は staffCode:date 形式", () => {
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries[0].jobcanShiftId).toBe("Z9999:2026-08-01");
  });

  it("規定位置(col2)にコードが無ければ、他行に本人コード様セルがあっても採用せず throw(別人ひも付け防止)", () => {
    // 規定の index3 col2 は空。承認者等の他人コード "Z9999" が別セルに1つだけ在っても拾わない
    const identity = ["試 太郎", "", "", "", "TEST DIV->Test TM->テスト", "Z9999", ""];
    const rows = makeRows(
      [["8/1(土)", "", "", "", "", "9:00", "18:00"]],
      MONTH_HEADER,
      identity,
    );
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });

  it("規定位置のコードが書式外なら throw(推測フォールバックしない)", () => {
    // col2 が "A1"(部署コード様)で STAFF_CODE_RE に合わない → 黙って他行を探さず throw
    const identity = ["試 太郎", "", "A1", "", "TEST DIV->Test TM->テスト", "Z9999", ""];
    const rows = makeRows(
      [["8/1(土)", "", "", "", "", "9:00", "18:00"]],
      MONTH_HEADER,
      identity,
    );
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });

  it("氏名が空なら sheetName で補完する(コードは規定位置固定)", () => {
    const identity = ["", "", "Z9999", "", "TEST DIV->Test TM->テスト", "", ""];
    const rows = makeRows(
      [["8/1(土)", "", "", "", "", "9:00", "18:00"]],
      MONTH_HEADER,
      identity,
    );
    const entries = parseJobcanSheet({ rows, sheetName: "試 太郎シート" });
    expect(entries[0].staffName).toBe("試 太郎シート");
    expect(entries[0].staffCode).toBe("Z9999");
  });

  it("コード書式は英字1+数字ちょうど4桁。5桁(Z99999)は書式外で throw(⑦)", () => {
    const identity = ["試 太郎", "", "Z99999", "", "TEST DIV->Test TM->テスト", "", ""];
    const rows = makeRows(
      [["8/1(土)", "", "", "", "", "9:00", "18:00"]],
      MONTH_HEADER,
      identity,
    );
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });
});

describe("parseJobcanSheet: 対象年月の決定", () => {
  it("targetMonth 指定を header より優先する", () => {
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    const entries = parseJobcanSheet({
      rows: makeRows(rows),
      targetMonth: { year: 2030, month: 8 },
    });
    expect(entries[0].shift.date).toBe("2030-08-01");
    expect(entries[0].sourceMonth).toBe("2030-08");
  });

  it("targetMonth 未指定なら header から YYYY年M月 を読む", () => {
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries[0].sourceMonth).toBe("2026-08");
  });

  it("データ領域の別月注記(1999年1月)にヘッダ年月を乗っ取られない(④)", () => {
    // 走査範囲外(データ行)に別月が紛れても先頭の正しい対象月を採る
    const rows = [
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
      ["※ 前月 1999年1月 の注記", "", "", "", "", "", ""],
    ];
    const entries = parse(rows);
    expect(entries[0].sourceMonth).toBe("2026-08");
    expect(entries[0].shift.date).toBe("2026-08-01");
  });

  it("ヘッダ走査範囲内に異なる年月が複数あれば曖昧として throw(④ fail-loud)", () => {
    const rows: string[][] = [
      [MONTH_HEADER, "", "", "", "", "", ""],
      ["1999年1月", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      IDENTITY_ROW,
      ["", "", "", "", "", "", ""],
      DATA_HEADER_ROW,
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
    ];
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });

  it("後続語つきヘッダ(2026年8月度 シフト表)を正しく解決する", () => {
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    // MONTH_HEADER は "2026年8月度 シフト表"。度・後続語があっても2026-08
    const entries = parse(rows);
    expect(entries[0].sourceMonth).toBe("2026-08");
  });

  it("④-a: 1セル内に異なる年月が2つあると曖昧として throw(silent hijack防止)", () => {
    // "1999年1月実績比較 2026年8月度 シフト表" のような1セル。先頭だけ拾って1999に化けない
    const rows: string[][] = [
      ["1999年1月実績比較 2026年8月度 シフト表", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      IDENTITY_ROW,
      ["", "", "", "", "", "", ""],
      DATA_HEADER_ROW,
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
    ];
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });

  it("④-b: 出力日時(2026年07月25日)があっても年月ヘッダと誤認せず 2026-08 に解決", () => {
    // フル日付(…月…日)は年月候補から除外。度ヘッダと合わせても曖昧throwしない
    const rows: string[][] = [
      ["出力日時 2026年07月25日 13:00", "", "", "", "", "", ""],
      ["2026年8月度 シフト表", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      IDENTITY_ROW,
      ["", "", "", "", "", "", ""],
      DATA_HEADER_ROW,
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
    ];
    const entries = parseJobcanSheet({ rows });
    expect(entries[0].sourceMonth).toBe("2026-08");
    expect(entries[0].shift.date).toBe("2026-08-01");
  });

  it("④-b: 出力日時のフル日付が単独で存在する場合は年月として拾わない", () => {
    // フル日付だけで年月ヘッダが無ければ「特定できず」throw(日付を月ヘッダに誤採用しない)
    const rows: string[][] = [
      ["出力日時 2026年07月25日", "", "", "", "", "", ""],
      ["シフト表", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      IDENTITY_ROW,
      ["", "", "", "", "", "", ""],
      DATA_HEADER_ROW,
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
    ];
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });
});

describe("parseJobcanSheet: データ開始行", () => {
  it("col0 に 日付 を含むヘッダの次行からデータを読む", () => {
    const rows = [["8/1(土)", "", "", "", "", "9:00", "18:00"]];
    const entries = parse(rows);
    expect(entries).toHaveLength(1);
  });

  it("日付ヘッダが無ければ index9 以降にフォールバックする", () => {
    // index0..8 を identity/ヘッダ等で埋め、index9 からデータを置く("日付"ヘッダ無し)
    const rows: string[][] = [
      [MONTH_HEADER, "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      IDENTITY_ROW,
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
      ["8/2(日)", "", "", "", "", "10:00", "16:00"],
    ];
    const entries = parseJobcanSheet({ rows });
    expect(entries).toHaveLength(2);
    expect(entries[0].shift.date).toBe("2026-08-01");
  });
});

describe("parseJobcanSheet: 出現順保持", () => {
  it("シート出現順に配列を返す", () => {
    const rows = [
      ["8/3(月)", "", "", "", "", "9:00", "18:00"],
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
      ["8/2(日)", "", "", "", "", "9:00", "18:00"],
    ];
    const entries = parse(rows);
    expect(entries.map((e) => e.shift.date)).toEqual([
      "2026-08-03",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("parseJobcanSheet: 破綻入力は throw", () => {
  it("対象年月が header にも targetMonth にも無ければ throw", () => {
    const rows: string[][] = [
      ["シフト表", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      IDENTITY_ROW,
      ["", "", "", "", "", "", ""],
      DATA_HEADER_ROW,
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
    ];
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });

  it("staffCode がどこにも無ければ throw", () => {
    const identity = ["試 太郎", "", "", "", "TEST DIV->Test TM->テスト", "", ""];
    const rows: string[][] = [
      [MONTH_HEADER, "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      identity,
      ["", "", "", "", "", "", ""],
      DATA_HEADER_ROW,
      ["8/1(土)", "", "", "", "", "9:00", "18:00"],
    ];
    expect(() => parseJobcanSheet({ rows })).toThrow();
  });
});
