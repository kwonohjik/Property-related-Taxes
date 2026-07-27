/**
 * 양도소득세 토지/건물 분리 계산 결과 타입 (소득세법 §166⑥)
 * 800줄 정책 준수를 위해 transfer.types.ts 에서 분리. 하위 호환을 위해 transfer.types.ts 가 재수출.
 */
import type { PreHousingDisclosureResult } from "./transfer-phd.types";
import type { HousingExpropriationValuationDetail } from "../transfer-tax-expropriation-valuation";

/**
 * §164⑨ 1호 건물 split 토지분 산출근거 (총액 3후보) — Record(Map 금지, JSON 소실).
 *
 * 시행규칙 §80⑧이 "보상기초 기준시가 = 토지 개별공시지가"로 한정 → split의 **토지분 분모만**
 * min[]으로 낮춘다(건물분은 "보상기초" 개념 부재로 미적용, 계획 D16-GB와 동형).
 * `SplitGainResult`에 부착되어 `TransferTaxResult.splitDetail`을 통해 결과 카드에 도달한다.
 *
 * 타입을 여기(split 결과 파일)에 두는 이유: `SplitGainResult`가 이 필드를 담으므로 co-locate.
 * `transfer-tax-expropriation-valuation.ts`의 `applySplitLandExpropriationValuation`이 이 타입을 import한다
 * (반대 방향이면 expropriation-valuation ↔ transfer.types ↔ split-gain.types 타입 순환).
 */
export interface SplitLandExpropriationValuationDetail {
  /** 양도시 토지 기준시가 총액 (분할 토지분 환산 분모) */
  landStdTotal: number;
  /** 토지분 보상액 총액 */
  compensationTotal: number;
  /** 토지분 보상액 산정 기초 기준시가 총액 */
  compensationBasisTotal: number;
  /** 적용값 = min(3) */
  chosen: number;
  /** 환산 분모(총액) = chosen */
  denominator: number;
}

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
  /** 파트별 취득 방식 echo (결과뷰 라벨 전용, 계산 로직 무영향) */
  acqMode?: "actual" | "estimated" | "appraisal" | "salesCase";
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
  /** §164⑨1호 건물 split 토지분 특례 산출근거 (계획 P6/D6) — 적용 시만 포함 */
  splitLandExpropriationValuationDetail?: SplitLandExpropriationValuationDetail;
  /** §164⑨1호 주택 PHD split 총액 특례 산출근거 (계획 P6b/D15) — 적용 시만 포함 */
  housingExpropriationValuationDetail?: HousingExpropriationValuationDetail;
}
