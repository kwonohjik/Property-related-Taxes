/**
 * 게이트 — 기타토지 «상태 이력» leaf의 **배선 확인**(허용 목록). NBL-STATE-HISTORY-E1 도달 불가 가드 → **E2에서 배선 확인으로 갱신**(삭제 아님).
 *
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §7.4 (E2 = «E1 도달 불가 가드 갱신(배선 확인으로)» · building-site 선례의 가드)
 * 선례: `building-site-land.ts` 머리주석 · `__tests__/lib/property-dead-classifier-reachability.test.ts` (소스 트리를 읽는 정적 분석).
 *
 * 왜 필요한가: ⑫ Zod·⑭ 매퍼는 TypeScript가 못 잡는 경계다(14지점 ⑫⑬⑭). 누군가 한 군데만 배선하거나 한 곳을 빼면 «이력 칸이 침묵 strip»되거나
 * «화면에 있는데 판정에 안 쓰이는 칸»(B1 교훈)이 생긴다. 이 테스트는 E2가 배선한 파일을 **정확히** 고정한다 — U1(④⑤⑧)·U2가 새 사용처를 만들면
 * 그 PR이 이 허용 목록을 갱신한다(UI 쪽 «아직 배선 안 됨» 단언이 빨개지는 것이 정상).
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { statSync } from "node:fs";
import { join } from "node:path";
import { relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const PRODUCTION_ROOTS = ["lib", "app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** 주석 제거 — 머리주석의 심볼 언급이 호출로 잡히지 않게 한다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = PRODUCTION_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => ({
  path: relative(REPO_ROOT, f),
  src: stripComments(readFileSync(f, "utf-8")),
}));

const LEAF = "lib/tax-engine/non-business-land/other-land-state-history.ts";
const MESSAGES = "lib/tax-engine/non-business-land/nbl-validation-messages.ts";
const NOTICES = "lib/tax-engine/nbl-confirm-notices.ts";
const CATEGORY = "lib/tax-engine/non-business-land/land-category.ts";

/** 심볼(단어 경계)을 소스에 쓰는 프로덕션 파일 — 정의 파일은 제외한다. */
function usersOf(symbolPattern: string, definedIn: string[]): string[] {
  const re = new RegExp(`\\b(?:${symbolPattern})\\b`);
  return FILES.filter((f) => !definedIn.includes(f.path) && re.test(f.src)).map((f) => f.path);
}

const APPLY = "lib/tax-engine/non-business-land/other-land-state-history-apply.ts";
const MAPPER = "lib/tax-engine/non-business-land/form-mapper-helpers.ts";
const REFINES = "lib/api/transfer-tax-schema-nbl-refines.ts";
const SCHEMA = "lib/api/transfer-tax-schema-nbl.ts";

const NEXT_PR_HINT = "새 사용처가 생겼다면 UI 배선(U1·U2)일 것이다 — 이 허용 목록을 그 파일로 갱신한다(삭제 금지). 계획서 plan.md §4 U1·U2.";

