/**
 * STEP 0.9 + 0.95: 주택수 제외(§99의4·§98의9·보유 감면주택·상속주택) → 비과세 판정용 유효 주택수 산정.
 *
 * transfer-tax.ts 800줄 정책 분리. effectiveInput의 reductions·houses에서 §89①3호 의제 주택수 제외를
 * 합산해 exemptionJudgeInput(householdHousingCount 차감)을 만들고 관련 step을 push한다.
 * 중과 주택수는 불변(R-D) — 비과세 판정 한정.
 *
 * 순환 의존 방지: 이 파일은 transfer-tax.ts를 import하지 않는다.
 */

import { resolveInheritedHouseExclusionFromInput, buildInheritedExclusionSteps } from "./transfer-inheritance-exclusion";
import { resolveHouseCountExclusion, buildHouseCountExclusionStep } from "./transfer-reductions/unsold-98-9";
import { resolveSpecialHouseExclusions } from "./transfer-reductions/unsold-hybrid-p5";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";
import { INHERITED_GENERAL_HOUSE_SURCHARGE_EXCLUSION_EFFECTIVE_DATE } from "./legal-codes";

/**
 * STEP 0.9 + 0.95의 **제외 판정만** — step을 쓰지 않는 순수 함수.
 *
 * E-14 — 중과 판정(STEP 0.5)이 영 §167의10①15호 ① 요소를 판정할 때 비과세와 **같은** 세대 주택 수를
 * 봐야 해서 끌어냈다(그 단계는 이 STEP보다 먼저 돈다). 인자가 같으면 `runHouseCountExclusionStep`과
 * 항상 같은 값이다(그 함수가 이것을 부른다).
 */
export function resolveExemptionHouseCountExclusions(
  effectiveInput: TransferTaxInput,
  generalHouseAcquisitionDate?: Date,
) {
  const { appliedList: hceApplied, new994Detail, unsold989Detail } = resolveHouseCountExclusion(
    effectiveInput.reductions,
    {
      generalHouseAcquisitionDate: generalHouseAcquisitionDate ?? effectiveInput.acquisitionDate,
      transferDate: effectiveInput.transferDate,
    },
  );
  const specialHouseExclusionDetail = resolveSpecialHouseExclusions(
    effectiveInput.specialHouseExclusions,
    effectiveInput.transferDate,
  );
  const inheritedExclusion = resolveInheritedHouseExclusionFromInput(effectiveInput);
  return {
    hceApplied,
    new994Detail,
    unsold989Detail,
    specialHouseExclusionDetail,
    inheritedExclusion,
    /** 조특법(§99의4·§98의9·보유 감면주택)으로 뺀 수 */
    specialActExcludedCount: hceApplied.length + specialHouseExclusionDetail.excludedCount,
  };
}

/**
 * 영 §167의10①15호(·§167의3①13호) **① 요소** 판정용 세대 주택 수 (E-14).
 *
 * 비과세 E-3이 보는 값(`exemptionJudgeInput.householdHousingCount` — §155②③·조특법 제외 후)과 같다.
 * 단 **조특법 제외만으로 2 미만**이 되는 경우는 조특법 주택을 센 값을 쓴다 — 15호의 「「조세특례제한법」에
 * 따라 … 1개의 주택을 소유하고 있는 것으로 보거나」가 조특법 §99의4 등 「소유주택이 아닌 것으로 보아
 * 소득세법 §89①3호를 적용」하는 조문까지 포섭하는지 직접 선례를 확보하지 못했다(확인 필요) ⇒ 그 축은
 * 종전 동작(조특법 주택이 주택 수에 남은 채 §155 의제를 판정)을 유지한다.
 */
export function surcharge15HouseCount(
  householdHousingCount: number,
  inheritedExcludedCount: number,
  specialActExcludedCount: number,
): number {
  const withoutInherited = Math.max(householdHousingCount - inheritedExcludedCount, 0);
  const exemptionCount = Math.max(withoutInherited - specialActExcludedCount, 0);
  if (specialActExcludedCount > 0 && exemptionCount < 2) return withoutInherited;
  return exemptionCount;
}

/**
 * 영 §167의10①15호(구 13호) ① 요소 — §155②③(상속주택 + 일반주택)으로 「국내에 1개의 주택을 소유하고 있는
 * 것으로 보아 제154조제1항이 적용되는 주택」인가 (E-14).
 *
 * §155②③ 제외 뒤 1주택이면 ①·④⑤·⑦ 어느 의제 분기에도 걸리지 않으므로 경로를 따로 둔다. 조특법 제외가
 * 섞이면 열지 않는다(`surcharge15HouseCount` 주석 — 확인 필요). 구 13호 신설(대통령령 제31442호) 전
 * 양도분은 경로 없음.
 *
 * 단건(`resolveSurchargeDeemedOneHouse`)과 겸용(`calcMixedUseTransferTax`, E-14d)이 **같은 술어**를 쓴다.
 */
export function inheritedGeneralHouseSurchargeBasis(p: {
  isOneHousehold: boolean;
  /** `surcharge15HouseCount`의 값 */
  houseCount: number;
  inheritedExcludedCount: number;
  specialActExcludedCount: number;
  transferDate: Date;
}): DeemedOneHouseBasis | undefined {
  return p.isOneHousehold &&
    p.houseCount === 1 &&
    p.inheritedExcludedCount > 0 &&
    p.specialActExcludedCount === 0 &&
    p.transferDate >= INHERITED_GENERAL_HOUSE_SURCHARGE_EXCLUSION_EFFECTIVE_DATE
    ? "inherited_general_house"
    : undefined;
}

