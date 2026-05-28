/**
 * listed-premium-exclusion-labels — §53⑧ 할증 배제 사유 라벨 단일 출처.
 *
 * 라벨 문구는 KoreanLaw MCP로 상증령 §53⑧ 1~9호 본칙 확인 후 작성.
 * 화면(`ListedStockBesshiAttributesSection`)·결과뷰(`ListedStockBesshiResultView`)·
 * PDF(`ListedStockBesshiPdfDocument`) 가 동일 출처 import — dual-truth 차단.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §1.법령 근거
 * Design: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md §3-0
 */

import type { ListedPremiumExclusionReason } from "@/lib/tax-engine/types/listed-stock-valuation.types";

/**
 * §53⑧ 1~9호 + §53④ 중소·중견기업(자동 배제) + none(미적용) 라벨.
 *
 * ★ 라벨 문구는 Pre-Do 단계에서 KoreanLaw MCP로 §53⑧ 본칙 끝까지 검증 후 최종 확정.
 *   현재 라벨은 1차 초안(요지 정리). 본칙 라벨과 차이 발견 시 본 파일만 정정.
 */
export const PREMIUM_EXCLUSION_LABELS: Record<ListedPremiumExclusionReason, string> = {
  none: "배제 사유 없음",
  smb_med: "중소·중견기업 (§53 ④)",
  art53_8_1: "§53 ⑧ 1호 — 평가기준일 전 3년 이내 계속 결손법인",
  art53_8_2: "§53 ⑧ 2호 — 평가기준일 직전 3개 사업연도 매출액이 평균 30억원 이하",
  art53_8_3: "§53 ⑧ 3호 — 사업개시 후 3년 미만",
  art53_8_4: "§53 ⑧ 4호 — 평가기준일 전후 6개월 이내 매매사실",
  art53_8_5: "§53 ⑧ 5호 — 상속·증여 후 1년 이내 청산",
  art53_8_6: "§53 ⑧ 6호 — 잔여 존속기한 3년 이내",
  art53_8_7: "§53 ⑧ 7호 — 주식 80% 이상 보유 법인 청산 진행",
  art53_8_8: "§53 ⑧ 8호 — 최대주주 보유 주식가액 합 30억원 이하",
  art53_8_9: "§53 ⑧ 9호 — 그 밖에 시행규칙으로 정하는 경우",
};

/** 사유별 짧은 배지 라벨 (사이드바·결과뷰 fine-print용) */
export const PREMIUM_EXCLUSION_SHORT_LABELS: Record<ListedPremiumExclusionReason, string> = {
  none: "할증 적용",
  smb_med: "중소·중견기업",
  art53_8_1: "§53⑧1호",
  art53_8_2: "§53⑧2호",
  art53_8_3: "§53⑧3호",
  art53_8_4: "§53⑧4호",
  art53_8_5: "§53⑧5호",
  art53_8_6: "§53⑧6호",
  art53_8_7: "§53⑧7호",
  art53_8_8: "§53⑧8호",
  art53_8_9: "§53⑧9호",
};
