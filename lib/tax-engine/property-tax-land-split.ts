/**
 * 재산세 토지 — 별도합산·직접 종합합산 선택 경로의 결과 조립 (PSA-E4 · property-tax.ts 800줄 정책 분리).
 *
 * 별도합산 선택: 필지 판정(`isSeparateAggregateLand`·`splitByBaseArea`)으로 별도합산 인정분·종합합산 이관분 가액을 구해
 * 분류별 합산 과세(`calculateLandClassTax`)로 이 필지 합계를 낸다 — 종전에는 이관분을 «0원 + 경고»로 버렸다.
 * 직접 종합합산 선택(Q-16): 같은 함수에 이 필지 전체를 종합합산분으로 넣는다.
 * `calculateSeparateAggregateTax`(다필지·지자체 안분)는 호출하지 않는다 — 단일 필지 경로는 그 함수의 세부담상한·안분이 필요 없다.
 */
import { PROPERTY_SEPARATE } from "./legal-codes";
import { calcSurtax, calcInstallment } from "./property-tax-surtax";
import { buildCapEcho } from "./property-tax-cap-echo";
import { buildTaxpayerOutcome } from "./property-taxpayer";
import { calculateLandClassTax } from "./property-land-split-tax";
import { landSplitTaxBaseDate } from "./property-land-split-tax";
import { propertyLandSplitRequired } from "./property-land-split-tax";
import { isSeparateAggregateLand, splitByBaseArea } from "./separate-aggregate-land";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type { LandSplitCapInput } from "./property-land-split-tax";
import type { PropertyLandSplitTransferReason, PropertyTaxInput, PropertyTaxResult } from "./types/property.types";
import type { CoOwnershipShare } from "./types/property-object.types";

const NO_PREVIOUS_TAX_NOTICE = "전년도 세부담 상당세액이 입력되지 않아 세부담상한(150%)을 적용하지 않습니다.";

export interface LandSplitBranchContext {
  input: PropertyTaxInput;
  targetDate: string;
  taxYear: number;
  /** Step 1 `calcTaxBase`의 토지 공정시장가액비율(DB 우선) — 두 분류에 같이 쓴다 */
  fairMarketRatio: number;
  legalBasis: string[];
  warnings: string[];
  taxpayerResult: Parameters<typeof buildTaxpayerOutcome>[0];
  coShares: CoOwnershipShare[] | undefined;
}

function resolveCap(input: PropertyTaxInput, priorYear: number): LandSplitCapInput {
  return input.taxCapMode === "recompute" && input.previousYearTaxBase != null
    ? { mode: "recompute", previousYearTaxBase: input.previousYearTaxBase, priorYear }
    : { mode: "direct", previousYearTax: input.previousYearTax };
}

/**
 * 이관 사유 — 별도합산 필지 판정 결과에서 분류 사유 1곳 매핑.
 * 철거 요건 접힘(영 §103의2)은 판정 leaf의 접힘 사유를 그대로 옮긴다 — 허가·사용승인 → `permit` · 건축 외 용도 → `other_use` · 무상 공용 → `public_use_unpaid` ·
 * 기간 경과·시행 전·입력 불가 → `demolished_period`.
 */
function transferReasonsOf(
  item: NonNullable<PropertyTaxInput["separateAggregateItem"]>,
  check: ReturnType<typeof isSeparateAggregateLand>,
): PropertyLandSplitTransferReason[] {
  if (check.excessArea <= 0) return [];
  if (check.isSeparateAggregate) return ["area_excess"];
  const foldReason = check.demolishedVerdict?.foldReason;
  if (foldReason === "permit" || foldReason === "other_use" || foldReason === "public_use_unpaid") return [foldReason];
  return [item.demolished === true ? "demolished_period" : "no_building"];
}

