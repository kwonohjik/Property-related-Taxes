/**
 * PR-3 양도차손 처리 — 통산하지 않음(사용자 결정 2026-11-28 · 계획서 엔진 V-1).
 * 근거: 법 §118의8 준용 목록에 §102②(양도차손 공제)가 없다 · 국심2005서3759(2006.7.5. 기각) · 국외자산 사이 통산을 다룬 해석례 미확인.
 *  - 차손 자산은 양도소득금액에 0으로 반영하고 차익 자산은 전액 과세한다. 차손과 차익 자산이 함께 있으면 확인 필요 코드 `FOREIGN_LOSS_NOT_NETTED`.
 *  - 기본공제(§118의7②)는 양(+)의 양도소득금액을 가진 자산에만 양도일 순서로 배분한다.
 *  - §118의6①1호 한도 B·C도 같은 비통산 값이다(C = Σ 양(+) 양도소득금액, 차손 자산 B = 0).
 *  - 차익 자산이 없으면(단건 차손·전부 차손) 세액 0 — 통산 여부가 결과에 영향이 없어 코드를 싣지 않는다.
 * 기대값은 엔진 코드를 쓰지 않은 손계산이다.
 *   K-1 자산 a 437,000,000 + 차손 b −20,000,000: 과세표준 437,000,000 − 2,500,000 = 434,500,000 → 40% − 25,940,000 = 147,860,000(a 단건과 같다)
 *   (통산했다면 과세표준 417,000,000 − 2,500,000 = 414,500,000 — 값이 달라져 통산 뮤테이션이 잡힌다)
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { aAsset, bAsset, ftax, k1Input, ratesAt, usd } from "./_fixtures";

const rates = ratesAt("2026-07-10");
/** b를 양도차손으로: 양도가액 $200,000×1,200 = 240,000,000 − 취득 260,000,000 = −20,000,000 (양도 2026-03-05 — a(2026-07-10)보다 먼저) */
const bLoss = () => bAsset({}, 200_000, 1_200);
const NOT_NETTED = "FOREIGN_LOSS_NOT_NETTED";
const codes = (r: ReturnType<typeof calc>) => r.confirmationNeeded as string[];

