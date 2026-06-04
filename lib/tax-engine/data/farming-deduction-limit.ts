/**
 * 영농상속공제 연도별 한도 (현행 상증법 §18의3① / 2022년 이전 §18②2호)
 *
 * 출처 — KoreanLaw 1차 검증 완료 (2026-06-04). 조세심판원이 적용 조문을 축자 인용한
 * 재결례 + 연혁 신설조문으로 4개 한도 전부 확정. "20억원" 구간은 존재하지 않음 (2→5→15→30 단일 progression).
 *   · 2억원: 조심2010중2776 (상속개시 2007.2.21) — §18②2호 "2억원을 한도로 한다" 축자 인용
 *   · 5억원: 조심2014중4319 (2012.2.20) · 조심2017중4714 (2013.11.8) — "5억원을 한도로 한다"
 *   · 15억원: 조심2019중4355 (2018.1.9) — "15억원을 한도로 한다"
 *   · 30억원: 법률 제19195호 (시행 2023.1.1, MST 247439) §18의3① 신설 —
 *            "영농상속 재산가액에 상당하는 금액(30억원을 한도로 한다)" (time_travel 20220101↔20230101 신설조문 직접 확인)
 *
 * 경계 시행일: 30억=2023.1.1 (법률 제19195호 — 정확). 15억=2016.1.1 (일부개정 공포번호 13557,
 *   MST 177183 — 메타 확인). 5억=2012.1.1 · 2억=floor — 교재 p.299 + 위 재결례 축자값으로 bracket 확정
 *   (5억: 2007.2.21=2억 ↔ 2012.2.20=5억 / 15억: 2013.11.8=5억 ↔ 2018.1.9=15억).
 *
 * string(YYYY-MM-DD) 비교 — cohabitShareRate(inheritance-deductions.ts) 패턴 일관, Date 변환 금지.
 */

/** 영농상속공제 한도 개정 구간 — 내림차순(최신 우선). `from` 이상이면 해당 limit. */
export const FARMING_DEDUCTION_LIMIT_HISTORY: ReadonlyArray<{
  from: string;
  limit: number;
}> = [
  { from: "2023-01-01", limit: 3_000_000_000 }, // 30억 (현행 §18의3① — 법률 제19195호)
  { from: "2016-01-01", limit: 1_500_000_000 }, // 15억 (§18②2호 — 조심2019중4355 확인)
  { from: "2012-01-01", limit: 500_000_000 }, //   5억 (조심2014중4319·2017중4714 확인)
  { from: "0000-01-01", limit: 200_000_000 }, //   2억 (2011.12.31 이전 — 조심2010중2776 확인)
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
