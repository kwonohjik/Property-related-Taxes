/**
 * 의제취득일(1985.1.1.) 전 상속 — 3자 max anchor (calculateTransferTax 통합 · 원 단위).
 *
 * 취득가액 = max(① 상증법 평가액, ② §164④~⑦ 기준시가, ③ 환산취득가액) — 동점 ① > ② > ③,
 * 비교는 취득가액만(Q-7 a). ③이 채택되면 추계(개산공제 영 §163⑥ · 법 §97②2호 단서 swap).
 * 근거·반대 자료: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §3·§4.
 *
 * 시료: 토지 · 1983.7.26. 상속 · 2023.2.16. 양도 · 양도시 기준시가 1,243,350,000 · mock 세율표.
 *   pre1990 = §164④ 등급가액 경로(②가 자동 주입되고 ③ 분자도 같은 계열) · 직접 = ③ 분자 202,620,000.
 * 「종전(가목 우선)」 열은 변경 전 엔진 실측값 — P5·P8~P11만 달라진다(계획서 §4·§4.1).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const STD_AT_TRANSFER = 1_243_350_000;
const STD_AT_DEEMED = 202_620_000;

function make(opts: {
  reported?: number;
  pre1990: boolean;
  transferPrice?: number;
  capitalExpenditure?: number;
}) {
  const transferPrice = opts.transferPrice ?? 920_000_000;
  return baseTransferInput({
    ...(opts.capitalExpenditure !== undefined
      ? { capitalExpenditure: opts.capitalExpenditure, transferExpense: 0 }
      : {}),
    propertyType: "land",
    transferPrice,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1985-01-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtTransfer: STD_AT_TRANSFER,
    ...(opts.pre1990
      ? {
          pre1990Land: {
            acquisitionDate: new Date("1983-07-26"),
            transferDate: new Date("2023-02-16"),
            areaSqm: 184.2,
            pricePerSqm_1990: 1_100_000,
            pricePerSqm_atTransfer: 6_750_000,
            grade_1990_0830: 218,
            gradePrev_1990_0830: 218,
            gradeAtAcquisition: 200,
          },
        }
      : { standardPriceAtAcquisition: STD_AT_DEEMED }),
    inheritedAcquisition: {
      inheritanceDate: new Date("1983-07-26"),
      assetKind: "land",
      ...(opts.pre1990 ? {} : { standardPriceAtDeemedDate: STD_AT_DEEMED }),
      standardPriceAtTransfer: STD_AT_TRANSFER,
      transferDate: new Date("2023-02-16"),
      transferPrice,
      ...(opts.reported !== undefined ? { reportedValue: opts.reported } : {}),
    },
  });
}

const CASES = [
  // [id, 입력, 채택, 취득가액, 결정세액, 종전(가목 우선) 결정세액]
  { id: "P1 ②만", in: { pre1990: true }, sel: "sec164", acq: 84_443_174, tax: 229_530_077, before: 229_530_077 },
  { id: "P2 ① 1억+②", in: { pre1990: true, reported: 100_000_000 }, sel: "reported", acq: 100_000_000, tax: 224_499_000, before: 224_499_000 },
  { id: "P3 ① 2억+②", in: { pre1990: true, reported: 200_000_000 }, sel: "reported", acq: 200_000_000, tax: 192_159_000, before: 192_159_000 },
  { id: "P4 ① 1천만+②", in: { pre1990: true, reported: 10_000_000 }, sel: "sec164", acq: 84_443_174, tax: 229_530_077, before: 229_530_077 },
  { id: "P5 ① 1억 < ③", in: { pre1990: false, reported: 100_000_000 }, sel: "converted", acq: 149_925_925, tax: 206_387_135, before: 224_499_000 },
  { id: "P6 ① 3억 > ③", in: { pre1990: false, reported: 300_000_000 }, sel: "reported", acq: 300_000_000, tax: 161_326_000, before: 161_326_000 },
  { id: "P7 ③만", in: { pre1990: false }, sel: "converted", acq: 149_925_925, tax: 206_387_135, before: 206_387_135 },
  { id: "P8 ②만·양도 15억", in: { pre1990: true, transferPrice: 1_500_000_000 }, sel: "converted", acq: 101_873_777, tax: 410_645_753, before: 417_102_077 },
  { id: "P9 ① 1억+자본적지출 3억(swap)", in: { pre1990: false, reported: 100_000_000, capitalExpenditure: 300_000_000 }, sel: "converted", acq: 149_925_925, tax: 161_326_000, before: 130_526_000 },
  { id: "P10 ① 1억+자본적지출 5천만", in: { pre1990: false, reported: 100_000_000, capitalExpenditure: 50_000_000 }, sel: "converted", acq: 149_925_925, tax: 206_387_135, before: 208_329_000 },
  { id: "P11 ① 1억+자본적지출 1억", in: { pre1990: false, reported: 100_000_000, capitalExpenditure: 100_000_000 }, sel: "converted", acq: 149_925_925, tax: 206_387_135, before: 192_159_000 },
] as const;

describe("의제취득일 전 상속 3자 max — 통합 anchor", () => {
  for (const c of CASES) {
    it(`${c.id}: ${c.sel} · 취득가액 ${c.acq.toLocaleString()} · 결정세액 ${c.tax.toLocaleString()} (종전 ${c.before.toLocaleString()})`, () => {
      const r = calculateTransferTax(make(c.in), rates);
      const b = r.inheritedAcquisitionDetail!.preDeemedBreakdown!;
      expect(b.selectedMethod).toBe(c.sel);
      expect(r.inheritedAcquisitionDetail!.acquisitionPrice).toBe(c.acq);
      expect(r.usedEstimatedAcquisition).toBe(c.sel === "converted");
      expect(r.totalTax).toBe(c.tax);
    });
  }

  it("P9: ③ 채택 후 §97②2호 단서 swap — 필요경비 = 자본적지출 단독, 취득가액 미차감", () => {
    const r = calculateTransferTax(make({ pre1990: false, reported: 100_000_000, capitalExpenditure: 300_000_000 }), rates);
    expect(r.swapComparison).toEqual({ estimatedSide: 156_004_525, directSide: 300_000_000, chosen: "direct" });
    expect(r.transferGain).toBe(920_000_000 - 300_000_000);
  });

  it("P5: ③ 채택이면 개산공제 = 의제취득일 기준시가 × 3%", () => {
    const r = calculateTransferTax(make({ pre1990: false, reported: 100_000_000 }), rates);
    expect(r.transferGain).toBe(920_000_000 - 149_925_925 - Math.floor(STD_AT_DEEMED * 0.03));
  });
});