describe("차익 + 차손 혼재 → 통산하지 않고 계산 + 확인 필요", () => {
  const alone = calc(k1Input({ assets: [aAsset()] }), rates);
  const r = calc(k1Input({ assets: [aAsset(), bLoss()] }), rates);

  it("a 차익 437,000,000 + b 차손 −20,000,000 → 과세표준 434,500,000 · 산출세액 147,860,000 (a 단건과 같은 세액)", () => {
    expect(r.taxCategory).toBe("foreign_realestate");
    expect(r.incomeAmountTotal).toBe(437_000_000); // 통산하면 417,000,000
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(434_500_000); // 통산하면 414,500,000
    expect(r.appliedRate).toBe(0.4);
    expect(r.progressiveDeduction).toBe(25_940_000);
    expect(r.calculatedTax).toBe(147_860_000);
    expect(r.localIncomeTax).toBe(14_786_000);
    expect(r.totalTax).toBe(162_646_000);
    expect([r.calculatedTax, r.localIncomeTax, r.totalTax]).toEqual([alone.calculatedTax, alone.localIncomeTax, alone.totalTax]);
  });

  it("행 echo — 차손 자산은 음수 양도차익·차손액을 보이되 양도소득금액·몫은 0 · 양도차익 합계는 차손 포함 417,000,000", () => {
    const [a, b] = r.rows;
    expect([b.id, b.capitalGain, b.lossAmount, b.incomeAmount, b.basicDeductionAllocated, b.taxBaseAllocated]).toEqual(["b", -20_000_000, 20_000_000, 0, 0, 0]);
    expect([a.capitalGain, a.incomeAmount]).toEqual([437_000_000, 437_000_000]);
    expect(r.capitalGainTotal).toBe(417_000_000);
  });

  it("기본공제는 차손 자산이 먼저 양도(3/5 < 7/10)됐어도 차익 자산 a에 배분 — a 몫 2,500,000 · 과세표준 몫 434,500,000", () => {
    const [a, b] = r.rows;
    expect([a.basicDeductionAllocated, a.taxBaseAllocated]).toEqual([2_500_000, 434_500_000]);
    expect(b.basicDeductionAllocated).toBe(0);
    expect(r.rows.reduce((s, x) => s + x.basicDeductionAllocated, 0)).toBe(r.basicDeduction);
    expect(r.rows.reduce((s, x) => s + x.taxBaseAllocated, 0)).toBe(r.taxBase);
  });

  it("확인 필요 코드 FOREIGN_LOSS_NOT_NETTED + 미지원 상황 코드(순서 고정)", () => {
    expect(codes(r)).toEqual([NOT_NETTED, "UNSUPPORTED_SITUATIONS_NOT_EVALUATED"]);
    expect(codes(alone)).toEqual(["UNSUPPORTED_SITUATIONS_NOT_EVALUATED"]);
  });

  it("차손이 앞 자산(입력 순서)이어도 같다", () => {
    const rv = calc(k1Input({ assets: [bLoss(), aAsset()] }), rates);
    expect([rv.taxBase, rv.calculatedTax, rv.totalTax]).toEqual([434_500_000, 147_860_000, 162_646_000]);
    expect(codes(rv)).toContain(NOT_NETTED);
    expect(rv.rows.map((x) => [x.id, x.basicDeductionAllocated])).toEqual([["b", 0], ["a", 2_500_000]]);
  });

  it("차손 자산이 둘이어도 차익 자산이 한 건이면 코드는 1회 · 합산하지 않는다", () => {
    const c = { ...bLoss(), id: "c", transfer: usd(190_000, "2026-03-05", 1_200) };
    const r3 = calc(k1Input({ assets: [aAsset(), bLoss(), c] }), rates);
    expect(r3.incomeAmountTotal).toBe(437_000_000);
    expect(r3.calculatedTax).toBe(147_860_000);
    expect(codes(r3).filter((x) => x === NOT_NETTED)).toHaveLength(1);
    expect(r3.capitalGainTotal).toBe(437_000_000 - 20_000_000 - 32_000_000);
  });
});

describe("필요경비 산입방법으로 차손이 된 자산도 같다", () => {
  it("b 차익 100,000,000에 외국세 150,000,000 산입 → b = −50,000,000 · a만 과세 147,860,000 · 코드", () => {
    const r = calc(
      k1Input({
        assets: [aAsset(), bAsset()],
        foreignTax: { method: "expense", items: [ftax("b", 150_000, "2026-03-05", 1_000)] },
      }),
      rates,
    );
    const [a, b] = r.rows;
    expect([b.capitalGain, b.lossAmount, b.incomeAmount, b.foreignTax.expenseKrw]).toEqual([-50_000_000, 50_000_000, 0, 150_000_000]);
    expect([a.basicDeductionAllocated, r.incomeAmountTotal, r.taxBase, r.calculatedTax]).toEqual([2_500_000, 437_000_000, 434_500_000, 147_860_000]);
    expect(codes(r)).toContain(NOT_NETTED);
  });

  it("같은 외국세여도 세액공제방법이면 양도차익은 그대로(차손 아님) → 코드 없음", () => {
    const r = calc(
      k1Input({
        assets: [aAsset(), bAsset()],
        foreignTax: { method: "credit", items: [ftax("b", 150_000, "2026-03-05", 1_000)] },
      }),
      rates,
    );
    expect(r.rows[1].capitalGain).toBe(100_000_000);
    expect(r.foreignTaxCreditApplied).toBe(35_111_732);
    expect(codes(r)).not.toContain(NOT_NETTED);
  });
});

