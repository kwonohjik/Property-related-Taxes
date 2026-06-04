/**
 * 외국납부세액공제
 *
 * 상속세 §29 / 상증령 §21①: 국외 상속재산에 대한 외국 상속세액 공제
 * 증여세 §59: 국외재산에 대한 외국 증여세액 공제
 *
 * 공제 = Min( ① , ② )   [상증령 §21①]
 *   ① 한도 = 상속세 산출세액 × ( 외국 법령에 따라 상속세가 부과된 상속재산의 과세표준
 *                              ÷ 상증법 §25① 상속세 과세표준 )
 *   ② = 외국 법령에 따라 부과된 상속세액
 *
 * ※ "산출세액"은 §28 증여세액공제 등 세액공제 차감 前 원 산출세액. 잔액 클램핑은
 *   호출부(calcInheritanceTaxCredits)에서 §30 패턴으로 적용.
 * ※ 1997.11.10 개정으로 재산가액 점유비 → 과세표준 점유비.
 * ※ gift(§59) 호출부는 overallTaxBase를 전달하지 않으므로 한도 = 산출세액 전액(기존 동작 보존).
 */

import { TAX_CREDIT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";

// ============================================================
// 외국납부세액공제 계산
// ============================================================

export interface ForeignTaxCreditInput {
  /** 외국에서 부과된 상속·증여세액 (= 한도 비교 대상 ②) */
  foreignTaxPaid: number;
  /** 상속세 산출세액 — §28 차감 前 원본. 한도① 계산 기준. */
  computedTax: number;
  /** 국외 상속재산 과세표준 (§21① 한도식 분자). 미입력/0 → 한도 0 → 공제 0. */
  foreignInheritanceTaxBase?: number;
  /**
   * §25① 상속세 전체 과세표준 (분모). calcInheritanceTaxCredits이 엔진 taxBase 주입.
   * undefined(gift §59 호출부 — 미전달) → 한도 = computedTax 전액(기존 동작 보존).
   * number(inheritance 호출부 — taxBase ?? 0) → §21① 점유비 한도.
   */
  overallTaxBase?: number;
  /** @deprecated 도달 불가 dead code — 미사용. (구 한도 분기) */
  foreignPropertyRatio?: number;
  /** 'inheritance' = §29, 'gift' = §59 */
  mode: "inheritance" | "gift";
}

/** §29 한도 산식 표시용 echo (inheritance 점유비 한도 적용 시만) */
export interface ForeignTaxCreditDetail {
  computedTax: number;
  foreignTaxPaid: number;
  foreignInheritanceTaxBase: number;
  overallTaxBase: number;
  creditLimit: number;
  creditAmount: number;
}

export interface ForeignTaxCreditResult {
  creditAmount: number;
  breakdown: CalculationStep[];
  detail?: ForeignTaxCreditDetail;
}

/**
 * 외국납부세액공제 계산 (§29 / §59)
 *
 * @param input 외국납부세액공제 입력
 */
export function calcForeignTaxCredit(
  input: ForeignTaxCreditInput,
): ForeignTaxCreditResult {
  const {
    foreignTaxPaid,
    computedTax,
    foreignInheritanceTaxBase,
    overallTaxBase,
    mode,
  } = input;

  const lawRef =
    mode === "inheritance" ? TAX_CREDIT.INH_FOREIGN : TAX_CREDIT.GIFT_FOREIGN;
  const limitLawRef =
    mode === "inheritance" ? TAX_CREDIT.INH_FOREIGN_LIMIT : TAX_CREDIT.GIFT_FOREIGN;

  if (!foreignTaxPaid || foreignTaxPaid <= 0) {
    return {
      creditAmount: 0,
      breakdown: [
        { label: "외국납부세액공제 — 해당 없음", amount: 0, lawRef },
      ],
    };
  }

  const breakdown: CalculationStep[] = [
    { label: "외국에서 납부한 상속·증여세액", amount: foreignTaxPaid, lawRef },
  ];

  // 한도 계산 — overallTaxBase 분기 (gift 회귀 방지)
  let creditLimit: number;
  let usesProportion: boolean;

  if (overallTaxBase === undefined) {
    // gift §59 호출부 — 점유비 한도 미적용, 산출세액 전액 한도 (기존 동작 보존)
    creditLimit = computedTax;
    usesProportion = false;
    breakdown.push({
      label: "공제 한도 (산출세액 전액 — 국외재산 과세표준 미적용)",
      amount: creditLimit,
      lawRef: limitLawRef,
    });
  } else {
    // inheritance §29 — 상증령 §21① 과세표준 점유비 한도
    // 산출세액 × (국외 상속재산 과세표준 ÷ 상속세 과세표준)
    // safeMultiplyThenDivide: 분모 0 → 0, 분자×산출세액 overflow → BigInt floor.
    const numerator = foreignInheritanceTaxBase ?? 0;
    creditLimit = safeMultiplyThenDivide(computedTax, numerator, overallTaxBase);
    usesProportion = true;
    breakdown.push({
      label: "공제 한도 — 산출세액 × (국외 상속재산 과세표준 ÷ 상속세 과세표준)",
      amount: creditLimit,
      lawRef: limitLawRef,
      note: `${computedTax.toLocaleString()} × (${numerator.toLocaleString()} ÷ ${overallTaxBase.toLocaleString()})`,
    });
  }

  const creditAmount = Math.min(foreignTaxPaid, creditLimit);

  if (foreignTaxPaid > creditLimit) {
    breakdown.push({
      label: "공제 한도 적용 후 외국납부세액공제",
      amount: creditAmount,
      note: `한도 초과액 ${(foreignTaxPaid - creditLimit).toLocaleString()}은(는) 공제 불가`,
    });
  }

  const detail: ForeignTaxCreditDetail | undefined = usesProportion
    ? {
        computedTax,
        foreignTaxPaid,
        foreignInheritanceTaxBase: foreignInheritanceTaxBase ?? 0,
        overallTaxBase: overallTaxBase ?? 0,
        creditLimit,
        creditAmount,
      }
    : undefined;

  return { creditAmount, breakdown, detail };
}
