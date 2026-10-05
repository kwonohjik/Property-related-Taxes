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
import type { SpecialHouseExclusionResolution } from "./transfer-reductions/unsold-hybrid-p5";
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
  const { appliedList: hceApplied, new994Detail, unsold989Detail, details: hceDetails } = resolveHouseCountExclusion(
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
    hceDetails,
    specialHouseExclusionDetail,
    inheritedExclusion,
    /** 조특법(§99의4·§98의9·보유 감면주택)으로 뺀 수 */
    specialActExcludedCount: hceApplied.length + specialHouseExclusionDetail.excludedCount,
    ...verifiedSpecialAct15Exclusions(specialHouseExclusionDetail, hceApplied),
  };
}

/**
 * 조특법 제외 중 15호·13호의 「「조세특례제한법」에 따라 … 1개의 주택을 소유하고 있는 것으로 보거나」에
 * 든다고 **해석으로 확인된** 조문만 (E-14a) — `SPECIAL_ACT_15HO_VERIFIED_ARTICLES`. 단건·겸용 공용.
 *
 * 두 축을 같은 목록과 대조한다 — 보유 감면주택(STEP 0.95 `entries[].article`)과 §99의4·§98의9(STEP 0.9
 * `hceApplied[].id`). 🔴 종전에는 앞의 것만 대조해 §99의4·§98의9 제외는 늘 「미확인」으로 셌다(2026-10-04).
 */
export function verifiedSpecialAct15Exclusions(
  detail: SpecialHouseExclusionResolution,
  hceApplied: ReadonlyArray<{ id: string; legalBasis: string }>,
): {
  /** 확인된 조문으로 뺀 수 */
  specialActVerified15Count: number;
  /** 그 조문의 인용(표시용) — 중과 배제 사유 detail이 적는다 */
  specialActVerified15Basis: string[];
} {
  const verified = [
    ...hceApplied.filter((d) => SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has(d.id)),
    ...detail.entries.filter((e) => e.eligible && SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has(e.article)),
  ];
  return {
    specialActVerified15Count: verified.length,
    specialActVerified15Basis: verified.map((e) => e.legalBasis),
  };
}

/**
 * 영 §167의10①15호 등 ① 요소 — **확인된** 조특법 감면주택 제외만으로 양도 주택 하나가 남았는가 (E-14a).
 * 상속(§155②③) 제외와 섞이면 열지 않는다(확인 필요). 단건(`resolveSurchargeDeemedOneHouseDetail`)과 겸용이 같은 술어를 쓴다.
 */
export function specialActHouseExclusionBasis(p: {
  isOneHousehold: boolean;
  /** `surcharge15HouseCount`의 값(확인 인자 포함) */
  houseCount: number;
  inheritedExcludedCount: number;
  specialActVerified15Count: number;
  specialActVerified15Basis: string[];
}): { basis: DeemedOneHouseBasis; source: string } | undefined {
  return p.isOneHousehold && p.houseCount === 1 && p.specialActVerified15Count > 0 && p.inheritedExcludedCount === 0
    ? { basis: "special_act_house_exclusion", source: p.specialActVerified15Basis.join("·") }
    : undefined;
}

