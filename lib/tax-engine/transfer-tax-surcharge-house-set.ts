/**
 * STEP 0.5 다주택 중과 판정의 **주택 집합 조립** — 명부 · 명부 없는 구성 행(§155⑳ 거주주택 · §155①⑦ 의제 ·
 * §155⑳ 불성립 임대 호 · 권리 보유 1주택 세대의 양도 행)과 15호(13호) ① 요소 의제 판정.
 *
 * `transfer-tax-judgment-steps.ts` 800줄 정책에 따라 분리(2026-11-23). 판정 단계(`runMultiHouseSurchargeStep`)는
 * 그 파일에 남고, 외부 import 경로 호환을 위해 그 파일이 이 모듈을 재수출한다.
 */
import type { TransferTaxInput } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import {
  resolveDeemedOneHouseBy155,
  presaleRightStartDate,
} from "./transfer-tax-helpers";
import { resolveArticle89Clause2 } from "./transfer-tax-89-2-exclusion";
import { clause2BlocksSurchargeDeeming, clause2SurchargeDeemed } from "./transfer-tax-89-2-consequences";
import {
  judgeRentalHousingEligibility,
  rentalUnitsToRestore,
  surchargeDeemingHouseCount,
} from "./transfer-tax-rental-housing-judge";
import { rentalCardSurchargeRows } from "./rental-card-surcharge-rows";
import { resolveRentalResidenceComposition } from "./transfer-tax-rental-residence-composition";
import {
  resolveExemptionHouseCountExclusions,
  surcharge15HouseCount,
  inheritedGeneralHouseSurchargeBasis,
  specialActHouseExclusionBasis,
  culturalOrUnavoidableDeemingBasis,
} from "./transfer-tax-house-exclusion-step";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";
import { classifyRegionCriteriaByCode } from "./multi-house-surcharge-count";
import { translateRedevAptForHousingJudgment } from "./one-house/redev-apt-judgment-input";
import { hasNoMergeRosterInputPath } from "./one-house/roster-input-path";
import { isSurchargeFallbackPropertyType } from "./transfer-tax-surcharge-predicate";

/**
 * 영 §167의10①15호(·§167의3①13호) **① 요소** — 「제155조 … 에 따라 1세대가 국내에 1개의 주택을 소유하고
 * 있는 것으로 보거나 1세대 1주택으로 보아 제154조제1항이 적용되는 주택」 (E-14).
 *
 * 🔴 종전에는 **원시 세대 주택 수**로 `resolveDeemedOneHouseBy155`를 불렀고, 그 함수의 §155① 분기는 주택 수를
 *    보지 않았다. 3주택 세대(강남 2채 + 지방 기준시가 2억 1채)에서 명부 도출이 중과 불산입 주택(영 §167의3①1호)을
 *    「신규 주택」으로 골라 15호가 성립했다 — 세대는 §155 기준 3주택이라 비과세도 과세인데(부동산납세과-1179,
 *    2018.12.12. 「1세대 3주택자가 해당 주택을 양도하는 경우에는 같은 호가 적용되지 아니하는 것」).
 * ⇒ 비과세 정본과 **같은 주택 수**(§155②③·조특법 제외 후 — `surcharge15HouseCount`)로 판정한다.
 *
 * §155②③(상속주택 + 일반주택)은 주택 수가 1로 줄어 ①·④⑤·⑦ 어느 분기에도 걸리지 않는다. 종전에는 상속주택이
 * 「신규 주택」으로 도출되고 1년·3년 타이밍이 맞을 때만 §155① 분기로 **우연히** 덮였다 ⇒ 경로를 따로 둔다.
 * 조특법 제외가 섞이면 이 경로를 열지 않는다(`surcharge15HouseCount` 주석 — 확인 필요).
 *
 * E-14a·c — 경로 셋을 더했다(모두 비과세 쪽과 **같은 술어**를 부른다):
 * - 조특법 감면주택 제외로 1주택(`special_act_house_exclusion`) — 해석으로 확인된 조문만(부동산납세과-1627).
 * - §155⑳ 거주주택(`long_term_rental_residence`) — `judgeRentalHousingEligibility`(STEP 2.5와 같은 판정).
 * - §156의2·§156의3(`house_with_*_right`) — `resolveArticle89Clause2`(STEP 1 `checkExemption`과 같은 판정).
 * 어느 호가 받는지(15호 · 13호 · §167의11①13호 · §167의4③7호)는 중과 엔진이 주택·권리 수로 정한다.
 */
