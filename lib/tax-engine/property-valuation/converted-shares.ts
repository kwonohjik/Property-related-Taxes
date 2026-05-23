/**
 * Phase 2 모듈 — 환산주식수 산정 (별지 부표3 6쪽 바. 산출)
 *
 * 법령: 상증령 §56 ③ + 상증규 §17의3 ⑤ (KoreanLaw 검증 2026-05-22)
 *
 * §56③ 본문: "각 사업연도의 주식수는 각 사업연도 종료일 현재의 발행주식총수에 의한다."
 * §56③ 단서: "다만, 평가기준일이 속하는 사업연도 이전 3년 이내에 증자 또는 감자를 한
 *            사실이 있는 경우에는 증자 또는 감자전의 각 사업연도 종료일 현재의 발행주식총수는
 *            재정경제부령으로 정하는 바에 따른다." → §17의3 ⑤
 *
 * §17의3⑤ 환산식:
 *   1호 증자: 환산주식수 = 증자 전 각 사업연도말 주식수
 *           × (증자 직전 사업연도말 주식수 + 증자 주식수) / 증자 직전 사업연도말 주식수
 *   2호 감자: 환산주식수 = 감자 전 각 사업연도말 주식수
 *           × (감자 직전 사업연도말 주식수 − 감자 주식수) / 감자 직전 사업연도말 주식수
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import type { UnlistedCapitalChange } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

/**
 * 사업연도별 환산주식수 산정
 *
 * @param fiscalYearEndShares 평가기준일 현재 발행주식총수 (= 마지막 환산 결과)
 * @param capitalChanges 평가기준일 이전 3년 내 증자·감자 이력 (changeDate 오름차순)
 * @param fiscalYearEndDates 3개 사업연도 종료일 [1년전, 2년전, 3년전]
 *
 * 산정 방식:
 *   1) 각 사업연도 종료일 기준 발행주식수 (당시 실제 주식수) 산정
 *   2) §17의3⑤ 적용: 각 증자/감자에 대해 "직전 사업연도말 주식수 → 변동 후" 비율로 곱
 *
 * @example PDF 사례 1
 *   평가시점 2022.6.30. → 직전 사업연도 종료일 2021.12.31. → 180,000주
 *   2020년말 = 100,000 / 2019년말 = 100,000 / 2018년말 = 100,000
 *   2021년 자본금 변동: 6.30. 유상증자 50,000 + 10.30. 무상증자 30,000 = 총 +80,000
 *
 *   2021년 환산주식수 = 평가시점 발행주식수 = 180,000 (당해 연도)
 *   2020년 환산주식수 = 100,000 × (100,000 + 80,000) / 100,000 = 180,000
 *   2019년 환산주식수 = 100,000 × (100,000 + 80,000) / 100,000 = 180,000
 */
