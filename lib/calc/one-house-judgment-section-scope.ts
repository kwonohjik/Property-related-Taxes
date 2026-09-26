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
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset";
import { temporaryTwoHouseApplies } from "./household-house-count";
import { replacementHouseApplies } from "./replacement-house-scope";

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
 * ① 세대 단계가 **합가일 입력을 소유하는가**.
 *
 * 🔴 **배타 규약이다.** `MergedHouseholdRightSection`은 주택 수 < 2일 때
 *    `marriageDate`·`parentalCareMergeDate`·`isFirstTransferredInMerge`를 **직접 소유**한다
 *    (`MergedHouseholdRightSection.tsx:14-16·80-82`). 그 조건에서 `MergeDateSection`도 함께
 *    렌더하면 **같은 칸이 두 벌** 뜬다(F-3).
 *
 * 그 섹션은 `presaleRights.length === 0`이면 `null`을 반환하므로(`:77`), 실제로 소유하는
 * 조건은 **「분양권·입주권이 있고 + 주택 수 < 2」** 다. 그 밖에는 ①이 소유한다.
 */
export function judgmentMergeDateOwnedByStep1(form: OneHouseJudgmentFormData): boolean {
  const ownedByRightSection =
    (form.presaleRights?.length ?? 0) > 0 && deriveJudgmentHouseCount(form) < 2;
  return !ownedByRightSection;
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
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
      declaredSpecial: form.temporaryTwoHouseSpecial === true,
      declaredNewHouseDate: form.newHouseAcquisitionDate,
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
 * §99의4·§98의9 선언 — ⑤(칸 노출)·④(전송)·⑧(필수값)의 **공용 게이트** (OH-28).
 *
 * 🔑 양도 대상이 **주택**일 때만 연다 — 두 조문은 「일반주택(종전주택)을 양도하는 경우」이고,
 *    조합원입주권 양도(§89①4호)에는 주택 수 제외 축이 없다. 입주권으로 바꾼 뒤 남은 선언은
 *    ④가 보내지 않고 ⑧도 요구하지 않는다(값은 지우지 않는다 — 주택으로 되돌리면 복귀).
 * 🔑 다른 감면 유형은 판정과 무관하므로 걸러 낸다(판정 route는 세액을 계산하지 않는다).
 */
export function judgmentHouseCountExclusionReductions(
  form: OneHouseJudgmentFormData,
): HouseCountExclusionReduction[] {
  if (!judgmentSaleIsHousing(form)) return [];
  return (form.assets?.[0]?.reductions ?? []).filter(isHouseCountExclusionReduction);
}
