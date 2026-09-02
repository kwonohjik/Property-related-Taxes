/**
 * anchor: 다건 합산 감면액 = 「소득세법」 §90①의 **A × (B − C) / D × E** (2026-09-02)
 *
 * ── 결함 ───────────────────────────────────────────────────────────
 * M-8(`transfer-tax-aggregate-reduction-step.ts`)이 `A × B / D`로 **C를 빼지 않았다**.
 * 감면소득이 전체 소득의 대부분이면 `B > D`가 되어 **감면이 과대**해진다
 * (= 세액 과소). 단건 경로는 §90①과 일치하므로 **같은 사안이 경로마다 다른 세액**을 냈다.
 *
 * ── 근거 (법제처 본문 실측) ────────────────────────────────────────
 * **§90①** 「… 다음 계산식에 따라 계산한 양도소득세 감면액을 양도소득 산출세액에서 감면한다.
 *   양도소득세 감면액 = **A × (B − C) / D × E**
 *   A: 제104조에 따른 양도소득 산출세액 · B: 감면대상 양도소득금액
 *   **C: 제103조제2항에 따른 양도소득 기본공제** · D: 제92조에 따른 양도소득 과세표준
 *   E: … 감면율」
 *
 * **§103②** 「제1항을 적용할 때 … **감면소득금액이 있는 경우에는 그 감면소득금액 외의**
 *   **양도소득금액에서 먼저 공제**하고, 감면소득금액 외의 양도소득금액 중에서는 해당 과세기간에
 *   먼저 양도한 자산의 양도소득금액에서부터 순서대로 공제한다.」
 *
 * ⇒ **C = max(0, 총 기본공제 − 비감면소득)**. 비감면소득이 250만원 이상이면 C = 0이라
 *   종전 동작과 같고, **감면 자산만 있는 사안에서만** 발현한다.
 *
 * ── 세액 (실측 · §97① 본문 50% · 자산 1건) ────────────────────────
 * | | 단건 | 종전 다건 | 정정 |
 * |---|---|---|---|
 * | 감면 | 82,530,000 | 82,962,094 | **82,530,000** |
 * | 총부담 | 107,289,000 | 106,900,114 | **107,289,000** |
 *
 * ── ⚠️ 두 축을 한 판별자로 묶지 말 것 ─────────────────────────────
 * `reducibleIncome`의 의미는 **두 축**으로 갈린다:
 *   · 감면율 반영 여부 → `aggregateReductionRate`
 *   · 기본공제 차감 여부 → **`reducibleIncomeNetOfBasicDeduction`** (이번에 신설)
 * §69(자경농지)는 감면율이 100%라 rate 축에서는 「반영됨」이지만 기본공제 축에서는 **gross**다.
 * rate 유무로 판별하면 §69를 net으로 오분류한다.
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

/** §97① 본문 — 5호 이상 국민주택 임대, 5년 이상 → 50% 세액감면. 다건에서 **차단되지 않는다**. */
const R97 = {
  type: "rental_97_main" as const,
  rentalStartDate: D("1996-01-01"),
  constructionYear: 1993,
  isNationalHousing: true,
  hasMin5RentalUnits: true,
  rentalPeriodYears: 6,
};

function bothWays(o: Record<string, unknown>) {
  const s0 = baseTransferInput({
    propertyType: "housing",
    isOneHousehold: false,
    householdHousingCount: 2,
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("1995-03-01"),
    transferDate: D("2005-06-01"),
    ...o,
  } as never) as unknown as Record<string, unknown>;
  const single = calculateTransferTax(s0 as never, rates) as unknown as Record<string, unknown>;
  const multi = calculateTransferTaxAggregate(
    {
      taxYear: (s0.transferDate as Date).getFullYear(),
      annualBasicDeductionUsed: 0,
      properties: [{ ...s0, propertyId: "A", propertyLabel: "A" } as unknown as TransferTaxItemInput],
    } as AggregateTransferInput,
    rates,
  );
  return { single, multi };
}

describe("§90① — 감면 자산만 있는 사안(C = 기본공제 전액)", () => {
  it("K1: 🔴 §97① 본문 50% — 다건 감면이 단건과 일치한다 (종전 82,962,094 과대)", () => {
    const { single, multi } = bothWays({ reductions: [R97] });
    expect(single.reductionAmount).toBe(82_530_000);
    expect(multi.reductionAmount).toBe(82_530_000);
  });

  it("K2: 🔑 총부담도 원 단위까지 일치한다", () => {
    const { single, multi } = bothWays({ reductions: [R97] });
    expect(single.totalTax).toBe(107_289_000);
    expect(multi.totalTax).toBe(107_289_000);
    expect((multi.totalTax ?? 0) - ((single.totalTax as number) ?? 0)).toBe(0);
  });

  it("K3: 산식 검산 — (B − C)/D = 1 이므로 감면 = 산출세액 × 50%", () => {
    const { single } = bothWays({ reductions: [R97] });
    const A = single.calculatedTax as number;
    const B = single.reducibleIncome as number; // 기본공제 前 감면대상 양도소득금액
    const Dv = single.taxBase as number;
    expect(B - 2_500_000).toBe(Dv); // C = 기본공제 전액 (비감면소득 0)
    expect(Math.floor((A * (B - 2_500_000)) / Dv / 2)).toBe(82_530_000);
  });
});

