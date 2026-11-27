/**
 * PR-3 외국납부세액 anchor — 법 §118의6 두 방법 + 지방소득세(지특법 §97③·지방세법 §103③).
 * 기대값은 엔진을 쓰지 않은 손계산. 시료는 pr3-multi-asset과 같다(a 437,000,000 · b 100,000,000 · 산출세액 188,550,000).
 *
 * 한도 A × B / C (소득세, 2건): a = floor(188,550,000 × 437/537) = 153,438,268 · b = 188,550,000 − 153,438,268 = 35,111,732
 *   (b의 floor 몫은 35,111,731 — 절사 잔차 1원을 입력 순서상 마지막 양(+) B 자산이 흡수하는 leaf 규약)
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import type { ForeignRealEstateForeignTaxInput } from "@/lib/tax-engine/foreign-realestate";
import { aAsset, bAsset, d, ftax, k1Input, ratesAt } from "./_fixtures";
import { localForeignTaxCredit, truncateLocalIncomeTax, calcForeignRealEstateLocalIncomeTax } from "@/lib/tax-engine/foreign-realestate";

const rates = ratesAt("2026-07-10");
const two = (foreignTax?: ForeignRealEstateForeignTaxInput) => calc(k1Input({ assets: [aAsset(), bAsset()], foreignTax }), rates);
/** 외국세는 USD 1단위 = 환율 1,000원으로 둬 외화액이 곧 원화 천 단위가 되게 한다 */
const t = (assetId: string, krw: number, date = "2026-07-20") => ftax(assetId, krw / 1_000, date, 1_000);