export function resolveSurchargeDeemedOneHouse(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): DeemedOneHouseBasis | undefined {
  return resolveSurchargeDeemedOneHouseDetail(workingInput, parsedRates, generalHouseAcquisitionDate)?.basis;
}

/**
 * `resolveSurchargeDeemedOneHouse` + 표시용 근거 조문(조특법 감면주택·§156의2·§156의3 경로만)
 * + 구 §167의11①1호 인용 범위(`citedByOldClause1` — §156의2③④·§156의3②③ 직접 경로, E-14f).
 */
export function resolveSurchargeDeemedOneHouseDetail(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): { basis: DeemedOneHouseBasis; source?: string; citedByOldClause1?: boolean; restsOnInheritedExclusion?: boolean } | undefined {
  // 🔴 주택 수 제외는 번역 **전** 원본을 본다 — 상속주택 제외(E-8)가 입주권 취득일과 준공일을 따로 받는다.
  const ex = resolveExemptionHouseCountExclusions(workingInput, generalHouseAcquisitionDate);
  const inheritedExcluded = ex.inheritedExclusion.excludedCount;
  /**
   * 🔴 §155⑳ A가 **불성립**이면 임대주택을 더한 수로 판정한다 (결정 #20 G8-1 — 비과세 STEP 0.96과 같은 규칙 `rentalUnitsToRestore`).
   * 종전에는 임대주택을 뺀 수로 §155①②·조특법 의제를 세워 중과를 배제했다 — 요건(호별·거주)을 못 갖췄거나 3중첩이라 비과세는 거둬도
   * 중과 배제는 남았다(STEP 0.5가 STEP 0.96·D12 회수보다 먼저 돌아 두 철회가 닿지 않았다). 영 §155⑳은 요건을 충족한 때만 「1개의 주택을
   * 소유하고 있는 것으로 보아」이므로 불성립이면 임대주택도 주택이고 §155①·②의 「1주택」이 서지 않는다(조심 2021서1571).
   * 중과 주택 수 자체는 STEP 0.5가 카드 행을 명부에 더해 반영한다(`unmetRentalSurchargeHouses` — 결정 #20 C).
   */
  const count = surchargeDeemingHouseCount(
    workingInput,
    parsedRates,
    generalHouseAcquisitionDate,
    surcharge15HouseCount(
      workingInput.householdHousingCount,
      inheritedExcluded,
      ex.specialActExcludedCount,
      ex.specialActVerified15Count,
    ),
  );
  /**
   * 🔴 **재개발 완공APT는 비과세 판정(`judgeRedevAptOneHouseExemption`)과 같은 번역을 거친 입력으로 판정한다**
   * (G8-4). 번역하지 않으면 §89② 게이트(`resolveArticle89Clause2`)가 `propertyType !== "housing"`이라 늘
   * `not_applicable`이고(→ §89②로 비과세가 꺼진 세대에 중과 배제가 서고, §156의2·§156의3 예외 의제는 열리지
   * 않는다), §155① 종전주택 요건(`meetsOneHouseHoldingResidence`)이 승계조합원의 입주권 취득일·Step4 거주값을
   * 읽는다(비과세는 준공일 기준 보유 미달인데 ① 요소는 충족). 완공APT가 아니면 입력 그대로(동일 참조)다.
   */
  const judgedInput = translateRedevAptForHousingJudgment(workingInput);
  /**
   * 「소득세법」 §89② — 주택과 조합원입주권·분양권을 함께 보유하면 §89①3호(§154①)를 적용하지 않는다(단서 예외는
   * 영 §156의2·§156의3). 그러면 §155 의제가 서도 「제154조제1항이 적용되는 주택」이 아니다 ⇒ 비과세 정본
   * (`checkExemption`)과 같은 술어로 먼저 거른다. 판정 보류(`undetermined` — 예외 사실을 입력받을 경로가 없는 조합)는
   * 비과세가 종전 동작(적용)을 유지하고 경고하지만, 중과 배제까지 그 가정에 기대지 않는다(확인 필요 — 종전 동작).
   */
  const clause2 = resolveArticle89Clause2(
    // 주택 수에서 이미 빠진 행은 §89② 단서의 특수주택(이농주택·국가유산주택)으로 다시 쓰지 않는다 — 비과세와 같은 대조(NH-12 · V-14).
    { ...judgedInput, householdHousingCount: count, knownHouseExclusionHouseIds: ex.knownHouseExclusionHouseIds },
    presaleRightStartDate(parsedRates),
  );
  if (clause2BlocksSurchargeDeeming(clause2)) return undefined;

  // knownHouseExclusionCount·knownHouseExclusionHouseIds·noMergeRosterInputPath — 비과세
  // STEP 0.9/0.95·transfer-tax.ts와 같은 값(§155④⑤ 합가 전 구성 판정 echo) — 부담부증여는
  // 비과세·중과 배제가 같은 결론을 내야 한다.
  const deemed = resolveDeemedOneHouseBy155(
    {
      ...judgedInput,
      householdHousingCount: count,
      knownHouseExclusionCount: inheritedExcluded + ex.specialActExcludedCount,
      inheritedHouseExclusionCount: inheritedExcluded,
      knownHouseExclusionHouseIds: ex.knownHouseExclusionHouseIds,
      noMergeRosterInputPath: hasNoMergeRosterInputPath(workingInput),
    },
    parsedRates.oneHouseSpecialRules,
  );
  // ②③ 상속 제외 뒤 ⑦(농어촌)·⑥·⑧이 겹친 2중첩은 해석 미확보 확인 필요를 단다(#16 — `overlap-notice.ts`).
  const restsOnInherited = inheritedExcluded > 0;
  if (deemed) return { basis: deemed, ...(restsOnInherited && deemed === "rural_house" ? { restsOnInheritedExclusion: true } : {}) };
  const inherited = inheritedGeneralHouseSurchargeBasis({
    isOneHousehold: workingInput.isOneHousehold,
    houseCount: count,
    inheritedExcludedCount: inheritedExcluded,
    specialActExcludedCount: ex.specialActExcludedCount,
    specialActVerified15Count: ex.specialActVerified15Count,
    transferDate: workingInput.transferDate,
  });
  if (inherited) return { basis: inherited };
  // #16(G8-3) — 상속·조특법 제외로 2주택이 된 세대의 §155⑥·⑧ 의제. 비과세 E-3.6·E-3.7과 같은 술어다.
  const culturalOrUnavoidable = culturalOrUnavoidableDeemingBasis({
    isOneHousehold: workingInput.isOneHousehold,
    houseCount: count,
    rawHouseCount: workingInput.householdHousingCount,
    inheritedExcludedCount: inheritedExcluded,
    specialActExcludedCount: ex.specialActExcludedCount,
    transferDate: workingInput.transferDate,
    culturalHeritageHouse: workingInput.culturalHeritageHouse,
    culturalHeritageHouseId: workingInput.culturalHeritageHouseId,
    unavoidableOutsideCapitalHouse: workingInput.unavoidableOutsideCapitalHouse,
    knownHouseExclusionHouseIds: ex.knownHouseExclusionHouseIds,
  });
  if (culturalOrUnavoidable) {
    return { basis: culturalOrUnavoidable, ...(restsOnInherited ? { restsOnInheritedExclusion: true } : {}) };
  }
  // E-14a — 확인된 조특법 제외만으로 양도 주택 하나가 남았다(상속 제외와 섞이면 열지 않는다 — 확인 필요).
  const special = specialActHouseExclusionBasis({
    isOneHousehold: workingInput.isOneHousehold,
    houseCount: count,
    inheritedExcludedCount: inheritedExcluded,
    specialActVerified15Count: ex.specialActVerified15Count,
    specialActVerified15Basis: ex.specialActVerified15Basis,
  });
  if (special) return special;
  if (qualifiesRentalResidenceDeeming(workingInput, parsedRates, generalHouseAcquisitionDate)) {
    return { basis: "long_term_rental_residence" };
  }
  // §156의2·§156의3 예외 충족 → `house_with_*_right`(겸용 단건 엔진과 같은 leaf — E-7). ⑤ 대체주택은 받지 않는다.
  return clause2SurchargeDeemed(clause2);
}