describe("§118의6①1호 한도 — 차손 자산이 있어도 B·C는 양(+) 양도소득금액 기준", () => {
  /** a 437M + b 100M(차익) + c −20M(차손): 과세표준 534,500,000 → 산출세액 188,550,000. C = 537,000,000(통산하면 517,000,000) */
  const c = () => ({ ...bAsset({}, 200_000, 1_200), id: "c" });
  const withTax = (...items: ReturnType<typeof ftax>[]) =>
    calc(k1Input({ assets: [aAsset(), bAsset(), c()], foreignTax: { method: "credit", items } }), rates);

  it("한도 a = 188,550,000 × 437/537 = 153,438,268 · b(잔액 흡수) 35,111,732 — 차손 c가 없을 때와 같다", () => {
    const r = withTax(ftax("a", 200_000, "2026-07-20", 1_000), ftax("b", 200_000, "2026-07-20", 1_000));
    expect(r.calculatedTax).toBe(188_550_000);
    const [a, b, lossRow] = r.rows;
    expect([a.foreignTax.limit, b.foreignTax.limit, lossRow.foreignTax.limit]).toEqual([153_438_268, 35_111_732, 0]);
    expect(a.foreignTax.limit + b.foreignTax.limit).toBe(r.calculatedTax); // Σ한도 = A (차손 자산은 한도 0)
    expect(r.foreignTaxCreditApplied).toBe(153_438_268 + 35_111_732);
    expect(codes(r)).toContain(NOT_NETTED);
  });

  it("차손 자산(B = 0)에 붙은 외국세는 한도 0 — 전액 미공제로 남는다", () => {
    const r = withTax(ftax("c", 5_000, "2026-07-20", 1_000));
    const lossRow = r.rows[2];
    expect([lossRow.foreignTax.limit, lossRow.foreignTax.applied, lossRow.foreignTax.unappliedKrw]).toEqual([0, 0, 5_000_000]);
    expect(r.foreignTaxCreditApplied).toBe(0);
    expect(r.foreignTaxUnappliedKrw).toBe(5_000_000);
  });
});

describe("차익 자산이 없으면 통산할 대상이 없다 → 세액 0 · 코드 없음", () => {
  it("단건 차손(K-7) 세액 0 · 차손 echo", () => {
    const r = calc(k1Input({ assets: [bLoss()] }), rates);
    expect(r.taxCategory).toBe("foreign_realestate");
    expect(r.rows[0].lossAmount).toBe(20_000_000);
    expect([r.incomeAmountTotal, r.basicDeduction, r.taxBase, r.calculatedTax, r.totalTax]).toEqual([0, 0, 0, 0, 0]);
    expect(codes(r)).not.toContain(NOT_NETTED);
  });

  it("2건 모두 차손 — 세액 0, 행마다 차손 echo", () => {
    const r = calc(
      k1Input({ assets: [bLoss(), { ...bLoss(), id: "c", transfer: usd(190_000, "2026-03-05", 1_200) }] }),
      rates,
    );
    expect(r.rows.map((x) => x.lossAmount)).toEqual([20_000_000, 32_000_000]);
    expect([r.taxBase, r.calculatedTax, r.localIncomeTax, r.totalTax]).toEqual([0, 0, 0, 0]);
    expect(r.capitalGainTotal).toBe(-52_000_000);
    expect(codes(r)).not.toContain(NOT_NETTED);
  });

  it("차손 + 양도차익 0(= 차익 없음)도 코드 없음", () => {
    const zero = bAsset({}, 260_000, 1_000); // 양도가액 260,000,000 − 취득 260,000,000 = 0
    const r = calc(k1Input({ assets: [bLoss(), { ...zero, id: "z" }] }), rates);
    expect(r.rows[1].capitalGain).toBe(0);
    expect(r.totalTax).toBe(0);
    expect(codes(r)).not.toContain(NOT_NETTED);
  });

  it("거주 5년 미만이면 혼재여도 과세대상 아님으로 먼저 끝난다(세액 0 · 코드 없음)", () => {
    const r = calc(k1Input({ domesticResidenceYears: 3, assets: [aAsset(), bLoss()] }), rates);
    expect(r.taxCategory).toBe("not_liable");
    expect(r.confirmationNeeded).toEqual([]);
  });
});
