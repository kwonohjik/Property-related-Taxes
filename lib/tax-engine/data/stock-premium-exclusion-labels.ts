/**
 * stock-premium-exclusion-labels — §53⑧ 할증 배제 사유 라벨 단일 출처 (상장·비상장 공용).
 *
 * 라벨 문구는 KoreanLaw MCP로 상증령 §53⑧ 1~9호 본칙 확인 후 작성 (검증 2026-06-27, 시행 20260227).
 * 화면(상장 `ListedStockBesshiAttributesSection`·비상장 `CorporateInfoSection`)·결과뷰·PDF가
 * 동일 출처 import — dual-truth 차단.
 *
 * Design: docs/02-design/features/stock-premium-exclusion-53-8-2-correction.engine.design.md §2-2
 */

import type {
  StockPremiumExclusionReason,
  Section53_8_2FailReason,
} from "@/lib/tax-engine/types/stock-premium-exclusion.types";

/** §53⑧ 1~9호 + none(미적용) — Record로 enum 누락을 컴파일러가 catch. */
export const STOCK_PREMIUM_EXCLUSION_LABELS: Record<StockPremiumExclusionReason, string> = {
  none: "배제 사유 없음",
  continuous_loss_3y: "§53 ⑧ 1호 — 평가기준일 전 3년 이내 계속 결손법인",
  all_sold_within_6m:
    "§53 ⑧ 2호 — 평가기준일 전후 6개월(증여 전6·후3월) 내 주식 전부 매각(§49①1호 적합)",
  calc_gift_profit: "§53 ⑧ 3호 — §28·29·29의2·29의3·30 증여이익 계산",
  subsidiary_other_max: "§53 ⑧ 4호 — 다른 법인의 최대주주에 해당하여 그 주식을 평가",
  all_negative_op_income_3y: "§53 ⑧ 5호 — 사업개시 3년 이내 + 영업이익 모두 0 이하",
  liquidation_confirmed: "§53 ⑧ 6호 — 신고기한 이내 청산 확정",
  not_max_after_succession: "§53 ⑧ 7호 — 상속·증여로 최대주주에 해당하지 않게 된 경우",
  deemed_gift_nominee: "§53 ⑧ 8호 — §45의2 명의신탁 증여의제",
  small_medium_enterprise: "§53 ⑧ 9호 — 중소·중견기업",
};

/** 사유별 짧은 배지 라벨 (사이드바·결과뷰 fine-print용) */
export const STOCK_PREMIUM_EXCLUSION_SHORT_LABELS: Record<StockPremiumExclusionReason, string> = {
  none: "할증 적용",
  continuous_loss_3y: "§53⑧1호",
  all_sold_within_6m: "§53⑧2호",
  calc_gift_profit: "§53⑧3호",
  subsidiary_other_max: "§53⑧4호",
  all_negative_op_income_3y: "§53⑧5호",
  liquidation_confirmed: "§53⑧6호",
  not_max_after_succession: "§53⑧7호",
  deemed_gift_nominee: "§53⑧8호",
  small_medium_enterprise: "중소·중견기업",
};

/** §53⑧2호 게이트 실패 안내 — 요건 미충족 시 할증 적용 사유(결과 rose tone·warnings). */
export const SECTION_53_8_2_FAIL_LABELS: Record<Section53_8_2FailReason, string> = {
  not_all_sold: "§53⑧2호: 최대주주 주식 전부 매각이 아니므로 할증 배제 불가 → 할증 적용",
  not_normal_transaction:
    "§53⑧2호: §49①1호 정상 매매거래 요건 미충족 → 할증 배제 불가 → 할증 적용",
  out_of_period:
    "§53⑧2호: 매매계약일이 허용기간(상속 ±6월/증여 전6·후3월) 밖 → 할증 배제 불가 → 할증 적용",
  missing_input: "§53⑧2호 보조입력(매매계약일 등) 필요",
};