/**
 * 영 §167의10①15호·§167의3①13호의 「「조세특례제한법」에 따라 1세대가 국내에 1개의 주택을 소유하고 있는 것으로
 * 보거나」에 드는 것으로 **해석이 확인된** 보유 감면주택 조문 (E-14a).
 *
 * - 서면-2023-부동산-0197(부동산납세과-1627, 2023.6.22.) — 조특법 §99의2① 감면주택(A)과 상속주택(B) 보유,
 *   B 양도: 「…A주택은 해당 거주자의 소유주택으로 보지 아니하는 것입니다」 · 「…같은 영 제154조제1항의 요건을
 *   모두 충족하는 경우에는 같은 영 제167조의10제1항제15호에 따라 중과세율을 적용하지 아니하며 장기보유특별공제도
 *   적용할 수 있는 것입니다」.
 * - 아래 조문은 조특법 본문이 §99의2②와 **같은 문형**이다(조특법 MST 284389 실독): 「「소득세법」 제89조제1항
 *   제3호를 적용할 때 제1항을 적용받는 …주택은 해당 거주자의 소유주택으로 보지 아니한다」 — §98의2④·§98의3③·
 *   §98의5②·§98의6②·§98의7②·§98의8②·§99의2② · §99②·§99의3②(「…2007년 12월 31일까지 양도하는 경우에만」).
 * - §97②(「「소득세법」 제89조제1항제3호를 적용할 때 임대주택은 그 거주자의 소유주택으로 보지 아니한다」)·
 *   §97의2②(「…제97조제2항부터 제4항까지의 규정을 준용한다」)도 같은 문형이다(MST 284389 실독 2026-10-02).
 *   §97을 15호·13호에 직접 적용한 해석은 찾지 못했다(taxlaw.nts 검색) — 위 조문들과 같은 기준(같은 문형 +
 *   부동산납세과-1627)으로 넣는다. ⚠️ 중과 **주택 수**에서 빼는 것이 아니다 — 영 §167의3① 본문 괄호는 주택 수
 *   불산입을 1호·12호로 한정하고 §97 임대주택(3호)은 산입된다. 여기서 여는 것은 13호·15호 **배제 사유**뿐이다.
 *
 * - §98의9(준공후미분양)·§99의4(농어촌·고향주택) — `resolveHouseCountExclusion`(STEP 0.9) 축이라 키가 감면 종류
 *   (`hceApplied[].id`)다. 문형은 위와 다르다 — §98의9① 「… 그 준공후미분양주택을 해당 1세대의 소유주택이 아닌 것으로
 *   보아 같은 법 제89조제1항제3호를 적용한다」 · §99의4① 「… 그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아
 *   「소득세법」 제89조제1항제3호를 적용한다」(MST 284389). 두 조문에 15호·13호를 적용한 직접 해석은 찾지 못했다
 *   (국세청 검색 · 계획서 §9.3 E-14a).
 *   - §98의9 — **사용자 결정 2026-10-04** 「§98의9를 13호·15호 단독 축에서도 확인된 것으로」(§99의4와 같은 문형).
 *   - §99의4 — §98의9를 여는 근거가 「§99의4와 같은 문형」이라 함께 연다(리드 판단 2026-10-04 — 사용자 명시 결정은
 *     §98의9뿐). §99의4가 소유주택에서 빠진다는 해석은 서면-2016-법령해석재산-3686(「소유주택에서 제외되므로」) 등.
 *     1호·2호(농어촌·고향)는 같은 항의 한 문장으로 효과를 받는다.
 *
 * ⚠️ **넣지 않은 것**(확인 필요 — 종전 동작 유지):
 * - `unsold_98` — 근거가 법률이 아니라 조특법 **시행령** §98②·⑥(「…다른 주택만을 기준으로 하여 「소득세법」
 *   제89조제1항제3호를 적용한다」)이다. 15호는 「「조세특례제한법」에 따라」라고만 한다.
 *
 * §155⑳ 거주주택 구성 축(`RENTAL_RESIDENCE_VERIFIED_SPECIAL_ACT`)은 별도 목록이다 — 이 목록을 펼쳐 쓴다.
 */
export const SPECIAL_ACT_15HO_VERIFIED_ARTICLES: ReadonlySet<string> = new Set([
  "unsold_98_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_7",
  "unsold_98_8",
  "unsold_99_2",
  "new_99",
  "new_99_3",
  "rental_97",
  "rental_97_2",
  "unsold_98_9",
  "new_99_4_rural",
  "new_99_4_hometown",
]);