describe("§118의6①1호 세액공제방법", () => {
  it("한도 미달(a 40,000,000 · b 10,000,000): 전액 공제 → 결정세액 138,550,000", () => {
    const r = two({ method: "credit", items: [t("a", 40_000_000), t("b", 10_000_000)] });
    expect(r.calculatedTax).toBe(188_550_000);
    expect(r.rows.map((x) => [x.foreignTax.limit, x.foreignTax.applied, x.foreignTax.unappliedKrw])).toEqual([
      [153_438_268, 40_000_000, 0],
      [35_111_732, 10_000_000, 0],
    ]);
    expect(r.foreignTaxCreditApplied).toBe(50_000_000);
    expect(r.determinedTax).toBe(138_550_000);
    expect(r.foreignTaxUnappliedKrw).toBe(0);
  });

  it("한도 초과(a 200,000,000): a는 한도 153,438,268까지만, b 10,000,000 그대로 → 결정세액 25,111,732", () => {
    const r = two({ method: "credit", items: [t("a", 200_000_000), t("b", 10_000_000)] });
    expect(r.rows[0].foreignTax).toMatchObject({ limit: 153_438_268, applied: 153_438_268, unappliedKrw: 46_561_732 });
    expect(r.rows[1].foreignTax).toMatchObject({ applied: 10_000_000, unappliedKrw: 0 });
    expect(r.foreignTaxCreditApplied).toBe(163_438_268);
    expect(r.determinedTax).toBe(25_111_732);
    expect(r.foreignTaxUnappliedKrw).toBe(46_561_732);
    expect(r.warnings.join(" ")).toContain("이월 규정이 없어");
  });

  it("한도 초과(b 50,000,000 > 35,111,732): b가 한도에 걸린다 → 결정세액 113,438,268", () => {
    const r = two({ method: "credit", items: [t("a", 40_000_000), t("b", 50_000_000)] });
    expect(r.rows[1].foreignTax).toMatchObject({ limit: 35_111_732, applied: 35_111_732, unappliedKrw: 14_888_268 });
    expect(r.determinedTax).toBe(113_438_268);
  });

  it("자산별 한도 합 ≤ 산출세액(불변식) — 한도가 자산별이라 한 자산의 초과를 다른 자산 한도로 쓰지 못한다", () => {
    const r = two({ method: "credit", items: [t("a", 999_000_000), t("b", 999_000_000)] });
    expect(r.rows[0].foreignTax.limit + r.rows[1].foreignTax.limit).toBe(188_550_000);
    expect(r.determinedTax).toBe(0);
  });

  it("외국세가 한 자산에만 있어도 한도는 그 자산 몫만(b에 외국세 없으면 a 한도는 여전히 153,438,268)", () => {
    const r = two({ method: "credit", items: [t("a", 200_000_000)] });
    expect(r.rows[0].foreignTax.applied).toBe(153_438_268);
    expect(r.rows[1].foreignTax).toMatchObject({ paidKrw: 0, applied: 0 });
  });

  it("같은 자산에 외국세 여러 건은 합산해 한도에 비교", () => {
    const r = two({ method: "credit", items: [t("a", 30_000_000), t("a", 20_000_000, "2026-08-01")] });
    expect(r.rows[0].foreignTax).toMatchObject({ paidKrw: 50_000_000, applied: 50_000_000 });
    expect(r.rows[0].foreignTax.items).toHaveLength(2);
  });

  it("K-10 단건: 외국세 40,000,000 → 한도 = 산출세액 147,860,000 → 결정세액 107,860,000", () => {
    const r = calc(k1Input({ foreignTax: { method: "credit", items: [t("a1", 40_000_000)] } }), rates);
    expect(r.rows[0].foreignTax.limit).toBe(147_860_000);
    expect(r.determinedTax).toBe(107_860_000);
  });

  it("K-11 단건: 외국세 200,000,000 → 공제 = 한도 147,860,000 → 결정세액 0 · 초과분 52,140,000은 이월 없음", () => {
    const r = calc(k1Input({ foreignTax: { method: "credit", items: [t("a1", 200_000_000)] } }), rates);
    expect(r.foreignTaxCreditApplied).toBe(147_860_000);
    expect(r.determinedTax).toBe(0);
    expect(r.foreignTaxUnappliedKrw).toBe(52_140_000);
  });

  it("B·C는 기본공제 전 양도소득금액 — 기본공제 순서가 한도에 영향을 주지 않는다(양도일을 맞바꿔도 같은 한도)", () => {
    const swapped = calc(
      k1Input({
        assets: [
          aAsset({ transferDate: d("2026-03-05") }),
          bAsset({ transferDate: d("2026-07-10") }),
        ],
        foreignTax: { method: "credit", items: [t("a", 200_000_000), t("b", 10_000_000)] },
      }),
      rates,
    );
    expect(swapped.rows.map((x) => x.foreignTax.limit)).toEqual([153_438_268, 35_111_732]);
  });
});

describe("§118의6①2호 필요경비 산입방법", () => {
  it("K-12 단건: 외국세 40,000,000을 양도차익에서 빼 과세표준 394,500,000 → 산출세액 131,860,000 · 지방소득세 13,186,000", () => {
    const r = calc(k1Input({ foreignTax: { method: "expense", items: [t("a1", 40_000_000)] } }), rates);
    expect(r.rows[0].capitalGain).toBe(397_000_000);
    expect(r.rows[0].foreignTax).toMatchObject({ expenseKrw: 40_000_000, applied: 0, limit: 0 });
    expect(r.taxBase).toBe(394_500_000);
    expect(r.calculatedTax).toBe(131_860_000);
    expect(r.foreignTaxCreditApplied).toBe(0);
    expect(r.determinedTax).toBe(131_860_000);
    expect(r.localForeignTaxCredit).toBe(0); // 지특법 §97③은 1호 공제방법만
    expect(r.localIncomeTax).toBe(13_186_000); // 지방세법 §103③ 과세표준이 줄어 반영
  });

  it("2건: a 40,000,000 · b 10,000,000 산입 → 과세표준 484,500,000 → 40% − 25,940,000 = 167,860,000 · 지방소득세 16,786,000", () => {
    const r = two({ method: "expense", items: [t("a", 40_000_000), t("b", 10_000_000)] });
    expect(r.rows.map((x) => x.capitalGain)).toEqual([397_000_000, 90_000_000]);
    expect(r.incomeAmountTotal).toBe(487_000_000);
    expect(r.taxBase).toBe(484_500_000);
    expect(r.calculatedTax).toBe(167_860_000);
    expect(r.localIncomeTax).toBe(16_786_000);
  });

  it("필요경비 산입 후에도 기본공제는 합계에서 1회, 먼저 양도한 b부터", () => {
    const r = two({ method: "expense", items: [t("b", 10_000_000)] });
    expect(r.rows[1].basicDeductionAllocated).toBe(2_500_000);
    expect(r.rows[0].basicDeductionAllocated).toBe(0);
  });
});