/**
 * §155⑳ 거주주택 1주택 의제 — 영 §167의10①15호(구 14호)·§167의3①13호 ① 요소 (E-14c).
 *
 * 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대가 … 해당 1주택("거주주택")을 양도하는 경우
 * … 국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」(영 §155⑳ · MST 286211).
 * 요건 판정은 STEP 2.5(세액)와 **같은 함수**(`judgeRentalHousingEligibility`)다.
 *
 * 세대 구성(「그 밖의 1주택」) — 비과세 STEP 2.5와 **같은 판정**(`resolveRentalResidenceComposition`)이다(E-14h).
 * `met`일 때만 연다 — §155① 중첩은 사전-2021-법령해석재산-1719(「…같은 영 제167조의3제1항제13호에 따라
 * 중과세율을 적용하지 아니하며…」), §155② 중첩은 비과세를 인정한 사전-2025-법규재산-0162에 15호·13호의 공통 꼬리
 * (「제155조 … 에 따라 … 1세대 1주택으로 보아 제154조제1항이 적용되는 주택」)가 그대로 걸린다.
 * §155③·④⑤·⑦3호·조특법(§99의2와 같은 문형 조문·§99의4) 겹침도 `met`이면 연다 — 비과세 회신(composition 표)의
 * 「1세대1주택으로 보아 제154조제1항을 적용」이 15호·13호 꼬리에 걸린다는 **법문 추론**이고, 그 겹침에서 13호·15호를
 * 직접 다룬 회신은 없다(사용자 결정 Q1(가) 2026-10-04 — 연다).
 * 판정 보류(`undetermined` — 명부 없음)는 열지 않는다(확인 필요 — 종전 동작).
 * 시나리오 B(직전거주주택보유주택 — 「직전거주주택의 양도일 후의 기간분에 대해서만」)는 과세 기간분이 중과되는지
 * 해석을 확보하지 못했다 → 열지 않는다(사용자 결정 2026-10-14: 현행 유지 — 중과를 적용하고 확인 필요를 알린다,
 * `prhpSurchargeUnverifiedNotice`). 재제안하지 말 것 — 임대 제외 주택 수 1 입력은 중과가 붙지 않는 불일치도 그 결정에 포함된다.
 */
