/**
 * anchor: §77 계열 다건 감면 = 단건 — 「소득세법」 §90①의 C를 **버킷**으로 흡수 (2026-09-03)
 *
 * ── 결함 ───────────────────────────────────────────────────────────
 * 다건 합산 M-8은 §77·§77의2·§77의3을 「자체 산식에서 이미 기본공제를 뺐다」고 보아
 * §90①의 `− C`에서 **제외**했다. 그 전제가 틀렸다 — 집계는 단건 엔진을
 * `skipBasicDeduction: true`로 부르므로 세 조문이 받은 기본공제는 **0**이다.
 * ⇒ 기본공제가 감면 분자에 **한 번도** 반영되지 않아 감면이 과대해졌다(= 세액 과소).
 *
 * ── 실측 (자산 1건 · 다건 ↔ 단건) ──────────────────────────────────
 * | 사안 | 단건 = 정정 후 다건 | 정정 前 다건 | 차 |
 * |---|---|---|---|
 * | §77 현금 6억 | 8,855,000 | 8,932,539 | +77,539 |
 * | §77 현금 3억 + 채권 3억(3년) | 17,787,539 | 17,865,078 | +77,539 |
 * | §77의2 대토 6억 | 35,420,000 | 35,730,157 | +310,157 |
 * | §77의3 1호 40% | 34,204,000 | 34,512,144 | +308,144 |
 * | §77의2 현금 2억 + 대토 4억 | 23,820,105 | **23,820,105** | 0 |
 *
 * 마지막 줄이 설계의 시금석이다 — §77의2의 **현금분은 감면대상이 아니므로 비감면소득**이고,
 * §103②에 따라 기본공제를 그쪽이 먼저 흡수해 C = 0이 된다. 그래서 정정 전후가 같다.
 *
 * ── 왜 단일 감면율로는 안 되는가 ──────────────────────────────────
 * `reducibleIncome`의 의미가 유형마다 갈린다:
 *   · §97 계열 — B(감면율 前) + `aggregateReductionRate`
 *   · §77 계열 — **B × E**(율이 박혀 있고 율 필드는 미설정)
 * 게다가 §77은 현금분(10%)·채권분(30%)의 **율이 다르고**, §77의2는 현금분이 감면대상 자체가
 * 아니다. 평균율 한 개로는 §90①의 `(B − C) × E`가 복원되지 않는다.
 * ⇒ `reducibleIncomeBuckets`(감면율 前 소득, 그 율)를 실어 **낮은 율부터** C를 흡수시킨다 —
 *   그 순서는 §77·§77의2 **단건 산식의 기존 해석**이다(§103②은 감면소득 내부 순서를 정하지
 *   않는다). L2가 두 율이 섞인 사안에서 단건과 원 단위까지 일치함을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 같은 자산을 단건·다건 두 경로로 계산한다 — 두 결과가 일치해야 한다. */
function bothWays(o: Record<string, unknown>, extra: Record<string, unknown>[] = []) {
  const s0 = baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 600_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: D("2010-01-01"),
    transferDate: D("2024-06-01"),
    ...o,
  } as never) as unknown as Record<string, unknown>;
  const single = calculateTransferTax(s0 as never, rates) as unknown as Record<string, unknown>;
  const multi = calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      // ⚠️ 0이어야 한다 — 다건에만 기사용액을 넣으면 기본공제가 갈려 가짜 divergence가 생긴다.
      annualBasicDeductionUsed: 0,
      properties: [
        { ...s0, propertyId: "A", propertyLabel: "A" },
        ...extra,
      ] as unknown as TransferTaxItemInput[],
    } as AggregateTransferInput,
    rates,
  ) as unknown as Record<string, unknown>;
  return { single, multi };
}

