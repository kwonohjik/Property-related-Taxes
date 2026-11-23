/**
 * 게이트 — E3-① 「재산세 구분 변경 사건」의 **배선 확인**(침묵 소실 grep 게이트 · 허용 목록). 선례: `nbl-state-history-leaf-unreachable.test.ts`.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §6(grep 게이트) · §3.3(단일 술어 `eventCarriesTaxTypeBefore`) · 결정 기록(2026-11-23)
 *
 * 왜 필요한가: 사건 종류가 2 → 3이 되면 «종류가 둘뿐이다»를 가정한 `kind === "building_removed"` 삼항은 **컴파일 오류 없이** 새 종류의 `propertyTaxTypeBefore`를 침묵으로 `""`(모름)로 지운다.
 * 별도합산이라고 입력했는데 모름 처리 → 비사업용이 되는 과대 과세다. 그래서 Before 운반 여부는 leaf 단일 술어 하나만 판정하고, 리터럴 분기는 허용 목록으로 묶는다.
 * 엔진 쪽(⑭)은 이 PR에서 술어로 교체했다. **UI 쪽 3곳은 U4가 교체한다** — 교체하면 아래 허용 목록 단언이 빨갛게 되고, U4 PR이 `UI_PENDING_REMOVED_LITERAL`을 비운다(삭제 금지 — 비운 뒤 «0건» 단언이 영구 게이트가 된다).
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
// U4(UI)가 교체할 «Before 운반» 리터럴 — ⑤ 미리보기 · ④ 와이어 정규화 · ③ 복원 정규화 + ⑤ 위젯의 직전 구분 칸 노출 술어(`removed &&` — UI 계획서 S4)
const PREVIEW = "lib/calc/nbl-other-state-history-preview.ts";
const SCOPE = "lib/calc/nbl-other-state-history-scope.ts";
const MIGRATE = "lib/stores/calc-wizard-asset-migrate-nbl.ts";
const UI_PENDING_REMOVED_LITERAL = [PREVIEW, SCOPE, MIGRATE, SECTION].sort();

describe("E3-① 침묵 소실 grep 게이트 — `kind === \"building_removed\"` 리터럴 분기", () => {
  const withLiteral = FILES.filter((f) => f.path !== LEAF && /\bkind\s*===\s*["']building_removed["']/.test(f.src)).map((f) => f.path).sort();

  it("엔진·API 쪽(⑭ 매퍼 포함)에는 없다 — Before 운반은 단일 술어 `eventCarriesTaxTypeBefore`", () => {
    const engineSide = withLiteral.filter((p) => !UI_PENDING_REMOVED_LITERAL.includes(p));
    expect(engineSide, "엔진·API 쪽 리터럴 분기는 술어로 교체해야 한다").toEqual([]);
    expect(src(MAPPER)).toMatch(/\beventCarriesTaxTypeBefore\(/);
  });

  it("UI 쪽 남은 곳 = 정확히 ⑤ 미리보기 · ④ 와이어 정규화 · ③ 복원 정규화 · ⑤ 위젯(직전 구분 칸 노출) 4곳 — U4가 술어로 교체하고 이 목록을 비운다", () => {
    expect(withLiteral.filter((p) => UI_PENDING_REMOVED_LITERAL.includes(p)), "U4에서 교체 필요 — 교체 후 UI_PENDING_REMOVED_LITERAL을 []로 비운다(삭제 금지)").toEqual(UI_PENDING_REMOVED_LITERAL);
  });

  it.todo("U4 완료 조건: `git grep 'kind === \"building_removed\"' lib components app` 0건 — UI_PENDING_REMOVED_LITERAL = []");
});

describe("E3-① 3중 패턴 배선 — ⑧·⑫가 같은 leaf에 같은 초기 건축물 상태(`tailHasBuilding`)를 넘긴다", () => {
  it("⑫ refine = `!!raw.nblOtherHasBuilding` · ⑧ = `asset.nblOtherHasBuilding` — 빠지면 «없음»(안전 쪽)으로 읽혀 정상 tax-only 이력이 영구 차단된다(막다른 길)", () => {
    expect(src(REFINES)).toMatch(/tailHasBuilding:\s*!!raw\.nblOtherHasBuilding/);
    expect(src(VALIDATE)).toMatch(/tailHasBuilding:\s*asset\.nblOtherHasBuilding/);
  });

  it.todo("U4: ⑤ 미리보기(`nbl-other-state-history-preview.ts`)의 `stateEventSequenceIssue` 호출도 `tailHasBuilding: asset.nblOtherHasBuilding`을 넘긴다 — 지금은 생략(= 없음)이라 tax-only 이력의 미리보기가 null");
});

describe("E3-① 고지 2종 배선 — 엔진 apply만 싣는다(UI는 U4가 모름 안내로 읽는다)", () => {
  it("새 고지는 `applyStateHistory`가 싣고, 구분 변경 사건이 있을 때만 대체한다 — 기존 3종 상수는 정의 파일 밖에서 이름이 바뀌지 않는다", () => {
    const users = FILES.filter((f) => f.path !== NOTICES && /\bNBL_STATE_HISTORY_TAX_CHANGE_(?:APPLIED|UNKNOWN)_NOTICE\b/.test(f.src)).map((f) => f.path).sort();
    expect(users, "새 사용처가 생겼다면 U4(UI)일 것이다 — 이 허용 목록을 그 파일로 갱신한다(삭제 금지)").toEqual([APPLY]);
  });
});
