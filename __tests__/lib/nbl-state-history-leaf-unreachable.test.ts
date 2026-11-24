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
// E3-③ A — 주택부수토지 판정: `judgeHousingLand`(양도일 현재 상태 · 초과 분기 PARTIAL 고지) → `applyHousingStateHistory`(이내 분기 후처리 — 같은 leaf를 쓴다) · 배율 helper `housing-limit.ts`(단일 소스).
const HOUSING_LAND = "lib/tax-engine/non-business-land/housing-land.ts";
const HOUSING_APPLY = "lib/tax-engine/non-business-land/housing-state-history.ts";
const HOUSING_LIMIT = "lib/tax-engine/non-business-land/housing-limit.ts";
const MAPPER = "lib/tax-engine/non-business-land/form-mapper-helpers.ts";
// E3-③ B — 기타토지 철거 행 «주택» 입력의 적용 범위 술어(수도권 칸 조건부 개방 · 양도일 의제 scope) leaf — ⑭ 상위 매퍼(`form-mapper.ts`)·판정(apply)이 읽는다. UI-B가 ④⑧⑤ 사용처를 더한다.
const HOUSE_PRIOR_SCOPE = "lib/tax-engine/non-business-land/house-prior-scope.ts";
const FORM_MAPPER = "lib/tax-engine/non-business-land/form-mapper.ts";
const REFINES = "lib/api/transfer-tax-schema-nbl-refines.ts";
const SCHEMA = "lib/api/transfer-tax-schema-nbl.ts";
// U0·U1(UI) 배선 — ④ 전송·⑤ 렌더·⑧ 검증이 같은 술어·같은 leaf를 쓴다.
const SCOPE = "lib/calc/nbl-other-state-history-scope.ts";
const REQUEST = "lib/calc/non-business-land-request.ts"; // ④ 전송(수도권 게이트)
const PREVIEW = "lib/calc/nbl-other-state-history-preview.ts";
const VALIDATE = "lib/calc/transfer-tax-validate-nbl-state-history.ts";
const MIGRATE = "lib/stores/calc-wizard-asset-migrate-nbl.ts";
const SECTION = "components/calc/transfer/nbl/OtherLandStateHistorySection.tsx";
const KIND_FIELD = "components/calc/transfer/nbl/OtherLandBuildingKindField.tsx"; // E3-③ B ⑤ 철거 행 «철거된 건축물 종류»(`data-field` 앵커 — 이력 칸 이름을 읽는다)
const BARE_FIELDS = "components/calc/transfer/nbl/OtherLandBareIntervalFields.tsx"; // E3-1b ⑤ 나대지 구간 선언 카드(근거 선택지·접힘 해석을 leaf에서 읽는다)
const PERIOD_TABLE = "components/calc/NblStateHistoryPeriodTable.tsx"; // E3-1b ⑦ 결과 구간표(나대지 구간 선언 문구 `bareIntervalTaxTypeText` — 입력 미리보기와 같은 leaf 함수)
const DETAIL = "components/calc/transfer/nbl/OtherLandDetailSection.tsx";
// E3-③ 후속 #1 — «엔진이 철거 행 이력을 읽는가»(의제 ∨ 부분 면적) UI 래퍼: ⑧ H9·H10 · ⑤ 필수·수도권 칸이 이 한 함수를 읽는다. 엔진 `otherLandAreaIsPartial`을 돌린다(자체 근사 금지).
const READ = "lib/calc/nbl-other-state-history-read.ts";
// E3-④ — 13호 «세대 주택 소유 기간»: 술어 래퍼(④⑤⑧ 단일 소스) · 입력 안내 갈래 · 미리보기. 엔진 술어 `vacantLotHousePeriodsRead`·leaf를 부른다.
const VL_SCOPE = "lib/calc/nbl-vacant-lot-household-scope.ts";
const VL_NOTICE = "lib/calc/nbl-vacant-lot-history-notice.ts";
const VL_PREVIEW = "lib/calc/nbl-vacant-lot-household-preview.ts";
const OTHER_LAND = "lib/tax-engine/non-business-land/other-land.ts";
// E3-⑤ E3f-1b — 꼬리 근거 «철거ㆍ멸실»의 철거ㆍ멸실일 요구·출처 술어 leaf. ⑫′(`demolishedInputIssue`)·⑭(`demolishedOnForEngine`)이 읽고, U-2가 ⑧·④(`demolishedOnWireValue`)를 더한다.
const DEMOLISHED_ISSUE = "lib/tax-engine/non-business-land/demolished-input-issue.ts";
// E3-⑤ E3f-1b U-2 — ④⑤⑧ 공용 술어 래퍼(AssetForm → leaf 사실) · ⑤ 위젯 블록 · ⑧ 호출처. 엔진 leaf를 부르는 UI 쪽 사용처는 이 셋뿐이다.
const TAIL_SCOPE = "lib/calc/nbl-demolished-tail-scope.ts";
const TAIL_FIELDS = "components/calc/transfer/nbl/OtherLandDemolishedTailFields.tsx";
const VALIDATE_OTHER = "lib/calc/transfer-tax-validate-nbl-other.ts";

