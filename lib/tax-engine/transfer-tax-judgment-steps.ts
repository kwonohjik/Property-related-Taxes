/**
 * STEP 0.5 다주택 중과세 판정 · STEP 0.6 비사업용 토지 정밀 판정
 * · STEP 0.62 상업용건물 부수토지 초과분 판정
 *
 * transfer-tax.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 * 모두 `workingInput`을 읽어 판정 결과를 내고, 그 결과로 파생 입력
 * (`effectiveInput`)을 만든다. 세액 계산 자체는 하지 않는다.
 */
import { NBL } from "./legal-codes";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import {
  determineMultiHouseSurcharge,
  type MultiHouseSurchargeInput,
  type MultiHouseSurchargeResult,
} from "./multi-house-surcharge";
import { judgeNonBusinessLand } from "./non-business-land";
import type { NonBusinessLandJudgment } from "./non-business-land";
import {
  resolveDeemedOneHouseBy155,
  qualifiesUnavoidableOutsideCapital,
  meetsOneHouseHoldingResidence,
  presaleRightStartDate,
} from "./transfer-tax-helpers";
import { meetsPublicInstitutionRelocationRegion } from "./transfer-tax-temporary-two-house-timing";
import { resolveArticle89Clause2 } from "./transfer-tax-89-2-exclusion";
import { clause2BlocksSurchargeDeeming, clause2SurchargeDeemed } from "./transfer-tax-89-2-consequences";
import { judgeRentalHousingEligibility } from "./transfer-tax-rental-housing-judge";
import { resolveRentalResidenceComposition } from "./transfer-tax-rental-residence-composition";
import { buildSurchargeExclusionStep } from "./transfer-reductions";
import {
  resolveExemptionHouseCountExclusions,
  surcharge15HouseCount,
  inheritedGeneralHouseSurchargeBasis,
  specialActHouseExclusionBasis,
} from "./transfer-tax-house-exclusion-step";
import type { DeemedOneHouseBasis } from "./types/multi-house-surcharge.types";
import { qualifiesOldClause8TemporaryTwoHouse } from "./data/surcharge-old-clauses-era";
import { classifyRegionCriteriaByCode } from "./multi-house-surcharge-count";
import type { IncomeDeductionId } from "./transfer-reductions";

