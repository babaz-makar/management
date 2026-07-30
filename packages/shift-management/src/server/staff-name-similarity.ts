/**
 * 名簿確定時の「取り違え」警告用の似名判定(純関数・追加依存ゼロ)。
 *
 * 新しく登録しようとしている氏名(target)が、既存名簿の氏名と紛らわしい場合に
 * 警告候補を返す。判定は ①完全一致 ②前方一致(片方が他方の接頭辞) ③簡易編集距離
 * (レーベンシュタイン)の順。氏名を運用していない(staffName 無し)候補は安全にスキップする。
 *
 * 誤警告を抑えるため、前方一致は短い側の長さ 2 以上を要求し、編集距離のしきい値は
 * 文字数に応じて 1〜2 に絞る。UI 表示用途であり、判定漏れよりも過剰警告の抑制を優先する。
 */

/** 似名判定の入力候補(氏名は任意運用)。 */
export interface StaffNameCandidate {
  staffCode: string;
  staffName?: string;
}

/** 似名ヒットの種別。 */
export type StaffNameMatchType = "exact" | "prefix" | "edit_distance";

/** 似名ヒット1件。 */
export interface SimilarStaffMatch {
  staffCode: string;
  staffName: string;
  matchType: StaffNameMatchType;
}

/** 前方一致とみなす最小の接頭辞長(1文字一致はノイズが多いので除外)。 */
const MIN_PREFIX_LENGTH = 2;

/** 2文字列のレーベンシュタイン距離(挿入/削除/置換の最小回数)。 */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    const curr = [i];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[cols - 1];
}

/** 文字数に応じた編集距離のしきい値(短い名前ほど厳しく)。 */
function editDistanceThreshold(maxLength: number): number {
  return maxLength <= 3 ? 1 : 2;
}

/** target と1候補の似名種別を判定する。似ていなければ null。 */
function classify(target: string, candidate: string): StaffNameMatchType | null {
  if (target === candidate) return "exact";
  const shorter = target.length <= candidate.length ? target : candidate;
  const longer = target.length <= candidate.length ? candidate : target;
  if (shorter.length >= MIN_PREFIX_LENGTH && longer.startsWith(shorter)) {
    return "prefix";
  }
  const maxLength = Math.max(target.length, candidate.length);
  if (levenshtein(target, candidate) <= editDistanceThreshold(maxLength)) {
    return "edit_distance";
  }
  return null;
}

/**
 * target に似た既存氏名を探して返す。
 * target が空(空白のみ含む)なら空配列。氏名の無い候補はスキップする。
 */
export function findSimilarStaffNames(
  target: string,
  existing: ReadonlyArray<StaffNameCandidate>,
): SimilarStaffMatch[] {
  const normalizedTarget = typeof target === "string" ? target.trim() : "";
  if (normalizedTarget.length === 0) return [];

  const matches: SimilarStaffMatch[] = [];
  for (const candidate of existing) {
    const name =
      typeof candidate.staffName === "string" ? candidate.staffName.trim() : "";
    if (name.length === 0) continue;
    const matchType = classify(normalizedTarget, name);
    if (matchType !== null) {
      matches.push({ staffCode: candidate.staffCode, staffName: name, matchType });
    }
  }
  return matches;
}
