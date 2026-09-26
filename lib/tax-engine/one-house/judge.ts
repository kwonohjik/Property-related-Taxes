/**
 * 1세대1주택 비과세 **공유 판정 엔진** — 진입점 (P2)
 *
 * 계획서 §5.1 · 엔진 설계 「P2 추출 절차 요약」. **세액 불변 리팩터**다 —
 * 판정 로직은 한 줄도 다시 쓰지 않고, 기존 `checkExemption`을 감싸는 **어댑터**만 둔다.
 *
 * ```
 *   판정 메뉴(P4)  ──┐
 *                    ├─→ judgeOneHouseExemption(facts, sale, …) ─→ checkExemption(판정 로직)
 *   양도세 계산기  ──┘        (OneHouseFacts + OneHouseSale → OneHouseJudgeInput)
 * ```
 *
 * 🔑 **계산기도 어댑터를 거친다.** 이미 `TransferTaxInput`을 들고 있으니 그냥 `checkExemption`을
 *    부르면 되지만, 그러면 「판정 메뉴가 넘기는 사실만으로 같은 판정이 나오는가」가 **한 번도
 *    검증되지 않는다**. 계산기를 `TransferTaxInput → OneHouseFacts → OneHouseJudgeInput`
 *    **왕복**시키면, 사실 타입이 빠뜨린 필드는 곧바로 세액 차이로 드러난다 —
 *    P4에서 조용히 다른 답이 나오는 것보다 지금 전체 anchor 앞에서 깨지는 편이 낫다.
 *
 * ⚠️ 이 파일은 **판정하지 않는다**. 판정을 옮기는 것은 P4 착수 시점의 방향 전환이다
 *    (그때 `checkExemption`이 이 파일을 부르는 얇은 래퍼가 된다).
 */
import { checkExemption } from "../transfer-tax-exemption";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import type { OneHouseFacts, OneHouseJudgeInput, OneHouseJudgment, OneHouseSale } from "./types";

/**
 * 사실 + 양도정보 → 판정 서브트리 입력.
 *
 * 🔴 **키 커버리지 가드가 이 함수의 핵심**이다. `OneHouseJudgeInput`의 필드는 전부 optional이라
 *    하나를 빠뜨려도 `tsc`는 통과한다 — 판정만 조용히 달라진다. 그래서 조립을 `satisfies`로 하고
 *    (`feedback_satisfies_preserves_keys_annotation_kills_guard` — 타입 주석을 달면 `keyof`가
 *    넓어져 가드가 상수 참이 된다) 아래에서 키 전수를 강제한다.
 */