function qualifiesRentalResidenceDeeming(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): boolean {
  const rhe = workingInput.rentalHousingException;
  if (!workingInput.isOneHousehold || workingInput.isUnregistered) return false;
  if (rhe?.applyException !== true || rhe.scenario !== "A") return false;
  if (judgeRentalHousingEligibility(workingInput)?.passed !== true) return false;
  return resolveRentalResidenceComposition(workingInput, parsedRates, generalHouseAcquisitionDate).status === "met";
}

/**
 * 명부(`houses[]`) 없이 §155⑳ 거주주택 의제가 선 세대 — 정밀 중과 판정에 넘길 행을 입력된 사실로 구성한다.
 *
 * 🔴 종전에는 명부가 없으면 STEP 0.5가 돌지 않아 원시 플래그(조정지역 · 세대 주택 수 ≥ 2)로 중과가 붙었다.
 *    같은 세대를 명부에 입력하면 15호(영 §167의10①15호 「제155조 … 에 따라 … 1세대 1주택으로 보아 제154조제1항이
 *    적용되는 주택으로서 같은 항의 요건을 모두 충족하는 주택」)로 배제되는데(102,086,600), 명부가 없으면 같은 사실에
 *    2주택 중과(167,360,600)였다.
 *
 * 열리는 조건 — `qualifiesRentalResidenceDeeming`(§155⑳ 요건 판정 통과 + 세대 구성 `met`). 명부 없는 `met`은
 * 「세대 주택 수 = 거주주택 1 + 임대주택 카드 수」일 때만이다(`resolveRentalResidenceComposition`). 그 밖에는
 * 종전대로 원시 플래그다.
 *
 * 행 구성 — 모르는 사실은 **불리한 쪽**으로 둔다(사용자 결정 2026-10-04):
 * - 양도 주택: 명부 경로 ④(`buildHousesPayload`)의 양도 행과 같은 원천(취득일 · 양도 당시 기준시가 · 법정동코드).
 * - 임대주택(카드마다 1행): 소재지·양도 당시 기준시가를 모른다 → 지역기준(REGION, 무조건 산입)으로 둔다
 *   (§167의10① 본문 괄호 1호 불산입을 주지 않는다). 영 §167의3①2호 사실(유형 매트릭스)이 없으므로 10호 판정에서
 *   빠지지 않는다. 취득일을 모른다 → 양도일로 둔다(합가 차감 단서 「혼인 후 취득」에 걸리는 쪽).
 *   이 셋은 15호(13호)가 서면 결론을 바꾸지 않는다 — 배제의 근거는 양도 주택의 의제다.
 */
