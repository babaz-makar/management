/**
 * Slack UI（Modal / ボタン付きメッセージ）の定義と、送信された値のパース。
 *
 * 対象メンバーは**チャンネル単位**。Botを招待したチャンネルで参加者から選び、
 * あとから参加した人はボタン1つで追加できるようにしている。
 *
 * Block Kit のJSONは型を厳密に書いても得が少ないので unknown 寄りで扱い、
 * 「送信された値を取り出す」側だけを型付きの関数に閉じ込める。
 */

/** Modal の callback_id */
export const MEMBERS_CALLBACK_ID = "shift_remind_members";

/** ボタンの action_id */
export const ACTION_OPEN_MEMBERS = "shift_remind_open_members";
export const ACTION_ADD_MEMBER = "shift_remind_add_member";
export const ACTION_DISMISS = "shift_remind_dismiss";

// ---------------------------------------------------------------------------
// 対象メンバー選択 Modal
// ---------------------------------------------------------------------------

/**
 * チャンネルの対象メンバーを選ぶ Modal。
 *
 * @param channelId  対象チャンネル。private_metadata に載せて送信時に取り戻す
 * @param initialUsers 初期選択。Bot招待直後は「チャンネルの参加者（Bot除く）」を、
 *                     再編集時は「すでに登録済みのメンバー」を渡す
 * @param channelLabel 見出しに出すチャンネル名（`<#C0123>` 形式でよい）
 */
export function buildMembersView(
  channelId: string,
  initialUsers: string[],
  channelLabel?: string,
): Record<string, unknown> {
  const element: Record<string, unknown> = {
    type: "multi_users_select",
    action_id: "value",
    placeholder: { type: "plain_text", text: "メンバーを選択" },
  };
  // 空配列を渡すと Slack がエラーを返すため、1人以上いるときだけ初期値を入れる
  if (initialUsers.length > 0) element.initial_users = initialUsers;

  return {
    type: "modal",
    callback_id: MEMBERS_CALLBACK_ID,
    private_metadata: channelId,
    title: { type: "plain_text", text: "リマインド対象メンバー" },
    submit: { type: "plain_text", text: "保存" },
    close: { type: "plain_text", text: "閉じる" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${channelLabel ? `${channelLabel} の` : "このチャンネルの"}シフトリマインド対象メンバーを選んでください。\n選んだ人のGoogleカレンダーを読み、シフトがある日だけこのチャンネルに通知します。`,
        },
      },
      {
        type: "input",
        block_id: "members",
        optional: true,
        label: { type: "plain_text", text: "対象メンバー" },
        element,
        hint: {
          type: "plain_text",
          text: "外した人には通知しません。全員外すとこのチャンネルへの通知は止まります",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// チャンネルに投稿するボタン付きメッセージ
// ---------------------------------------------------------------------------

/** Bot が招待されたときの案内（「対象メンバーを選ぶ」ボタン付き） */
export function buildBotJoinedBlocks(
  channelId: string,
  suggestedUsers: string[],
): unknown[] {
  const suggestion =
    suggestedUsers.length > 0
      ? `このチャンネルの参加者 ${suggestedUsers.length}人 を初期値として選んであります。不要な人を外して保存してください。`
      : "このチャンネルにはまだ参加者がいないようです。あとから `/shift-remind setup` で設定できます。";

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:wave: シフトリマインドを有効にしました。\nまず *このチャンネルで通知する対象メンバー* を決めてください。\n\n${suggestion}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: ACTION_OPEN_MEMBERS,
          style: "primary",
          text: { type: "plain_text", text: "対象メンバーを選ぶ" },
          value: channelId,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "あとから変更するときは `/shift-remind setup`（一覧は `/shift-remind list`）",
        },
      ],
    },
  ];
}

/** あとから人が参加したときの「対象に追加しますか？」（ワンクリック追加） */
export function buildUserJoinedBlocks(
  channelId: string,
  slackUserId: string,
): unknown[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<@${slackUserId}> さんが参加しました。シフトリマインドの対象に追加しますか？`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: ACTION_ADD_MEMBER,
          style: "primary",
          text: { type: "plain_text", text: "対象に追加" },
          value: `${channelId}:${slackUserId}`,
        },
        {
          type: "button",
          action_id: ACTION_DISMISS,
          text: { type: "plain_text", text: "追加しない" },
          value: `${channelId}:${slackUserId}`,
        },
      ],
    },
  ];
}

/** ボタンの value（`channelId:slackUserId`）を分解する */
export function parseActionValue(
  value: string | undefined,
): { channelId: string; slackUserId: string } | null {
  if (!value) return null;
  const [channelId, slackUserId] = value.split(":");
  if (!channelId || !slackUserId) return null;
  return { channelId, slackUserId };
}

// ---------------------------------------------------------------------------
// view_submission のパース
// ---------------------------------------------------------------------------

type ViewState = {
  values?: Record<string, Record<string, {
    value?: string | null;
    selected_users?: string[] | null;
  }>>;
};

export interface MembersSubmission {
  channelId: string;
  slackUserIds: string[];
}

/** 対象メンバー Modal の送信値。channel_id は private_metadata から取る */
export function parseMembersSubmission(view: {
  private_metadata?: string;
  state?: ViewState;
}): MembersSubmission | null {
  const channelId = view.private_metadata;
  if (!channelId) return null;
  return {
    channelId,
    slackUserIds: view.state?.values?.members?.value?.selected_users ?? [],
  };
}
