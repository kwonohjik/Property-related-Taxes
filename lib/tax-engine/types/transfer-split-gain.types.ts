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
  /** 취득시 기준시가 — 물건 전체(100%) 값 */
  stdPriceAtAcq?: number;
  /**
   * 개산공제 base로 **실제 사용된 값** = `floor(취득시 기준시가 × 지분율)`.
   * 표시 산식 「… × 3%」가 표시된 개산공제를 그대로 만들어내게 하는 echo다 — 100% 기준시가를
   * 노출하면 지분 자산에서 산식이 자기 값을 못 만든다(`feedback_engine_result_display_drift`).
   * 단독소유면 기준시가와 같다.
   */
  lumpDeductionBase?: number;
  gain: number;
  holdingYears: number;
  longTermRate: number;
  longTermDeduction: number;
  /** §97② 단서 swap 발동 여부 (자산 단위) */
  swapApplied?: boolean;
  /** 파트별 취득 방식 echo (결과뷰 라벨 전용, 계산 로직 무영향) */
  acqMode?: "actual" | "estimated" | "appraisal" | "salesCase";
  /**
   * 이 파트의 **취득시 기준시가**가 결합 총액에서 역산된 값인가 (결과뷰 fine-print 전용).
   *
   * ⚠️ 결함 표식이 아니다 — 의미가 propertyType별로 정반대다:
   *  · 주택(라목): 개별·공동주택가격이 부수토지 포함 결합 공시라 역산이 **법정 정상 경로**다.
   *  · 일반 건물: 가목·나목이 각각 공시되므로 역산은 건물 취득시점이 섞인 **한시 후퇴**다.
   * UI 문구는 propertyType으로 갈라 쓸 것.
   */
  stdPriceDerivedFromTotal?: boolean;
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
