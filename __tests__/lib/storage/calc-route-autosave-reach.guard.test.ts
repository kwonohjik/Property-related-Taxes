/**
 * 가드 #103 — 계산 라우트는 **이력 자동저장에 도달하거나, 사유가 적힌 예외**여야 한다.
 *
 * 설계: docs/00-pm/gift39-72-100-103-deemed-history.plan.md (PR ①)
 *
 * `local-tax-type-registration.guard.test.ts`는 `LOCAL_TAX_TYPES`를 **순회**한다. 그래서
 * 「목록에 있는 세목이 전부 배선됐는가」는 재지만 「애초에 등록되지 않은 계산기」는 구조적으로
 * 보지 못한다 — §39 증여이익 계산기가 이력에 전혀 남지 않는데도 가드는 전건 초록이었다
 * (리뷰 J-safety-net.md:309 · 대리 지표 문제).
 *
 * 여기서는 **주장 자체**를 관측한다: `app/calc/**\/page.tsx`에서 출발해 import를 끝까지 따라가
 * `useAutoSaveCalculation(` 호출에 닿는지 본다. 1단계 import만 보면 취득·증여·상속·재산세처럼
 * 폼 컴포넌트 깊은 곳에서 부르는 라우트를 놓친다(실측).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/**
 * 이력 자동저장이 **없는** 계산 라우트. 사유를 반드시 적는다 — 이 목록의 길이가
 * 곧 영속 공백의 실제 크기다(2026-09-28 실측 5건). 이 라우트에 이력을 붙이면 목록에서 빼야 한다(아래 [AR-2]가 강제).
 */
const NO_HISTORY_ROUTES: Record<string, string> = {
  "app/calc/cross-104-5/page.tsx":
    "소득세법 §104⑤ 합산 비교 — 저장된 양도세 이력(`calculationRepository`)을 읽어 재계산하는 화면이라 새 record를 만들지 않는다",
  "app/calc/family-business-postmgmt/page.tsx":
    "상증법 §18의2⑤ 가업상속공제 사후관리 추징 시뮬레이터 — 이력 세목 미등록(별건)",
  "app/calc/inheritance-postmgmt/page.tsx":
    "상증법 §18의3④ 영농상속공제 사후관리 추징 시뮬레이터 — 이력 세목 미등록(별건)",
  "app/calc/public-interest-penalty/page.tsx":
    "상증법 §78⑨ 공익법인등 사후관리 가산세 계산기 — 이력 세목 미등록(별건)",
  "app/calc/public-interest-postmgmt/page.tsx":
    "상증법 §48② 공익법인등 출연재산 사후관리 추징 시뮬레이터 — 이력 세목 미등록(별건)",
};

const IMPORT_RE = /(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const HOOK_CALL = /\buseAutoSaveCalculation\s*\(/;
const HOOK_FILE = "lib/storage/use-auto-save-calculation.ts";

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** page에서 import 그래프를 따라가 훅 **호출**을 만나면 그 파일을 돌려준다 */
function reachesAutoSave(page: string): string | null {
  const seen = new Set<string>();
  const stack = [join(ROOT, page)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    if (!f.endsWith(HOOK_FILE) && HOOK_CALL.test(src)) return relative(ROOT, f);
    for (const m of src.matchAll(IMPORT_RE)) {
      const r = resolveSpec(m[1] ?? m[2], f);
      if (r && !r.endsWith(HOOK_FILE)) stack.push(r);
    }
  }
  return null;
}

function calcPages(dir = "app/calc"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...calcPages(rel));
    else if (name === "page.tsx") out.push(rel);
  }
  return out.sort();
}

describe("계산 라우트 ↔ 이력 자동저장 도달 가드", () => {
  const pages = calcPages();

  it("[AR-0] 모집단이 비어 있지 않다(스캔 자체가 도는지)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
    expect(pages).toContain("app/calc/gift-deemed/page.tsx");
  });

  it("[AR-1] 모든 계산 라우트가 자동저장에 닿거나 사유가 적힌 예외다", () => {
    const orphans = pages.filter((p) => !(p in NO_HISTORY_ROUTES) && reachesAutoSave(p) === null);
    expect(orphans, "새 계산 라우트는 useAutoSaveCalculation을 부르거나 NO_HISTORY_ROUTES에 사유와 함께 등재한다").toEqual([]);
  });

  it("[AR-2] 예외 목록이 부패하지 않았다 — 자동저장에 닿는 라우트가 예외로 남아 있으면 실패", () => {
    const stale = Object.keys(NO_HISTORY_ROUTES).filter((p) => reachesAutoSave(p) !== null);
    expect(stale, "이력이 붙었으면 예외 목록에서 뺀다").toEqual([]);
    const missing = Object.keys(NO_HISTORY_ROUTES).filter((p) => !pages.includes(p));
    expect(missing, "없어진 라우트가 예외로 남아 있다").toEqual([]);
  });

  it("[AR-3] 탐지기 자가 점검 — 깊은 곳에서 부르는 라우트도 잡는다(1단계 스캔이면 놓침)", () => {
    expect(reachesAutoSave("app/calc/gift-tax/page.tsx")).toBe("components/calc/GiftTaxForm.tsx");
    expect(reachesAutoSave("app/calc/acquisition-tax/page.tsx")).toBe("components/calc/AcquisitionTaxForm.tsx");
    expect(reachesAutoSave("app/calc/cross-104-5/page.tsx")).toBeNull(); // 부정 짝
  });
});
