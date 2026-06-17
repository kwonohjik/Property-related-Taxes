/**
 * 양도소득세 토지/건물 분리 계산 결과 타입 (소득세법 §166⑥)
 * 800줄 정책 준수를 위해 transfer.types.ts 에서 분리. 하위 호환을 위해 transfer.types.ts 가 재수출.
 */
import type { PreHousingDisclosureResult } from "./transfer-phd.types";

/** 토지/건물 분리 계산 결과 */
export interface SplitPartResult {
  transferPrice: number;
  acquisitionPrice: number;
  directExpenses: number;
  appraisalDeduction: number;
  /** 취득시 기준시가 — 개산공제 산식 표시용 (개산공제 = floor(stdPriceAtAcq × 3%)) */
  stdPriceAtAcq?: number;
  gain: number;
  holdingYears: number;
  longTermRate: number;
  longTermDeduction: number;
  /** §97② 단서 swap 발동 여부 (자산 단위) */
  swapApplied?: boolean;
}

export interface SplitGainResult {
  land: SplitPartResult;
  building: SplitPartResult;
  apportionRatio: { land: number; building: number };
  note: string;
  /** 본인 신고 부분 — UI 결과 뷰 표시용 */
  selfOwns: "both" | "building_only" | "land_only";
  /** §164⑤ 경로 시만 포함 — calculateTransferTax가 result.preHousingDisclosureDetail로 승격 */
  preHousingDisclosureDetail?: PreHousingDisclosureResult;
}