describe("§103② — 비감면소득이 기본공제를 먼저 흡수하면 C = 0", () => {
  it("K4: 감면 없는 자산이 함께 있으면 종전과 같다 (C = 0)", () => {
    /**
     * 비감면 자산의 양도소득금액이 기본공제(2,500,000)를 넘으므로 §103②상 기본공제는
     * 전부 그쪽에서 공제된다 ⇒ C = 0 ⇒ 분자는 B 그대로다.
     */
    const s0 = baseTransferInput({
      propertyType: "housing", isOneHousehold: false, householdHousingCount: 2,
      transferPrice: 900_000_000, acquisitionPrice: 300_000_000,
      acquisitionDate: D("1995-03-01"), transferDate: D("2005-06-01"), reductions: [R97],
    } as never) as unknown as Record<string, unknown>;
    const plain = baseTransferInput({
      propertyType: "land", isOneHousehold: false, householdHousingCount: 0,
      transferPrice: 300_000_000, acquisitionPrice: 100_000_000,
      acquisitionDate: D("1995-03-01"), transferDate: D("2005-06-01"),
    } as never) as unknown as Record<string, unknown>;
    const multi = calculateTransferTaxAggregate(
      {
        taxYear: 2005, annualBasicDeductionUsed: 0,
        properties: [
          { ...s0, propertyId: "A", propertyLabel: "A" } as unknown as TransferTaxItemInput,
          { ...plain, propertyId: "B", propertyLabel: "B" } as unknown as TransferTaxItemInput,
        ],
      } as AggregateTransferInput,
      rates,
    );
    // C = 0이므로 분자는 감면대상 양도소득금액 × 50% 그대로다 — 이 값은 정정 前과 **같다**.
    expect(multi.reductionAmount).toBe(87_269_647);
  });
});

describe("net 유형은 이중 차감하지 않는다", () => {
  /**
   * ⚠️ 이 구획을 지우지 말 것 — 도입 시점에 **다건 × §77 조합 테스트가 하나도 없었다**.
   * net 유형을 gross로 오분류하는 뮤테이션이 엔진 전건(11,914건) 중 **0건**에 걸렸다.
   */
  it("K5b: 🔴 §77(공익수용) 다건 — 단건과 감면·총부담이 일치한다 (이중 차감 금지)", () => {
    const s0 = baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 600_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: D("2010-01-01"),
      transferDate: D("2024-06-01"),
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 600_000_000,
          bondCompensation: 0,
          businessApprovalDate: D("2013-01-01"),
        },
      ],
    } as never) as unknown as Record<string, unknown>;
    const single = calculateTransferTax(s0 as never, rates) as unknown as Record<string, unknown>;
    const multi = calculateTransferTaxAggregate(
      {
        taxYear: 2024,
        annualBasicDeductionUsed: 0,
        properties: [{ ...s0, propertyId: "A", propertyLabel: "A" } as unknown as TransferTaxItemInput],
      } as AggregateTransferInput,
      rates,
    );
    expect(single.reductionAmount, "§77이 적격이어야 이 anchor가 의미를 갖는다").toBeGreaterThan(0);
    // net 플래그가 결과까지 실려야 M-8이 이중 차감을 피한다(명시 prop 매핑 strip 방지).
    expect(single.reducibleIncomeNetOfBasicDeduction).toBe(true);
    /**
     * ⚠️ 다건 §77은 단건과 **원래 일치하지 않는다**(감면 8,855,000 ↔ 8,932,539 · 총부담 −69,786).
     * 이 값은 §90① `− C` 정정 **前후가 같다**(실측) — 즉 **별개의 선행 결함**이고 이 PR 범위 밖이다.
     * 여기서는 「이 정정이 그 값을 건드리지 않는다」를 고정한다.
     */
    expect(single.reductionAmount).toBe(8_855_000);
    expect(multi.reductionAmount).toBe(8_932_539);
    expect((multi.totalTax ?? 0) - ((single.totalTax as number) ?? 0)).toBe(-69_786);
  });

  it("K5: §97은 gross — `reducibleIncomeNetOfBasicDeduction` 미설정", () => {
    /**
     * 세 net 조문(§77·§85의10·대토)은 자체 산식에서 자산별 기본공제를 이미 빼고 감면율까지
     * 곱해 둔다(`public-expropriation-reduction.ts` `cashTaxable = cashIncome − basicDeductionOnCash` 등).
     * M-8이 또 빼면 이중 차감이다.
     * ⚠️ §69는 감면율 100%라 rate 축에서는 「반영됨」이지만 기본공제 축에서는 **gross**다 —
     *    두 축을 한 판별자로 묶으면 §69가 net으로 오분류된다.
     *
     * 🔬 **정직한 한계** — net 유형을 gross로 오분류하는 뮤테이션은 **현행 조문에서는 잡히지 않는다**.
     *    세 조문의 감면율이 모두 **≤ 40%**라 `비감면소득 = 소득 − 감면대상소득`이 항상
     *    기본공제(250만원)를 넘어 **C = 0**이 되기 때문이다(K5b의 §77도 그래서 값이 안 변한다).
     *    ⇒ `reducibleIncomeNetOfBasicDeduction` 분기는 **오늘은 no-op이고, 감면율이 높은 net
     *    유형이 새로 들어올 때를 위한 방어선**이다. 지우면 그때 조용히 이중 차감된다.
     */
    const { single } = bothWays({ reductions: [R97] });
    expect(single.reducibleIncomeNetOfBasicDeduction).toBeUndefined(); // §97 = gross
  });
});
