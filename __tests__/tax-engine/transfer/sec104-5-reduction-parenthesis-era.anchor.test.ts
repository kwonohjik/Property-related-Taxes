/**
 * anchor: §104⑤ 본문 **감면 괄호**의 시행일 게이트 — 2020.1.1. 양도분부터
 *
 * 계획서: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §1.1 · §2.2 (사용자 결정 2026-10-16: 법문대로 — A2)
 *
 * [법령] 법률 제16834호(2019.12.31.) 부칙 제2조② — 양도소득세 개정규정은 시행(2020.1.1.) 이후 양도하는 분부터 적용.
 *   2019.1.1. 시행본(제16104호) §104⑤ 본문에는 괄호가 없다 → 2019.12.31. 이전 양도분은 **감면 전 MAX**를 산출세액으로 하고 그 세액에 감면을 적용한다.
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 1. 시기 판정 경계(2019 ↔ 2020).
 * 2. 다건 합산 엔진: 2019 과세기간은 감면 전 MAX를 유지한다(대조: 같은 구조의 2020 과세기간은 감면 차감 후 비교로 경로가 바뀐다).
 * 3. 크로스 엔진: `reductionParenthesisApplies: false`면 감면 전 산출세액이 큰 호를 고른다.
 * 4. 어댑터가 `taxYear`로 그 플래그를 정한다.
 *
 * ⚠️ 금액은 mock 세율표(2022 단일표) 기준이다 — 경로 전환의 구조 증거이지 연혁 세율의 금액 확정이 아니다.
 */
import { describe, it, expect } from "vitest";
import {
  SEC104_5_REDUCTION_PARENTHESIS_FROM,
  isSec104_5ReductionParenthesisInForceForTaxYear,
} from "@/lib/tax-engine/data/sec104-5-reduction-parenthesis-era";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { computeCross1045 } from "@/lib/tax-engine/comparative-104-5-cross";
import { BASIC_PROGRESSIVE_BRACKETS, NBL_HEAVY_CORP_BRACKETS } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import { buildCross1045Input } from "@/lib/calc/cross-104-5-adapter";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

describe("A2-1: 시기 판정 경계", () => {
  it("시행일 상수는 2020-01-01", () => {
    expect(SEC104_5_REDUCTION_PARENTHESIS_FROM).toBe("2020-01-01");
  });
  it("과세기간: 2019 미적용 · 2020 적용", () => {
    expect(isSec104_5ReductionParenthesisInForceForTaxYear(2019)).toBe(false);
    expect(isSec104_5ReductionParenthesisInForceForTaxYear(2020)).toBe(true);
    expect(isSec104_5ReductionParenthesisInForceForTaxYear(2018)).toBe(false);
  });
});

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 토지 L(4억 · 1년 보유) + 토지 B(5억, §77 현금보상 2억) — 모든 날짜를 양도연도 y 기준으로 옮겨 두 연도의 보유기간·감면 요건을 같게 둔다. */
const props = (y: number) => {
  const card = (id: string, o: Record<string, unknown>, reductions: unknown[] = []) => ({
    ...baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 500_000_000,
      acquisitionPrice: 150_000_000,
      transferDate: D(`${y}-06-01`),
      reductions,
      ...o,
    } as Partial<TransferTaxInput>),
    propertyId: id,
    propertyLabel: id,
  });
  return [
    card("L", { transferPrice: 400_000_000, acquisitionDate: D(`${y - 1}-01-01`) }),
    card("B", { acquisitionDate: D(`${y - 9}-01-01`) }, [
      { type: "public_expropriation", cashCompensation: 200_000_000, bondCompensation: 0, businessApprovalDate: D(`${y - 6}-01-01`) },
    ]),
  ];
};
type Agg = { calculatedTax: number; reductionAmount: number; totalTax: number; comparedTaxApplied: string; reductionBreakdown: { clauseBasis?: string }[] };
const agg = (y: number) =>
  calculateTransferTaxAggregate({ taxYear: y, annualBasicDeductionUsed: 0, properties: props(y) } as never, rates) as unknown as Agg;

