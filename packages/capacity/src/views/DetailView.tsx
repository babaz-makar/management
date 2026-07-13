// メンバー詳細ビュー（ステップ2で実装）。
import { useCapacity } from "../store";

export function DetailView() {
  const { currentMember } = useCapacity();
  return (
    <div className="main">
      <div className="card">
        <div className="empty-msg">
          {currentMember ? `${currentMember} の詳細は準備中です（次のステップで移植）。` : "メンバーを選択してください。"}
        </div>
      </div>
    </div>
  );
}
