/**
 * Phase 3 모듈 — 영업권 평가 (별지 부표3 5쪽 6.영업권)
 *
 * 법령: 상증령 §59 ② + §59 ③ + 상증규 §19 ① (KoreanLaw 검증 2026-05-22)
 *
 * §59②: "영업권의 평가는 다음 산식에 의하여 계산한 초과이익금액을 평가기준일 이후의
 *        영업권지속연수(원칙적으로 5년)를 고려하여 재정경제부령으로 정하는 방법에 따라
 *        환산한 가액에 의한다."
 *
 * §59③: "최근 3년간 순손익액의 가중평균액은 §56①·② 준용. 같은 조 §1 중 '1주당 순손익액'과
 *        §2 중 '1주당 추정이익'은 '순손익액'으로 본다."
 *        → 1주당이 아닌 회사 전체 가중평균 순손익액 사용
 *
 * §19① (상증규): "영 제59조제2항 산식에서 '재정경제부령이 정하는 율'이란 100분의 10을 말한다."
 *
 * §55③ 자동 배제 사유 (KoreanLaw 검증):
 *   1호: §54④ 1호(청산) 또는 3호(부동산 80%) → 영업권 가산 X
 *   2호: §54④ 2호(3년 미만) → 단, 무체재산권 현물출자+합산 3년 이상 시 가산
 *   3호: 평가기준일 직전 3년 계속 결손 → 영업권 가산 X
 *
 * 별지 양식 5쪽 산식:
 *   가. 가중평균 (§56① 준용 §59③) — 회사 전체 3년 가중평균 순손익액
 *   나. 가 × 50%
 *   다. 평가기준일 현재 자기자본 = §55① 영업권 포함 전 순자산가액
 *   라. 이자율 10% (상증규 §19①)
 *   마. 다 × 라
 *   바. 영업권 지속연수 = 5년
 *   사. ∑[(나−마)/(1+0.1)^n] for n=1..5
 *       ※ 매년 동일 상수일 때 ∑ = (나−마) × 3.79078676... ≈ 3.7908 (5년 연금현가)
 *   아. 매입 무체재산권 가액 중 감가상각비 차감 금액 (선택)
 *   자. 영업권 평가액 = max(사 − 아, 0)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import type {
  UnlistedGoodwillResult,
  UnlistedNetAssetOnlyReason,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export interface GoodwillInput {
  /** 가. 3년 가중평균 순손익액 (회사 전체, §59③ 준용 §56①) */
  weightedAvg3y: number;
  /** 다. 평가기준일 현재 자기자본 (§55① 영업권 포함 전 순자산가액) */
  selfCapital: number;
  /** 라. 이자율 (기본 0.10 — 상증규 §19①) */
  rate?: number;
  /** 아. 매입 무체재산권 가액 중 평가기준일까지 감가상각비 공제 금액 */
  intangibleDeduction?: number;
  /** §54④ 순자산 단독 평가 사유 (§55③ 자동 배제 1·2호 판정용) */
  netAssetOnlyReason?: UnlistedNetAssetOnlyReason;
  /** §55③ 3호 — 평가기준일 직전 3년 계속 결손 법인 */
  isContinuousLossLastThreeYears?: boolean;
}

/**
 * 영업권 평가 — §59② + §55③ 자동 배제
 *
 * @example PDF 사례 5 (p1538~1539)
 *   가중평균 = 28,750,000원
 *   나 = 14,375,000
 *   다 = 60,000,000 (자기자본)
 *   라 = 10%
 *   마 = 6,000,000
 *   초과이익 = 8,375,000
 *   사 = 8,375,000 × ∑(1/1.1^n, n=1..5) = 8,375,000 × 3.79078676... = 31,747,839
 *     ★ PDF는 3.7908 (5년 연금현가표 4자리 반올림) 사용 → 31,747,950 (PDF 정합)
 *     본 엔진은 정확한 ∑ 계산 → 31,747,839 (110원 차이는 PDF 표 반올림 사유)
 *   자 = 31,747,839 (무체재산권 차감 없음)
 *
 * @example PDF 사례 6 (p1548)
 *   가중평균 = 58,341,511
 *   나 = 29,170,755
 *   다 = 489,351,700 (영업권 포함 전 순자산)
 *   라 = 10%
 *   마 = 48,935,170
 *   초과이익 = max(29,170,755 − 48,935,170, 0) = max(△19,764,415, 0) = 0
 *   사 = 0
 *   자 = 0 (음수→0)
 */
export function calcGoodwill(input: GoodwillInput): UnlistedGoodwillResult {
  const rate = input.rate ?? 0.10;
  const durationYears = 5;
  const intangibleDeduction = input.intangibleDeduction ?? 0;

  // §55③ 자동 배제 판정
  let excludedByLaw:
    | "liquidation"
    | "real_estate_80"
    | "lt3y"
    | "continuous_loss_3y"
    | undefined;

  if (input.netAssetOnlyReason === "liquidation") {
    excludedByLaw = "liquidation"; // §55③ 1호 (§54④ 1호)
  } else if (input.netAssetOnlyReason === "real_estate_80") {
    excludedByLaw = "real_estate_80"; // §55③ 1호 (§54④ 3호)
  } else if (input.netAssetOnlyReason === "lt3y") {
    excludedByLaw = "lt3y"; // §55③ 2호 (§54④ 2호) — 본 PR은 단서(무체재산권 현물출자) 미적용
  } else if (input.isContinuousLossLastThreeYears) {
    excludedByLaw = "continuous_loss_3y"; // §55③ 3호
  }

  // 별지 양식 5쪽 산식
  const weightedAvgHalf = Math.floor(input.weightedAvg3y * 0.5); // 나
  const selfCapitalRate = Math.floor(input.selfCapital * rate); // 마
  const annualExcessProfit = Math.max(0, weightedAvgHalf - selfCapitalRate); // (나−마, 음수 0)

  // 사. ∑[(나−마)/(1+r)^n] for n=1..5
  // ★ 매년 상수일 때 ∑ = annualExcessProfit × annuityPresentValueFactor(5, r)
  // 5년 연금현가 정확값 (r=0.1): (1 − 1.1^-5)/0.1 = 3.79078676940...
  let goodwillCalc = 0;
  for (let n = 1; n <= durationYears; n++) {
    goodwillCalc += annualExcessProfit / Math.pow(1 + rate, n);
  }
  goodwillCalc = Math.floor(goodwillCalc);

  // 자. 영업권 평가액 = max(사 − 아, 0)
  let goodwillFinal = Math.max(0, goodwillCalc - intangibleDeduction);

  // §55③ 자동 배제 시 영업권 0
  if (excludedByLaw) {
    goodwillFinal = 0;
  }

  return {
    weightedAvg3y: input.weightedAvg3y,
    weightedAvgHalf,
    selfCapital: input.selfCapital,
    rate,
    selfCapitalRate,
    annualExcessProfit,
    durationYears,
    goodwillCalc,
    intangibleDeduction,
    goodwillFinal,
    excludedByLaw,
  };
}