describe("§77 계열 다건 감면 = 단건 (§90①의 C 버킷 흡수)", () => {
  it("L1: §77 현금보상 6억 — 감면·총부담이 단건과 원 단위까지 일치", () => {
    const { single, multi } = bothWays({
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 600_000_000,
          bondCompensation: 0,
          businessApprovalDate: D("2013-01-01"),
        },
      ],
    });
    expect(single.reductionAmount, "§77이 적격이어야 이 anchor가 의미를 갖는다").toBe(8_855_000);
    expect(multi.reductionAmount).toBe(8_855_000); // 정정 前 8,932,539
    expect(multi.totalTax).toBe(single.totalTax);
    expect(multi.totalTax).toBe(89_435_500);
  });

  it("L2: §77 현금 3억 + 채권 3억 — 율이 둘이어도 낮은 율(현금 10%)부터 흡수해 단건과 일치", () => {
    const { single, multi } = bothWays({
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 300_000_000,
          bondCompensation: 300_000_000,
          bondHoldingYears: 3,
          businessApprovalDate: D("2013-01-01"),
        },
      ],
    });
    const detail = single.publicExpropriationDetail as { breakdown: { cashRate: number; bondRate: number; basicDeductionOnCash: number } };
    // 단건이 **낮은 율(현금)에 전액 배정**한다 — 다건 버킷 정렬이 이 순서를 따라야 값이 맞는다.
    expect(detail.breakdown.cashRate).toBeLessThan(detail.breakdown.bondRate);
    expect(detail.breakdown.basicDeductionOnCash).toBe(2_500_000);
    expect(single.reductionAmount).toBe(17_787_539);
    expect(multi.reductionAmount).toBe(17_787_539); // 정정 前 17,865,078
    expect(multi.totalTax).toBe(single.totalTax);
  });

  it("L3: §77의2 대토 6억(현금 0) — 단건과 일치", () => {
    const { single, multi } = bothWays({
      reductions: [
        {
          type: "replacement_land_comp",
          cashCompensation: 0,
          replacementLandComp: 600_000_000,
          businessApprovalDate: D("2013-01-01"),
        },
      ],
    });
    expect(single.reductionAmount).toBe(35_420_000);
    expect(multi.reductionAmount).toBe(35_420_000); // 정정 前 35,730,157
    expect(multi.totalTax).toBe(single.totalTax);
  });

  it("L3b: §77의2 현금 2억 + 대토 4억 — 현금분이 비감면소득이라 C = 0 (정정 전후 동일)", () => {
    const { single, multi } = bothWays({
      reductions: [
        {
          type: "replacement_land_comp",
          cashCompensation: 200_000_000,
          replacementLandComp: 400_000_000,
          businessApprovalDate: D("2013-01-01"),
        },
      ],
    });
    /**
     * 현금보상분은 §77의2의 감면대상이 **아니다** — 버킷에 싣지 않으므로 M-8이 비감면소득으로
     * 보고 §103②대로 기본공제를 그쪽에서 먼저 흡수한다. 그 결과 감면 분자에 닿는 C가 0이 되어
     * 정정 前 값과 같다. 「값이 안 변했으니 미도달」이 아니라 **조문대로 0인 것**이다.
     */
    expect(single.reductionAmount).toBe(23_820_105);
    expect(multi.reductionAmount).toBe(23_820_105);
    expect(multi.totalTax).toBe(single.totalTax);
  });

  it("L4: §77의3 개발제한구역 1호(40%) — 단건과 일치", () => {
    const { single, multi } = bothWays({
      acquisitionDate: D("2000-01-01"), // 지정일(2005-01-01) 이전 취득 → §77의3 1호 40%
      reductions: [
        {
          type: "gb_designated_land",
          branch: "purchase",
          designationDate: D("2005-01-01"),
          triggerDate: D("2024-01-01"),
          residedFromAcqToTrigger: true,
        },
      ],
    });
    expect(single.reductionAmount).toBe(34_204_000);
    expect(multi.reductionAmount).toBe(34_204_000); // 정정 前 34,512,144
    expect(multi.totalTax).toBe(single.totalTax);
  });

  it("L5: §77 + 비감면 자산 동반 — 비감면소득이 기본공제를 흡수해 C = 0", () => {
    const other = baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 300_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: D("2010-01-01"),
      transferDate: D("2024-07-01"),
    } as never) as unknown as Record<string, unknown>;
    const { multi } = bothWays(
      {
        reductions: [
          {
            type: "public_expropriation",
            cashCompensation: 600_000_000,
            bondCompensation: 0,
            businessApprovalDate: D("2013-01-01"),
          },
        ],
      },
      [{ ...other, propertyId: "B", propertyLabel: "B" }],
    );
    // 비감면 자산 B의 양도소득금액이 기본공제 250만원을 넘으므로 §103②대로 전액 흡수 → C = 0.
    expect(multi.reductionAmount).toBe(9_430_288);
    expect(multi.totalTax).toBe(120_278_740);
  });
});
