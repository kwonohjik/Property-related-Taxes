/**
 * 영농상속공제 연도별 한도 (상증법 §18의3① + 부칙)
 *
 * 출처 (2026-06-04 검증):
 *   - 현행 30억: KoreanLaw time-travel 20220101↔20230101 — §18의3① "30억원을 한도" 2023.1.1 신설 확정 (MST 247439).
 *   - 과거 한도(2022 이전 §18②2호): 교재「상속·증여세 2026」제2권 p.299 개정연혁 표 기준.
 *     ※연혁법령 mst 직접조회 NOT_FOUND — 교재 anchor 채택 (feedback_pdf_example_test_anchoring).
 *     ※교재 "20억" 칸은 경계 모호 — 실무 정설 4단계(2/5/15/30) 채택. 후속 부칙 직접확정 시 재검토.
 *
 * string(YYYY-MM-DD) 비교 — cohabitShareRate(inheritance-deductions.ts) 패턴 일관, Date 변환 금지.
 */

/** 영농상속공제 한도 개정 구간 — 내림차순(최신 우선). `from` 이상이면 해당 limit. */
export const FARMING_DEDUCTION_LIMIT_HISTORY: ReadonlyArray<{
  from: string;
  limit: number;
}> = [
  { from: "2023-01-01", limit: 3_000_000_000 }, // 30억 (현행, §18의3①)
  { from: "2016-01-01", limit: 1_500_000_000 }, // 15억 (§18②2호)
  { from: "2012-01-01", limit: 500_000_000 }, //   5억
  { from: "0000-01-01", limit: 200_000_000 }, //   2억 (2011.12.31 이전)
];

/**
 * 상속개시일(deathDate, YYYY-MM-DD string)별 영농상속공제 한도.
 * deathDate 미입력 시 현행 30억 (legacy 호환 — FARMING_MAX와 동일).
 */
export function resolveFarmingDeductionLimit(deathDate?: string): number {
  if (!deathDate) return 3_000_000_000;
  for (const tier of FARMING_DEDUCTION_LIMIT_HISTORY) {
    if (deathDate >= tier.from) return tier.limit;
  }
  return 3_000_000_000;
}
