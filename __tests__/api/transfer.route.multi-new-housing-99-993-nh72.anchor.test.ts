/**
 * NH-72(Q-16) — 다건(연간 합산) ⑧·⑫가 조특법 §99·§99의3을 «세율 특칙» 사유로 막던 것을 **2016.1.1. 이후 양도분만** 푼다.
 *
 * 두 조문은 소득금액 차감형이라 §98계 세율 특칙(`forceFlatRate20`·`suppressShortTermRate`)의 소실과 무관하다. 합산은 차감·농특세를 이미
 * 지원한다(`aggregate-income-deduction-993.anchor`). 2016.1.1. 전 양도분은 사용자 결정으로 계속 막는다(리뷰: 해제 시 −8,602,567 위험).
 *
 * 🔴 해제하면서 **5년 이내 양도의 농특세 불일치**를 함께 고쳤다(실측 — 세율표 = 로컬 fallback 시드):
 *    합산의 «감면 전 산출세액»이 기본공제를 감면 후 소득(전액 차감이면 0)으로 배분해 기본공제가 빠졌다 →
 *    단건 18,730,000 ↔ 합산 18,920,000 (농특세 +190,000). 감면 전 소득으로 배분하도록 맞췄다(`transfer-tax-aggregate-once.ts`).
 *
 * | 시료(자산 1건 · 양도가 8억 · 취득가 5억 · 2주택) | 단건 | 합산 수정 전 | 합산 수정 후 |
 * |---|---|---|---|
 * | §99의3 5년 후 · 2018.6.1. 양도 | 38,972,500 | 400 차단 | 38,972,500 |
 * | §99 5년 후 · 2022.8.1. 양도 | 37,382,500 | 400 차단 | 37,382,500 |
 * | §99의3 5년 내 · 2018.6.1. 양도(취득 2016.6.1.) | 18,730,000 | 400 차단 | 18,730,000 (차단만 풀면 18,920,000) |
 * | 2015.12.31. 양도 | 37,382,500 | 400 | 400 (계속 차단) |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE,
  MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE,
} from "@/lib/calc/multi-transfer-support-messages";

const r993 = {
  type: "new_99_3", contractDate993: "2002-03-01", acquisitionType993: "from_builder", firstContract993: "yes", region993: "outside_speculation",
  standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 160_000_000, standardPriceAtTransfer993: 250_000_000, exclusiveAreaSqm993: 84,
  isResident993: true, isHousingConstructionBusiness993: false, hasOccupancyAtContract: false, isRecontractExcluded993: false,
  recontractUnavoidableCause993: false, isRedevelopedNewHouse993: false,
};
const r99 = {
  type: "new_99", contractDate99: "1998-06-01", acquisitionType99: "from_builder", firstContract99: "yes", isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: 250_000_000, exclusiveAreaSqm99: 84,
  isResident99: true, isHousingConstructionBusiness99: false, hasOccupancyAtContract99: false, isRecontractExcluded99: false,
  recontractUnavoidableCause99: false, isRedevelopedNewHouse99: false,
};
const r983 = {
  type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: "2009-06-01", isUnsoldConfirmed983: true,
  isFirstContract983: true, isNotOccupiedAtContract983: true, isNotRecontract983: true, isOutsideSeoulNotDesignated983: true, isOverconcentration983: false,
  standardPriceAtAcquisition983: 100_000_000, standardPriceAt5Years983: 160_000_000, standardPriceAtTransfer983: 250_000_000,
};
const prop = (id: string, td: string, acq: string, reductions: object[]) => ({
  propertyId: id, propertyLabel: id, propertyType: "housing", transferDate: td, acquisitionDate: acq, transferPrice: 800_000_000, acquisitionPrice: 500_000_000,
  expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
  isNonBusinessLand: false, isOneHousehold: false, reductions, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
});
const post = (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) =>
  h(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function both(td: string, acq: string, reductions: object[]) {
  const p = prop("p1", td, acq, reductions);
  const { propertyId: _id, propertyLabel: _label, ...single } = p;
  void _id; void _label;
  const s = await post(SINGLE, "http://l/api/calc/transfer", single);
  const sj = (await s.json()) as { data: { result: { totalTax: number; determinedTax: number; ruralSurtax: number } } };
  const m = await post(MULTI, "http://l/api/calc/transfer/multi", { taxYear: Number(td.slice(0, 4)), annualBasicDeductionUsed: 0, properties: [p] });
  const mj = (await m.json()) as { data?: { totalTax: number; determinedTax: number; ruralSurtax: number }; error?: { fieldErrors?: Record<string, string[]> } };
  return { s, sj: sj.data.result, m, mj };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, d) => loadFallbackTransferRates(d as Date) as never);
});

describe("NH-72 ⑫ route — 2016.1.1. 이후 양도분은 단건 = 합산(원 단위)", () => {
  const grid: [string, string, string, object[], number][] = [
    ["§99의3 5년 후 2018.6.1.", "2018-06-01", "2003-09-01", [r993], 38_972_500],
    ["§99 5년 후 2022.8.1.", "2022-08-01", "1999-01-01", [r99], 37_382_500],
    ["§99의3 5년 후 2016.1.1.(경계)", "2016-01-01", "2003-09-01", [r993], 42_152_500],
    ["§99 5년 후 2016.1.1.(경계)", "2016-01-01", "1999-01-01", [r99], 37_382_500],
    // 5년 이내(취득 2016.6.1. → 양도 2018.6.1.) — 전액 차감, 농특세 18,730,000
    ["§99의3 5년 내 2018.6.1.", "2018-06-01", "2016-06-01", [r993], 18_730_000],
    ["§99 5년 내 2022.8.1.", "2022-08-01", "2020-08-01", [r99], 18_730_000],
  ];
  it.each(grid)("%s: 합산 = 단건 = 고정값", async (_label, td, acq, red, expected) => {
    const r = await both(td, acq, red);
    expect(r.s.status).toBe(200);
    expect(r.m.status, JSON.stringify(r.mj).slice(0, 300)).toBe(200);
    expect(r.sj.totalTax).toBe(expected);
    expect(r.mj.data?.totalTax).toBe(r.sj.totalTax);
    expect(r.mj.data?.determinedTax).toBe(r.sj.determinedTax);
    expect(r.mj.data?.ruralSurtax).toBe(r.sj.ruralSurtax);
  });
});

describe("NH-72 ⑫ route — 2016.1.1. 전 양도분과 §98계 세율 특칙은 계속 차단", () => {
  it("B1 양도 2015.12.31.의 §99의3·§99: 400 + 2016.1.1. 사유 문구", async () => {
    for (const [red, acq] of [[r993, "2003-09-01"], [r99, "1999-01-01"]] as const) {
      const r = await both("2015-12-31", acq, [red]);
      expect(r.m.status).toBe(400);
      expect(r.mj.error?.fieldErrors?.["properties.0.reductions"]).toEqual([MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE]);
    }
  });

  it("B2 짝 — §98의3(하이브리드·세율 특칙)은 2018 양도여도 종전 사유로 400", async () => {
    const r = await both("2018-06-01", "2009-06-01", [r983]);
    expect(r.m.status).toBe(400);
    expect(r.mj.error?.fieldErrors?.["properties.0.reductions"]).toEqual([MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE]);
  });

  it("B3 짝 — §99의3과 §98의3을 함께 고르면 §98의3 때문에 막힌다", async () => {
    const r = await both("2018-06-01", "2003-09-01", [r993, r983]);
    expect(r.m.status).toBe(400);
    expect(r.mj.error?.fieldErrors?.["properties.0.reductions"]).toEqual([MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE]);
  });

  it("B4 짝 — 감면 없는 자산은 2015 양도여도 영향 없음(200)", async () => {
    const r = await both("2015-12-31", "2003-09-01", []);
    expect(r.m.status).toBe(200);
    expect(r.mj.data?.totalTax).toBe(r.sj.totalTax);
  });
});

describe("NH-72 ⑧ validateMultiSupportedMode — ⑫와 같은 판정", () => {
  const form = (td: string, reductions: object[]) => {
    const f = createDefaultTransferFormData();
    f.transferDate = td;
    f.assets[0] = { ...f.assets[0], assetKind: "housing", reductions: reductions as never };
    return f;
  };
  it("C1 §99의3·§99 + 2016.1.1. 이후 양도: 차단 없음", () => {
    expect(validateMultiSupportedMode(form("2016-01-01", [{ type: "new_99_3" }]))).toBeNull();
    expect(validateMultiSupportedMode(form("2022-08-01", [{ type: "new_99" }]))).toBeNull();
  });
  it("C2 2015.12.31. 이전 · 양도일 없음: 2016.1.1. 사유로 차단(보수적)", () => {
    expect(validateMultiSupportedMode(form("2015-12-31", [{ type: "new_99_3" }]))).toBe(MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE);
    expect(validateMultiSupportedMode(form("", [{ type: "new_99" }]))).toBe(MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE);
  });
  it("C3 짝 — 하이브리드(§98의3)는 양도일과 무관하게 종전 사유", () => {
    expect(validateMultiSupportedMode(form("2022-08-01", [{ type: "unsold_98_3" }]))).toBe(MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE);
    expect(validateMultiSupportedMode(form("2022-08-01", [{ type: "new_99_3" }, { type: "unsold_98_8" }]))).toBe(MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE);
  });
});
