/**
 * anchor: 부동산 **§104①1호 버킷 echo** — §104⑤ 크로스 조정용 (C-3a / 2b-1)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §5 · `cross-engine-...plan.md` §5-C
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * §104⑤2호의 「자산별」은 예규상 「**각 호별로 합산한 자산**」이다(기획재정부 재산세제과-536 ·
 * 국세청 기준-2018-법령해석재산-0098). 8호·9호뿐 아니라 **1호끼리도 합산 대상**이므로,
 * 부동산 엔진이 §104①1호 몫을 분리해 내보내야 크로스 조정 레이어가 기타자산 1호와 묶을 수 있다.
 * `clause8TaxBase`·`clause8Tax`와 **같은 규약**(키가 정확히 그 호 하나)이다.
 *
 * 🔒 **분양권은 포함되지 않는다**(A-2 — 이 파일의 핵심). §104①1호 괄호가 「분양권의 경우에는
 *   100분의 60」이라 **호는 1호인데 세율은 단일 60%**이고, `clauseBucketKey`는 누진 호가 끼면
 *   세율을 키에서 빼므로 **버킷 키가 `"104-1-1"`로 같아진다**. 그런데도 섞이지 않는 유일한 이유는
 *   `classifyRateGroup`이 분양권을 `short_term`으로 보내고 이 echo가 **누진 호 분기에서만**
 *   누적되기 때문이다 ⇒ 제외 근거는 **현행 규약 승계**이지 새 법령 해석이 아니다.
 *   ⚠️ 그 방어선을 무너뜨리면 `presale-clause-1-bucket-guard.anchor.test.ts`와 **여기가 함께**
 *     빨개진다. 키만 보고 모으면 실측 **62,720,000 과소**였다(계획서 §5-C H-1).
 *
 * ⚠️ 조합원입주권 2년+는 **포함**된다(A-3) — 1호 괄호가 분양권만 지목하므로 §55① 누진이다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2024-06-01"),
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}
function agg(properties: TransferTaxItemInput[]) {
  return calculateTransferTaxAggregate(
    // 기본공제 소진 → 과세표준 = 양도소득금액
    { taxYear: 2024, annualBasicDeductionUsed: 2_500_000, properties } as AggregateTransferInput,
    mockRates,
  );
}
const groupOf = (r: ReturnType<typeof agg>, g: string) => r.groupTaxes.find((x) => x.group === g);
const land = (id: string, gross: number, o: Partial<TransferTaxItemInput> = {}) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: false, ...o });
const nbl = (id: string, gross: number, o: Partial<TransferTaxItemInput> = {}) =>
  item(id, { propertyType: "land", transferPrice: gross, isNonBusinessLand: true, ...o });

describe("§104①1호 버킷 echo (C-3a / 2b-1)", () => {
  it("A-1: 사업용 토지 2건 — 1호 버킷 = `progressive` 그룹", () => {
    const r = agg([land("A", 300_000_000), land("B", 200_000_000)]);
    const g = groupOf(r, "progressive")!;
    expect(r.clause1BucketTaxBase).toBe(410_000_000);
    expect(r.clause1BucketTaxBase).toBe(g.groupTaxBase);
    expect(r.clause1BucketTax).toBe(g.groupCalculatedTax);
    // 410,000,000 × 40% − 25,940,000 = 138,060,000
    expect(r.clause1BucketTax).toBe(138_060_000);
  });

  it("A-2: 🔒 **분양권은 제외**된다 — 호는 1호이나 세율이 단일 60%", () => {
    const r = agg([
      item("P", { propertyType: "presale_right", transferPrice: 300_000_000 }),
      land("L", 200_000_000),
    ]);
    // 분양권은 `short_term` 그룹으로 분리돼 있다(방어선).
    expect(groupOf(r, "short_term")!.assetIds).toEqual(["P"]);
    expect(groupOf(r, "short_term")!.groupCalculatedTax).toBe(180_000_000); // 3억 × 60%

    // 1호 버킷에는 토지분만 잡힌다.
    expect(r.clause1BucketTaxBase).toBe(164_000_000); // 2억 − LTHD 18%(9년)
    expect(r.clause1BucketTax).toBe(42_380_000);
    expect(r.clause1BucketTaxBase).toBe(groupOf(r, "progressive")!.groupTaxBase);

    // ❌ 분양권까지 모으면 464,000,000이 되어 기본누진 159,660,000 — 현행 222,380,000 대비
    //    **62,720,000 과소**다(R7이 고친 63,940,000급 결함의 재현).
    expect(r.clause1BucketTaxBase).not.toBe(464_000_000);
  });

  it("A-3: ⚠️ **조합원입주권 2년+는 포함**된다 (1호 괄호는 분양권만 지목)", () => {
    const r = agg([
      item("R", { propertyType: "right_to_move_in", transferPrice: 300_000_000 }),
      land("L", 200_000_000),
    ]);
    expect(groupOf(r, "short_term")).toBeUndefined();
    expect(r.clause1BucketTaxBase).toBe(410_000_000);
    expect(r.clause1BucketTax).toBe(138_060_000);
  });

  it("A-4: ⭐ **부분 비사토** — 1호 파트와 8호 파트로 완전 분해된다", () => {
    const r = agg([
      nbl("N", 300_000_000, { nonBusinessLandAreaRatio: 0.5 } as Partial<TransferTaxItemInput>),
      nbl("M", 300_000_000),
    ]);
    const g = groupOf(r, "non_business_land")!;
    expect(r.clause1BucketTaxBase).toBe(123_000_000);
    expect(r.clause1BucketTax).toBe(27_610_000);
    expect(r.clause8TaxBase).toBe(369_000_000);
    expect(r.clause8Tax).toBe(158_560_000);
    // 두 버킷의 합이 그룹과 정확히 일치한다 — 그룹 하나가 두 호로 갈리는 유일한 경로다.
    expect(r.clause1BucketTaxBase + r.clause8TaxBase).toBe(g.groupTaxBase);
    expect(r.clause1BucketTax + r.clause8Tax).toBe(g.groupCalculatedTax);
    expect(g.groupCalculatedTax).toBe(186_170_000);
  });

  it("A-5: 단기(2년 미만) 자산은 제외된다 (후보가 `{104-1-2}`)", () => {
    const r = agg([
      land("S", 300_000_000, { acquisitionDate: D("2023-11-01") }), // 7개월
      land("L", 200_000_000),
    ]);
    expect(groupOf(r, "short_term")).toBeDefined();
    expect(r.clause1BucketTaxBase).toBe(164_000_000); // 장기분만
  });

  it("A-6: 1호 자산이 없으면 0이다", () => {
    const r = agg([nbl("N", 300_000_000), nbl("M", 200_000_000)]);
    expect(r.clause1BucketTaxBase).toBe(0);
    expect(r.clause1BucketTax).toBe(0);
    expect(r.clause8TaxBase).toBe(410_000_000);
  });

  it("A-7: **위기취득 비사토는 포함**된다 (해당 호가 §104①1호 — PR#1020)", () => {
    // 부칙 §9270호 §14①로 +10%p가 배제되면 후보가 `{104-1-1}`이라 1호 버킷에 들어간다.
    const r = agg([
      nbl("C", 300_000_000, { acquisitionDate: D("2010-06-01") }),
      land("L", 200_000_000),
    ]);
    expect(groupOf(r, "progressive")!.assetIds).toEqual(["C", "L"]);
    expect(r.clause1BucketTaxBase).toBe(386_000_000);
    expect(r.clause1BucketTax).toBe(128_460_000);
    expect(r.clause8TaxBase).toBe(0); // 8호로는 잡히지 않는다
  });

  it("A-8: 불변식 — 1호·8호 버킷은 서로 겹치지 않고 전체 과세표준을 넘지 않는다", () => {
    for (const props of [
      [land("A", 300_000_000)],
      [land("A", 300_000_000), nbl("B", 500_000_000)],
      [nbl("A", 300_000_000, { nonBusinessLandAreaRatio: 0.3 } as Partial<TransferTaxItemInput>)],
      [item("P", { propertyType: "presale_right", transferPrice: 300_000_000 }), land("B", 300_000_000)],
    ]) {
      const r = agg(props);
      expect(r.clause1BucketTaxBase + r.clause8TaxBase).toBeLessThanOrEqual(r.taxBase);
      expect(r.clause1BucketTax + r.clause8Tax).toBeLessThanOrEqual(r.calculatedTaxByGroups);
    }
  });
});