/**
 * 영 §167의10①15호(·§167의3①13호) **① 요소** 판정용 세대 주택 수 (E-14).
 *
 * 비과세 E-3이 보는 값(`exemptionJudgeInput.householdHousingCount` — §155②③·조특법 제외 후)과 같다.
 * 단 **확인되지 않은 조특법 제외**(조특령 §98②·⑥ 등 — `SPECIAL_ACT_15HO_VERIFIED_ARTICLES` 밖)가 섞인 채 2 미만이
 * 되는 경우는 그 조특법 주택을 센 값을 쓴다 — 15호의 「「조세특례제한법」에 따라 … 1개의 주택을 소유하고 있는 것으로
 * 보거나」에 드는지 확인되지 않았다(확인 필요) ⇒ 그 축은 종전 동작(조특법 주택이 주택 수에 남은 채 §155 의제를
 * 판정)을 유지한다.
 *
 * E-14a — **해석으로 확인된** 조특법 제외(`verifiedSpecialActExcludedCount` — `SPECIAL_ACT_15HO_VERIFIED_ARTICLES`:
 * 보유 감면주택 같은 문형 조문(부동산납세과-1627) · §98의9·§99의4(2026-10-04))는 빼고 센다. 그래서 그 제외만으로
 * 1이 되면 1이다.
 * 생략하면 0 — 종전 동작과 같다(겸용 경로가 그렇게 부른다).
 */
export function surcharge15HouseCount(
  householdHousingCount: number,
  inheritedExcludedCount: number,
  specialActExcludedCount: number,
  verifiedSpecialActExcludedCount = 0,
): number {
  const withoutInherited = Math.max(householdHousingCount - inheritedExcludedCount, 0);
  const exemptionCount = Math.max(withoutInherited - specialActExcludedCount, 0);
  const unverified = specialActExcludedCount - verifiedSpecialActExcludedCount;
  if (unverified > 0 && exemptionCount < 2) {
    return Math.max(withoutInherited - verifiedSpecialActExcludedCount, 0);
  }
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
  const { hceApplied, new994Detail, unsold989Detail, hceDetails, specialHouseExclusionDetail, inheritedExclusion } =
    resolveExemptionHouseCountExclusions(effectiveInput, generalHouseAcquisitionDate);
  const totalExcluded =
    hceApplied.length + specialHouseExclusionDetail.excludedCount + inheritedExclusion.excludedCount;
  // knownHouseExclusionCount — §155④⑤ 합가 전 구성 판정(`resolveMergeComposition`)이 명부 행 수와
  // 판정 주택수의 불일치를 「알려진 제외로 설명됨(판정 보류)」과 「입력 누락(불성립)」으로 가르는 echo.
  const exemptionJudgeInput = {
    ...effectiveInput,
    ...(totalExcluded > 0
      ? { householdHousingCount: Math.max(effectiveInput.householdHousingCount - totalExcluded, 0) }
      : {}),
    knownHouseExclusionCount: totalExcluded,
  };
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
    /**
     * §99의4·§98의9 **선언 전건**(행 id 포함) — 결과 카드가 「보유 주택 N」마다 그린다(계산기 계획서 Q-6).
     * `new994Detail`·`unsold989Detail`은 각 유형의 첫 선언이라 같은 유형 두 번째 행이 보이지 않았다.
     * **추가 반환일 뿐** 계산에는 쓰이지 않는다(세액 불변).
     */
    houseCountExclusionDetails: hceDetails.length > 0 ? hceDetails : undefined,
    specialHouseExclusionDetail,
    /**
     * 판정 메뉴(P4-2)의 「주택 수 산정」 명세용 — `buildOneHouseCountBreakdown`이 읽는다.
     * 종전에는 `steps`에 문자열로만 남고 구조화 결과가 밖으로 나오지 않았다.
     * **추가 반환일 뿐** 계산에는 쓰이지 않는다(세액 불변).
     */
    houseCountExclusion: { appliedList: hceApplied, new994Detail, unsold989Detail, details: hceDetails },
    inheritedExclusion,
  };
}