/**
 * STEP 0.9 + 0.95 실행 — 비과세 판정용 유효 주택수(exemptionJudgeInput) 산정 + step push.
 * @param steps 계산 step 배열 (in-place push)
 */
export function runHouseCountExclusionStep(
  effectiveInput: TransferTaxInput,
  steps: CalculationStep[],
  /**
   * §99의4①·§98의9①의 「취득 전에 보유하던 다른 주택」 판정용 일반주택 취득일 (D4-05).
   *
   * `effectiveInput.acquisitionDate`를 쓰면 **이월과세 시나리오 A** 재귀 계산에서
   * 증여자 취득일(`carryover.ts` `donorAcquisitionDate`)로 판정된다. 두 조문의 「보유」
   * 주체는 **1세대**이고, 소득세법 §97의2①은 취득가액만 의제할 뿐 취득시기를 의제하지
   * 않는다(보유기간 승계는 §95④·§104②의 별도 명문이며 이 요건에는 미적용).
   * STEP 0.45(중과 배제 선판정)가 이미 같은 이유로 원본 `input`을 쓴다.
   *
   * 미제공 시 `effectiveInput.acquisitionDate`로 폴백한다(비-이월과세 경로는 동일값).
   */
  generalHouseAcquisitionDate?: Date,
) {
  // STEP 0.9: §99의4·§98의9 주택수 제외 (소법 §89①3호 의제) — 각 1채씩(D4-01),
  // 비과세·12억 안분·LTHD 표2에 유효 주택수 반영. 중과는 §167의3 별개 — 원본(R-D).
  // STEP 0.95 (P5 모드 2): 보유 감면주택 N-way 주택수 제외 — 7개 조문 ② + §98 령②·⑥ + §99②.
  // 비과세(§89①3호) 판정 주택수만 차감 — 중과 주택수는 원본 유지 (R-D).
  // §155②③ 상속·공동상속주택 비과세 주택수 제외 (2-A2) — 단독(§155②)·공동소수지분(§155③) 풀 분리, 각 최대 1채.
  // 양도(일반)주택이 상속개시 2년내 피상속인 증여분이면 §155② 단독상속 풀만 게이트-오프(L-11 — ③ 풀 무관). 최대지분 공동상속(§155③ 단서)은 산입. 중과 주택수는 불변(R-D).
  // 🔑 selling id 폴백 규칙은 `resolveInheritedHouseExclusionFromInput` 안에만 둔다 —
  //    불성립 사유 안내(`collectInheritedUnmet`)가 같은 후보 집합을 봐야 하기 때문.
  const { hceApplied, new994Detail, unsold989Detail, specialHouseExclusionDetail, inheritedExclusion } =
    resolveExemptionHouseCountExclusions(effectiveInput, generalHouseAcquisitionDate);
  const totalExcluded =
    hceApplied.length + specialHouseExclusionDetail.excludedCount + inheritedExclusion.excludedCount;
  const exemptionJudgeInput = totalExcluded > 0
    ? { ...effectiveInput, householdHousingCount: Math.max(effectiveInput.householdHousingCount - totalExcluded, 0) }
    : effectiveInput;
  // 둘 다 적격이면 §99의4 → §98의9 순으로 각각 1채씩 (D4-01) — 주택 수는 순차 체이닝
  let hceCursor = effectiveInput.householdHousingCount;
  for (const applied of hceApplied) {
    const after = Math.max(hceCursor - 1, 0);
    steps.push(buildHouseCountExclusionStep(applied, hceCursor, after));
    hceCursor = after;
  }
  if (specialHouseExclusionDetail.excludedCount > 0) {
    // 표시는 **증분 체이닝**이다 (D4-07) — 형제 step 둘이 지키는 규약을 감면주택 행만
    // 이탈해 `exemptionJudgeInput.householdHousingCount`(= 원본 − hce − 감면주택 − 상속)를
    // 자기 몫으로 찍고 있었다. 진입 주택수 = 원본 − hce, 나가는 값 = 그 값 − 감면주택수.
    const specialBefore = Math.max(effectiveInput.householdHousingCount - hceApplied.length, 0);
    const specialAfter = Math.max(specialBefore - specialHouseExclusionDetail.excludedCount, 0);
    steps.push({
      label: "보유 감면주택 주택수 제외 (§89①3호 의제)",
      formula: `${specialHouseExclusionDetail.entries.filter((e) => e.eligible).map((e) => e.articleLabel).join(" · ")} — 주택수 ${specialBefore} → ${specialAfter} (비과세 판정 한정 — 중과 주택수 불변)`,
      amount: 0,
      legalBasis: specialHouseExclusionDetail.entries.filter((e) => e.eligible).map((e) => e.legalBasis).join(" · "),
    });
  }
  steps.push(
    ...buildInheritedExclusionSteps(
      inheritedExclusion,
      // 상속 제외 진입 시점 주택수 = 원본 − hce − 감면주택 (단독→공동 순 체이닝은 헬퍼가 처리)
      effectiveInput.householdHousingCount -
        hceApplied.length -
        specialHouseExclusionDetail.excludedCount,
    ),
  );

  return {
    exemptionJudgeInput,
    new994Detail,
    unsold989Detail,
    specialHouseExclusionDetail,
    /**
     * 판정 메뉴(P4-2)의 「주택 수 산정」 명세용 — `buildOneHouseCountBreakdown`이 읽는다.
     * 종전에는 `steps`에 문자열로만 남고 구조화 결과가 밖으로 나오지 않았다.
     * **추가 반환일 뿐** 계산에는 쓰이지 않는다(세액 불변).
     */
    houseCountExclusion: { appliedList: hceApplied, new994Detail, unsold989Detail },
    inheritedExclusion,
  };
}
