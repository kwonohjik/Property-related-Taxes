/**
 * 주식 양도 — 가업상속공제 자산 취득가액 특례(소득세법 §97의2④) 입력·결과 타입
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.1
 */
import type { FamilyBusinessRateBasis } from "../../family-business-applied-rate";
import type { FamilyBusinessCgtDetail } from "../../transfer-tax-family-business";

/**
 * 종목(단건 취득) 입력.
 *
 * 상속개시일 = `StockTransferInput.acquisitionDate`, 상속개시일 현재 평가액 = 기존 실가 취득가액 입력
 * (`actualAcquisitionTotal`) — 같은 값을 두 번 받지 않는다(계획서 A-7).
 */
export interface StockFamilyBusinessInput {
  /** 피상속인의 1주당 취득가액 — 소득세법 §97의2④1호 「제97조제1항제1호에 따른 금액」 */
  decedentAcquisitionPricePerShare: number;
  /**
   * 피상속인 자본적지출 **총액** (선택) — 피상속인 취득가 base에 더한 뒤 적용률을 곱한다(계획서 Q-5 ·
   * 부동산 안 B와 같다). 해석례 미확보 상태의 채택이다.
   */
  decedentCapitalExpenditure?: number;
  /**
   * 가업상속공제적용률의 법정량 — 주식은 % 직접 입력이 없다(계획서 Q-7).
   * 양도일 2026.2.27. 이후 법인가업은 `corporate_business_assets`(소득세법 시행령 §163의2③2호).
   */
  fbRateBasis: FamilyBusinessRateBasis;
}

/**
 * 결과 상세 — 부동산 `FamilyBusinessCgtDetail`과 같은 모양(결과 카드 재사용)에 1주당·주식수를 더한다.
 *
 * - `decedentAcquisitionPrice` = 피상속인 1주당 취득가액 × 주식수
 * - `inheritanceMarketValue` = 상속개시일 현재 평가액 총액(실가 취득가액 입력)
 * - `cgtUnderSection97_2_4`·`cgtUnderSection97` = **결정세액**(가산세 제외 · 계획서 Q-6). 다종목이면 신고 단위 합계다
 *   (기본공제가 그룹 단위 연 1회라 종목 단독 차이와 다르다 — 계획서 §7.2 F1-11).
 *   가업 종목이 2건 이상이면 **전부를 함께** §97로 되돌린 차이 1회이고, 가업 종목마다 같은 값이 실린다 —
 *   종목 간에 더하지 말 것(`fbItemCount`).
 */
export interface StockFamilyBusinessDetail extends FamilyBusinessCgtDetail {
  decedentAcquisitionPricePerShare: number;
  shareCount: number;
  /** 적용률 법정량 — 주식은 항상 있다 */
  appliedRateBasis: FamilyBusinessRateBasis;
  /** 이 신고의 가업 종목 수 — 2 이상이면 세 금액(`cgtUnderSection97_2_4`·`cgtUnderSection97`·`creditAmount`)은 그 종목들의 합계 1회분 */
  fbItemCount: number;
  /**
   * lot 단위 입력에서 가업 lot이 **둘 이상** 배정됐을 때만 — lot마다 법정량·피상속인 취득가액이 다를 수 있어
   * 상단 `appliedRate`·`appliedRateBasis`는 첫 lot의 값이고 정확한 값은 여기 있다.
   */
  lots?: StockFamilyBusinessLotEcho[];
  /** 이동평균이라 의제 취득가액이 풀 평균에 섞였다 — `imputedAcquisitionPrice`는 FIFO 물량 기준 참고값 */
  pooled?: boolean;
}

/**
 * lot 단위 배정 요약 1건 — 가업 lot 하나가 이 양도에 배정된 몫(계획서 §7.7 L-f).
 * 금액은 전부 **배정 주식수 기준**이다(lot 전체가 아니다).
 */
export interface StockFamilyBusinessLotEcho {
  lotId?: string;
  /** 이 lot에서 매도에 배정된 주식수 */
  shares: number;
  appliedRate: number;
  appliedRateBasis: FamilyBusinessRateBasis;
  /** 피상속인 1주당 취득가액(자본조정 희석 뒤 값) */
  decedentAcquisitionPricePerShare: number;
  /** Σ 피상속인 1주당 × 배정 주식수 */
  decedentPart: number;
  /** Σ 상속개시일 평가 1주당 × 배정 주식수 */
  valuationPart: number;
  /** Σ ⌊자본적지출 총액 × 배정 주식수 ÷ lot 주식수⌋ */
  capex: number;
  /** Σ sub-lot 의제 취득원가(항별 절사). 이동평균(`pooled`)이면 FIFO 물량에 같은 산식을 댄 **참고값**이다 */
  buyCost: number;
}

/**
 * 가업 lot 배정 요약(`LotMatchingDetail.familyBusinessSummary`) — 결과 `familyBusinessDetail`의 입력.
 * `pooled`(이동평균)이면 실제 취득가액은 풀 평균 단가 × 주식수이고, 여기 금액은 FIFO 물량 기준 참고값이다.
 */
export interface StockFamilyBusinessLotSummary {
  pooled: boolean;
  shares: number;
  decedentPart: number;
  valuationPart: number;
  capex: number;
  buyCost: number;
  lots: StockFamilyBusinessLotEcho[];
}