function noRosterRentalResidenceHouses(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): NonNullable<TransferTaxInput["houses"]> | undefined {
  if (!qualifiesRentalResidenceDeeming(workingInput, parsedRates, generalHouseAcquisitionDate)) return undefined;
  const selling = noRosterSellingHouse(workingInput);
  const rentals = workingInput.rentalHousingException!.rentalUnits.map((u, i) => ({
    id: `no-roster-rental-${i + 1}`,
    acquisitionDate: workingInput.transferDate,
    officialPrice: 0,
    region: "capital" as const,
    regionCriteria: "REGION" as const,
    isInherited: false,
    isLongTermRental: true,
    isApartment: u.isApartment,
    isOfficetel: false,
    isUnsoldHousing: false,
  }));
  return [selling, ...rentals];
}

/** 명부 없는 구성의 양도 주택 행 — 명부 경로 ④(`buildHousesPayload`)의 양도 행과 같은 원천(취득일 · 양도 당시 기준시가 · 법정동코드). */
function noRosterSellingHouse(workingInput: TransferTaxInput): NonNullable<TransferTaxInput["houses"]>[number] {
  const regionCode = workingInput.regionCode || undefined;
  return {
    id: "selling",
    acquisitionDate: workingInput.acquisitionDate,
    // 양도 당시 기준시가 — ④가 전용 키로 싣는다(실가 모드는 `standardPriceAtTransfer`를 싣지 않는다). 옛 본문은 종전 키로 후퇴.
    officialPrice: workingInput.sellingHouseStdPriceAtTransfer ?? workingInput.standardPriceAtTransfer ?? 0,
    region:
      regionCode && classifyRegionCriteriaByCode(regionCode) === "VALUE" ? ("non_capital" as const) : ("capital" as const),
    regionCode,
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
  };
}

/**
 * §155⑳ **불성립** — 카드의 임대 호를 중과 판정 명부에 더한다(결정 #20 C · 사용자 결정 2026-10-12 A·B 모두).
 *
 * 불성립이면 임대주택은 그냥 주택이라 중과 주택 수에 들어간다(영 §167의3① 본문 · §167의10① 본문, 조심 2021서1571).
 * 2호 장기임대주택이면 중과 대상에서 빠지고 주택 수에는 남으며, 그것을 빼고 남은 주택이 양도 주택 하나면 10호로 배제된다 —
 * 2호 여부는 중과 술어로 판정한다(`rentalCardSurchargeRows`).
 *
 * 되돌림 규칙은 비과세(STEP 0.96)·① 요소와 같은 `rentalUnitsToRestore`다(이중 계상 방지):
 * - 명부가 있으면 장기임대로 표시한 행이 없을 때만 → 명부 + 카드 행.
 * - 명부가 없으면 세대 주택 수가 정확히 1일 때만 → 양도 주택 + 카드 행. 2 이상은 임대주택이 이미 들어 있는 수로 보아
 *   (결정 #20 하위 가) 종전대로 원시 플래그로 판정한다.
 */
function unmetRentalSurchargeHouses(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate: Date | undefined,
  roster: NonNullable<TransferTaxInput["houses"]> | undefined,
): NonNullable<TransferTaxInput["houses"]> | undefined {
  const restore = rentalUnitsToRestore({
    effectiveInput: workingInput,
    parsedRates,
    generalHouseAcquisitionDate,
    judgeHouseCount: workingInput.householdHousingCount,
    scenarios: ["A", "B"],
  });
  if (!restore) return undefined;
  const rows = rentalCardSurchargeRows(workingInput.rentalHousingException!.rentalUnits, workingInput.transferDate);
  return [...(roster ?? [noRosterSellingHouse(workingInput)]), ...rows];
}

