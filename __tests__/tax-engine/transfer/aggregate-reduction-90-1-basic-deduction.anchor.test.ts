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
 * ── 🔴 정정 (2026-09-03) — 「net 유형」 분류는 틀렸었다 ────────────
 * 최초 구현은 §77·§77의2·§77의3을 「자체 산식에서 이미 기본공제를 뺐다」고 보아 C에서
 * **제외**했다(`reducibleIncomeNetOfBasicDeduction`). 그 전제가 틀렸다 — 집계는 단건 엔진을
 * `skipBasicDeduction: true`로 부르므로 세 조문이 받은 기본공제는 **0**이고, 따라서 그 값은
 * net이 아니라 **gross**다. 제외 때문에 기본공제가 감면 분자에 **한 번도** 닿지 않았다.
 * ⇒ 플래그를 폐기하고 `reducibleIncomeBuckets`(감면율 前 소득, 그 율)로 대체했다.
 *   상세·실측: `aggregate-reduction-77-series-buckets.anchor.test.ts`.
 *
 * ⚠️ 그때 「제외는 오늘 no-op이고 미래를 위한 방어선」이라고 적었는데 그것도 틀렸다 —
 *    뮤테이션이 0/11,914였던 이유는 no-op이어서가 아니라, `reducibleIncome`이 이미
 *    **B × E**라 gross로 분류해도 나머지 `B × (1 − E)`가 비감면소득처럼 보여 C를 삼켰기
 *    때문이다. **「값이 안 변한다」는 「영향이 없다」가 아니다.**
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

describe("§77 계열도 §90①의 C를 뺀다", () => {
  /**
   * ⚠️ 이 구획을 지우지 말 것 — 도입 시점에 **다건 × §77 조합 테스트가 하나도 없었다**.
   * 그래서 §77 계열을 C에서 제외한 오분류가 엔진 전건 중 **0건**에 걸렸고, 그 「0건」을
   * 「영향이 없다」로 읽어 결함을 한 번 놓쳤다(2026-09-03 정정).
   */
  it("K5b: §77(공익수용) 다건 — 단건과 감면·총부담이 일치한다", () => {
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
    /**
     * 최초 구현에서는 여기가 8,855,000 ↔ **8,932,539**로 갈렸고(총부담 −69,786), 그것을
     * 「별개의 선행 결함」으로 남겼다. 실제로는 이 정정과 **같은 뿌리**였다 — §77 계열을
     * C에서 제외한 것이 원인이다(2026-09-03 해소).
     */
    expect(single.reductionAmount).toBe(8_855_000);
    expect(multi.reductionAmount).toBe(8_855_000);
    expect((multi.totalTax ?? 0) - ((single.totalTax as number) ?? 0)).toBe(0);
  });

  it("K5: §97은 버킷을 싣지 않는다 — M-8 합성 경로가 정확하기 때문", () => {
    /**
     * `reducibleIncome`이 **감면율 前 B**인 유형(§97 계열·legacy 장기임대·legacy 신축·
     * 하이브리드)은 M-8이 `[{ income: reducibleIncome, rate: aggregateReductionRate ?? 1 }]`로
     * 합성해도 §90①의 `(B − C) × E`가 정확히 복원된다. 버킷은 그 합성이 불가능한
     * §77 계열만 싣는다 — 필요 없는 곳에 실으면 두 경로가 갈릴 자리만 늘어난다.
     */
    const { single } = bothWays({ reductions: [R97] });
    expect(single.aggregateReductionRate).toBe(0.5);
    expect(single.reducibleIncomeBuckets).toBeUndefined();
  });
});
