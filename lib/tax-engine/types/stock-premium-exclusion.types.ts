/**
 * stock-premium-exclusion.types — 주식 할증평가(§63③) 배제사유 공용 타입.
 *
 * 상장(EstateItem)·비상장(UnlistedStockValuationInput) 양쪽이 import하는 단일 출처.
 * 라벨 단일 출처: lib/tax-engine/data/stock-premium-exclusion-labels.ts
 *
 * 법령: 상증법 §63③ · 상증령 §53⑧(1~9호) · 상증령 §49①1호·②1호
 *   (KoreanLaw 검증 2026-06-27, 시행 20260227)
 * Design: docs/02-design/features/stock-premium-exclusion-53-8-2-correction.engine.design.md §2
 */

/** §53⑧ 1~9호 할증 배제 사유 + 미적용(none). 상장·비상장 공용. */
export type StockPremiumExclusionReason =
  | "none"
  | "continuous_loss_3y" // §53⑧1 평가기준일 전 3년 계속 결손
  | "all_sold_within_6m" // §53⑧2 전부매각(§49①1호 적합) — 2호 게이트 대상
  | "calc_gift_profit" // §53⑧3 §28·29·29의2·29의3·30 증여이익 계산
  | "subsidiary_other_max" // §53⑧4 다른 법인 최대주주 보유주식 평가
  | "all_negative_op_income_3y" // §53⑧5 3년내 사업개시+영업이익 모두 0 이하
  | "liquidation_confirmed" // §53⑧6 신고기한 내 청산 확정
  | "not_max_after_succession" // §53⑧7 상속·증여로 최대주주 미해당
  | "deemed_gift_nominee" // §53⑧8 §45의2 명의신탁 증여의제
  | "small_medium_enterprise"; // §53⑧9 중소·중견기업

/**
 * §53⑧2호 전부매각 보조입력 (2호 선택 시에만 존재 — optional 3-state).
 * 평가기준일 D는 별도 주입(상장 valuationDate / 비상장 evaluationDate).
 */
export interface Section53_8_2Input {
  /** ⓐ §53⑧2 — 최대주주등 보유 주식 전부 매각 */
  allSharesSold: boolean;
  /** ⓑ §49①1호 적합 — 특수관계 부당거래·소액 비상장주식 아닌 정상 매매 */
  meetsArticle49_1_1: boolean;
  /** ⓒ §49②1호 기준일 = 매매계약일 (S). JSON 경유 string 도달 가능 — 게이트가 coerce. */
  saleContractDate: Date | string;
  /** ⓓ 상속(±6월) / 증여(전6·후3월) */
  transferType: "inheritance" | "gift";
}

export type Section53_8_2FailReason =
  | "not_all_sold"
  | "not_normal_transaction"
  | "out_of_period"
  | "missing_input";

export interface Section53_8_2Result {
  eligible: boolean;
  failReason?: Section53_8_2FailReason;
}

/**
 * 레거시 상장 배제사유 코드(art53_8_*·smb_med)를 공용 코드로 매핑.
 * Design §4-1·§5 마이그레이션 표. 매핑 불명 항목은 보수적으로 "none"(재선택 유도).
 */
export function migrateListedPremiumReason(legacy: string | undefined): StockPremiumExclusionReason {
  switch (legacy) {
    case "continuous_loss_3y":
    case "all_sold_within_6m":
    case "calc_gift_profit":
    case "subsidiary_other_max":
    case "all_negative_op_income_3y":
    case "liquidation_confirmed":
    case "not_max_after_succession":
    case "deemed_gift_nominee":
    case "small_medium_enterprise":
    case "none":
      return legacy; // 이미 공용 코드
    case "art53_8_1":
      return "continuous_loss_3y"; // 1호 의미 일치
    case "art53_8_4":
      return "all_sold_within_6m"; // 구 "매매사실" → 2호 의도 추정
    case "smb_med":
      return "small_medium_enterprise"; // 9호
    // art53_8_2·3·5·6·7·8·9 = 호 번호 무의미했음 → 보수적 초기화
    default:
      return "none";
  }
}
