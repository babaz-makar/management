/**
 * /shift-remind の Modal（Block Kit）定義と、view_submission のパース。
 *
 * Block Kit のJSONは型を厳密に書いても得が少ないので unknown 寄りで扱い、
 * 「送信された値を取り出す」側だけを型付きの関数に閉じ込める。
 */

export const SETUP_CALLBACK_ID = "shift_remind_setup";
export const CHANNELS_CALLBACK_ID = "shift_remind_channels";

const ENABLED_OPTION_VALUE = "enabled";

/** メンバー設定 Modal */
export function buildSetupView(): Record<string, unknown> {
  return {
    type: "modal",
    callback_id: SETUP_CALLBACK_ID,
    title: { type: "plain_text", text: "シフトリマインド設定" },
    submit: { type: "plain_text", text: "保存" },
    close: { type: "plain_text", text: "閉じる" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Google Calendar 連携済みのメンバーは、既定で全員リマインド対象です。個別に止めたい人・別カレンダーを見る人だけここで設定してください。",
        },
      },
      {
        type: "input",
        block_id: "member",
        label: { type: "plain_text", text: "対象メンバー" },
        element: { type: "users_select", action_id: "value", placeholder: { type: "plain_text", text: "Slackユーザーを選択" } },
      },
      {
        type: "input",
        block_id: "enabled",
        optional: true,
        label: { type: "plain_text", text: "リマインド" },
        element: {
          type: "checkboxes",
          action_id: "value",
          initial_options: [enabledOption()],
          options: [enabledOption()],
        },
        hint: { type: "plain_text", text: "チェックを外すとこの人へのリマインドを止めます" },
      },
      {
        type: "input",
        block_id: "calendar_id",
        optional: true,
        label: { type: "plain_text", text: "対象カレンダーID" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          initial_value: "primary",
          placeholder: { type: "plain_text", text: "primary" },
        },
        hint: { type: "plain_text", text: "通常は primary のままでOK。別カレンダーにシフトを入れている場合だけ変更してください" },
      },
      {
        type: "input",
        block_id: "display_name",
        optional: true,
        label: { type: "plain_text", text: "表示名（任意）" },
        element: { type: "plain_text_input", action_id: "value" },
        hint: { type: "plain_text", text: "設定一覧で見分けるためのメモ。通知文はメンションを使います" },
      },
    ],
  };
}

/** 通知先チャンネル設定 Modal */
export function buildChannelsView(currentTargets: string[]): Record<string, unknown> {
  const element: Record<string, unknown> = {
    type: "multi_conversations_select",
    action_id: "value",
    placeholder: { type: "plain_text", text: "チャンネルを選択" },
  };
  // 空配列を渡すと Slack がエラーを返すため、既存設定があるときだけ初期値を入れる
  if (currentTargets.length > 0) element.initial_conversations = currentTargets;

  return {
    type: "modal",
    callback_id: CHANNELS_CALLBACK_ID,
    title: { type: "plain_text", text: "通知先チャンネル" },
    submit: { type: "plain_text", text: "保存" },
    close: { type: "plain_text", text: "閉じる" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "リマインドを投稿するチャンネルです。*Botを事前に招待しておいてください。*",
        },
      },
      {
        type: "input",
        block_id: "channels",
        label: { type: "plain_text", text: "通知先" },
        element,
      },
    ],
  };
}

function enabledOption() {
  return {
    value: ENABLED_OPTION_VALUE,
    text: { type: "plain_text", text: "リマインドを有効にする" },
  };
}

// ---------------------------------------------------------------------------
// view_submission のパース
// ---------------------------------------------------------------------------

type ViewState = {
  values?: Record<string, Record<string, {
    value?: string | null;
    selected_user?: string | null;
    selected_options?: { value: string }[] | null;
    selected_conversations?: string[] | null;
  }>>;
};

export interface SetupSubmission {
  slackUserId: string;
  remindEnabled: boolean;
  calendarId: string;
  displayName?: string;
}

/** メンバー設定 Modal の送信値。必須項目が取れなければ null */
export function parseSetupSubmission(state: ViewState): SetupSubmission | null {
  const slackUserId = field(state, "member")?.selected_user;
  if (!slackUserId) return null;

  const selected = field(state, "enabled")?.selected_options ?? [];
  const calendarId = field(state, "calendar_id")?.value?.trim();
  const displayName = field(state, "display_name")?.value?.trim();

  return {
    slackUserId,
    remindEnabled: selected.some((o) => o.value === ENABLED_OPTION_VALUE),
    calendarId: calendarId && calendarId.length > 0 ? calendarId : "primary",
    displayName: displayName && displayName.length > 0 ? displayName : undefined,
  };
}

/** 通知先チャンネル Modal の送信値 */
export function parseChannelsSubmission(state: ViewState): string[] {
  return field(state, "channels")?.selected_conversations ?? [];
}

function field(state: ViewState, blockId: string) {
  return state.values?.[blockId]?.value;
}
