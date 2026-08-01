import {
  buildMembersView,
  filterHumanUsers,
  listConversationMembers,
  openView,
} from "@management/shift-management";
import { getRemindStore, remindEnv } from "./remind-config";

/**
 * 対象メンバー選択 Modal を開く。
 *
 * 初期値は「登録済みメンバー」→ 無ければ「チャンネルの参加者（Bot・削除済みを除く）」。
 * Bot招待直後は後者になるので、不要な人を外して保存するだけで設定が終わる。
 *
 * スラッシュコマンドとボタンの両方から呼ぶため、ルートではなくここに置く
 * （Next.js の route.ts は HTTP ハンドラ以外を export できない）。
 */
export async function openMembersModal(
  channelId: string,
  triggerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const store = getRemindStore();
  const existing = await store.listChannelMembers(channelId);

  const initial =
    existing.length > 0
      ? existing.map((m) => m.slackUserId)
      : await filterHumanUsers(
          remindEnv.botToken,
          await listConversationMembers(remindEnv.botToken, channelId),
        );

  const result = await openView(
    remindEnv.botToken,
    triggerId,
    buildMembersView(channelId, initial, `<#${channelId}>`),
  );
  return { ok: result.ok, error: result.error };
}
