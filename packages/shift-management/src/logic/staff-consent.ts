/**
 * スタッフ名簿(staffCode ⇄ email)登録フォームの同意ゲート判定(純関数)。
 *
 * 取り違え登録は致命的なので、「この対応で間違いない」の同意は
 * 対応入力(staffCode / email)のいずれかが変わったら必ず無効化する。
 * この規則を単一の真実として関数化し、component 側は staffCode/email 双方の
 * onChange で同じ関数を呼ぶことで対称性(O-1 の穴埋め)をコードで担保する。
 *
 * 依存ゼロ。client 安全バレル(../ui)経由で公開する。
 */

/**
 * 対応入力(staffCode / email)が変化した後の同意状態。
 * どちらの入力でも同意は無効化する(常に未同意へ戻す)。
 */
export function consentAfterInputChange(): boolean {
  return false;
}

/** 登録可否ゲートの入力。 */
export interface StaffEntryGate {
  /** staffCode の形式が妥当か。 */
  codeValid: boolean;
  /** email が最低限の体裁を満たすか。 */
  emailLooksValid: boolean;
  /** 「この対応で間違いない」に同意済みか。 */
  agreed: boolean;
  /** 送信処理中か。 */
  busy: boolean;
}

/**
 * 登録ボタンを押せるか。形式妥当・同意済み・非 busy が全て揃うときのみ true。
 * 入力変更で agreed が false に戻れば(consentAfterInputChange)ここで false になる。
 */
export function canSubmitStaffEntry(gate: StaffEntryGate): boolean {
  return gate.codeValid && gate.emailLooksValid && gate.agreed && !gate.busy;
}