describe("A2-2: 다건 합산 엔진 — 2019 과세기간은 감면 전 MAX 유지", () => {
  it("2019: 감면 전 MAX(전체 누진) 188,550,000 · 감면 10,124,200 · 총 198,293,220", () => {
    const r = agg(2019);
    expect(r.comparedTaxApplied).toBe("general");
    expect(r.calculatedTax).toBe(188_550_000);
    expect(r.reductionAmount).toBe(10_124_200);
    expect(r.totalTax).toBe(198_293_220);
    expect(r.reductionBreakdown[0].clauseBasis).toBeUndefined(); // 합산 감면
  });
  it("대조 2020: 감면 차감 후 비교로 세율군별이 채택된다 — 188,120,000 · 감면 8,912,000 · 총 198,911,200", () => {
    const r = agg(2020);
    expect(r.comparedTaxApplied).toBe("groups");
    expect(r.calculatedTax).toBe(188_120_000);
    expect(r.reductionAmount).toBe(8_912_000);
    expect(r.totalTax).toBe(198_911_200);
    expect(r.reductionBreakdown[0].clauseBasis).toBe("per_clause");
  });
  it("2019 결과가 2020보다 총세액이 낮다 — 괄호는 항상 큰 쪽을 고르므로 2020 전엔 현행이 과다였다", () => {
    expect(agg(2019).totalTax).toBeLessThan(agg(2020).totalTax);
  });
});

describe("A2-3: 크로스 엔진 — 괄호 on/off", () => {
  const base = {
    totalTaxBase: 243_500_000 + 300_000_000,
    clause8TaxBase: 243_500_000,
    clause9TaxBase: 300_000_000,
    realEstateClause1TaxBase: 0,
    otherAssetClause1TaxBase: 0,
    otherClausesTax: 0,
    basicBrackets: BASIC_PROGRESSIVE_BRACKETS,
    nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
  };
  // 감면 전: 1호 192,330,000 < 2호 246,680,000. 2호 쪽에 감면 60,000,000이 있으면 감면 후 2호(186,680,000)가 1호보다 작아진다.
  const reduction = { ifClause1: 0, ifClause2: 60_000_000 };

  it("괄호 적용(기본): 감면 후 비교 → 1호 192,330,000", () => {
    const r = computeCross1045({ ...base, reduction });
    expect(r.applied).toBe("clause1");
    expect(r.calculatedTax).toBe(192_330_000);
    expect(r.reductionParenthesisApplied).toBe(true);
  });
  it("괄호 미적용(2020 전): 감면 전 비교 → 2호 246,680,000", () => {
    const r = computeCross1045({ ...base, reduction, reductionParenthesisApplies: false });
    expect(r.applied).toBe("clause2");
    expect(r.calculatedTax).toBe(246_680_000);
    expect(r.reductionParenthesisApplied).toBe(false);
  });
  // 반대 방향: 감면 전엔 1호 216,060,000 > 2호 29,560,000. 1호 쪽에 감면 200,000,000이 있으면 감면 후 1호(16,060,000)가 2호보다 작아진다.
  const base1 = { ...base, totalTaxBase: 600_000_000, clause8TaxBase: 100_000_000, clause9TaxBase: 0 };
  const reduction1 = { ifClause1: 200_000_000, ifClause2: 0 };
  it("1호 쪽 감면 — 괄호 적용: 감면 후 비교 → 2호 29,560,000", () => {
    const r = computeCross1045({ ...base1, reduction: reduction1 });
    expect(r.applied).toBe("clause2");
    expect(r.calculatedTax).toBe(29_560_000);
  });
  it("1호 쪽 감면 — 괄호 미적용(2020 전): 감면 전 비교 → 1호 216,060,000", () => {
    const r = computeCross1045({ ...base1, reduction: reduction1, reductionParenthesisApplies: false });
    expect(r.applied).toBe("clause1");
    expect(r.calculatedTax).toBe(216_060_000);
  });
  it("감면이 없으면 두 설정의 답이 같다", () => {
    const on = computeCross1045(base);
    const off = computeCross1045({ ...base, reductionParenthesisApplies: false });
    expect(off.applied).toBe(on.applied);
    expect(off.calculatedTax).toBe(on.calculatedTax);
  });
});

describe("A2-4: 어댑터가 과세기간으로 플래그를 정한다", () => {
  const side = { taxBase: 0, clause1TaxBase: 0, clause1Tax: 0, clause2Tax: 0, nblClauseTaxBase: 0, nblClauseTax: 0 };
  const build = (taxYear: number) =>
    buildCross1045Input({
      realEstate: side as never,
      otherAsset: side as never,
      basicBrackets: BASIC_PROGRESSIVE_BRACKETS,
      nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
      taxYear,
    });
  it("2019 → false · 2020 → true", () => {
    expect(build(2019).reductionParenthesisApplies).toBe(false);
    expect(build(2020).reductionParenthesisApplies).toBe(true);
  });
});