/**
 * 명부(`houses[]`) 없이 §155①(일시적 2주택)·⑦(농어촌주택) 의제 또는 조특법 제외만의 1주택 의제
 * (`special_act_house_exclusion`)가 선 세대 — 정밀 중과 판정에 넘길 행을 입력된 사실로 구성한다(사용자 결정
 * 2026-10-04 — #1955 「알게 된 것」, 선례 `noRosterRentalResidenceHouses`).
 *
 * 🔴 종전에는 명부가 없으면 원시 플래그로 2주택 중과가 붙었다 — 강남 20억 §155①: 명부 없음 422,521,000 ·
 *    같은 세대를 명부에 입력하면 15호(영 §167의10①15호) 배제로 102,086,600.
 * 🔴 #1958은 원시 세대 주택 수 2만 열었다 — 3채 중 1채가 조특법 §99의4로 비과세 주택 수에서 빠져 §155①이 선 세대는
 *    명부 없음 497,046,000 + 고지 · 명부 입력 13호(영 §167의3①13호) 102,086,600이었다(사용자 결정 2026-10-04
 *    「정밀 판정으로 열어라」).
 * 🔴 #1965는 §155①⑦ 의제만 열었다 — 2채 중 1채가 확인된 조특법 제외(§99의4 등)라 제외만으로 1주택이 된 세대
 *    (의제 `special_act_house_exclusion` — §155① 아님)는 명부 없음 422,521,000 + 고지 · 명부 입력 15호 102,086,600
 *    이었다(사용자 결정 2026-10-04 「정밀 판정으로 열어라」). 이 의제는 다른 주택 행 없이 양도 주택 + 확인 제외 주택
 *    행으로 구성한다(제외 후 주택 수 1 — `specialActHouseExclusionBasis`).
 *
 * 열리는 조건 — 의제는 STEP 0.5가 주입하는 것과 **같은 정본**(`resolveSurchargeDeemedOneHouse` →
 * `resolveDeemedOneHouseBy155` · `specialActHouseExclusionBasis`)으로 본다. 세대 주택 수가 의제 구성(종전 + 신규 ·
 * 일반 + 농어촌 = 2채 · 조특법 제외만이면 양도 주택 1채)과
 * **해석으로 확인된** 조특법 제외 주택(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES` — §99의4·§98의9 감면 선언 ·
 * 보유 감면주택)의 합과 맞을 때만 연다 — 맞지 않으면(그 밖의 주택) 의제가 서지 않는다. 확인되지 않은 조문의 제외가
 * 하나라도 있으면(`specialActExcludedCount`가 확인 수보다 크다) 열지 않는다. 미등기는 #1947과 같이 열지 않는다.
 *
 * 다른 주택·제외 주택 행 — 모르는 사실은 **불리한 쪽**(#1947과 같은 원칙):
 * - 소재지·양도 당시 기준시가 → 지역기준(REGION, 무조건 산입 — 1호 불산입을 주지 않는다).
 * - 영 §167의3①2호~8호의2 사실(장기임대·상속 5년 등) → 없음(10호 판정에서 빠지지 않는다).
 * - 취득일 → §155① 신규 주택 취득일(입력) · §155⑦ 3호 귀농주택 취득일(입력), 그 밖에(제외 주택 포함) 양도일.
 * 산입 여부(1호 불산입)만은 「불리한 쪽」이 시기마다 다르다 — 2023.2.28. 전 양도분은 3채로 세면 13호가 받지만
 * 2채로 세면 15호가 없어 중과된다. 그래서 `runMultiHouseSurchargeStep`이 산입 수의 모든 경우에 중과가 배제될 때만
 * 결과를 쓴다. 15호·13호가 서지 않으면(§154① 요건 미충족 · 시기) 결론이 그 모르는 사실에 달리므로 정밀 판정을
 * 쓰지 않는다(원시 플래그 + `noRosterSurchargeFallbackNotice` 고지, 종전 동작).
 */
