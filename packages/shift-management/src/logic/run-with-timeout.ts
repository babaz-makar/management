/**
 * best-effort な副作用(監査ログ書込等)に短い timeout を付ける汎用ユーティリティ(M-2)。
 *
 * 目的: DB ハング時に本処理(取込レスポンス)を無制限に待たせないため、task に上限時間を設ける。
 * 挙動: 決して throw せず、必ず以下のいずれかに解決する。
 *   - "completed": task が期限内に解決した。
 *   - "failed"   : task が reject した / 生成が同期 throw した(エラーは握る)。
 *   - "timeout"  : task が期限内に解決しなかった(task はバックグラウンドで継続しうる)。
 *
 * ★fire-and-forget にはしない: 呼び出し側は本レスポンスを返す前にこれを await すること。
 *   サーバレス(Vercel)ではレスポンス後に実行が凍結され、await しないと書込が失われうるため、
 *   「上限付きで待つ(timeout なら諦める)」という形にする。
 */
export type TimeoutOutcome = "completed" | "failed" | "timeout";

export async function runWithTimeout(
  task: () => Promise<unknown>,
  timeoutMs: number,
): Promise<TimeoutOutcome> {
  // task 生成(同期例外)も含めて Promise 化し、reject を握って "failed" に落とす。
  const taskPromise: Promise<TimeoutOutcome> = (async () => {
    try {
      await task();
      return "completed";
    } catch {
      return "failed";
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<TimeoutOutcome>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    // 成功時にタイマーを解放してリークを防ぐ(timeout 発火後の解放は no-op)。
    if (timer !== undefined) clearTimeout(timer);
  }
}
