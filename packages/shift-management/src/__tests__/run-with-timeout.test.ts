import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithTimeout } from "../logic/run-with-timeout";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runWithTimeout: best-effort な副作用に短いtimeoutを付ける(M-2)", () => {
  it("task が期限内に解決すれば 'completed'(throwしない)", async () => {
    const result = await runWithTimeout(() => Promise.resolve(), 3000);
    expect(result).toBe("completed");
  });

  it("task が reject しても throw せず 'failed' を返す(呼び出し側の本処理を巻き込まない)", async () => {
    const result = await runWithTimeout(
      () => Promise.reject(new Error("db down")),
      3000,
    );
    expect(result).toBe("failed");
  });

  it("task が期限内に解決しなければ throw せず 'timeout' を返す(ハング時に先へ進める)", async () => {
    vi.useFakeTimers();
    // 永遠に解決しない task。timeout 側が先に発火することを固定する。
    const promise = runWithTimeout(() => new Promise<void>(() => {}), 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toBe("timeout");
  });

  it("task 生成自体が同期 throw しても握って 'failed'", async () => {
    const result = await runWithTimeout(() => {
      throw new Error("sync boom");
    }, 3000);
    expect(result).toBe("failed");
  });
});