const NEXT_PR_HINT = "새 사용처가 생겼다면 UI 배선(U1·U2)일 것이다 — 이 허용 목록을 그 파일로 갱신한다(삭제 금지). 계획서 plan.md §4 U1·U2.";

describe("배선 확인 — 상태 이력 leaf는 판정(apply)·⑫ refine·⑭ 매퍼(E2)와 UI(U0·U1: ④⑤⑧·③)에 연결돼 있다", () => {
  it("WIRE-0 (공허 방지): leaf가 실제로 존재하고 핵심 함수를 export한다", () => {
    const leaf = FILES.find((f) => f.path === LEAF);
    expect(leaf, "leaf 파일이 없다").toBeDefined();
    for (const name of ["deriveOtherLandStateIntervals", "stateEventRowIssue", "stateEventSequenceIssue", "isStateIntervalBusiness", "stateHistoryBusinessIntervals", "effectiveOtherHasBuilding"]) {
      expect(leaf!.src).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it("WIRE-1: `other-land-state-history`를 import하는 프로덕션 파일 = 판정(apply) · ⑭ 매퍼 · ⑫ refine(E2) + UI(술어 · 미리보기 · ⑧ · ③ 복원 정규화 · ⑤ 위젯 · E3-1b 나대지 구간 선언 카드 · ⑦ 결과 구간표)", () => {
    const re = /^\s*import[\s\S]*?from\s+["'][^"']*other-land-state-history["']/m;
    const importers = FILES.filter((f) => re.test(f.src)).map((f) => f.path).sort();
    expect(importers, NEXT_PR_HINT).toEqual([APPLY, HOUSING_APPLY, HOUSE_PRIOR_SCOPE, REFINES, MAPPER, SCOPE, READ, PREVIEW, VALIDATE, MIGRATE, SECTION, BARE_FIELDS, PERIOD_TABLE, DEMOLISHED_ISSUE].sort());
  });

  it("WIRE-2: 판정은 구간 변환(derive)과 구간 산식(stateHistoryBusinessIntervals)을 쓰고, ⑫ refine은 공용 issue leaf를, ⑭ 매퍼·⑫는 `effectiveOtherHasBuilding`을 쓴다 — 3중 패턴", () => {
    const src = (p: string) => FILES.find((f) => f.path === p)!.src;
    expect(src(APPLY)).toMatch(/\bderiveOtherLandStateIntervals\(/);
    expect(src(APPLY)).toMatch(/\bstateHistoryBusinessIntervals\(/);
    expect(src(REFINES)).toMatch(/\bstateEventSequenceIssue\(/);
    // E3f-1b — ⑫의 «양도일 현재 건축물 유무 파생»은 철거ㆍ멸실일 술어 leaf(`demolishedInputIssue`)가 같은 함수로 읽는다(⑭는 직접 · 같은 leaf를 `demolishedOnForEngine`으로도 쓴다).
    expect(src(REFINES)).toMatch(/\bdemolishedInputIssue\(/);
    expect(src(DEMOLISHED_ISSUE)).toMatch(/\beffectiveOtherHasBuilding\(/);
    expect(src(MAPPER)).toMatch(/\beffectiveOtherHasBuilding\(/);
    expect(src(MAPPER)).toMatch(/\bisEventKind\(/);
  });

  it("WIRE-3: 소비표 술어 `consumesStateHistory`는 ⑭ 매퍼·⑫ refine과 UI 공용 술어(`nblOtherStateHistoryApplies` — ④⑤⑧이 이 한 곳을 읽는다)가 쓴다", () => {
    const users = usersOf("consumesStateHistory", [CATEGORY]).sort();
    // E3-③ B — `house-prior-scope.ts`(수도권 조건부 술어: 기타토지 ∧ 주택 아님을 이 술어로 가른다)도 읽는다.
    expect(users, NEXT_PR_HINT).toEqual([REFINES, MAPPER, SCOPE, HOUSE_PRIOR_SCOPE].sort());
  });

  it("WIRE-4: 판정이 쓰는 고지 상수 = apply + 입력 화면(위젯 · 당해 사업개시일 칸 안내) · UI 전용 상수(unchanged·유예 안내)는 위젯만 쓴다", () => {
    const used = usersOf("NBL_STATE_HISTORY_(?:APPLIED|UNKNOWN|PARTIAL_AREA|DEEMED_TRANSFER|REMOVED_TAX_TYPE_UNKNOWN|REVENUE_START)_NOTICE", [NOTICES]).sort();
    // E3-③ — `UNKNOWN`은 `applyHousingStateHistory`(이내 분기)가 싣는다. 배율 초과 분기의 «이력 미반영» 고지는 주택 변형 상수(`HOUSING_PARTIAL_AREA` — WIRE-13)다.
    expect(used, NEXT_PR_HINT).toEqual([APPLY, DETAIL, SECTION, HOUSING_APPLY].sort());
    const uiOnly = usersOf("NBL_STATE_HISTORY_(?:UNCHANGED|GRACE_ROW)_NOTICE", [NOTICES]);
    expect(uiOnly, NEXT_PR_HINT).toEqual([SECTION]);
    const messages = usersOf("STATE_EVENTS_REQUIRED_MESSAGE|stateEvent[A-Za-z]+Message", [MESSAGES, LEAF]).sort();
    expect(messages, NEXT_PR_HINT).toEqual([APPLY, HOUSING_APPLY].sort());
  });

  it("WIRE-4b (E3-③ A·B): 주택 이력 고지 상수(DAYWISE·HOUSING_APPLIED·HOUSE_*·NON_HOUSE_BUILDING)는 `applyHousingStateHistory`(A 결과 고지) · `applyStateHistory`(B 결과 고지 — 주택 구간이 있을 때만)와 입력 위젯(UI — 같은 상수를 읽는다)만 쓴다. `WITHIN_UNCONFIRMED`는 위젯이 쓰지 않는다(UI는 ⑧이 차단 — 직접 API 접힘 고지)", () => {
    const used = usersOf("NBL_STATE_HISTORY_(?:DAYWISE_NO_RULING|HOUSING_APPLIED|HOUSE_BEFORE|HOUSE_WITHIN_UNCONFIRMED|HOUSE_EXCEEDED|HOUSE_EXCEEDED_GRACE|HOUSING_NON_HOUSE_BUILDING)_NOTICE", [NOTICES]).sort();
    expect(used, NEXT_PR_HINT).toEqual([APPLY, HOUSING_APPLY, SECTION].sort());
    // B 결과 고지는 A 고지 중 «주택 아닌 건축물 안내·HOUSING_APPLIED(A 한정 고지)»를 쓰지 않는다 — 기타토지는 종전 APPLIED 고지를 대체하지 않는다(Anchor 9 바이트 동일).
    const apply = FILES.find((f) => f.path === APPLY)!.src;
    expect(apply).not.toMatch(/NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE|NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE/);
    const widget = FILES.find((f) => f.path === SECTION)!.src;
    expect(widget, "위젯은 ⑧이 막는 직접 API 접힘 고지를 쓰지 않는다").not.toMatch(/NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE/);
  });

  it("WIRE-3b (E3-③ A): 주택 소비 술어 `consumesHousingStateHistory` = 사건 주체 leaf(`stateEventSubjectOf` — ⑧·⑫ 문구 변형) · ⑭ 매퍼(tailHasBuilding=true · 정착면적 운반) · UI 기타토지 전용 술어(주택 제외)", () => {
    const users = usersOf("consumesHousingStateHistory", [CATEGORY]).sort();
    expect(users, NEXT_PR_HINT).toEqual([LEAF, MAPPER, SCOPE, HOUSE_PRIOR_SCOPE].sort());
  });

  it("WIRE-11 (E3-③ B): B 적용 범위 술어는 단일 소스 — `housePriorNeedsMetropolitan`은 ⑭ 상위 매퍼(수도권 게이트)와 UI ④⑤⑧의 한 함수(`housePriorNeedsMetropolitanOf`)가, `stateHistoryDeemedBlocks`는 판정(apply)과 UI의 한 함수(`stateHistoryDeemedBlocksOf` — ⑧ 의제 건너뜀)가 읽는다", () => {
    expect(usersOf("housePriorNeedsMetropolitan", [HOUSE_PRIOR_SCOPE]).sort(), NEXT_PR_HINT).toEqual([FORM_MAPPER, SCOPE].sort());
    expect(usersOf("stateHistoryDeemedBlocks", [HOUSE_PRIOR_SCOPE]).sort(), NEXT_PR_HINT).toEqual([APPLY, SCOPE].sort());
    // UI 호출처는 래퍼 한 곳(scope)을 거쳐 읽는다 — ④ 전송 게이트·⑤ 수도권 칸·⑤ 미리보기 맥락·⑧ H10이 **같은 함수**(`housePriorNeedsMetropolitanOf`).
    expect(usersOf("housePriorNeedsMetropolitanOf", [SCOPE]).sort(), NEXT_PR_HINT).toEqual([REQUEST, PREVIEW, SECTION, VALIDATE].sort());
    // E3-③ 후속 #1 — 의제 사유는 «엔진이 철거 행 이력을 읽는가» 래퍼(`housePriorHistoryIgnoredOf`)가 부분 면적과 함께 한 함수로 읽는다(⑧ H9·H10·⑤가 자체 의제 조건을 쓰지 않는다).
    // E3-④ — 13호 술어 래퍼(`vacantLotHousePeriodsReadOf`의 인자 «양도일 의제»)와 13호 미리보기(의제일 = 소유기간 끝)도 같은 한 함수를 읽는다.
    expect(usersOf("stateHistoryDeemedBlocksOf", [SCOPE]).sort(), NEXT_PR_HINT).toEqual([READ, VL_SCOPE, VL_PREVIEW].sort());
    // E3-④ — 13호 입력 안내(C-1·C-2)·미리보기도 «엔진이 이력을 읽는가»를 같은 래퍼로 묻는다(자체 부분 면적·의제 조건 금지).
    expect(usersOf("housePriorHistoryIgnoredOf", [READ]).sort(), NEXT_PR_HINT).toEqual([VALIDATE, SECTION, VL_NOTICE, VL_PREVIEW].sort());
    // 부분 면적 판정은 엔진 core를 그대로 돌린다 — `otherLandAreaIsPartial`(other-land.ts)이 `applyStateHistory`가 쓰는 `isPartialArea`를 같은 core 결과에 적용한다(UI 자체 근사 금지).
    expect(usersOf("otherLandAreaIsPartial", [OTHER_LAND]), NEXT_PR_HINT).toEqual([READ]);
    expect(usersOf("isPartialArea", [APPLY]).sort(), NEXT_PR_HINT).toEqual([OTHER_LAND]);
    // ④ 와이어 게이트(`non-business-land-request.ts`)는 소비표 지목 ∨ B 술어(안 열면 BP1 — 수도권이 서버에 안 닿아 보수적 3배로 읽힌다).
    expect(FILES.find((f) => f.path === REQUEST)!.src).toMatch(/metro:\s*consumesMetropolitanArea\(asset\.nblLandType\)\s*\|\|\s*housePriorNeedsMetropolitanOf\(asset,\s*transferDate\)/);
  });

  it("WIRE-14 (E3-⑤ E3f-1b · U-2): 꼬리 철거ㆍ멸실일 술어는 단일 소스 — ⑫′는 `demolishedInputIssue`, ⑭는 `demolishedOnForEngine`, ④⑤⑧은 래퍼 `nbl-demolished-tail-scope`를 거쳐 같은 leaf를 읽는다(자체 replay·날짜 비교 금지)", () => {
    // 엔진 leaf 소비처 — ⑫′·⑭(엔진)와 UI 래퍼 한 곳. ⑧(VALIDATE_OTHER)은 래퍼의 `demolishedTailInputIssueOf`를 부르지 leaf를 직접 부르지 않는다.
    expect(usersOf("demolishedInputIssue", [DEMOLISHED_ISSUE]).sort(), NEXT_PR_HINT).toEqual([REFINES, TAIL_SCOPE].sort());
    expect(usersOf("demolishedOnWireValue|demolishedFloorAreaWireValue", [DEMOLISHED_ISSUE]).sort(), NEXT_PR_HINT).toEqual([TAIL_SCOPE]);
    expect(usersOf("demolishedOnForEngine", [DEMOLISHED_ISSUE]).sort(), NEXT_PR_HINT).toEqual([MAPPER, TAIL_FIELDS].sort());
    expect(usersOf("demolishedOnRequired", [DEMOLISHED_ISSUE]).sort(), NEXT_PR_HINT).toEqual([TAIL_SCOPE]);
    // ⑭ 매퍼는 같은 조건을 `requiresDemolishedFloorArea ∧ demolishedAreaClauseApplies`로 직접 읽는다(엔진 소관 — leaf 거울과 같은 두 술어의 합).
    expect(usersOf("demolishedFloorAreaRequired", [DEMOLISHED_ISSUE]).sort(), NEXT_PR_HINT).toEqual([TAIL_SCOPE]);
    expect(usersOf("tailRemovalDateOf", [LEAF]).sort(), NEXT_PR_HINT).toEqual([DEMOLISHED_ISSUE]);
    expect(usersOf("isTailDemolishedClearlyExpired", ["lib/tax-engine/non-business-land/demolished-temp-status.ts"]).sort(), NEXT_PR_HINT).toEqual(["lib/tax-engine/non-business-land/property-tax-basis.ts", TAIL_FIELDS].sort());
    // UI 래퍼 소비처 — ④ 전송 · ⑤ 위젯 · ⑧ 검증이 각각 한 곳. 래퍼를 거치지 않는 제4의 호출처가 생기면 ⑤⑧⑫가 어긋난다.
    expect(usersOf("demolishedTailWireFields", [TAIL_SCOPE]), NEXT_PR_HINT).toEqual(["lib/calc/non-business-land-request.ts"]);
    expect(usersOf("demolishedTailInputIssueOf", [TAIL_SCOPE]), NEXT_PR_HINT).toEqual([VALIDATE_OTHER]);
    expect(usersOf("demolishedOnFieldNeededOf|demolishedFloorAreaNeededOf|demolishedTailFactsOf", [TAIL_SCOPE]), NEXT_PR_HINT).toEqual([TAIL_FIELDS]);
    // ⑧은 순서 `validateNblStateHistory` → `demolishedTailInputIssueOf`(사건 행 결함이 철거ㆍ멸실일 안내보다 먼저 — ⑫′의 `stateRowIssued` 억제와 같은 방향)
    const v8 = FILES.find((f) => f.path === VALIDATE_OTHER)!.src;
    expect(v8.indexOf("validateNblStateHistory(")).toBeGreaterThan(-1);
    expect(v8.indexOf("validateNblStateHistory(")).toBeLessThan(v8.indexOf("demolishedTailInputIssueOf("));
  });


  it("WIRE-12 (E3-③ UI Low 3): 엔진이 이력을 읽는 조건 `housingStateHistoryIsRead`는 판정(`judgeHousingLand`)과 UI 안내·⑧ H9 게이트(`housingAreaLimitState`)가 같은 함수로 읽는다", () => {
    expect(usersOf("housingStateHistoryIsRead", [HOUSING_LIMIT]).sort(), NEXT_PR_HINT).toEqual([HOUSING_LAND, PREVIEW].sort());
    expect(FILES.find((f) => f.path === VALIDATE)!.src, "⑧은 `housingAreaLimitState`로 게이트한다(자체 배율 계산 금지)").toMatch(/housingAreaLimitState\(/);
  });

  it("WIRE-13 (E3-③ UI Low 1): 주택 변형 PARTIAL 고지는 `judgeHousingLand`(결과)와 입력 위젯이 같은 상수를 읽는다", () => {
    expect(usersOf("NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE", [NOTICES]).sort(), NEXT_PR_HINT).toEqual([HOUSING_LAND, SECTION].sort());
  });

  it("WIRE-10 (E3-③ Q-11 (나)): 폐기된 3지선다 칸 `houseWithinLimitBefore`는 프로덕션 어디에도 없다 — A·B 모두 `houseFootprintBefore`(㎡)로 통일(Y-32)", () => {
    expect(usersOf("houseWithinLimitBefore", []), "폐기된 칸 잔재").toEqual([]);
  });

  it("WIRE-9 (E3-③ A): 배율 helper `housing-limit.ts`는 `judgeHousingLand`(양도일 현재)와 과거 주택 구간(leaf)이 같이 쓴다 — 단일 소스(D-12). `getHousingMultiplier`를 직접 부르는 주택 판정이 더 생기면 배율이 갈라진다", () => {
    const users = usersOf("judgeHousingLimit|resolveHouseInterval", [HOUSING_LIMIT]).sort();
    // UI-A — ⑤ 미리보기(철거 행 허용 면적·양도일 현재 배율 초과 안내)도 **같은 leaf를 직접 부른다**(표시 전용 — 배율표·비교를 UI가 따로 쓰지 않는다).
    expect(users, NEXT_PR_HINT).toEqual([HOUSING_LAND, LEAF, PREVIEW].sort());
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

  it("WIRE-6: 이력 칸 이름을 읽는 UI(store·components·lib/calc) 파일 = ①②③ 상태·복원 · ④ 전송 · ⑤ 위젯 · ⑧ 검증·술어·미리보기 — 정확히 이 열여섯 곳", () => {
    const uiUsers = FILES.filter(
      (f) => /^(components|lib\/(stores|calc))\//.test(f.path) && /nblOtherStateEvents|nblOtherStateHistoryMode/.test(f.src),
    ).map((f) => f.path).sort();
    const expected = [
      "lib/stores/calc-wizard-asset-nbl-other.ts", // ① 타입
      "lib/stores/calc-wizard-asset-nbl.ts", // ② NBL_DEFAULTS
      "lib/stores/calc-wizard-asset-factory.ts", // ② factory
      MIGRATE, // ③ 복원 정규화
      "lib/calc/non-business-land-request.ts", // ④ 전송(파생 nblOtherHasBuilding 덮어쓰기 포함)
      TAIL_SCOPE, // E3f-1b U-2 — 꼬리 근거 «철거ㆍ멸실» 술어 래퍼: 와이어 사건(`stateHistoryWireFields`)을 leaf 사실로 넘긴다(④⑤⑧ 공용)
      SCOPE, READ, PREVIEW, VALIDATE, // ④⑤⑧ 공용 술어 · «엔진이 이력을 읽는가» 래퍼(E3-③ 후속) · 미리보기 · ⑧ 규칙
      SECTION, BARE_FIELDS, KIND_FIELD, DETAIL, // ⑤ 위젯 · 나대지 구간 선언 카드(E3-1b — `data-field` 앵커) · 철거 행 종류 카드(E3-③ B) · 마운트
      VL_SCOPE, VL_NOTICE, VL_PREVIEW, // E3-④ — 13호 술어 래퍼(`nblOtherStateEventsInUse`를 인자로 공급) · 입력 안내 갈래 · 행 아래 미리보기
    ].sort();
    expect(uiUsers, NEXT_PR_HINT).toEqual(expected);
  });

  it("WIRE-8: ⑧은 ⑫와 같은 issue leaf(`stateEventSequenceIssue`)를 쓰고 하한일(`floorDate`)은 ⑧만 넘긴다 — ⑫가 넘기면 축 B 늦은 지분이 400", () => {
    const src = (p: string) => FILES.find((f) => f.path === p)!.src;
    expect(src(VALIDATE)).toMatch(/\bstateEventSequenceIssue\(/);
    expect(src(VALIDATE)).toMatch(/floorDate:\s*ctx\.floorDate/);
    expect(src(REFINES)).toMatch(/\bstateEventSequenceIssue\(/);
    expect(src(REFINES), "⑫는 floorDate를 넘기지 않는다").not.toMatch(/floorDate/);
  });

  it("WIRE-7: 엔진 입력 `landStateHistory`는 types · 매퍼 · 판정(apply)만 읽는다", () => {
    const users = usersOf("landStateHistory", []).sort();
    // E3-③ — 주택부수토지: `judgeHousingLand`(초과 분기 고지) · `applyHousingStateHistory`(이내 분기 후처리)도 읽는다.
    expect(users).toEqual(["lib/tax-engine/non-business-land/form-mapper.ts", HOUSING_LAND, HOUSING_APPLY, "lib/tax-engine/non-business-land/other-land-state-history-apply.ts", "lib/tax-engine/non-business-land/types.ts"].sort());
  });
});
