/**
 * 게이트 — E3-① 「재산세 구분 변경 사건」의 **배선 확인**(침묵 소실 grep 게이트 · 허용 목록). 선례: `nbl-state-history-leaf-unreachable.test.ts`.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §6(grep 게이트) · §3.3(단일 술어 `eventCarriesTaxTypeBefore`) · 결정 기록(2026-11-23)
 *
 * 왜 필요한가: 사건 종류가 2 → 3이 되면 «종류가 둘뿐이다»를 가정한 `kind === "building_removed"` 삼항은 **컴파일 오류 없이** 새 종류의 `propertyTaxTypeBefore`를 침묵으로 `""`(모름)로 지운다.
 * 별도합산이라고 입력했는데 모름 처리 → 비사업용이 되는 과대 과세다. 그래서 Before 운반 여부는 leaf 단일 술어 하나만 판정하고, 리터럴 분기는 허용 목록으로 묶는다.
 * 엔진 쪽(⑭)은 E3-1a가, UI 쪽 4곳(⑤ 미리보기 · ④ 와이어 · ③ 복원 · ⑤ 위젯 직전 구분 칸)은 U4가 술어로 교체했다 — `UI_PENDING_REMOVED_LITERAL`은 비웠고(삭제 금지) «0건» 단언이 영구 게이트다.
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

/** 주석 제거 — 머리주석의 심볼·리터럴 언급이 코드로 잡히지 않게 한다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = PRODUCTION_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => ({
  path: relative(REPO_ROOT, f),
  src: stripComments(readFileSync(f, "utf-8")),
}));
const src = (p: string) => FILES.find((f) => f.path === p)!.src;

const MAPPER = "lib/tax-engine/non-business-land/form-mapper-helpers.ts";
const APPLY = "lib/tax-engine/non-business-land/other-land-state-history-apply.ts";
const REFINES = "lib/api/transfer-tax-schema-nbl-refines.ts";
const VALIDATE = "lib/calc/transfer-tax-validate-nbl-state-history.ts";
const NOTICES = "lib/tax-engine/nbl-confirm-notices.ts";
const LEAF = "lib/tax-engine/non-business-land/other-land-state-history.ts"; // 종류 의미(건축물 사건 판별·replay)를 정의하는 파일 — 리터럴이 정의다
const SECTION = "components/calc/transfer/nbl/OtherLandStateHistorySection.tsx";
// U4가 술어로 교체한 «Before 운반» 4곳 — ⑤ 미리보기 · ④ 와이어 정규화 · ③ 복원 정규화 + ⑤ 위젯의 직전 구분 칸 노출 술어(`removed &&` — UI 계획서 S4)
const PREVIEW = "lib/calc/nbl-other-state-history-preview.ts";
const SCOPE = "lib/calc/nbl-other-state-history-scope.ts";
const MIGRATE = "lib/stores/calc-wizard-asset-migrate-nbl.ts";
/** 비어 있다 — 새 리터럴 분기가 생기면 이 목록이 아니라 술어를 쓴다. 삭제 금지(비운 상태의 «0건» 단언이 영구 게이트). */
const UI_PENDING_REMOVED_LITERAL: string[] = [];

describe("E3-① 침묵 소실 grep 게이트 — `kind === \"building_removed\"` 리터럴 분기", () => {
  const withLiteral = FILES.filter((f) => f.path !== LEAF && /\bkind\s*===\s*["']building_removed["']/.test(f.src)).map((f) => f.path).sort();

  it("엔진·API 쪽(⑭ 매퍼 포함)에는 없다 — Before 운반은 단일 술어 `eventCarriesTaxTypeBefore`", () => {
    const engineSide = withLiteral.filter((p) => !UI_PENDING_REMOVED_LITERAL.includes(p));
    expect(engineSide, "엔진·API 쪽 리터럴 분기는 술어로 교체해야 한다").toEqual([]);
    expect(src(MAPPER)).toMatch(/\beventCarriesTaxTypeBefore\(/);
  });

  it("UI 쪽에도 없다 — 영구 0건 게이트(`git grep 'kind === \"building_removed\"' lib components app` 0건, leaf 정의 파일 제외)", () => {
    expect(withLiteral, "리터럴 분기 금지 — 단일 술어 `eventCarriesTaxTypeBefore`(Before 운반) · `isBuildingEventKind`(건축물 사건)를 쓴다").toEqual(UI_PENDING_REMOVED_LITERAL);
    for (const p of [PREVIEW, SCOPE, MIGRATE, SECTION]) {
      expect(src(p), `${p}는 Before 운반을 단일 술어로 판정한다`).toMatch(/\beventCarriesTaxTypeBefore\(/);
    }
  });
});

describe("E3-① 3중 패턴 배선 — ⑧·⑫가 같은 leaf에 같은 초기 건축물 상태(`tailHasBuilding`)를 넘긴다", () => {
  it("⑫ refine = `!!raw.nblOtherHasBuilding` · ⑧ = `asset.nblOtherHasBuilding` — 빠지면 «없음»(안전 쪽)으로 읽혀 정상 tax-only 이력이 영구 차단된다(막다른 길)", () => {
    expect(src(REFINES)).toMatch(/tailHasBuilding:\s*!!raw\.nblOtherHasBuilding/);
    expect(src(VALIDATE)).toMatch(/tailHasBuilding:\s*asset\.nblOtherHasBuilding/);
  });

  it("⑤ 미리보기도 같은 값(`tailHasBuilding: asset.nblOtherHasBuilding`)을 넘긴다 — 빠지면 «없음»으로 읽혀 tax-only 이력의 미리보기가 null이 된다", () => {
    expect(src(PREVIEW)).toMatch(/tailHasBuilding:\s*asset\.nblOtherHasBuilding/);
  });
});

describe("E3-① 고지 2종 배선 — APPLIED는 엔진 apply만 싣고, UNKNOWN(모름 안내)은 위젯이 행 아래에 읽는다", () => {
  it("결과 경고 `…TAX_CHANGE_APPLIED_NOTICE`는 `applyStateHistory`만 싣는다(UI가 다시 그리지 않는다 — 결과 카드는 엔진 warnings를 그린다)", () => {
    const users = FILES.filter((f) => f.path !== NOTICES && /\bNBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE\b/.test(f.src)).map((f) => f.path).sort();
    expect(users).toEqual([APPLY]);
  });
  it("행 아래 «모름» 안내 `…TAX_CHANGE_UNKNOWN_NOTICE`는 엔진 apply(결과 경고)와 위젯 두 곳이 읽는다 — 문구는 엔진 상수 단일 소스", () => {
    const users = FILES.filter((f) => f.path !== NOTICES && /\bNBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE\b/.test(f.src)).map((f) => f.path).sort();
    expect(users, "새 사용처가 생겼다면 이 허용 목록을 갱신한다(삭제 금지)").toEqual([APPLY, SECTION].sort());
  });
});