export function toOneHouseJudgeInput(facts: OneHouseFacts, sale: OneHouseSale): OneHouseJudgeInput {
  const judgeInput = {
    // ── 양도 대상 자산 ──
    propertyType: facts.propertyType,
    acquisitionDate: facts.acquisitionDate,
    transferDate: sale.transferDate,
    transferPrice: sale.transferPrice,
    totalPropertyTransferPrice: sale.totalPropertyTransferPrice,
    burdenedGiftDenominator: sale.burdenedGiftDenominator,
    isUnregistered: facts.isUnregistered,
    acquisitionCause: facts.acquisitionCause,
    nonHousingToHousingConversion: facts.nonHousingToHousingConversion,
    oneHouseUnitRole: facts.oneHouseUnitRole,
    appurtenantHouseVerdict: facts.appurtenantHouseVerdict,
    // ── 세대 — `household` 묶음을 TransferTaxInput 형태로 되돌린다 ──
    isOneHousehold: facts.household.isOneHousehold,
    householdHousingCount: facts.household.householdHousingCount,
    marriageMerge:
      facts.household.marriageDate !== undefined
        ? { marriageDate: facts.household.marriageDate }
        : undefined,
    parentalCareMerge:
      facts.household.parentalCareMergeDate !== undefined
        ? { mergeDate: facts.household.parentalCareMergeDate }
        : undefined,
    isFirstTransferredInMerge: facts.household.isFirstTransferredInMerge,
    // ── 거주·지역 ──
    residencePeriodMonths: sale.residencePeriodMonths,
    residenceTransitionAcquisitionDate: facts.residenceTransitionAcquisitionDate,
    isRegulatedArea: facts.isRegulatedArea,
    wasRegulatedAtAcquisition: facts.wasRegulatedAtAcquisition,
    regionCode: facts.regionCode,
    // ── 상속 ──
    decedentSameHouseholdBeforeInheritance: facts.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationResidenceMonths: facts.decedentCohabitationResidenceMonths,
    decedentCohabitationHoldingStartDate: facts.decedentCohabitationHoldingStartDate,
    generalHouseHeldAtInheritance: facts.generalHouseHeldAtInheritance,
    generalHouseGiftedFromDecedentWithin2yr: facts.generalHouseGiftedFromDecedentWithin2yr,
    generalHouseGiftDate: facts.generalHouseGiftDate,
    generalHouseRightAtInheritance: facts.generalHouseRightAtInheritance,
    // ── §154① 단서 · §155 각 항 ──
    oneHouseExemptionProviso: facts.oneHouseExemptionProviso,
    temporaryTwoHouse: facts.temporaryTwoHouse,
    ruralHouse: facts.ruralHouse,
    unavoidableOutsideCapitalHouse: facts.unavoidableOutsideCapitalHouse,
    culturalHeritageHouse: facts.culturalHeritageHouse,
    // ── §155의2 · §155의3 ──
    longTermMortgageHouse: facts.longTermMortgageHouse,
    winWinRentalHouse: facts.winWinRentalHouse,
    // ── §89② · §156의2 · §156의3 ──
    houses: facts.houses,
    presaleRights: facts.presaleRights,
    sellingHouseId: facts.sellingHouseId,
    replacementHouse: facts.replacementHouse,
    rightThreeYearException: facts.rightThreeYearException,
    mergedHouseholdFirstHouse: facts.mergedHouseholdFirstHouse,
    inheritedRightChoiceWhenBothHeld: facts.inheritedRightChoiceWhenBothHeld,
  } satisfies OneHouseJudgeInput;

  /**
   * ⚠️ 이 가드가 보는 것은 **키의 존재뿐**이다 — 값을 엉뚱한 곳에서 가져와도 통과한다.
   *    그래서 왕복 anchor(`one-house-judge-extraction.anchor.test.ts`)와 685케이스 스냅샷 대조가
   *    함께 있어야 한다(`feedback_mutation_zero_discrimination_is_not_proof`).
   */
  type _Assembled = typeof judgeInput;
  const _judgeInputKeyCoverage: [
    Exclude<keyof OneHouseJudgeInput, keyof _Assembled> extends never ? true : never,
  ] = [true];
  void _judgeInputKeyCoverage;

  return judgeInput;
}

/**
 * 계산기 입력에서 **판정 사실**만 뽑는다 — 판정 메뉴가 넘기는 것과 같은 모양(D-3).
 *
 * 🔴 여기서도 키 커버리지를 강제한다. `OneHouseFacts`에 필드가 늘었는데 이 함수가 안 채우면
 *    계산기 경로에서만 조용히 `undefined`가 되어, 판정 메뉴와 **다른 답**이 나온다.
 */
