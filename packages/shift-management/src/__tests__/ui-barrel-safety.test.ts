import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * client 安全バレル(src/ui.ts)の再汚染ガード(退行検知)。
 *
 * ui.ts は管理画面(Client Component)が使う純粋な表示ヘルパだけを公開する。
 * その依存グラフに Node 専用/重量級モジュール(crypto・googleapis・neon 等)が
 * 混入すると、webpack がそれらを client バンドルへ引き込みビルドが落ちる。
 *
 * このテストは ui.ts を起点に **相対 import を静的に辿り**、到達する全ファイルが
 * 参照する外部(bare)モジュールに禁止依存が現れないことを固定する。将来 crypto/
 * googleapis が葉ファイルへ混入したら、ビルドを待たずにここで赤くなる。
 */

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const UI_BARREL = resolve(CURRENT_DIR, "../ui.ts");

/** client バンドルへ混入してはならない外部モジュール(前方一致で判定)。 */
const FORBIDDEN_MODULES = [
  "crypto",
  "node:crypto",
  "googleapis",
  "google-auth-library",
  "@neondatabase/serverless",
  "@neondatabase",
];

/** import / export ... from "X" と 動的 import("X") から specifier を抽出する。 */
function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const fromPattern = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  const dynamicPattern = /import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(fromPattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(dynamicPattern)) specifiers.push(match[1]);
  return specifiers;
}

/** 相対 specifier を .ts / index.ts 込みで実ファイルへ解決する。無ければ null。 */
function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * 起点ファイルから相対 import を辿り、到達ファイル集合と外部モジュール集合を返す。
 */
function collectGraph(entry: string): { files: string[]; externals: string[] } {
  const visited = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    for (const specifier of extractSpecifiers(source)) {
      const isRelative = specifier.startsWith(".");
      if (!isRelative) {
        externals.add(specifier);
        continue;
      }
      const resolved = resolveRelative(file, specifier);
      // type-only の相対 import 等で解決できなくても、外部依存の検知には影響しない。
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return { files: [...visited], externals: [...externals] };
}

describe("ui.ts バレル: client 安全性(再汚染ガード)", () => {
  it("依存グラフに禁止外部モジュール(crypto/googleapis/neon 等)が現れない", () => {
    const { externals } = collectGraph(UI_BARREL);
    const offending = externals.filter((specifier) =>
      FORBIDDEN_MODULES.some(
        (forbidden) =>
          specifier === forbidden || specifier.startsWith(`${forbidden}/`),
      ),
    );
    expect(offending).toEqual([]);
  });

  it("起点(ui.ts)から純ヘルパ葉ファイルへ到達している(グラフを実際に辿れている)", () => {
    const { files } = collectGraph(UI_BARREL);
    const reachedLeaves = files.some(
      (file) =>
        file.endsWith("import-reason-describe.ts") ||
        file.endsWith("staff-name-similarity.ts"),
    );
    expect(reachedLeaves).toBe(true);
  });

  it("後から追加した純ヘルパ葉(http-error-describe / staff-code)も汚染検知の到達対象に含む", () => {
    const { files } = collectGraph(UI_BARREL);
    expect(files.some((file) => file.endsWith("http-error-describe.ts"))).toBe(
      true,
    );
    expect(files.some((file) => file.endsWith("staff-code.ts"))).toBe(true);
  });
});