/** `resolveSurchargeExclusionByReduction` 반환형 (조특법 감면주택 중과 배제 선판정) */
type SurchargeExclusionByReduction = { excluded: boolean; appliedId?: IncomeDeductionId; legalBasis?: string };

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
): { basis: DeemedOneHouseBasis; source?: string; citedByOldClause1?: boolean } | undefined {
  const ex = resolveExemptionHouseCountExclusions(workingInput, generalHouseAcquisitionDate);
  const inheritedExcluded = ex.inheritedExclusion.excludedCount;
  const count = surcharge15HouseCount(
    workingInput.householdHousingCount,
    inheritedExcluded,
    ex.specialActExcludedCount,
    ex.specialActVerified15Count,
  );
  /**
   * 「소득세법」 §89② — 주택과 조합원입주권·분양권을 함께 보유하면 §89①3호(§154①)를 적용하지 않는다(단서 예외는
   * 영 §156의2·§156의3). 그러면 §155 의제가 서도 「제154조제1항이 적용되는 주택」이 아니다 ⇒ 비과세 정본
   * (`checkExemption`)과 같은 술어로 먼저 거른다. 판정 보류(`undetermined` — 예외 사실을 입력받을 경로가 없는 조합)는
   * 비과세가 종전 동작(적용)을 유지하고 경고하지만, 중과 배제까지 그 가정에 기대지 않는다(확인 필요 — 종전 동작).
   */
  const clause2 = resolveArticle89Clause2(
    { ...workingInput, householdHousingCount: count },
    presaleRightStartDate(parsedRates),
  );
  if (clause2BlocksSurchargeDeeming(clause2)) return undefined;

  const deemed = resolveDeemedOneHouseBy155(
    { ...workingInput, householdHousingCount: count },
    parsedRates.oneHouseSpecialRules,
  );
  if (deemed) return { basis: deemed };
  const inherited = inheritedGeneralHouseSurchargeBasis({
    isOneHousehold: workingInput.isOneHousehold,
    houseCount: count,
    inheritedExcludedCount: inheritedExcluded,
    specialActExcludedCount: ex.specialActExcludedCount,
    transferDate: workingInput.transferDate,
  });
  if (inherited) return { basis: inherited };
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
 * 해석을 확보하지 못했다 → 열지 않는다(확인 필요 — 종전 동작).
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
  const regionCode = workingInput.regionCode || undefined;
  const selling = {
    id: "selling",
    acquisitionDate: workingInput.acquisitionDate,
    officialPrice: workingInput.standardPriceAtTransfer ?? 0,
    region:
      regionCode && classifyRegionCriteriaByCode(regionCode) === "VALUE" ? ("non_capital" as const) : ("capital" as const),
    regionCode,
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
  };
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

/**
 * STEP 0.5 — houses[] + 주택 수 산정 규칙이 모두 있을 때만 정밀 중과 판정.
 * 명부가 없어도 §155⑳ 거주주택 의제가 서면 입력된 사실로 행을 구성해 판정한다(`noRosterRentalResidenceHouses`).
 */
export function runMultiHouseSurchargeStep(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  steps: CalculationStep[],
  surchargeExclusionByReduction: SurchargeExclusionByReduction,
  /** §99의4·§98의9 「취득 전 보유 주택」 판정 기준일 — STEP 0.9와 같은 값(`hceGeneralHouseAcquisitionDate`) */
  generalHouseAcquisitionDate?: Date,
): MultiHouseSurchargeResult | undefined {
  // STEP 0.5: 다주택 중과세 판정 (houses[] 제공 + 주택 수 산정 규칙 로드 완료 시)
  let multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  const houses =
    workingInput.houses && workingInput.houses.length > 0
      ? workingInput.houses
      : noRosterRentalResidenceHouses(workingInput, parsedRates, generalHouseAcquisitionDate);
  if (houses && parsedRates.houseCountExclusionRules) {
    const sellingId = workingInput.sellingHouseId ?? houses[0].id;
    const housesForSurcharge = surchargeExclusionByReduction.excluded
      ? houses.map((h) => (h.id === sellingId ? { ...h, isTaxSpecialExemption: true } : h))
      : houses;
    if (surchargeExclusionByReduction.excluded) steps.push(buildSurchargeExclusionStep(surchargeExclusionByReduction));
    const deemed = resolveSurchargeDeemedOneHouseDetail(workingInput, parsedRates, generalHouseAcquisitionDate);
    const mhInput: MultiHouseSurchargeInput = {
      houses: housesForSurcharge,
      sellingHouseId: sellingId,
      transferDate: workingInput.transferDate,
      isOneHousehold: workingInput.isOneHousehold,
      // §167의10①15호 ① 요소 — §155① 의제 성립 여부를 **비과세 정본으로 선판정**해 주입.
      //   STEP 1(checkExemption)이 뒤에 오므로 그 결과를 받을 수 없다. 배제 2가
      //   `meetsOneHouseHoldingResidence`를 여기서 precompute하는 것과 같은 패턴이다.
      //   ⚠️ 타이밍(요건 A·B)만 본다 — §154① 충족(② 요소)은
      //   `sellingHouseMeetsOneHouseRequirements`가 별도로 담당하며, 중과 엔진이 둘을 AND한다.
      //   E-14 — 주택 수는 원시값이 아니라 비과세 정본의 값이다(`resolveSurchargeDeemedOneHouse`).
      deemedOneHouseBy155: deemed?.basis,
      deemedOneHouseSource: deemed?.source,
      // 영 §167의10①4호 — §155⑧ 수도권 밖 부득이 주택. 15호와 **별개 호**라 슬롯이 다르다.
      //   요건(2주택·해소일부터 3년) 판정은 비과세와 같은 정본을 쓴다.
      unavoidableOutsideCapitalHouse: qualifiesUnavoidableOutsideCapital(workingInput),
      // E-14e·f — 2023.2.28. 전 양도분의 구 호(8호 · §167의11①1호). 판정은 `data/surcharge-old-clauses-era.ts`.
      //   8호의 「1주택을 소유한 1세대」는 실제 소유 주택 수다(조심2021중1803) — §155②③·조특법 제외 전 값.
      oldClause8TemporaryTwoHouse: qualifiesOldClause8TemporaryTwoHouse({
        ...workingInput,
        // §155⑯ 세대 5년 — 재산세제과-129. §155① 기한과 **같은 지역 술어**를 쓴다.
        publicInstitutionRelocationMet:
          workingInput.temporaryTwoHouse !== undefined &&
          meetsPublicInstitutionRelocationRegion(workingInput.temporaryTwoHouse),
      }),
      rightDeemingCitedByOldClause1: deemed?.citedByOldClause1,
      marriageMerge: workingInput.marriageMerge,
      parentalCareMerge: workingInput.parentalCareMerge,
      presaleRights: workingInput.presaleRights ?? [],
      gracePeriod: workingInput.gracePeriod,
      // §154① 보유·거주 요건 precompute (배제2 §155⑤ 의제 게이트). 미산정 시 undefined → 엔진 충족 간주
      sellingHouseMeetsOneHouseRequirements: parsedRates.oneHouseSpecialRules
        ? meetsOneHouseHoldingResidence(
            workingInput,
            parsedRates.oneHouseSpecialRules.one_house_exemption,
          )
        : undefined,
    };
    multiHouseSurchargeResult = determineMultiHouseSurcharge(
      mhInput,
      parsedRates.houseCountExclusionRules,
      parsedRates.regulatedAreaHistory ?? null,
      parsedRates.surchargeSpecialRules,
      workingInput.isRegulatedArea,
    );
  }
  return multiHouseSurchargeResult;
}

/** STEP 0.6 — nonBusinessLandDetails 제공 시 정밀 판정 + 파생 입력 생성. */
export function runNonBusinessLandStep(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  steps: CalculationStep[],
): { nonBusinessLandJudgment: NonBusinessLandJudgment | undefined; effectiveInput: TransferTaxInput } {
  // STEP 0.6: 비사업용 토지 정밀 판정 (nonBusinessLandDetails 제공 시)
  let nonBusinessLandJudgment: NonBusinessLandJudgment | undefined;
  // input은 readonly이므로 isNonBusinessLand override를 위한 mutable 복사본 사용
  let effectiveInput = workingInput;
  if (workingInput.nonBusinessLandDetails) {
    nonBusinessLandJudgment = judgeNonBusinessLand(
      workingInput.nonBusinessLandDetails,
      parsedRates.nonBusinessLandJudgmentRules,
    );
    // 판정 결과로 isNonBusinessLand override + 단일 필지 기준면적 초과분 면적안분 비율(목장 §168의10③·기타토지 §168의11①, F3) 항상 주입
    // (입력 플래그=true·판정=true 케이스도 부분안분이 반영되도록 if 밖에서 갱신)
    effectiveInput = {
      ...workingInput,
      isNonBusinessLand: nonBusinessLandJudgment.isNonBusinessLand,
      nonBusinessLandAreaRatio: nonBusinessLandJudgment.surcharge.nonBusinessAreaRatio,
    };
    // [I5] 입력 플래그와 판정 결과가 다를 때만 step 경고 기록
    if (nonBusinessLandJudgment.isNonBusinessLand !== workingInput.isNonBusinessLand) {
      steps.push({
        label: "비사업용 토지 판정 (엔진 재판정)",
        formula: `입력 플래그(${workingInput.isNonBusinessLand ? "비사업용" : "사업용"}) → 정밀 판정 결과: ${nonBusinessLandJudgment.isNonBusinessLand ? "비사업용" : "사업용"}`,
        amount: 0,
        legalBasis: NBL.MAIN,
      });
    }
  }
  return { nonBusinessLandJudgment, effectiveInput };
}

/**
 * STEP 0.62 — 상업용건물·오피스텔 부수토지 기준면적 초과분 비사업용 판정.
 *
 * 근거: 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 →
 *       「지방세법 시행령」 §101①2호(바닥면적 × §101② 적용배율).
 *
 * 판정 본체는 GB와 **같은 헬퍼**(`appurtenant-land-excess.ts`)를 쓴다. 구분소유는 지분율이
 * 판정식에서 약분되므로 집합건물 **전체** 대지·바닥면적만으로 초과 비율이 확정된다
 * (설계 근거: `commercial-appurtenant.types.ts` 헤더 · 계획서 §2.3 안 ㉮).
 *
 * 초과분이 있을 때만 `isNonBusinessLand`를 켠다 — 초과가 0이면 기존 값을 건드리지 않는다.
 *
 * ⚠️ `nonBusinessLandAreaRatio`만 주입하고 `isNonBusinessLand`를 켜지 않으면
 * `transfer-tax-rate-calc.ts`의 중과 분기에 진입하지 못해 **조용히 무효**가 된다.
 *
 * @returns 판정 미대상이면 입력을 그대로 반환한다(현행 동작 불변).
 */
export function runCommercialAppurtenantLandStep(
  workingInput: TransferTaxInput,
  steps: CalculationStep[],
): TransferTaxInput {
  const cal = workingInput.commercialAppurtenantLand;
  if (workingInput.propertyType !== "commercial_building" || !cal) return workingInput;

  const judged = judgeAppurtenantLandExcess({
    landArea: cal.totalLandArea,
    buildingFootprintArea: cal.totalBuildingFootprintArea,
    zoneType: cal.zoneType,
    unapprovedBuilding: cal.unapprovedBuilding,
    context: "상업용건물",
  });

  if (judged.nonBusinessArea <= 0) return workingInput;

  steps.push({
    label: "부수토지 기준면적 초과분 비사업용 판정",
    formula:
      `기준면적 = 건축물 바닥면적 ${cal.totalBuildingFootprintArea}㎡ × ${judged.multiplier}배 = ${judged.allowedLandArea}㎡ · ` +
      `대지면적 ${cal.totalLandArea}㎡ 중 ${judged.nonBusinessArea}㎡ 초과 (${judged.multiplierDetail})`,
    amount: 0,
    legalBasis: NBL.MAIN,
  });

  return {
    ...workingInput,
    isNonBusinessLand: true,
    nonBusinessLandAreaRatio: judged.nonBusinessRatio,
  };
}
