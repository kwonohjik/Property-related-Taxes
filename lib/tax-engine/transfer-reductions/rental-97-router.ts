/**
 * 장기임대 §97 시리즈 — 엔진 reduction variant → evaluator dispatch
 *
 * calcLongTermHoldingDeduction(STEP 4 — §97의3·§97의4)과
 * calcReductions(STEP 8 — §97 본문/단서·§97의2·§97의5) 양쪽에서 공용.
 *
 * 중복배제:
 * - §97의3 ↔ §97의4 ↔ §97의5: §97의3②·§97의5② — UI 라디오 단일 선택이 1차 차단,
 *   엔진 도달 시 첫 항목만 평가 (배열 순서 우선).
 * - 세액감면 계열 ↔ §69 자경 등: 조특법 §127⑦ — calcReductions candidates max 패턴 합류.
 */

import type { TransferReduction } from "../types/transfer.types";
import { evaluateRental973 } from "./rental-97-3";
import { evaluateRental974 } from "./rental-97-4";
import { evaluateRental975 } from "./rental-97-5";
import { evaluateRental97Main } from "./rental-97-main";
import { evaluateRental972 } from "./rental-97-2";
import type { Rental97ArticleId, Rental97EvaluationInput, Rental97Result } from "./types";

const LTHD_IDS: ReadonlySet<string> = new Set(["rental_97_3", "rental_97_4"]);
const TAX_AMOUNT_IDS: ReadonlySet<string> = new Set(["rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_5"]);

export interface Rental97EngineContext {
  transferDate: Date;
  acquisitionDate?: Date;
  /** §97의2·§97의5 시한 — 매매계약일 (자산-수준 assetContractDate) */
  contractDate?: Date;
  /** 임대기간 안분용 — 자산-수준 기준시가 (총액 원) */
  stdPriceAtAcquisition?: number;
  stdPriceAtTransfer?: number;
  /** 세액감면 계열 전용 */
  calculatedTax?: number;
}

type RentalReductionVariant = Extract<
  TransferReduction,
  { type: "rental_97_main" | "rental_97_proviso" | "rental_97_2" | "rental_97_3" | "rental_97_4" | "rental_97_5" }
>;

function isRentalVariant(r: TransferReduction): r is RentalReductionVariant {
  return LTHD_IDS.has(r.type) || TAX_AMOUNT_IDS.has(r.type);
}

/** Phase 1 stub(_phase1Stub) 또는 본 필드 미입력 항목은 평가 제외 — 시한 검증만 받던 기존 동작 보존 */
function hasSubstantiveFields(r: RentalReductionVariant): boolean {
  return r.registrationDate !== undefined || r.rentalStartDate !== undefined;
}

function buildInput(r: RentalReductionVariant, ctx: Rental97EngineContext): Rental97EvaluationInput {
  const base: Rental97EvaluationInput = {
    id: r.type as Rental97ArticleId,
    transferDate: ctx.transferDate,
    acquisitionDate: ctx.acquisitionDate,
    contractDate: ctx.contractDate,
    registrationDate: r.registrationDate,
    rentalStartDate: r.rentalStartDate,
    isTaxRegistered: r.isTaxRegistered,
    rentIncreaseViolated: r.rentIncreaseViolated,
    rentHistory: r.rentHistory,
    vacancyPeriods: r.vacancyPeriods,
    // Q10 — 감면-수준 override가 있으면 그것을 쓰고, 없으면 자산-수준(ctx)으로 폴백한다.
    // 자산-수준 값의 전송 조건은 두 시점이 다르다(`transfer-tax-api.ts` 실측) — 취득시는
    // 추계 또는 분리 모드, 양도시는 **추계 모드만**이다. 실지거래가액 모드에서는 둘 다
    // 비어 안분이 성립하지 않았고, 분리 전용 모드에서는 양도시만 비었다. 전송 조건을 넓히는 대신(무관한 경로의
    // 세액이 함께 움직인다) 여기서 조문 전용 입력을 받는다 — §98의8 계약일 폴백과 같은 모양.
    stdPriceAtAcquisition: r.stdPriceAtAcquisition ?? ctx.stdPriceAtAcquisition,
    stdPriceAtRentalStart: r.stdPriceAtRentalStart,
    stdPriceAtTransfer: r.stdPriceAtTransfer ?? ctx.stdPriceAtTransfer,
    // D2-06 — 조특령 §97의3⑤ B·§97의5②의 「실제 임대기간 마지막 날」 축.
    // ⚠️ 이 base는 **명시 매핑**이라 여기 적지 않은 키는 조용히 사라진다
    //    (직전 배치 D1-01에서 실제로 발생했다 — memory `feedback_explicit_prop_mapping_strip`).
    rentalContinuesToTransfer: r.rentalContinuesToTransfer,
    stdPriceAtRentalEnd: r.stdPriceAtRentalEnd,
    calculatedTax: ctx.calculatedTax,
  };

  switch (r.type) {
    case "rental_97_3":
      return {
        ...base,
        officialPriceAtStart: r.officialPriceAtStart,
        isNationalHousingScale: r.isNationalHousingScale,
        region: r.region,
        // D2-07 — ⚠️ 명시 매핑이라 적지 않으면 조용히 사라진다.
        isPrivateConstructionRental: r.isPrivateConstructionRental,
        // D9-07 — propertyType(아파트 여부)·rentalHousingType은 evaluateRental973이
        // 읽지 않으므로 엔진 입력에 싣지 않는다. 「엔진 입력은 엔진이 읽는 것만 담는다」.
        isConvertedFromShortTerm: r.isConvertedFromShortTerm,
      };
    case "rental_97_4":
      // D2-04 — 종전에는 region만 넘겨 기준시가 한도를 판정할 입력이 없었다.
      // (그 region조차 evaluator가 읽지 않는 사문 필드였다.)
      return {
        ...base,
        region: r.region,
        officialPriceAtStart: r.officialPriceAtStart,
        rental974Category: r.rental974Category,
      };
    case "rental_97_5":
      return {
        ...base,
        officialPriceAtStart: r.officialPriceAtStart,
        region: r.region,
        // CA-01 — §97의5①3호가 조특령 §97의3③2호(국민주택규모)를 준용한다.
        // ⚠️ 이 case도 **명시 매핑**이라 적지 않으면 조용히 사라진다.
        isNationalHousingScale: r.isNationalHousingScale,
      };
    case "rental_97_main":
    case "rental_97_proviso":
      return {
        ...base,
        constructionYear: r.constructionYear,
        isNationalHousing: r.isNationalHousing,
        provisoCase: r.type === "rental_97_proviso" ? r.provisoCase : undefined,
        // ⚠️ 이 case는 **명시 매핑**이라 여기 적지 않은 키는 조용히 사라진다
        //    (memory `feedback_explicit_prop_mapping_strip`). 신규 필드는 반드시 추가할 것.
        hasMin5RentalUnits: r.hasMin5RentalUnits,
        belowMin5UnitsPeriods: r.belowMin5UnitsPeriods,
        isMultiUnitHousing: r.isMultiUnitHousing,
        isUnoccupiedAt1986: r.isUnoccupiedAt1986,
        isUnoccupiedAtAcquisition: r.isUnoccupiedAtAcquisition,
      };
    case "rental_97_2":
      return {
        ...base,
        rental972Type: r.rental972Type,
        isNationalHousing: r.isNationalHousing,
        hasNewRentalPlus2Units: r.hasNewRentalPlus2Units,
        isUnoccupiedAtAcquisition: r.isUnoccupiedAtAcquisition,
        // D9-01 — §97의2①1호 나목. ⚠️ 명시 매핑이라 적지 않으면 조용히 사라진다.
        isMultiUnitHousing972: r.isMultiUnitHousing972,
        isUnoccupiedAt19990820: r.isUnoccupiedAt19990820,
      };
  }
}

