import { formatConnectDm } from "../remind/format-message";
import { openDirectMessage, postMessage } from "./slack-remind";

export interface ConnectRequestResult {
  /** DMを送れた相手 */
  dmSent: string[];
  /** DMを送れなかった相手（スコープ不足・DM拒否設定など） */
  dmFailed: string[];
}

/**
 * Googleカレンダー未連携のメンバーに、連携リンクを**本人へのDM**で送る。
 *
 * チャンネルに公開投稿しないのは、連携URLの末尾 `slack_user_id` が
 * 「誰のカレンダーとして保存するか」を決めているため。公開すると他人のリンクを
 * 開いてしまい、Googleアカウントが別人のSlack IDに紐づく。しかもエラーにならず、
 * シフトがずれて通知されるまで気づけない。
 *
 * 1人のDM失敗で他の人の送信は止めない（結果を返して呼び出し側に判断させる）。
 */
export async function requestCalendarConnect(
  botToken: string,
  slackUserIds: string[],
  appUrl: string,
): Promise<ConnectRequestResult> {
  const dmSent: string[] = [];
  const dmFailed: string[] = [];

  if (slackUserIds.length === 0 || !appUrl) return { dmSent, dmFailed };

  const results = await Promise.allSettled(
    slackUserIds.map(async (slackUserId) => {
      const channel = await openDirectMessage(botToken, slackUserId);
      const sent = await postMessage(
        botToken,
        channel,
        formatConnectDm(slackUserId, appUrl),
      );
      return { slackUserId, ok: sent.ok };
    }),
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.ok) dmSent.push(r.value.slackUserId);
    else dmFailed.push(slackUserIds[i]);
  });

  return { dmSent, dmFailed };
}
