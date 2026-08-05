/**
 * 검증 매니페스트 추가분 — 지방세법 **시행규칙**
 *
 * 배경은 `additions-local-decree.ts` 상단과 같다 — `LAW_ALIAS` 키 집합이 커버리지
 * 화이트리스트를 겸하므로, 등재 전까지 "지방세법 시행규칙 §…" 인용은 모수에서 조용히 빠진다.
 *
 * 2026-08-05에 공장용지 기준면적 판정(`NBL.FACTORY_LAND_SEPARATE`)이 「지방세법 시행규칙」
 * §50을 인용하며 이 법령이 처음 등장했다. `legal-verification-unverifiable.test.ts`가 즉시
 * 잡아냈고, 법제처 조문 API로 조회 가능한 법령이므로 「검증 불가」가 아니라 여기에 등록한다.
 *
 * ⚠️ **실질은 별표 6에 있다.** §50 본문은 "별표 6에 따른다"는 위임 한 줄뿐이고,
 * 산식(연면적 × 100 ÷ 업종별 기준공장면적률)과 추가 인정기준은 별표에 있다.
 * 법제처 조문 API는 별표 본문을 반환하지 않으므로 **이 규칙은 위임 구조가 바뀌는 것만
 * 잡는다** — 별표 6 자체의 개정(직전 2025.10.31)은 잡지 못한다.
 * 별표 확인은 `get_annexes("지방세법 시행규칙 별표6")` 또는 `target=admbyl` 수동 조회가 필요하다.
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const LOCAL_RULE_ADDITIONS: VerificationRule[] = [
  {
    id: "LOCAL_RULE.FACTORY_SITE_STANDARD_AREA",
    citation: "지방세법 시행규칙 §50",
    keywords: [
      "공장입지기준면적",
      "영 제102조제1항제1호",
      "행정안전부령으로 정하는 공장입지기준면적",
      "별표 6에 따른 공장입지기준면적",
    ],
    keywordMode: "ALL",
  },
];
