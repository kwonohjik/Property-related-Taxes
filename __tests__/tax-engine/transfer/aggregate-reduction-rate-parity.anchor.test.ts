/**
 * anchor — 다건 합산 M-8 감면율 패리티 (D8-01)
 *
 * 결함: M-8(`transfer-tax-aggregate-reduction-step.ts`)은 자산이 노출한 `reducibleIncome`을
 * 「감면율이 이미 반영된 감면대상소득」으로 전제하고
 * `safeMultiplyThenDivide(calculatedTax, reducibleIncome, aggregateTaxBase)`를 그대로 감면세액으로 쓴다.
 *
 * 그런데 `calcReductions`의 네 후보는 **감면율을 곱하지 않은** 값을 넣는다 — 별지84호 부표1 ⑲가
 * 「감면율 前」 금액을 요구하기 때문이다(부표1 작성방법 16번, 감면율은 별도 칸):
 *   `long_term_rental`(0.7·0.5) · `rental_97_main`(0.5) · hybrid tax_amount · `new_housing`
 * 반면 §77·§77의2·§77의3·§69는 감면율을 반영한 값을 넣는다.
 *
 * ⇒ `rental_97_main`(§97① 본문 50%)은 다건 경로에서 **정확히 2배** 감면된다.
 *
 * 설계: 표시용 `reducibleIncome`은 그대로 두고(⑲·PDF·상세명세 5개 호출부 무회귀),
 * M-8이 **추가로 곱해야 할** 감면율을 `aggregateReductionRate`로 운반한다.
 * 이미 감면율이 반영된 유형은 1(또는 미설정)이다.
 *
 * 핵심 불변식: **자산 1건짜리 다건 = 단건**. 경로가 세액을 가르면 안 된다.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateReductions,
  type AggregateAssetRecord,
} from "@/lib/tax-engine/transfer-tax-aggregate-reduction-step";
import type { CalculationStep } from "@/lib/tax-engine/transfer-tax";

const CALCULATED_TAX = 133_060_000;
const TAX_BASE = 397_500_000;

function runM8(
  records: Array<{
    propertyId: string;
    reductionTypeApplied: string;
    reducibleIncome: number;
    aggregateReductionRate?: number;
  }>,
  taxableAfterReduction: number[],
) {
  const assetRecords = records.map((r) => ({
    item: { propertyId: r.propertyId },
    result: {
      isExempt: false,
      reductionTypeApplied: r.reductionTypeApplied,
      reducibleIncome: r.reducibleIncome,
      aggregateReductionRate: r.aggregateReductionRate,
    },
  })) as unknown as AggregateAssetRecord[];

  return aggregateReductions({
    assetRecords,
    calculatedTax: CALCULATED_TAX,
    taxableAfterReduction,
    totalBasicDeduction: 0,
    taxYear: 2025,
    priorReductionUsage: [],
    comparedByGroups: false,
    steps: [] as CalculationStep[],
    warnings: [],
  });
}

describe("M-8 감면율 패리티", () => {
  it("§97① 본문(50%)은 자산 1건만 있어도 산출세액의 50%만 감면한다", () => {
    // calcReductions가 내보내는 값: reducibleIncome = transferIncome × rentalGainRatio(=1) — 감면율 前
    //                               aggregateReductionRate = 0.5 (rental-97-main.ts:143)
    const out = runM8(
      [
        {
          propertyId: "A",
          reductionTypeApplied: "rental_97_main",
          reducibleIncome: TAX_BASE,
          aggregateReductionRate: 0.5,
        },
      ],
      [TAX_BASE],
    );
    expect(out.reductionAmount).toBe(Math.floor(CALCULATED_TAX * 0.5));
    expect(out.reductionAmount).not.toBe(CALCULATED_TAX);
  });

  it("§97① 단서(면제 100%)는 전액 감면 — 감면율 1", () => {
    const out = runM8(
      [
        {
          propertyId: "A",
          reductionTypeApplied: "rental_97_proviso",
          reducibleIncome: TAX_BASE,
          aggregateReductionRate: 1,
        },
      ],
      [TAX_BASE],
    );
    expect(out.reductionAmount).toBe(CALCULATED_TAX);
  });

  it("§77 공익수용은 reducibleIncome에 감면율이 이미 반영돼 있어 추가로 곱하지 않는다", () => {
    const RATE = 0.15;
    const out = runM8(
      [
        {
          propertyId: "A",
          reductionTypeApplied: "public_expropriation",
          reducibleIncome: Math.floor(TAX_BASE * RATE),
          // aggregateReductionRate 미설정 ⇒ 1로 취급
        },
      ],
      [TAX_BASE],
    );
    expect(out.reductionAmount).toBe(Math.floor(CALCULATED_TAX * RATE));
  });

  it("다건 합산에서도 유형별 감면율이 각각 적용된다", () => {
    // A: §97① 본문 50% (감면대상소득 3억) · B: 감면 없음 (1억)
    const out = runM8(
      [
        {
          propertyId: "A",
          reductionTypeApplied: "rental_97_main",
          reducibleIncome: 300_000_000,
          aggregateReductionRate: 0.5,
        },
      ],
      [300_000_000, 97_500_000],
    );
    const rawFull = Math.floor((CALCULATED_TAX * 300_000_000) / TAX_BASE);
    expect(out.reductionAmount).toBe(Math.floor(rawFull * 0.5));
  });

  it("같은 유형 안에서 자산마다 감면율이 다르면 자산별로 곱해 합산한다", () => {
    // `long_term_rental`(정밀 장기임대 엔진)은 `housingType`·등록시기에 따라 rate가
    // 1.0 / 0.7 / 0.5로 갈린다(`rental-housing-reduction.ts:284-296`). `new_housing`도
    // 가격·시기 matrix로 갈린다. 즉 **같은 type 문자열 아래 rate가 균일하지 않다**.
    // 그룹 rate 하나를 last-write-wins로 덮으면 한쪽 자산에 틀린 율이 곱해진다.
    const A = 200_000_000;
    const B = 197_500_000;
    const out = runM8(
      [
        { propertyId: "A", reductionTypeApplied: "long_term_rental", reducibleIncome: A, aggregateReductionRate: 0.7 },
        { propertyId: "B", reductionTypeApplied: "long_term_rental", reducibleIncome: B, aggregateReductionRate: 0.5 },
      ],
      [A, B],
    );
    const ratedIncome = Math.floor(A * 0.7) + Math.floor(B * 0.5);
    expect(out.reductionAmount).toBe(Math.floor((CALCULATED_TAX * ratedIncome) / TAX_BASE));
    // 표시용 감면율은 소득 가중평균 — 「감면대상소득 × 이 값 = 감면율 반영 소득」 항등식 유지
    expect(out.reductionBreakdown[0].totalReducibleIncome).toBe(A + B);
    expect(out.reductionBreakdown[0].appliedReductionRate).toBeCloseTo(ratedIncome / (A + B), 10);
  });

  it("breakdown이 적용된 감면율을 노출한다 — 결과 화면이 근거를 보일 수 있어야 한다", () => {
    const out = runM8(
      [
        {
          propertyId: "A",
          reductionTypeApplied: "rental_97_main",
          reducibleIncome: TAX_BASE,
          aggregateReductionRate: 0.5,
        },
      ],
      [TAX_BASE],
    );
    expect(out.reductionBreakdown[0].appliedReductionRate).toBe(0.5);
  });
});
