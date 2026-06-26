/**
 * 신고세액공제 (상증법 §69)
 *
 * 법정신고기한 내에 과세표준 신고를 한 경우 산출세액의 일정 비율을 공제.
 * 공제율은 상속개시일/증여일 기준 연도별로 다름 (10%→7%→5%→3%, 아래 표 참조).
 *
 * 신고기한:
 *   상속세 : 상속개시일이 속하는 달의 말일로부터 6개월 (비거주자 9개월)
 *   증여세 : 증여받은 날이 속하는 달의 말일로부터 3개월
 *
 * 공제 기준:
 *   (산출세액 - 증여세액공제 - 외국납부세액공제 - 단기재상속세액공제) × 율
 *
 * 단, 조특법 §30의5·§30의6 특례 적용 시는 특례 세액에서 공제.
 */

import { TAX_CREDIT } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";

// ============================================================
// 신고세액공제율 — 연도별 (상속개시일/증여일 기준)
// ============================================================

/**
 * §69 신고세액공제율 연혁 — 법률 제14388호(2016.12.20 공포, 2017.1.1 시행) §69 개정 +
 * 부칙 적용례로 단계 인하. 기준일 = 상속개시일 / 증여일.
 *   ~2016-12-31 = 10% / 2017 = 7% / 2018 = 5% / 2019-01-01~ = 3%
 * 내림차순 — 기준일 이상(d >= from)인 첫 엔트리 적용. 역사 확정 데이터(정적 상수).
 */
const FILING_CREDIT_RATE_TABLE = [
  { from: "2019-01-01", rate: 0.03 },
  { from: "2018-01-01", rate: 0.05 },
  { from: "2017-01-01", rate: 0.07 },
  { from: "0000-01-01", rate: 0.1 }, // 2016-12-31 이전 catch-all
] as const;

/** 현행 신고세액공제율 (기준일 미전달 시 fallback) */
const CURRENT_FILING_CREDIT_RATE = 0.03;

/**
 * 기준일(상속개시일/증여일)이 속하는 시점의 §69 신고세액공제율.
 * 미전달 시 현행 3%(무회귀 안전판) — 호출처는 항상 날짜 전달 권장.
 * `0000-01-01` catch-all(=10%)과 미전달 fallback(=3%)이 다른 것은 의도적:
 *   날짜가 있는데 과거면 10%, 날짜 자체가 없으면 안전하게 현행 3%.
 */
export function resolveFilingCreditRate(referenceDate?: string): number {
  if (!referenceDate) return CURRENT_FILING_CREDIT_RATE;
  const d = referenceDate.slice(0, 10);
  return FILING_CREDIT_RATE_TABLE.find((r) => d >= r.from)?.rate ?? CURRENT_FILING_CREDIT_RATE;
}

// ============================================================
// 신고세액공제 계산
// ============================================================

export interface FilingCreditInput {
  /** 법정신고기한 내 신고 여부 */
  isFiledOnTime: boolean;
  /**
   * 공제 기준 산출세액
   * (산출세액 - 증여세액공제 - 외국납부공제 - 단기재상속공제)
   * 조특법 특례 적용 시: 특례 세액
   */
  taxBeforeFilingCredit: number;
  /** 상속개시일/증여일 — 연도별 공제율 결정. 미전달 시 현행 3%. */
  referenceDate?: string;
}

export interface FilingCreditResult {
  creditAmount: number;
  /** 적용된 신고세액공제율 (결과 echo·표시용) */
  appliedRate: number;
  breakdown: CalculationStep[];
}

/**
 * 신고세액공제 계산 (§69)
 *
 * @param input 신고세액공제 입력
 */
export function calcFilingCredit(input: FilingCreditInput): FilingCreditResult {
  const { isFiledOnTime, taxBeforeFilingCredit, referenceDate } = input;
  const appliedRate = resolveFilingCreditRate(referenceDate);
  const ratePct = appliedRate * 100;

  if (!isFiledOnTime || taxBeforeFilingCredit <= 0) {
    return {
      creditAmount: 0,
      appliedRate,
      breakdown: [
        {
          label: isFiledOnTime
            ? "신고세액공제 — 공제 기준세액 없음"
            : "신고세액공제 — 법정기한 내 미신고",
          amount: 0,
          lawRef: TAX_CREDIT.FILING_CREDIT,
        },
      ],
    };
  }

  const creditAmount = applyRate(taxBeforeFilingCredit, appliedRate);

  return {
    creditAmount,
    appliedRate,
    breakdown: [
      {
        label: "신고세액공제 기준세액",
        amount: taxBeforeFilingCredit,
        lawRef: TAX_CREDIT.FILING_CREDIT,
      },
      {
        label: `신고세액공제 (${ratePct}%)`,
        amount: creditAmount,
        lawRef: TAX_CREDIT.FILING_CREDIT,
        note: "법정신고기한 내 신고",
      },
    ],
  };
}