function noRosterTwoHouseDeemingHouses(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): NonNullable<TransferTaxInput["houses"]> | undefined {
  if (workingInput.isUnregistered) return undefined;
  const ex = resolveExemptionHouseCountExclusions(workingInput, generalHouseAcquisitionDate);
  const excluded = ex.specialActVerified15Count;
  // 세대 주택 수 = 2 + 확인 제외 수는 아래 의제에 이미 들어 있다 — §155①⑦ 의제는 제외 후 주택 수 2를 요구하고
  //   (`resolveDeemedOneHouseBy155`), 제외가 모두 확인 조문이면 그 수는 원시 수 − 확인 제외 수다(`surcharge15HouseCount`).
  if (ex.specialActExcludedCount !== excluded) return undefined;
  const basis = resolveSurchargeDeemedOneHouse(workingInput, parsedRates, generalHouseAcquisitionDate);
  const otherAcquisitionDate =
    basis === "temporary_two_house"
      ? workingInput.temporaryTwoHouse?.newAcquisitionDate
      : basis === "rural_house"
        ? (workingInput.ruralHouse?.acquisitionDate ?? workingInput.transferDate)
        : undefined;
  // 조특법 제외만으로 1주택(영 §167의10①15호 「「조세특례제한법」에 따라 … 1개의 주택」) — 확인 제외 주택 말고
  //   다른 주택이 없다(`specialActHouseExclusionBasis` — 제외 후 주택 수 1).
  const specialActOnly = basis === "special_act_house_exclusion";
  if (!otherAcquisitionDate && !specialActOnly) return undefined;
  const unknownHouse = (id: string, acquisitionDate: Date) => ({
    id,
    acquisitionDate,
    officialPrice: 0,
    region: "capital" as const,
    regionCriteria: "REGION" as const,
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
  });
  return [
    noRosterSellingHouse(workingInput),
    ...(otherAcquisitionDate ? [unknownHouse("no-roster-other", otherAcquisitionDate)] : []),
    ...Array.from({ length: excluded }, (_, i) =>
      unknownHouse(`no-roster-special-act-${i + 1}`, workingInput.transferDate),
    ),
  ];
}

/**
 * 명부(`houses[]`) 없이 조합원입주권·분양권(`presaleRights`)만 보낸 1주택 세대 — 양도 주택 한 행으로 정밀 판정에 넘긴다.
 *
 * 🔴 종전에는 명부가 없으면 원시 플래그(세대 주택 수 ≥ 2)만 봐 권리가 중과 주택 수에 들어가지 않았다(영 §167의10①
 *    본문 · §167의3① 본문 「조합원입주권 또는 분양권」 산입). 강남 주택 1 + 2022년 입주권 1 · 2026-06-01 양도:
 *    명부 없음 719,535,000 · 양도 행만 실은 같은 body 1,427,435,000(2주택 중과) — 직접 API만 닿는 갈래였다.
 *
 * 화면 경로 ④(`buildHousesPayload`)는 권리가 하나라도 있으면 다른 주택이 없어도 양도 행 하나를 싣는다 — 그 행과
 * **같은 구성**이다(`noRosterSellingHouse`). 다른 주택이 없으므로 모르는 사실이 없다. 세대 주택 수가 2 이상이면
 * 다른 주택의 사실을 몰라 종전대로 원시 플래그 + 「확인 필요」 고지다(`noRosterSurchargeFallbackNotice`).
 */
function noRosterRightHolderHouses(workingInput: TransferTaxInput): NonNullable<TransferTaxInput["houses"]> | undefined {
  if ((workingInput.presaleRights?.length ?? 0) === 0) return undefined;
  if (workingInput.householdHousingCount > 1 || !isSurchargeFallbackPropertyType(workingInput.propertyType)) return undefined;
  return [noRosterSellingHouse(workingInput)];
}

