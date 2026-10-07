/**
 * 판정 메뉴 — 재사용 섹션 **노출 게이트** (P4-2b-2)
 *
 * 계산기 Step4는 `form.householdHousingCount` 스칼라로 게이트하지만 판정 메뉴에는 그 위젯이
 * 없다(G-1). 여기서는 **명부 파생 주택 수**로 같은 판단을 내린다.
 *
 * 🔑 계산기 쪽 게이트 함수(`temporaryTwoHouseSectionVisible` 등)는 **건드리지 않는다** —
 *    다른 화면이 다른 정본을 쓰는 것은 D-3이 이미 승인한 설계다.
 */
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import {
  deriveJudgmentHouseCount,
  judgmentSaleIsHousing,
} from "@/lib/stores/one-house-judgment-form.types";
import { provisoGate, type ProvisoMode } from "./transfer-tax-api-helpers";
import type { AssetReductionForm, SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset";
import { temporaryTwoHouseApplies } from "./household-house-count";
import { replacementHouseApplies } from "./replacement-house-scope";
import {
  rowCountExclusionReductions,
  rowSpecialHouseExclusions,
} from "@/lib/calc/house-count-exclusion-rows";
import { temporaryTwoHouseCandidateExcludedIds } from "./temp-two-house-candidate-exclusion";
import type { RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import { mergeContextOf } from "@/lib/calc/merge-house-origin";

/**
 * §155①⑥⑦⑧⑯⑱ 섹션 — 2주택 이상일 때만 의미가 있다.
 *
 * ⚠️ §156의2⑤ 대체주택은 이 게이트로 판단하지 **않는다** — `judgmentReplacementHouseVisible`.
 *
 * 계산기의 `temporaryTwoHouseSectionVisible({ primaryAssetKind, householdHousingCount })`와
 * 같은 취지다. 자산 종류 축은 판정 메뉴가 주택만 다루므로 빠진다.
 */
export function judgmentTemporaryTwoHouseVisible(form: OneHouseJudgmentFormData): boolean {
  return deriveJudgmentHouseCount(form) >= 2;
}

/**
 * 합가일(혼인·동거봉양)·「먼저 양도」 칸이 **화면에 있는가** — ⑤(노출)·④(전송)·⑧(경고) 공용 게이트.
 *
 * 합가 칸은 ③ 보유 주택·권리 단계의 두 섹션 중 **정확히 하나**가 소유한다(배타 규약, F-3).
 *
 * | 조건 | 소유자 |
 * |---|---|
 * | 주택 수 ≥ 2 | `TemporaryTwoHouseSection`의 `<MergeDateSection>` |
 * | 분양권·입주권 > 0 && 주택 수 < 2 | `MergedHouseholdRightSection`(`MergedHouseholdRightSection.tsx:78·83`) |
 * | 그 밖(1주택 · 권리 없음) | **없음** — §155④⑤는 합가로 2주택이 된 경우라 입력할 이유가 없다 |
 *
 * 🔴 칸이 사라지는 조건(명부에서 주택을 지워 1주택이 됨)에서 남은 날짜를 보내면, 사용자가
 *    볼 수 없는 합가 안내가 결과에 뜬다 ⇒ ④·⑧도 이 술어로 게이트한다.
 */
export function judgmentMergeInputVisible(form: OneHouseJudgmentFormData): boolean {
  return deriveJudgmentHouseCount(form) >= 2 || (form.presaleRights?.length ?? 0) > 0;
}

/**
 * 혼인합가 1199 — 명부 밖 장기임대주택(②의 §155⑳ 선언)마다 혼인 전 보유자를 묻는가. ⑤(칸)·⑧(필수)의 공용 게이트.
 * 각각 2주택 이상인 사람끼리의 혼인이면 특례 불가(기획재정부 조세정책과-1199)라 임대주택도 양쪽 주택 수에 센다.
 * 혼인일이 있어야 묻는다(동거봉양은 이 회신의 대상이 아니다 — 엔진 `marriageRentalSidesOf`와 같은 범위).
 */
export function judgmentMarriageRentalOriginVisible(form: OneHouseJudgmentFormData): boolean {
  const rh = form.assets?.[0]?.rentalHousingException;
  return (
    judgmentSaleIsHousing(form) && // 입주권 양도에는 ⑳ 선언이 없다(G066)
    judgmentMergeInputVisible(form) &&
    !!form.marriageDate &&
    rh?.applyException === true &&
    (rh.rentalUnits?.length ?? 0) > 0
  );
}

/**
 * §156의2⑤ 대체주택 특례 — ⑤(칸 노출)·④(전송)·⑧(필수값)의 **공용 게이트** (OH-05).
 *
 * 법문(「소득세법 시행령」 §156의2⑤)은 「국내에 1주택을 소유한 1세대가 그 주택에 대한
 * 재개발사업 … 시행기간 동안 거주하기 위하여 다른 주택(대체주택)을 취득한 경우」이고, 3호가
 * 「관리처분계획등에 따라 취득하는 주택이 **완성되기 전** 또는 완성된 후 3년 이내에 대체주택을
 * 양도할 것」이다. 완성 전 양도의 기본 사례는 **대체주택 1채 + 조합원입주권 1개**다 —
 * 종전주택이 이미 입주권이 됐으므로 파생 주택 수는 1이다(입주권은 세지 않는다).
 *
 * 🔴 종전 게이트(`judgmentTemporaryTwoHouseVisible` = 주택 2채 이상)는 그 기본 사례에서 칸을
 *    숨겨 유일한 입력 경로를 없앴고, 반대로 ④·⑧은 게이트 없이 토글을 믿어 **숨겨진 stale
 *    선언**이 입주권 없는 1주택 세대를 비과세로 만들었다(엔진 분기는 주택 수를 보지 않는다).
 *
 * ⇒ 열리는 조건: 양도 대상이 주택이고 **(2주택 이상 — 완성 후 양도 · 관리처분 전)** 이거나
 *    **조합원입주권을 1개 이상 보유**. 분양권은 §156의3 축이라 세지 않는다.
 */
export function judgmentReplacementHouseVisible(form: OneHouseJudgmentFormData): boolean {
  // 조건 본문은 계산기 ④와 공용이다(`replacement-house-scope.ts`) — 인자만 명부 파생값으로 채운다.
  return replacementHouseApplies({
    houseCount: deriveJudgmentHouseCount(form),
    saleIsHousing: judgmentSaleIsHousing(form),
    holdsRedevelopmentRight: (form.presaleRights ?? []).some((r) => r.type === "redevelopment_right"),
  });
}

/**
 * §154① 단서 카드의 맥락 — ④(전송)와 ⑧(필수값)이 **같은 값**을 쓴다(OH-06).
 *
 * 🔑 ④가 사유를 보내지 않는 맥락(`null`)에서 ⑧이 막으면 채울 칸 없는 영구 차단이 되고,
 *    ④가 보내는 맥락에서 ⑧이 빠지면 필수값 없는 사유가 엔진에 닿는다. 그래서 한 함수다.
 */
export function judgmentProvisoMode(form: OneHouseJudgmentFormData): ProvisoMode {
  const primary = form.assets?.[0];
  return provisoGate({
    isOneHousehold: form.isOneHousehold,
    isHousing: primary?.assetKind === "housing",
    householdHousingCount: deriveJudgmentHouseCount(form), // 판정 메뉴는 명부 파생값(D-3)
    temporaryTwoHouseApplies: temporaryTwoHouseApplies({
      primaryKind: primary?.assetKind,
      primaryAcquisitionDate: primary?.acquisitionDate,
      houses: form.houses,
      transferDate: form.transferDate,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
      declaredSpecial: form.temporaryTwoHouseSpecial === true,
      declaredNewHouseDate: form.newHouseAcquisitionDate,
      mergeContext: mergeContextOf(form), // D8 — 합가 세대는 같은 쪽 안에서 짝을 고른다
      excludedHouseIds: temporaryTwoHouseCandidateExcludedIds(form),
    }),
  }).mode;
}

/**
 * 조특법 §99의4(농어촌·고향주택)·§98의9(준공후미분양) — **§89①3호 주택 수 제외** 축의 감면 유형.
 *
 * 두 조문 모두 효과가 「해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」 제89조제1항제3호를
 * 적용한다」(조특법 §99의4① · §98의9①)라 세액이 아니라 **판정**을 바꾼다. 판정 메뉴가 입력받는
 * 감면은 이 셋뿐이다.
 */
export const JUDGMENT_HOUSE_COUNT_EXCLUSION_TYPES = [
  "new_99_4_rural",
  "new_99_4_hometown",
  "unsold_98_9",
] as const;

type HouseCountExclusionReduction = Extract<
  AssetReductionForm,
  { type: (typeof JUDGMENT_HOUSE_COUNT_EXCLUSION_TYPES)[number] }
>;

export function isHouseCountExclusionReduction(
  r: AssetReductionForm,
): r is HouseCountExclusionReduction {
  return (JUDGMENT_HOUSE_COUNT_EXCLUSION_TYPES as readonly string[]).includes(r.type);
}

/**
 * §99의4·§98의9 선언 — ④(전송)·⑧(필수값)·사이드바의 **공용 게이트** (OH-28).
 *
 * 🔄 **출처는 명부 행이다**(`HouseEntry.countExclusion` — 계획서
 *    `one-house-judgment-count-exclusion-row-link.plan.md`). 종전에는 `assets[0].reductions`의
 *    세대 단위 선언이라 어느 주택인지 몰랐고, 명부에 없는 주택까지 빼 주었다(P3·P6).
 *    행에서 만든 선언은 취득일·주소 등을 행 값으로 채우고 `houseId`를 싣는다.
 *
 * 🔑 양도 대상이 **주택**일 때만 연다 — 두 조문은 「일반주택(종전주택)을 양도하는 경우」이고,
 *    조합원입주권 양도(§89①4호)에는 주택 수 제외 축이 없다. 입주권으로 바꾼 뒤 남은 선언은
 *    ④가 보내지 않고 ⑧도 요구하지 않는다(값은 지우지 않는다 — 주택으로 되돌리면 복귀).
 */
export function judgmentHouseCountExclusionReductions(
  form: OneHouseJudgmentFormData,
): RowCountExclusionReduction[] {
  if (!judgmentSaleIsHousing(form)) return [];
  return rowCountExclusionReductions(form.houses);
}

/**
 * 보유 감면주택(§98 등) 선언 — 명부 행에서. 게이트는 위와 같다: 감면 조문의 효과 문언이 모두
 * 「「소득세법」 제89조제1항제3호를 적용할 때」라 입주권 양도(§89①4호)에는 닿지 않는다(계획서 §7-1 V-3).
 */
export function judgmentSpecialHouseExclusions(
  form: OneHouseJudgmentFormData,
): SpecialHouseExclusionFormItem[] {
  if (!judgmentSaleIsHousing(form)) return [];
  return rowSpecialHouseExclusions(form.houses);
}

/**
 * **어느 주택인지 지정되지 않은** 옛 선언 수 — `assets[0].reductions`의 §99의4·§98의9와
 * `form.specialHouseExclusions`(행 id 없음). 이 입력 화면이 종전에 쓰던 저장소다.
 *
 * 🔴 계획서 Q-2(a): 종전처럼 1채를 빼 주면 명부에 없는 주택을 빼는 과소과세(P6)가 보존된다.
 *    ⑧이 다시 판정할 때 막고, ③ 화면이 「행에서 지정 → 옛 선언 삭제」를 안내한다(삭제 버튼이
 *    유일한 해소 경로 — 입력 칸 없는 영구 차단을 만들지 않는다).
 */
export function judgmentLegacyCountExclusionCount(form: OneHouseJudgmentFormData): number {
  if (!judgmentSaleIsHousing(form)) return 0;
  const reductions = (form.assets?.[0]?.reductions ?? []).filter(isHouseCountExclusionReduction);
  const specials = (form.specialHouseExclusions ?? []).filter((e) => e.article);
  return reductions.length + specials.length;
}
