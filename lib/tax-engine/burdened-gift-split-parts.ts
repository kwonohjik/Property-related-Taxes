/**
 * 주택·건물(토지 제외) 부담부증여 × 토지·건물 취득일 다름 — §159 파트 값을 토지·건물 분리 계산(`calcSplitGain`)에 넘긴다.
 *
 * 설계서 `docs/00-pm/bg-house-building-split.design.md` §5.1(Q-1 a).
 * 「소득세법」 제95조 제4항 — 토지와 건물의 보유기간은 각각 그 자산의 취득일부터 센다(이월과세면 당초 증여자가 해당 자산을 취득한 날).
 * 「소득세법 시행령」 제159조 제1항 — 파트 양도가액·취득가액 = 파트 A × 채무액 B / 증여가액 C(B/C는 두 파트에 같다 — 설계서 §3.2).
 *
 * 부담부증여 단계가 파트 값을 이미 완성한다(양도가액·취득가액·필요경비). 분리 계산은 그 값을 **다시 안분하지 않고** 파트 카드·보유연수만 만든다 —
 * 장기보유특별공제(표 1·표 2)·고가주택 12억 안분(「소득세법 시행령」 제160조 제1항 후단)·세율 기산은 분리 계산의 기존 하류가 한다.
 */
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { calculateHoldingPeriod } from "./tax-utils";
import { dayKey } from "./transfer-split-part-cause-input";
import type { PartAcqMode } from "./transfer-tax-split-acq-price";
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { SplitGainResult, SplitPartResult, TransferTaxInput } from "./types/transfer.types";

/** 분리 계산이 다시 안분하지 않고 그대로 쓰는 파트 값 — 부담부증여 단계가 싣는다(엔진 내부 전달용). */
export interface BurdenedGiftSplitPart {
  transferPrice: number;
  acquisitionPrice: number;
  /** 실비(K-4 · §97②2호 단서 나목) + 증여세 상당액(§97의2①3호) */
  directExpenses: number;
  /** 개산공제(「소득세법 시행령」 제163조 제6항) */
  appraisalDeduction: number;
  acqMode: PartAcqMode;
  /** 개산공제 base로 쓴 취득시 기준시가(× 채무 비율 전 · 표시용) — 개산공제가 있을 때만 */
  stdPriceAtAcq?: number;
  lumpDeductionRate?: number;
}

/**
 * 토지·건물 취득일이 다른 부담부증여 주택·건물인가. 토지 취득원인을 따로 둔 경우(D1·D2가 막는다)와 소유자 분리(한 파트만 양도)는 아니다.
 * ⑧·⑫의 BG-D(`collectSplitPartCauseIssues`)와 같은 조건이다.
 */
export function bgPartDatesDiffer(
  input: Pick<TransferTaxInput, "transferType" | "propertyType" | "landAcquisitionDate" | "acquisitionDate" | "landAcquisitionCause" | "selfOwns">,
): boolean {
  return (
    input.transferType === "burdened_gift" &&
    (input.propertyType === "housing" || input.propertyType === "building") &&
    !input.landAcquisitionCause &&
    (input.selfOwns ?? "both") === "both" &&
    !!input.landAcquisitionDate &&
    dayKey(input.landAcquisitionDate) !== dayKey(input.acquisitionDate)
  );
}

const METHOD_TO_MODE: Record<TransferBurdenedGiftBreakdown["acquisitionMethodUsed"], PartAcqMode> = {
  actual: "actual",
  converted: "estimated",
  standard_price: "estimated",
  appraisal: "appraisal",
  salesCase: "salesCase",
};

/**
 * §159 명세 → 파트 값. 필요경비 칸은 성질별로 가른다 — 개산공제율이 있으면 개산공제, 없으면(K-4 실비 · 단서 나목) 실비다.
 * 증여세 상당액(STEP 5.7이 같은 칸에 더한 몫)은 실비 칸으로 옮긴다(분리 계산의 결과 항등식 규약 — `calcSplitGain` P6와 같다).
 */