/**
 * 영 §167의10①4호 슬롯(`qualifiesUnavoidableOutsideCapital`)에 넘길 입력 — 주택 수를 §155②③·조특법 제외 **후** 값으로 바꾼다
 * (#16 · `surcharge15HouseCount` — ① 요소와 같은 수). 제외가 없으면 입력 그대로다(종전 동작·참조 동일).
 * 중과 엔진 4호 분기가 가드를 따로 건다(`multi-house-surcharge-exclusion.ts`) — 명부에 ⑧ 행 표시(`isUnavoidableOutsideCapital`)가
 * 있으면 그 행이 중과 주택 수 2채 안(양도 주택 또는 다른 효과 주택)일 때만 배제하고, 없으면(명부 없는 합성 주택·세대 단위
 * 레거시 선언) 「다른 효과 주택이 상속주택이면」 건너뛰는 종전 대리 지표를 쓴다(#16-1).
 */
export function surchargeSlotInput(workingInput: TransferTaxInput, generalHouseAcquisitionDate?: Date): TransferTaxInput {
  const ex = resolveExemptionHouseCountExclusions(workingInput, generalHouseAcquisitionDate);
  const inheritedExcluded = ex.inheritedExclusion.excludedCount;
  const count = surcharge15HouseCount(
    workingInput.householdHousingCount,
    inheritedExcluded,
    ex.specialActExcludedCount,
    ex.specialActVerified15Count,
  );
  if (count === workingInput.householdHousingCount) return workingInput;
  return {
    ...workingInput,
    householdHousingCount: count,
    inheritedHouseExclusionCount: inheritedExcluded,
    // 이미 주택 수에서 빠진 행을 ⑧ 특례 상대방으로 다시 쓰지 않는다(NH-12).
    knownHouseExclusionHouseIds: ex.knownHouseExclusionHouseIds,
  };
}

/** STEP 0.5가 판정에 쓰는 주택 집합 — 다주택 중과 판정 메뉴의 행별 판정이 같은 집합을 쓴다(계획서 F-5 · MH-P10). */
export interface SurchargeHouseSet {
  /** §155⑳ 불성립 임대 호 · 명부 없는 구성 행까지 반영한 집합(5호 연결 전 — 양도 주택에 따라 달라지므로) */
  rawHouses: NonNullable<TransferTaxInput["houses"]>;
  /** 명부 없는 §155①⑦·조특법 제외 의제 구성 행이 만들어졌는가 — 그렇다면 중과가 배제될 때만 결과를 쓴다(`runMultiHouseSurchargeStep`) */
  fromTwoHouseDeeming: boolean;
}

/**
 * STEP 0.5의 주택 집합 조립 — 명부 · §155⑳ 불성립 임대 호(`unmetRentalSurchargeHouses`) · 명부 없는 §155⑳ 거주주택
 * (`noRosterRentalResidenceHouses`) · §155①⑦ 의제 구성 행(`noRosterTwoHouseDeemingHouses`) · 권리 보유 1주택 세대의 양도 행
 * (`noRosterRightHolderHouses`) 순. 없으면 undefined.
 */
export function assembleSurchargeHouseSet(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  generalHouseAcquisitionDate?: Date,
): SurchargeHouseSet | undefined {
  const roster = workingInput.houses && workingInput.houses.length > 0 ? workingInput.houses : undefined;
  const unmetRentalHouses = unmetRentalSurchargeHouses(workingInput, parsedRates, generalHouseAcquisitionDate, roster);
  const rentalResidenceHouses = roster
    ? undefined
    : noRosterRentalResidenceHouses(workingInput, parsedRates, generalHouseAcquisitionDate);
  const twoHouseDeemingHouses =
    roster || rentalResidenceHouses
      ? undefined
      : noRosterTwoHouseDeemingHouses(workingInput, parsedRates, generalHouseAcquisitionDate);
  const rightHolderHouses =
    roster || unmetRentalHouses || rentalResidenceHouses || twoHouseDeemingHouses ? undefined : noRosterRightHolderHouses(workingInput);
  const rawHouses = unmetRentalHouses ?? roster ?? rentalResidenceHouses ?? twoHouseDeemingHouses ?? rightHolderHouses;
  // `fromTwoHouseDeeming`은 구성 행이 **만들어졌는가**다(집합으로 쓰였는지가 아니다) — 종전 `twoHouseDeemingHouses &&` 분기 그대로.
  return rawHouses ? { rawHouses, fromTwoHouseDeeming: !!twoHouseDeemingHouses } : undefined;
}