export function extractOneHouseFacts(input: OneHouseJudgeInput): OneHouseFacts {
  const household = {
    isOneHousehold: input.isOneHousehold,
    householdHousingCount: input.householdHousingCount,
    marriageDate: input.marriageMerge?.marriageDate,
    parentalCareMergeDate: input.parentalCareMerge?.mergeDate,
    isFirstTransferredInMerge: input.isFirstTransferredInMerge,
  } satisfies OneHouseFacts["household"];

  const facts = {
    household,
    propertyType: input.propertyType,
    acquisitionDate: input.acquisitionDate,
    acquisitionCause: input.acquisitionCause,
    isUnregistered: input.isUnregistered,
    nonHousingToHousingConversion: input.nonHousingToHousingConversion,
    oneHouseUnitRole: input.oneHouseUnitRole,
    appurtenantHouseVerdict: input.appurtenantHouseVerdict,
    isRegulatedArea: input.isRegulatedArea,
    wasRegulatedAtAcquisition: input.wasRegulatedAtAcquisition,
    regionCode: input.regionCode,
    residenceTransitionAcquisitionDate: input.residenceTransitionAcquisitionDate,
    decedentSameHouseholdBeforeInheritance: input.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationResidenceMonths: input.decedentCohabitationResidenceMonths,
    decedentCohabitationHoldingStartDate: input.decedentCohabitationHoldingStartDate,
    generalHouseHeldAtInheritance: input.generalHouseHeldAtInheritance,
    generalHouseGiftedFromDecedentWithin2yr: input.generalHouseGiftedFromDecedentWithin2yr,
    generalHouseGiftDate: input.generalHouseGiftDate,
    generalHouseRightAtInheritance: input.generalHouseRightAtInheritance,
    oneHouseExemptionProviso: input.oneHouseExemptionProviso,
    temporaryTwoHouse: input.temporaryTwoHouse,
    ruralHouse: input.ruralHouse,
    unavoidableOutsideCapitalHouse: input.unavoidableOutsideCapitalHouse,
    culturalHeritageHouse: input.culturalHeritageHouse,
    longTermMortgageHouse: input.longTermMortgageHouse,
    winWinRentalHouse: input.winWinRentalHouse,
    houses: input.houses,
    presaleRights: input.presaleRights,
    sellingHouseId: input.sellingHouseId,
    replacementHouse: input.replacementHouse,
    rightThreeYearException: input.rightThreeYearException,
    mergedHouseholdFirstHouse: input.mergedHouseholdFirstHouse,
    inheritedRightChoiceWhenBothHeld: input.inheritedRightChoiceWhenBothHeld,
  } satisfies OneHouseFacts;

  type _Facts = typeof facts;
  type _Household = typeof household;
  const _factsKeyCoverage: [
    Exclude<keyof OneHouseFacts, keyof _Facts> extends never ? true : never,
    // 🔴 상위 가드는 **중첩 객체 안을 못 본다** — `household`는 따로 끌어올려 가드한다.
    Exclude<keyof OneHouseFacts["household"], keyof _Household> extends never ? true : never,
  ] = [true, true];
  void _factsKeyCoverage;

  return facts;
}

/** 계산기 입력에서 **양도 정보**만 뽑는다. */
export function extractOneHouseSale(input: OneHouseJudgeInput): OneHouseSale {
  const sale = {
    transferDate: input.transferDate,
    transferPrice: input.transferPrice,
    totalPropertyTransferPrice: input.totalPropertyTransferPrice,
    burdenedGiftDenominator: input.burdenedGiftDenominator,
    residencePeriodMonths: input.residencePeriodMonths,
  } satisfies OneHouseSale;

  type _Sale = typeof sale;
  const _saleKeyCoverage: [Exclude<keyof OneHouseSale, keyof _Sale> extends never ? true : never] = [
    true,
  ];
  void _saleKeyCoverage;

  return sale;
}

/**
 * 1세대1주택 비과세 판정 — **판정 메뉴와 계산기의 공통 진입점**(D-1).
 *
 * @param oneHouseRules `tax_rates` `special:one_house_exemption` 파싱본. 설계 초안은 `rates:
 *   TaxRatesMap`이라고 적었지만, 계산기는 이미 `parsedRates`를 들고 있어 여기서 다시 파싱하면
 *   같은 일을 두 번 한다 — 파싱본을 그대로 받는다.
 * @param presaleRightStartDate §88 10호 「분양권」 정의 시행일. 미제공 시 분양권 축은
 *   **판정하지 않는다**(기산일을 모르는 채 불리하게 적용하지 않는다).
 */
export function judgeOneHouseExemption(
  facts: OneHouseFacts,
  sale: OneHouseSale,
  oneHouseRules: OneHouseSpecialRulesData,
  presaleRightStartDate?: Date,
): OneHouseJudgment {
  const judgeInput = toOneHouseJudgeInput(facts, sale);
  return checkExemption(judgeInput, oneHouseRules, presaleRightStartDate);
}

/**
 * 계산기 경로 — `TransferTaxInput`을 **사실로 분해했다가 다시 조립해** 판정한다.
 *
 * 왕복시키는 이유는 위 파일 머리 주석에 적었다: 이 한 줄이 「판정 메뉴가 넘기는 사실만으로
 * 계산기와 같은 세액이 나온다」를 **매 테스트마다** 증명한다.
 */
export function judgeOneHouseExemptionFromInput(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  presaleRightStartDate?: Date,
): OneHouseJudgment {
  return judgeOneHouseExemption(
    extractOneHouseFacts(input),
    extractOneHouseSale(input),
    oneHouseRules,
    presaleRightStartDate,
  );
}
