/**
 * モーダルダイアログのフォーカス管理フック(破壊操作の最終ゲート向け)。
 *
 * aria-modal="true" を名乗るダイアログの最低限を満たす:
 *   1. 開いた時にダイアログ本体へフォーカスを移す(スクリーンリーダーが見出しを読む)。
 *   2. Escape で閉じる。
 *   3. Tab / Shift+Tab が背後の要素へ抜けない(最小フォーカストラップ)。
 *   4. 閉じた後に呼び出し元(直前のフォーカス要素)へフォーカスを復帰する。
 *
 * 追加依存なし。ref を dialog 本体(role="dialog" のコンテナ)へ付与して使う。
 */
import { useEffect, useRef } from "react";

/** ダイアログ内でフォーカス可能な要素を取得するセレクタ。 */
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * dialog 本体へ付ける ref を返す。onClose は Escape 押下時に呼ばれる。
 * @param onClose Escape で閉じる時のハンドラ(通常はキャンセル)。
 */
export function useDialogFocus<T extends HTMLElement>(
  onClose: () => void,
): React.RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  // 最新の onClose を参照し、依存配列にコールバックを入れずに済ませる(再登録を避ける)。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // 呼び出し元(開く直前にフォーカスされていた要素)を控える。
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // 開いた時にダイアログ本体へフォーカスを移す。
    dialog.focus();

    function focusables(): HTMLElement[] {
      if (!dialog) return [];
      return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        // フォーカス可能要素が無ければダイアログ本体に留める。
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === dialog) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // 閉じた後に呼び出し元へフォーカスを復帰する。
      previouslyFocused?.focus();
    };
  }, []);

  return dialogRef;
}