describe("지방소득세 — 지방세특례제한법 §97③ · 지방세법 §103의4", () => {
  it("한도 미달: 소득세 공제 50,000,000 → 지방소득세 공제 5,000,000 → 18,855,000 − 5,000,000 = 13,855,000", () => {
    const r = two({ method: "credit", items: [t("a", 40_000_000), t("b", 10_000_000)] });
    expect(r.localForeignTaxCredit).toBe(5_000_000);
    expect(r.localIncomeTaxBeforeRounding).toBe(13_855_000);
    expect(r.localIncomeTax).toBe(13_855_000);
    expect(r.totalTax).toBe(138_550_000 + 13_855_000);
  });

  it("한도 걸림: 소득세 공제 163,438,268 → 지방 공제 floor(÷10) = 16,343,826 → 2,511,174 → 10원 미만 절사 2,511,170", () => {
    const r = two({ method: "credit", items: [t("a", 200_000_000), t("b", 10_000_000)] });
    expect(r.localForeignTaxCredit).toBe(16_343_826);
    expect(r.localIncomeTaxBeforeRounding).toBe(2_511_174);
    expect(r.localIncomeTax).toBe(2_511_170);
  });

  it("b 한도 걸림: 공제 75,111,732 → 7,511,173 → 11,343,827 → 11,343,820", () => {
    const r = two({ method: "credit", items: [t("a", 40_000_000), t("b", 50_000_000)] });
    expect(r.localForeignTaxCredit).toBe(7_511_173);
    expect(r.localIncomeTax).toBe(11_343_820);
  });

  it("K-11: 소득세 공제 147,860,000 = 지방소득세 14,786,000 전액 → 지방소득세 0 (공제가 산출세액을 넘지 않음)", () => {
    const r = calc(k1Input({ foreignTax: { method: "credit", items: [t("a1", 200_000_000)] } }), rates);
    expect(r.localForeignTaxCredit).toBe(14_786_000);
    expect(r.localIncomeTax).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  it("외국납부세액이 없으면 종전 PR-2 값(K-1 14,786,000)과 같다", () => {
    const r = calc(k1Input(), rates);
    expect([r.localForeignTaxCredit, r.localIncomeTaxBeforeRounding, r.localIncomeTax]).toEqual([0, 14_786_000, 14_786_000]);
  });
});

describe("입력 규율 — fallback 없음 (K-13)", () => {
  it("외국세 환율 미입력(0·NaN) → 양도일 환율로 대체하지 않고 거부", () => {
    expect(() => two({ method: "credit", items: [ftax("a", 40, "2026-07-20", 0)] })).toThrow(TaxCalculationError);
    expect(() => two({ method: "credit", items: [ftax("a", 40, "2026-07-20", Number.NaN)] })).toThrow(TaxCalculationError);
  });
  it("납부일 무효 → 거부", () => {
    expect(() => two({ method: "expense", items: [{ ...t("a", 1_000_000), date: new Date("x") }] })).toThrow(/날짜/);
  });
  it("알 수 없는 자산 id → 거부(경로 foreignTax.items[0].assetId)", () => {
    expect(() => two({ method: "credit", items: [t("zzz", 1_000_000)] })).toThrow(/foreignTax\.items\[0\]\.assetId/);
  });
  it("방법 값이 둘 중 하나가 아니면 거부", () => {
    expect(() => two({ method: "both" as never, items: [t("a", 1_000_000)] })).toThrow(/credit 또는 expense/);
  });
  it("외국세 항목이 비면 §118의6 미적용(방법 무관)", () => {
    const r = two({ method: "credit", items: [] });
    expect(r.foreignTaxMethod).toBeUndefined();
    expect(r.confirmationNeeded).toEqual([
      "LOCAL_TAX_WEIGHTING_NOT_EVALUATED",
      "DOMESTIC_TRANSFER_NOT_AGGREGATED",
      "UNSUPPORTED_SITUATIONS_NOT_EVALUATED",
    ]);
  });
});

describe("확인 필요 · 근거 · 거주 5년 미만", () => {
  it("세액공제방법은 외국세 환산일을 정한 조문을 못 찾아 확인 필요 코드를 싣는다", () => {
    const r = two({ method: "credit", items: [t("a", 1_000_000)] });
    expect(r.confirmationNeeded).toContain("FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY");
    expect(r.appliedRules).toContain("지방세특례제한법 §97 ③");
    expect(r.appliedRules).toContain("소득세법 시행령 §178의7");
  });
  it("필요경비 산입방법은 영 §178의5① 필요경비 지출일 환산이라 그 코드를 싣지 않는다", () => {
    const r = two({ method: "expense", items: [t("a", 1_000_000)] });
    expect(r.confirmationNeeded).not.toContain("FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY");
    expect(r.appliedRules).not.toContain("지방세특례제한법 §97 ③");
  });
  it("외국세 없으면 §118의6 근거·확인 필요 코드 없음", () => {
    const r = two();
    expect(r.appliedRules).not.toContain("소득세법 §118의6");
    expect(r.confirmationNeeded).toEqual([
      "LOCAL_TAX_WEIGHTING_NOT_EVALUATED",
      "DOMESTIC_TRANSFER_NOT_AGGREGATED",
      "UNSUPPORTED_SITUATIONS_NOT_EVALUATED",
    ]);
  });
  it("거주 5년 미만: 외국세 항목은 환산·검증하되 공제·산입은 하지 않는다(세액 0)", () => {
    const r = calc(k1Input({ domesticResidenceYears: 4, foreignTax: { method: "credit", items: [t("a1", 40_000_000)] } }), rates);
    expect(r.taxCategory).toBe("not_liable");
    expect(r.rows[0].foreignTax).toMatchObject({ paidKrw: 40_000_000, applied: 0, unappliedKrw: 0 });
    expect(r.foreignTaxCreditApplied).toBe(0);
    expect(() =>
      calc(k1Input({ domesticResidenceYears: 4, foreignTax: { method: "credit", items: [t("a1", 1_000_000, "2026-07-20")].map((x) => ({ ...x, exchangeRate: 0 })) } }), rates),
    ).toThrow(TaxCalculationError);
  });
});

describe("지방소득세 순수 함수 — 끝수 처리 단일 지점", () => {
  it("truncateLocalIncomeTax: 10원 미만 절사(규약을 바꿀 때 이 함수만)", () => {
    expect([truncateLocalIncomeTax(2_511_174), truncateLocalIncomeTax(2_511_179), truncateLocalIncomeTax(9)]).toEqual([2_511_170, 2_511_170, 0]);
  });
  it("localForeignTaxCredit: 공제금액의 10%를 원 미만 절사, 지방소득세 산출세액을 넘지 못함(지방세법 §103의4 단서)", () => {
    expect(localForeignTaxCredit(50_000_009, 99_999_999)).toBe(5_000_000);
    expect(localForeignTaxCredit(200_000_000, 14_786_000)).toBe(14_786_000);
    expect(localForeignTaxCredit(-5, 100)).toBe(0);
  });
  it("calcForeignRealEstateLocalIncomeTax(공제 인자): 434,500,000에서 공제 100,000,000이면 14,786,000 − 10,000,000 = 4,786,000", () => {
    expect(calcForeignRealEstateLocalIncomeTax(434_500_000, rates.brackets, 100_000_000)).toBe(4_786_000);
    expect(calcForeignRealEstateLocalIncomeTax(434_500_000, rates.brackets)).toBe(14_786_000);
  });
});
