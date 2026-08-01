import { describe, expect, it } from "vitest";
import {
  ACTION_ADD_MEMBER,
  ACTION_OPEN_MEMBERS,
  MEMBERS_CALLBACK_ID,
  buildBotJoinedBlocks,
  buildMembersView,
  buildUserJoinedBlocks,
  parseActionValue,
  parseMembersSubmission,
} from "../remind/views";
import { connectUrl, formatConnectRequest, formatMemberAdded } from "../remind/format-message";

describe("対象メンバー選択 Modal", () => {
  it("channel_id を private_metadata で持ち回る", () => {
    const view = buildMembersView("C123", ["U1", "U2"], "<#C123>");
    expect(view.callback_id).toBe(MEMBERS_CALLBACK_ID);
    expect(view.private_metadata).toBe("C123");
  });

  it("初期選択があれば initial_users に入れる", () => {
    const view = buildMembersView("C123", ["U1", "U2"]);
    const block = (view.blocks as Record<string, unknown>[])[1];
    const element = block.element as Record<string, unknown>;
    expect(element.initial_users).toEqual(["U1", "U2"]);
  });

  it("初期選択が空なら initial_users を付けない（Slackがエラーを返すため）", () => {
    const view = buildMembersView("C123", []);
    const block = (view.blocks as Record<string, unknown>[])[1];
    const element = block.element as Record<string, unknown>;
    expect(element.initial_users).toBeUndefined();
  });

  it("送信値から channel_id と選択メンバーを取り出す", () => {
    expect(
      parseMembersSubmission({
        private_metadata: "C123",
        state: { values: { members: { value: { selected_users: ["U1", "U3"] } } } },
      }),
    ).toEqual({ channelId: "C123", slackUserIds: ["U1", "U3"] });
  });

  it("全員外した送信は空配列として扱う（通知停止の意思表示）", () => {
    expect(
      parseMembersSubmission({ private_metadata: "C123", state: { values: {} } }),
    ).toEqual({ channelId: "C123", slackUserIds: [] });
  });

  it("channel_id が無ければ null", () => {
    expect(parseMembersSubmission({ state: { values: {} } })).toBeNull();
  });
});

describe("ボタン付きメッセージ", () => {
  it("Bot招待時のボタンは channel_id を value に持つ", () => {
    const blocks = buildBotJoinedBlocks("C123", ["U1", "U2"]) as Record<string, unknown>[];
    const actions = blocks[1] as { elements: Record<string, unknown>[] };
    expect(actions.elements[0].action_id).toBe(ACTION_OPEN_MEMBERS);
    expect(actions.elements[0].value).toBe("C123");
    // 参加者数を案内文に出す
    expect(JSON.stringify(blocks)).toContain("2人");
  });

  it("参加者0人でも案内は出す", () => {
    const blocks = buildBotJoinedBlocks("C123", []);
    expect(JSON.stringify(blocks)).toContain("/shift-remind setup");
  });

  it("メンバー参加時のボタンは channelId:userId を value に持つ", () => {
    const blocks = buildUserJoinedBlocks("C123", "U9") as Record<string, unknown>[];
    const actions = blocks[1] as { elements: Record<string, unknown>[] };
    expect(actions.elements[0].action_id).toBe(ACTION_ADD_MEMBER);
    expect(actions.elements[0].value).toBe("C123:U9");
  });

  it("value を channelId と userId に分解する", () => {
    expect(parseActionValue("C123:U9")).toEqual({
      channelId: "C123",
      slackUserId: "U9",
    });
    expect(parseActionValue("C123")).toBeNull();
    expect(parseActionValue(undefined)).toBeNull();
  });
});

describe("カレンダー連携のお願い", () => {
  it("連携リンクは既存ツールのOAuth開始URLを使う", () => {
    expect(connectUrl("https://example.com", "U1")).toBe(
      "https://example.com/api/auth/google?slack_user_id=U1",
    );
    // 末尾スラッシュがあっても二重にならない
    expect(connectUrl("https://example.com/", "U1")).toBe(
      "https://example.com/api/auth/google?slack_user_id=U1",
    );
  });

  it("未連携メンバーごとにリンクを並べる", () => {
    const text = formatConnectRequest(["U1", "U2"], "https://example.com")!;
    expect(text).toContain("<@U1> → https://example.com/api/auth/google?slack_user_id=U1");
    expect(text).toContain("<@U2> → https://example.com/api/auth/google?slack_user_id=U2");
  });

  it("未連携が0人なら何も出さない", () => {
    expect(formatConnectRequest([], "https://example.com")).toBeNull();
  });

  it("追加時のメッセージに未連携なら連携リンクを添える", () => {
    const withLink = formatMemberAdded(["U1"], ["U1"], "https://example.com");
    expect(withLink).toContain("対象に追加しました");
    expect(withLink).toContain("slack_user_id=U1");

    const withoutLink = formatMemberAdded(["U1"], [], "https://example.com");
    expect(withoutLink).not.toContain("slack_user_id");
  });
});