export function calculateLandSplitPropertyTax(ctx: LandSplitBranchContext): PropertyTaxResult {
  const { input, targetDate, taxYear, fairMarketRatio, legalBasis, warnings } = ctx;
  const isSeparateType = input.landTaxType === "separate_aggregate";

  let separateOwnValue = 0;
  let comprehensiveOwnValue = input.publishedPrice;
  let recognizedArea = 0;
  let excessArea = 0;
  let transferReasons: PropertyLandSplitTransferReason[] = ["direct_type"];
  let demolishedVerdict: ReturnType<typeof isSeparateAggregateLand>["demolishedVerdict"];

  if (isSeparateType) {
    if (!input.separateAggregateItem) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "별도합산(separate_aggregate) 계산 시 separateAggregateItem이 필요합니다.",
      );
    }
    // 과세기준일은 6.1.(지방세법 §114) — ⑧·⑫와 같은 `landSplitTaxBaseDate`라 철거 요건 요구 칸과 판정이 같은 시행본을 본다
    const land = { ...input.separateAggregateItem, taxBaseDate: landSplitTaxBaseDate(targetDate) };
    const check = isSeparateAggregateLand(land);
    const split = splitByBaseArea(land, check);
    separateOwnValue = split.separateOfficialValue;
    comprehensiveOwnValue = split.excessOfficialValue;
    recognizedArea = check.recognizedArea;
    excessArea = check.excessArea;
    demolishedVerdict = check.demolishedVerdict;
    transferReasons = transferReasonsOf(land, check);
    warnings.push(...check.warnings);
    legalBasis.push(
      PROPERTY_SEPARATE.SUBJECT,
      PROPERTY_SEPARATE.RATE,
      PROPERTY_SEPARATE.PERSONAL_AGGREGATION,
      PROPERTY_SEPARATE.FAIR_MARKET_RATIO,
    );
  }

  const required = propertyLandSplitRequired({
    landTaxType: input.landTaxType,
    recognizedArea,
    excessArea,
  });
  const cap = resolveCap(input, taxYear - 1);
  const r = calculateLandClassTax({
    taxYear,
    fairMarketRatio,
    separateOwnValue,
    comprehensiveOwnValue,
    otherSeparateValue: input.otherSeparateAggregateValue,
    otherComprehensiveValue: input.otherComprehensiveValue,
    required,
    cap,
    transferredFromSeparate: isSeparateType && excessArea > 0,
    transferReasons,
  });
  warnings.push(...r.warnings);
  legalBasis.push(...r.legalBasis);
  if (isSeparateType && r.cap.basisTax === undefined && input.previousYearTax === undefined) {
    warnings.push(NO_PREVIOUS_TAX_NOTICE);
  }

  const surtax = calcSurtax(r.determinedTax, r.ownTaxBase, input.publishedPrice, input.objectType, input.isUrbanArea ?? false);
  legalBasis.push(...surtax.legalBasis);
  const installment = calcInstallment(r.determinedTax, input.objectType);
  const totalPayable = r.determinedTax + surtax.totalSurtax;

  return {
    publishedPrice: input.publishedPrice,
    fairMarketRatio,
    taxBase: r.ownTaxBase,
    appliedRate: 0, // 누진세율이므로 단일 세율 없음
    calculatedTax: r.taxBeforeCap,
    calculatedTaxBeforeCap: r.taxBeforeCap,
    taxCapRate: r.cap.capRate,
    determinedTax: r.determinedTax,
    surtax: surtax.surtax,
    totalSurtax: surtax.totalSurtax,
    totalPayable,
    installment,
    oneHouseSpecialApplied: false,
    legalBasis: [...new Set(legalBasis)],
    warnings,
    targetDate,
    landSplit: demolishedVerdict ? { ...r.landSplit, demolishedVerdict } : r.landSplit,
    ...buildCapEcho(input, r.cap.basisTax ?? (cap.mode === "recompute" ? 0 : input.previousYearTax), taxYear - 1),
    ...buildTaxpayerOutcome(ctx.taxpayerResult, ctx.coShares, r.determinedTax, totalPayable),
  };
}
