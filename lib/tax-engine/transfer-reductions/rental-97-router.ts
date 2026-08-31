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
    stdPriceAtAcquisition: ctx.stdPriceAtAcquisition,
    stdPriceAtRentalStart: r.stdPriceAtRentalStart,
    stdPriceAtTransfer: ctx.stdPriceAtTransfer,
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
        propertyType: r.propertyType,
        rentalHousingType: r.rentalHousingType,
        isConvertedFromShortTerm: r.isConvertedFromShortTerm,
      };
    case "rental_97_4":
      return { ...base, region: r.region };
    case "rental_97_5":
      return { ...base, officialPriceAtStart: r.officialPriceAtStart, region: r.region };
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
      };
    case "rental_97_2":
      return {
        ...base,
        rental972Type: r.rental972Type,
        isNationalHousing: r.isNationalHousing,
        hasNewRentalPlus2Units: r.hasNewRentalPlus2Units,
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
 */
export function evaluateRental97Lthd(
  reductions: TransferReduction[] | undefined,
  ctx: Rental97EngineContext,
): Rental97Result | undefined {
  if (!reductions) return undefined;
  for (const r of reductions) {
    if (!isRentalVariant(r) || !LTHD_IDS.has(r.type)) continue;
    if (!hasSubstantiveFields(r)) continue;
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
