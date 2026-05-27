/**
 * §56② 추정이익 갈음 평가 — 비상장주식 1주당 순손익가치 대체 옵션 (PR-G)
 *
 * 법령 (KoreanLaw MCP 검증 2026-05-27, 상증령 mst=283637 / 상증규 mst=284609):
 *   영 §56②: 제1항에도 불구하고 다음 4요건을 모두 갖춘 경우 §54① 1주당 최근 3년 순손익액의
 *            가중평균액을 둘 이상의 신용평가전문기관·회계법인·세무법인이 산출한
 *            1주당 추정이익의 평균가액으로 할 수 있다.
 *     1호: 규 §17의3① 사유 해당 / 2호: §67·§68 신고기한까지 신고 /
 *     3호: 산정기준일·평가서작성일 신고기한 이내 / 4호: 산정기준일·상속개시(증여)일 동일 연도
 *   규 §17의3①: 추정이익 사용 사유 (1호 삭제 / 2~8호)
 *   규 §17의3④: "1주당 추정이익의 평균가액" = 자본시장법 시행령 §176의5② 금융위 수익가치 × §54① 환원율
 *     → §56① 대입 시 (수익가치×환원율) ÷ 환원율 = 수익가치. 환원율 이중적용 없음.
 *
 * ★ §56② "제1항에도 불구하고" → §56① 음수→0 단서를 displace. 추정이익 평균가액은
 *   수익가치(구조상 비음수) 기반이라 통상 양수이나, 음수 입력 시 0 강제 치환하지 않고
 *   하류 §54① 3:2 가중·80% 하한 보정에 위임(warning 표기).
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-estimated-profit-section-56-2.engine.design.md
 */

/** §17의3① 추정이익 사용 사유 (1호 삭제 — enum 제외) */
export type EstimatedProfitReasonCode =
  | "asset_receipt_50pct" // 2호: 자산수증이익등 가중평균 > (법인세차감전손익 − 자산수증이익등) 가중평균 × 50%
  | "merger_split_business_change" // 3호: 평가기준일 전 3년 중 합병·분할 또는 주요 업종 변경
  | "merger_gift_section38" // 4호: 법 §38 합병증여이익 산정 위한 합병당사법인 주식가액 산정
  | "closure_over_1yr" // 5호: 최근 3개 사업연도 중 1년 이상 휴업
  | "disposal_gain_50pct" // 6호: 유가증권·유형자산 처분손익 + 자산수증이익등 가중평균 > 법인세차감전손익 가중평균 × 50%
  | "sales_period_under_3yr" // 7호: 주요 업종 정상 매출발생기간 3년 미만
  | "similar_notified"; // 8호: 2~7호 유사 + 재정경제부장관 고시 사유

/** reasonCode → 한국어 라벨 (Record 타입으로 컴파일러가 누락 catch — enum-verification 정책) */
export const ESTIMATED_PROFIT_REASON_LABEL: Record<EstimatedProfitReasonCode, string> = {
  asset_receipt_50pct: "자산수증이익 등 가중평균이 50% 초과 (§17의3① 2호)",
  merger_split_business_change: "합병·분할 또는 주요 업종 변경 (§17의3① 3호)",
  merger_gift_section38: "법 §38 합병증여이익 산정 (§17의3① 4호)",
  closure_over_1yr: "최근 3개 사업연도 중 1년 이상 휴업 (§17의3① 5호)",
  disposal_gain_50pct: "유가증권·유형자산 처분손익 등 가중평균이 50% 초과 (§17의3① 6호)",
  sales_period_under_3yr: "주요 업종 정상 매출발생기간 3년 미만 (§17의3① 7호)",
  similar_notified: "2~7호 유사 고시 사유 (§17의3① 8호)",
};

export interface EstimatedProfitInput {
  /** §17의3① 사유 (택1) */
  reasonCode: EstimatedProfitReasonCode;
  /** 각 평가기관(신용평가전문기관·회계법인·세무법인)이 산출한 1주당 추정이익 — §56② 둘 이상 */
  agencyEstimates: number[];
  /** §56② 2호 — 신고기한까지 추정이익 평균가액 신고 */
  filedWithinDeadline: boolean;
  /** §56② 3호 — 산정기준일·평가서작성일이 신고기한 이내 */
  baseDateAndReportWithinDeadline: boolean;
  /** §56② 4호 — 산정기준일·상속개시(증여)일 동일 연도 */
  sameYearAsInheritanceOrGift: boolean;
}

export interface EstimatedProfitResult {
  /** 4요건 모두 충족 시 true → 순손익가치 갈음 */
  applied: boolean;
  /** 추정이익 평균가액 (아. 갈음) = floor(Σ agencyEstimates / n) */
  estimatedProfitAverage: number;
  /** 1주당 순손익가치 ⑤ = floor(평균가액 ÷ 환원율) */
  perShareIncomeValue: number;
  reasonCode?: EstimatedProfitReasonCode;
  agencyCount: number;
  warnings: string[];
}

/**
 * §56② 추정이익 갈음 적용 판정 + 1주당 순손익가치 산출.
 *
 * @param input 추정이익 입력
 * @param capRate §54① 순손익가치환원율 (기본 0.10 — 상증규 §17)
 * @returns 갈음 결과. applied=true일 때만 orchestrator가 netIncomePerShare 대체.
 */
export function applyEstimatedProfit(
  input: EstimatedProfitInput,
  capRate: number,
): EstimatedProfitResult {
  const warnings: string[] = [];
  const agencyCount = input.agencyEstimates.length;

  // ── 요건 검증 (§56② 모두 충족 = AND) ──
  const hasTwoAgencies = agencyCount >= 2; // §56② "둘 이상"
  const proceduralOk =
    input.filedWithinDeadline &&
    input.baseDateAndReportWithinDeadline &&
    input.sameYearAsInheritanceOrGift; // 2·3·4호

  if (!hasTwoAgencies) {
    warnings.push(
      `§56② 추정이익 갈음은 둘 이상의 평가기관 산출액이 필요합니다 (현재 ${agencyCount}개).`,
    );
  }
  if (!proceduralOk) {
    warnings.push(
      "§56② 절차 요건(2호 신고기한 내 신고·3호 산정기준일/작성일·4호 동일 연도) 충족 확인이 필요합니다.",
    );
  }

  const applied = hasTwoAgencies && proceduralOk;

  // ── 추정이익 평균가액 (원 미만 절사) ──
  const sum = input.agencyEstimates.reduce((acc, v) => acc + v, 0);
  const estimatedProfitAverage = agencyCount > 0 ? Math.floor(sum / agencyCount) : 0;

  if (estimatedProfitAverage < 0) {
    warnings.push(
      "추정이익 평균가액이 음수입니다 — 수익가치 입력을 확인하세요. (하류 80% 순자산 하한으로 보정)",
    );
  }

  // ── 1주당 순손익가치 = 평균가액 ÷ 환원율 (차.) ──
  // §56② 가 §56① 음수→0 단서를 displace → 음수 평균도 0 강제 치환하지 않음.
  const safeRate = capRate > 0 ? capRate : 0.1;
  const perShareIncomeValue = Math.floor(estimatedProfitAverage / safeRate);

  return {
    applied,
    estimatedProfitAverage,
    perShareIncomeValue,
    reasonCode: input.reasonCode,
    agencyCount,
    warnings,
  };
}