export function bgSplitPartsOf(b: TransferBurdenedGiftBreakdown): { land: BurdenedGiftSplitPart; building: BurdenedGiftSplitPart } {
  const part = (key: "land" | "building"): BurdenedGiftSplitPart => {
    const p = b.perAsset[key];
    const giftTax = (key === "land" ? b.carryoverGiftTax?.landApplied : b.carryoverGiftTax?.buildingApplied) ?? 0;
    const lump = p.estimatedDeductionRate !== undefined;
    const rest = p.estimatedDeduction - giftTax;
    return {
      transferPrice: p.transferPrice,
      acquisitionPrice: p.acquisitionPrice,
      directExpenses: giftTax + (lump ? 0 : rest),
      appraisalDeduction: lump ? rest : 0,
      acqMode: METHOD_TO_MODE[p.acquisitionMethod],
      ...(lump ? { stdPriceAtAcq: p.stdPriceAtAcquisition, lumpDeductionRate: p.estimatedDeductionRate } : {}),
    };
  };
  return { land: part("land"), building: part("building") };
}

/**
 * 파트로 나눌 재료가 있는가 — 없으면 던진다(조용히 한 파트로 몰지 않는다).
 *  · 양도시 토지·건물 기준시가: 파트 평가액(A)을 정한다(기준시가 평가는 그 값, 시가 평가는 그 비율 — 「소득세법 시행령」 제166조 제6항).
 *    한쪽이 0이면 그 파트의 양도가액이 0이 되고 차익이 다른 파트의 기산일로 계산된다(주택 기준시가를 건물분에 몰아 둔 입력).
 *  · K-4(실지취득가액): 파트 값이 아니라 총액만 있으면 — 토지·건물을 다른 날 따로 취득했으니 「함께 취득」의 안분(「소득세법」 제100조 제2항)이 아니다.
 *    총액을 기준시가로 나누면 근거 없는 자동 안분이다(설계서 Q-2 a). 이월과세 시나리오 A는 당초 증여자 값(`carryoverDonorBasis`)이 이미 치환된 info다.
 */
export function assertBgSplitInputs(info: NonNullable<TransferTaxInput["burdenedGiftInfo"]>): void {
  if (!(info.landStdPriceAtTransfer > 0) || !(info.buildingStdPriceAtTransfer > 0))
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "[burdened_gift] 토지와 건물의 취득일이 다르면 양도시 토지 기준시가와 건물 기준시가를 따로 입력해야 합니다 — 토지·건물 파트의 평가액을 그 값으로 나눕니다(「소득세법 시행령」 제166조 제6항). 주택이면 개별주택가격을 토지분(개별공시지가 × 면적)과 건물분(국세청 기준시가) 비율로 나눈 값입니다.",
      { field: "burdenedGiftInfo.landStdPriceAtTransfer" },
    );
  if (info.acquisitionMethod !== "actual") return;
  if (info.actualLandAcquisitionPrice !== undefined && info.actualBuildingAcquisitionPrice !== undefined) return;
  throw new TaxCalculationError(
    TaxErrorCode.INVALID_INPUT,
    "[burdened_gift] 토지와 건물의 취득일이 다르면 토지·건물 실지취득가액을 따로 입력해야 합니다 — 다른 날 따로 취득한 자산은 「소득세법」 제100조 제2항의 함께 취득이 아니라 총액을 나눌 근거가 없습니다.",
    { field: "burdenedGiftInfo.actualLandAcquisitionPrice" },
  );
}

/** 분리 계산 결과 — 파트 값은 그대로, 보유연수는 파트 취득일(토지 = `landAcquisitionDate` · 건물 = `acquisitionDate`)부터. */
export function bgSplitGainResult(input: TransferTaxInput): SplitGainResult {
  const parts = input.burdenedGiftSplitParts!;
  const partResult = (p: BurdenedGiftSplitPart, from: Date): SplitPartResult => ({
    transferPrice: p.transferPrice,
    acquisitionPrice: p.acquisitionPrice,
    directExpenses: p.directExpenses,
    appraisalDeduction: p.appraisalDeduction,
    ...(p.stdPriceAtAcq !== undefined ? { stdPriceAtAcq: p.stdPriceAtAcq, lumpDeductionRate: p.lumpDeductionRate } : {}),
    gain: p.transferPrice - p.acquisitionPrice - p.directExpenses - p.appraisalDeduction,
    holdingYears: calculateHoldingPeriod(from, input.transferDate).years,
    longTermRate: 0,
    longTermDeduction: 0,
    swapApplied: false,
    acqMode: p.acqMode,
    stdPriceDerivedFromTotal: false,
  });
  const land = partResult(parts.land, input.landAcquisitionDate!);
  const building = partResult(parts.building, input.acquisitionDate);
  return {
    land,
    building,
    note: `토지 ${land.holdingYears}년 + 건물 ${building.holdingYears}년 분리 (부담부증여 — 「소득세법 시행령」 제159조 파트별 안분)`,
    selfOwns: "both",
  };
}