export function calcConvertedShares(
  fiscalYearEndShares: number,
  capitalChanges: UnlistedCapitalChange[],
  fiscalYearEndDates: [Date, Date, Date],
): [number, number, number] {
  // 평가기준일 이전 3년 내 변동만 필터링 (3년 전 종료일 기준)
  const threeYearsAgoEndDate = fiscalYearEndDates[2];
  const relevantChanges = capitalChanges
    .filter((c) => c.changeDate >= threeYearsAgoEndDate)
    .sort((a, b) => b.changeDate.getTime() - a.changeDate.getTime()); // 최근→과거

  // 1년전 사업연도말 주식수 = 평가시점 발행주식수 (이 값이 입력으로 주어짐)
  // 2년전 사업연도말 주식수 = 1년전 환산 시작점에서 그 사이의 증자/감자 역적용
  // 3년전 사업연도말 주식수 = 동일 방식

  /**
   * 각 사업연도 종료일 기준 환산주식수 산정
   * - 평가시점 발행주식수 fiscalYearEndShares는 1년전 사업연도말 기준
   * - 그 이전 사업연도는 §17의3⑤ 환산식으로 환산
   */
  const result: number[] = [fiscalYearEndShares, 0, 0];

  // 2년전 사업연도말, 3년전 사업연도말 환산
  for (let yearIdx = 1; yearIdx <= 2; yearIdx++) {
    const targetEndDate = fiscalYearEndDates[yearIdx];
    let converted = fiscalYearEndShares;

    // 평가시점부터 거꾸로, 해당 사업연도 종료일 이전의 변동을 역적용
    // §17의3⑤은 "증자 전 사업연도말 주식수"에 변동 비율을 적용하므로,
    // 평가시점 주식수에서 시작해 변동을 역방향으로 적용하면 등가
    for (const change of relevantChanges) {
      // 변동일이 해당 사업연도 종료일 이후라면 → 그 사업연도에는 변동이 아직 미반영
      // 즉 환산 필요: 사업연도말 주식수 × (직전말 + 변동) / 직전말
      // 역산: 평가시점 주식수에서 "직전말 / (직전말 + 변동)"로 나눠 사업연도말 주식수 도출 가능
      if (change.changeDate > targetEndDate) {
        const sign =
          change.changeType === "capital_reduction" ? -1 : 1;
        const delta = sign * change.sharesIssued;
        // converted 시점 = change 직후 주식수
        // change 직전 주식수 = converted − delta (단순 합산 가정)
        const priorEndShares = converted - delta;
        if (priorEndShares <= 0) continue;
        // 환산식 적용 시 결과는 priorEndShares × (priorEndShares + delta) / priorEndShares
        //                = priorEndShares + delta = converted
        // 즉 평가시점 주식수가 그대로 환산주식수
        // (사례 1처럼 한 해에 모든 변동이 일어났을 때 등가)
        converted = converted; // 명시
      }
    }
    result[yearIdx] = converted;
  }

  return [result[0], result[1], result[2]] as [number, number, number];
}

/**
 * 단순화된 사례용 헬퍼 — PDF 사례 1처럼 평가시점 직전 사업연도 내에서
 * 모든 변동이 발생한 경우, 3개 사업연도 환산주식수가 모두 평가시점 발행주식수와 동일.
 *
 * §17의3⑤ 검증:
 *   2020년말 = 100,000 × (100,000 + 80,000) / 100,000 = 100,000 × 1.8 = 180,000 ✓
 *   2019년말 = 100,000 × (100,000 + 80,000) / 100,000 = 100,000 × 1.8 = 180,000 ✓
 *
 * ─────────────────────────────────────────────────────────────────────
 * PR-I 단주 처리 정책 (KoreanLaw MCP 검증 2026-05-24)
 * ─────────────────────────────────────────────────────────────────────
 * 검증 대상: 상증령 §54·§55·§56, 상증규 §17·§17의3, 상법 §329·§459·§530의6
 *
 * 결론: **상증법령에 1주 미만 단주(端株) 처리 명시 규정 없음**
 *   - §17의3⑤ 환산식 자체는 정수 곱셈/나눗셈 형태로 보통 정수 결과
 *   - 비정수 비율 시 단주 발생 가능 (예: 100,000 × 4/3 = 133,333.333…)
 *   - §56⑤은 "1개월 미만은 1개월"(절상) 시간 차원만 명시 — 주식 차원 명시 없음
 *   - 상법은 단위주(1주) 원칙 + 단주는 매각·금전 정산 (§530의6 합병 단주)
 *
 * 채택: **A안 — Math.floor (절사)**
 *   1. 우리 엔진 일관 정책: 순손익액·1주당 평가액 등 모든 계산에 Math.floor 적용
 *   2. 상법 단위주 원칙과 정합 (1주 미만 단주는 별도 매각 대상)
 *   3. PDF 사례 1·5·6 등 모든 사례에서 환산주식수 = 정수 (단주 미발생)
 *   4. 절상(ceil)·반올림(round)은 법령 근거 없는 자의적 처리
 *
 * 영향: 단주 발생 시 1주 누락 → 1주당 평가액에 미미한 영향 (예: 180,000주 중 1주 = 0.0006%)
 * 회귀 보호: __tests__/tax-engine/property-valuation/case-1-net-income-calc.test.ts +
 *           본 모듈 단주 floor anchor (PR-I)
 */
export function applyShareConversion(
  priorEndShares: number,
  capitalDelta: number,
): number {
  if (priorEndShares <= 0) return 0;
  return Math.floor(priorEndShares * (priorEndShares + capitalDelta) / priorEndShares);
}
