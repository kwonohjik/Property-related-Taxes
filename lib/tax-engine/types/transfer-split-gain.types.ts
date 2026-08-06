/**
 * 양도소득세 토지/건물 분리 계산 결과 타입 (소득세법 §166⑥)
 * 800줄 정책 준수를 위해 transfer.types.ts 에서 분리. 하위 호환을 위해 transfer.types.ts 가 재수출.
 */
import type { PreHousingDisclosureResult } from "./transfer-phd.types";
import type { HousingExpropriationValuationDetail } from "../transfer-tax-expropriation-valuation";
import type { SaleSplitExemption, SaleSplitPair } from "../sale-split-deemed-unclear";
import type { ApportionBasisKind, AppraisalRejectReason } from "../sale-split-apportion-basis";

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
  /**
   * 이 파트의 **과세 대상** 양도차익 — 12억 안분(영 §160①)·1세대1주택 비과세 제외를 반영한 값.
   *
   * `gain`은 안분 **전** 양도차익이라 `longTermDeduction`(안분 후 기준)과 축이 다르다. 파트별
   * 세율(§104⑤)처럼 "파트 양도소득금액 = 과세 양도차익 − 장특공제"가 필요한 소비자는 이 값을 써야
   * 한다. `calcLongTermHoldingDeduction`의 split 분기가 채운다 — 미설정 시 소비자는 `gain` fallback.
   */
  taxableGainAfterProration?: number;
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

/**
 * 주택 부수토지 배율 초과분 = 비사업용 토지 (G-2).
 *
 * 「소득세법」 제104조의3 제1항 제5호가 "주택부속토지 중 주택 정착면적에 지역별 배율을 곱하여
 * 산정한 면적을 초과하는 토지"를 **명문으로 비사업용 토지로 규정**한다(배율 위임 = 같은 법
 * 시행령 제168조의12). ⇒ 1세대1주택 비과세 대상이 아니고, 토지 본래 보유기간 기준
 * 누진세율 + 10%p 중과(§104①8호), 장기보유특별공제는 표1이다.
 *
 * 「소득세법」 제104조 제5항 후단("한 필지의 토지가 비사업용 토지와 그 외의 토지로 구분되는
 * 경우에는 각각을 별개의 자산으로 보아 산출세액을 계산한다")이 이 분리의 직접 근거다.
 */
export interface SplitNonBusinessLandPart {
  /** 인정 한도 면적 = 건물 정착면적 × 배율 */
  limitArea: number;
  /** 한도 초과 면적 (㎡) */
  excessArea: number;
  /** 적용 배율 (3/5/10 — 2022.1.1. 전 양도분은 종전 규정) */
  appliedMultiplier: number;
  /** 토지 양도차익 중 초과면적 비율만큼 이전한 금액 — 12억 안분 대상이 아니다 */
  gain: number;
  /** 과세 대상 양도차익 (= `gain` — 안분하지 않는다). `SplitPartResult`와 축을 맞추기 위한 echo */
  taxableGainAfterProration?: number;
  /** 토지 본래 보유연수 */
  holdingYears: number;
  /** 장기보유특별공제율 (표1) */
  longTermRate: number;
  longTermDeduction: number;
}

/**
 * §100③ 「구분 기장 가액이 안분 가액과 30% 이상 차이 → 불분명 의제」 판정 결과.
 *
 * 「소득세법」 제100조 제3항의 적용 내역이다. 구분 기재가 **없는** 일괄양도에는 비교 대상이
 * 존재하지 않으므로 이 필드가 **없다**(`{deemedUnclear:false}`로 메우면 "판정했고 통과했다"로
 * 침묵 오표시된다).
 *
 * 표시 계층(결과 카드·신고서 각주)은 이 값을 **그대로 읽는다** — 이탈률을 재계산하면 엔진 판정과
 * 어긋난다(메모리 `feedback_engine_result_display_drift`).
 */
export interface SaleSplitJudgmentDetail {
  /** 「불분명한 때로 본다」 발동 여부 */
  deemedUnclear: boolean;
  /** 구분 기장 가액 — 한쪽만 입력된 경우 반대쪽은 `총액 − 입력값`으로 도출된 값 */
  declared: SaleSplitPair;
  /** 안분 가액 — 부가령 §64① basis 서열 적용 결과 */
  apportioned: SaleSplitPair;
  /** 실제 적용된 가액 = 발동 시 `apportioned`, 아니면 `declared` */
  applied: SaleSplitPair;
  /** 안분에 쓴 basis 종류 (감정평가가액 / 기준시가) */
  basisKind: ApportionBasisKind;
  /** 이탈률 (basis point — 1% = 100) */
  landDeviationBp: number;
  buildingDeviationBp: number;
  /** 그 파트가 30% 이상 벗어났는가 — **예외가 적용돼 발동을 면했어도 사실은 기록한다** */
  landOver: boolean;
  buildingOver: boolean;
  /** §166⑧ 예외로 발동을 면한 경우의 사유 */
  exemptionApplied?: SaleSplitExemption;
  /**
   * 감정평가가액을 basis로 **쓰지 못한 사유** — 감정 입력이 있었는데 배제된 경우만 채운다
   * (`out_of_window` 시기 요건 이탈 · `incomplete` 한쪽 미평가).
   *
   * 서열상 감정이 기준시가를 이기므로(부가령 §64①1호 단서), 감정을 넣었는데 기준시가로 안분되면
   * 사용자는 **이유를 알 수 없다**. 침묵 후퇴를 막으려고 결과에 싣는다(Phase 1-E).
   */
  appraisalRejected?: AppraisalRejectReason;
}

export interface SplitGainResult {
  land: SplitPartResult;
  building: SplitPartResult;
  /** 배율 초과 부수토지(비사업용 토지) 파트 — 초과분이 있을 때만 (G-2) */
  nonBusinessLandPart?: SplitNonBusinessLandPart;
  /**
   * 취득시 기준시가 안분비율. **파트별 실지거래가액을 아는 경우에는 안분 자체를 하지 않으므로
   * 존재하지 않는다**(계획서 transfer-split-acq-std-gate-relaxation §4.3 — `{0,0}` 금지).
   */
  apportionRatio?: { land: number; building: number };
  /**
   * §100③ 판정 내역 — **구분 기재가 있고 안분값도 산출된 경우에만** 존재한다.
   *
   * 없는 경우 2가지: ① 일괄양도(구분 기재 없음 — 비교 대상 부재) ② 양도시 기준시가·감정가액이
   * 없어 안분값을 만들 수 없음(⏳ 1-C 한시 — 계획서 §12.7이 1-D에서 필수화를 확정했다).
   */
  saleSplitJudgment?: SaleSplitJudgmentDetail;
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