describe("배선 확인 — 상태 이력 leaf는 E2에서 판정(apply)·⑫ refine·⑭ 매퍼에만 연결됐다", () => {
  it("WIRE-0 (공허 방지): leaf가 실제로 존재하고 핵심 함수를 export한다", () => {
    const leaf = FILES.find((f) => f.path === LEAF);
    expect(leaf, "leaf 파일이 없다").toBeDefined();
    for (const name of ["deriveOtherLandStateIntervals", "stateEventRowIssue", "stateEventSequenceIssue", "isStateIntervalBusiness", "stateHistoryBusinessIntervals", "effectiveOtherHasBuilding"]) {
      expect(leaf!.src).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it("WIRE-1: `other-land-state-history`를 import하는 프로덕션 파일 = 판정(apply) · ⑭ 매퍼 · ⑫ refine 정확히 셋", () => {
    const re = /^\s*import[\s\S]*?from\s+["'][^"']*other-land-state-history["']/m;
    const importers = FILES.filter((f) => re.test(f.src)).map((f) => f.path).sort();
    expect(importers, NEXT_PR_HINT).toEqual([APPLY, REFINES, MAPPER].sort());
  });

  it("WIRE-2: 판정은 구간 변환(derive)과 구간 산식(stateHistoryBusinessIntervals)을 쓰고, ⑫ refine은 공용 issue leaf를, ⑭ 매퍼·⑫는 `effectiveOtherHasBuilding`을 쓴다 — 3중 패턴", () => {
    const src = (p: string) => FILES.find((f) => f.path === p)!.src;
    expect(src(APPLY)).toMatch(/\bderiveOtherLandStateIntervals\(/);
    expect(src(APPLY)).toMatch(/\bstateHistoryBusinessIntervals\(/);
    expect(src(REFINES)).toMatch(/\bstateEventSequenceIssue\(/);
    expect(src(REFINES)).toMatch(/\beffectiveOtherHasBuilding\(/);
    expect(src(MAPPER)).toMatch(/\beffectiveOtherHasBuilding\(/);
    expect(src(MAPPER)).toMatch(/\bisEventKind\(/);
  });

  it("WIRE-3: 소비표 술어 `consumesStateHistory`는 ⑭ 매퍼·⑫ refine이 쓴다 — ④⑤⑧(UI)은 아직 쓰지 않는다(U1)", () => {
    const users = usersOf("consumesStateHistory", [CATEGORY]).sort();
    expect(users, NEXT_PR_HINT).toEqual([REFINES, MAPPER].sort());
  });

  it("WIRE-4: 판정이 쓰는 고지 상수 = apply 한 곳 · UI 전용 상수(unchanged·유예 안내)는 아직 쓰는 곳이 없다", () => {
    const used = usersOf("NBL_STATE_HISTORY_(?:APPLIED|UNKNOWN|PARTIAL_AREA|DEEMED_TRANSFER|REMOVED_TAX_TYPE_UNKNOWN|REVENUE_START)_NOTICE", [NOTICES]);
    expect(used, NEXT_PR_HINT).toEqual([APPLY]);
    const uiOnly = usersOf("NBL_STATE_HISTORY_(?:UNCHANGED|GRACE_ROW)_NOTICE", [NOTICES]);
    expect(uiOnly, NEXT_PR_HINT).toEqual([]);
    const messages = usersOf("STATE_EVENTS_REQUIRED_MESSAGE|stateEvent[A-Za-z]+Message", [MESSAGES, LEAF]).sort();
    expect(messages, NEXT_PR_HINT).toEqual([APPLY]);
  });

  it("WIRE-5: ⑫ Zod가 두 칸(`nblOtherStateHistoryMode`·`nblOtherStateEvents`)을 가진다 — 빠지면 침묵 strip · ⑭ 매퍼·⑫ refine이 둘 다 읽는다", () => {
    const src = (p: string) => FILES.find((f) => f.path === p)!.src;
    for (const p of [SCHEMA, MAPPER, REFINES]) {
      expect(src(p), p).toContain("nblOtherStateHistoryMode");
      expect(src(p), p).toContain("nblOtherStateEvents");
    }
    expect(src(SCHEMA)).toMatch(/nblOtherStateEvents:\s*z\.array\(nblStateEventRawSchema\)/);
    expect(src(SCHEMA)).toMatch(/propertyTaxTypeBefore:\s*z\.enum\(NBL_PROPERTY_TAX_TYPE_VALUES\)\.or\(z\.literal\(""\)\)/);
  });

  it("WIRE-6: 이력 칸 이름은 UI(store·components·lib/calc)에 아직 없다 — U0·U1이 추가한다(⑫⑭만 열린 상태 = 직접 API 전용)", () => {
    const uiUsers = FILES.filter(
      (f) => /^(components|lib\/(stores|calc))\//.test(f.path) && /nblOtherStateEvents|nblOtherStateHistoryMode/.test(f.src),
    ).map((f) => f.path);
    expect(uiUsers, NEXT_PR_HINT).toEqual([]);
  });

  it("WIRE-7: 엔진 입력 `landStateHistory`는 types · 매퍼 · 판정(apply)만 읽는다", () => {
    const users = usersOf("landStateHistory", []).sort();
    expect(users).toEqual(["lib/tax-engine/non-business-land/form-mapper.ts", "lib/tax-engine/non-business-land/other-land-state-history-apply.ts", "lib/tax-engine/non-business-land/types.ts"].sort());
  });
});
