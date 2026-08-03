/**
 * anchor: 부동산 **§104①8호 버킷 echo** — §104⑤ 크로스 조정용
 *
 * 계획서: `docs/00-pm/cross-engine-104-5-real-estate-other-asset.plan.md` **C-2 / 2-1** (v1.2 §5-B)
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * §104⑤ 본문 후단: 「제2호의 금액을 계산할 때 **제1항제8호 및 제9호의 자산은 동일한 자산으로
 * 보고** … 양도소득 산출세액을 계산한다」. 부동산 8호와 주식 9호를 한 버킷으로 재합산하려면
 * 각 엔진이 자기 몫을 **분리해 내보내야** 한다. 주식은 `clause9TaxBase`·`clause9Tax`,
 * 부동산은 이 `clause8TaxBase`·`clause8Tax`다 — **대칭**이다.
 *
 * 🔒 **`groupTaxes`의 `non_business_land` 그룹으로 대신할 수 없다**(G-1) — **부분 비사업용
 *   토지**는 한 그룹 안에서 8호 파트와 1호 파트로 갈린다. A-3이 그 괴리를 직접 고정한다.
 *
 * 🔒 **후보 집합이 정확히 `{104-1-8}`인 버킷만**이다(G-2 — 좁은 해석). 단기(1~2년) 비사토는
 *   8호에 **해당은 하나** 후보가 `{104-1-2, 104-1-8}`이고 `short_term` 그룹에 있다.
 *   넓게 잡으면 세율이 8호 표로 바뀌어 **세액이 오르고** §104⑤2호 **단서**(합산액에 각 해당
 *   호별 세율을 적용해 **큰** 것)와도 충돌 소지가 있다 ⇒ 「법 근거 없이 불리 적용 금지」.
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

function land(id: string, gross: number, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput({
      propertyType: "land",
      transferPrice: gross,
      acquisitionPrice: 0,
      transferDate: D("2024-06-01"),
      acquisitionDate: D("2015-01-01"),
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      isRegulatedArea: false,
      isNonBusinessLand: true,
    }) as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    ...o,
  };
}

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2024,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}
const groupOf = (r: ReturnType<typeof agg>, g: string) => r.groupTaxes.find((x) => x.group === g);

describe("§104①8호 버킷 echo (C-2 / 2-1)", () => {
  it("A-1: 순수 비사토 2건 — 8호 버킷 = `non_business_land` 그룹", () => {
    const r = agg([land("A", 300_000_000), land("B", 300_000_000)]);
    const g = groupOf(r, "non_business_land")!;
    expect(r.clause8TaxBase).toBe(492_000_000);
    expect(r.clause8TaxBase).toBe(g.groupTaxBase);
    expect(r.clause8Tax).toBe(g.groupCalculatedTax);
    // 492,000,000 × 40% − 25,940,000 = 170,860,000  +  10% × 492,000,000 = 49,200,000
    expect(r.clause8Tax).toBe(220_060_000);
  });

  it("A-2: 8호 자산이 없으면 0이다", () => {
    const r = agg([land("A", 300_000_000, { isNonBusinessLand: false })]);
    expect(r.clause8TaxBase).toBe(0);
    expect(r.clause8Tax).toBe(0);
  });

  it("A-3: ⭐ **부분 비사토** — 그룹과 8호 버킷이 갈린다 (그룹으로 대신할 수 없는 이유)", () => {
    const r = agg([
      land("A", 300_000_000, { nonBusinessLandAreaRatio: 0.5 } as Partial<TransferTaxItemInput>),
      land("B", 300_000_000),
    ]);
    const g = groupOf(r, "non_business_land")!;
    // 그룹 = 8호 파트 + 1호 파트
    expect(g.groupTaxBase).toBe(492_000_000);
    // 8호 버킷만 = 순수 비사토 246,000,000 + 부분 비사토의 8호 파트 123,000,000
    expect(r.clause8TaxBase).toBe(369_000_000);
    expect(r.clause8TaxBase).not.toBe(g.groupTaxBase);
    // 369,000,000 × 50% − 25,940,000 = 158,560,000
    expect(r.clause8Tax).toBe(158_560_000);
    // 그룹 세액 = 8호 버킷 158,560,000 + 1호 버킷(123,000,000 × 35% − 15,440,000 = 27,610,000)
    expect(g.groupCalculatedTax).toBe(186_170_000);
    expect(g.groupCalculatedTax - r.clause8Tax).toBe(27_610_000);
  });

  it("A-4: **단기(1~2년) 비사토는 제외**한다 (G-2 좁은 해석)", () => {
    // 후보가 {104-1-2, 104-1-8}이라 키가 `"104-1-2+104-1-8"`이고 `short_term` 그룹에 있다.
    const r = agg([
      land("S", 300_000_000, { acquisitionDate: D("2022-11-01") }), // 19개월
      land("L", 300_000_000), // 9년
    ]);
    expect(groupOf(r, "short_term")).toBeDefined();
    // 장기분만 8호 버킷에 잡힌다
    expect(r.clause8TaxBase).toBe(246_000_000);
    expect(r.clause8TaxBase).toBe(groupOf(r, "non_business_land")!.groupTaxBase);
  });

  it("A-5: **위기취득 비사토는 제외**한다 (해당 호가 §104①1호 — PR#1020)", () => {
    // 부칙 §9270호 §14①로 +10%p가 배제되면 해당 호가 1호가 되어 `progressive` 그룹으로 간다.
    const r = agg([
      land("C", 300_000_000, { acquisitionDate: D("2010-06-01") }), // 위기취득
      land("L", 300_000_000),
    ]);
    expect(groupOf(r, "progressive")).toBeDefined();
    expect(r.clause8TaxBase).toBe(246_000_000); // 장기분만
  });

  it("A-6: 불변식 — 8호 버킷은 `non_business_land` 그룹을 **넘지 못한다**", () => {
    for (const props of [
      [land("A", 300_000_000)],
      [land("A", 300_000_000), land("B", 500_000_000)],
      [land("A", 300_000_000, { nonBusinessLandAreaRatio: 0.3 } as Partial<TransferTaxItemInput>)],
      [land("A", 300_000_000, { isNonBusinessLand: false }), land("B", 300_000_000)],
    ]) {
      const r = agg(props);
      const g = groupOf(r, "non_business_land");
      expect(r.clause8TaxBase).toBeLessThanOrEqual(g?.groupTaxBase ?? 0);
      expect(r.clause8Tax).toBeLessThanOrEqual(g?.groupCalculatedTax ?? 0);
    }
  });
});