function dispatch(input: Rental97EvaluationInput): Rental97Result {
  switch (input.id) {
    case "rental_97_3": return evaluateRental973(input);
    case "rental_97_4": return evaluateRental974(input);
    case "rental_97_5": return evaluateRental975(input);
    case "rental_97_2": return evaluateRental972(input);
    case "rental_97_main":
    case "rental_97_proviso": return evaluateRental97Main(input);
  }
}

/**
 * STEP 4 (장특공제) 용 — reductions에서 §97의3/§97의4 첫 항목 평가.
 * 본 필드 미입력(stub) 항목은 건너뜀.
 *
 * ## §97의5와는 중복 적용하지 않는다 (D2-05)
 * 조특법 §97의5② — 「제1항에 따른 세액감면은 제97조의3에 따른 장기일반민간임대주택등에 대한
 * 양도소득세의 과세특례 및 제97조의4에 따른 장기임대주택에 대한 양도소득세의 과세특례와
 * **중복하여 적용하지 아니한다**」
 *
 * 이것은 §127⑦의 「후보 중 택일」이 아니라 **조문이 정한 우선순위**다 —
 * §97의5가 선택돼 있으면 §97의3·§97의4를 끈다.
 *
 * ⚠️ UI 라디오(`toggleGroupRadio`)가 같은 category를 하나만 남겨 앱 경로로는 공존 배열을
 *    만들 수 없지만, `/api/calc/transfer` 직접 POST로는 도달한다. 엔진 가드가 정본이다.
 */
export function evaluateRental97Lthd(
  reductions: TransferReduction[] | undefined,
  ctx: Rental97EngineContext,
): Rental97Result | undefined {
  if (!reductions) return undefined;

  const has975 = reductions.some(
    (r) => isRentalVariant(r) && r.type === "rental_97_5" && hasSubstantiveFields(r),
  );

  for (const r of reductions) {
    if (!isRentalVariant(r) || !LTHD_IDS.has(r.type)) continue;
    if (!hasSubstantiveFields(r)) continue;
    if (has975) {
      return {
        id: r.type,
        isEligible: false,
        ineligibleReasons: [
          {
            code: "OVERLAP_EXCLUDED_BY_97_5",
            message:
              `§97의5(장기일반민간임대주택등 양도소득세 세액감면)가 함께 선택되어 ` +
              `${r.type === "rental_97_4" ? "§97의4" : "§97의3"} 과세특례는 적용하지 않습니다 (조특법 §97의5②).`,
            legalBasis: "조특법 §97의5②",
          },
        ],
        legalBasis: "조특법 §97의5②",
        effectCategory: "long_term_holding_special",
      } as Rental97Result;
    }
    return dispatch(buildInput(r, ctx));
  }
  return undefined;
}

/**
 * STEP 8 (감면세액) 용 — reductions에서 세액감면 계열(§97 본문/단서·§97의2·§97의5) 첫 항목 평가.
 */
export function evaluateRental97TaxAmount(
  reductions: TransferReduction[] | undefined,
  ctx: Rental97EngineContext,
): Rental97Result | undefined {
  if (!reductions) return undefined;
  for (const r of reductions) {
    if (!isRentalVariant(r) || !TAX_AMOUNT_IDS.has(r.type)) continue;
    if (!hasSubstantiveFields(r)) continue;
    return dispatch(buildInput(r, ctx));
  }
  return undefined;
}
