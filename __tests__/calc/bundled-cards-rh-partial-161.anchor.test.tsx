import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { runCalc } from "@/__tests__/calc/_helpers/redev-one-house-route";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const a = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...a, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const ROW: HouseEntry = { id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2012-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
const RENTAL: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };

function form(rh: boolean, withLand = true) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, actualSalePrice: "1,500,000,000", addressJibun: "서울 강남구 역삼동 1" } as never;
  if (withLand) {
    f.assets.push({ ...makeDefaultAsset(2), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" } as never);
  }
  const total = 1_500_000_000 + (withLand ? 300_000_000 : 0);
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: String(total), bundledSaleMode: "actual", residencePeriodMonths: "0", householdHousingCount: rh ? "2" : "1", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: rh ? [RENTAL] : [] });
  const a = f.assets[0] as unknown as { residenceInputMode: string; residencePeriodMonthsAsset: string; rentalHousingException: object };
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  if (rh) {
    a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  }
  return f;
}

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PropertyCard, AggregatedTaxSummary } from "@/components/calc/results/BundledAllocationSubCards";

const txt = (h: string) => h.replace(/<[^>]+>/g, " | ").replace(/(\s*\|\s*)+/g, " | ");

/**
 * R-c06-04 (a) 3차 리뷰 — 일괄(함께 양도) 화면 「자산별 계산 결과」 카드·「합산 과세 내역」도 단건 규약(§161① 양도소득금액 단계).
 * 같은 화면 합산 신고서 표 주택 열(양도소득금액 528,000,000 · 비과세 양도소득금액 422,400,000)과 같은 값. 세액 불변.
 */
describe("일괄 화면 카드 — §155⑳ 부분과세 자산 단건 규약", () => {
  it("주택 카드: 양도소득금액 528,000,000 + 비과세 양도소득금액 △422,400,000 · 토지 카드 불변", async () => {
    const agg = (await runCalc(form(true))).json.data.aggregated;
    const [house, land] = agg.properties.map((p: never) => txt(renderToStaticMarkup(createElement(PropertyCard, { breakdown: p }))));
    expect(house).toContain("양도소득금액 | 528,000,000");
    expect(house).toContain("비과세 양도소득금액 | △422,400,000");
    expect(land).toContain("양도소득금액 | 140,000,000");
    expect(land).not.toContain("비과세 양도소득금액");
    expect(agg.totalTax).toBe(79_681_800);
  });
  it("합산 과세 내역: 668,000,000 − 422,400,000 − 2,500,000 = 과세표준 243,100,000", async () => {
    const agg = (await runCalc(form(true))).json.data.aggregated;
    const s = txt(renderToStaticMarkup(createElement(AggregatedTaxSummary, { aggregated: agg })));
    expect(s).toContain("양도소득금액 (합산) | 668,000,000");
    expect(s).toContain("비과세 양도소득금액 | △422,400,000");
    expect(s).toContain("과세표준 | 243,100,000");
    expect(668_000_000 - 422_400_000 - agg.basicDeduction).toBe(agg.taxBase);
  });
  it("짝 — §155⑳ 없는 일반 경로: 카드·합산 모두 종전 값(105,600,000 · 245,600,000) · 비과세 행 없음", async () => {
    const agg = (await runCalc(form(false))).json.data.aggregated;
    const house = txt(renderToStaticMarkup(createElement(PropertyCard, { breakdown: agg.properties[0] })));
    const s = txt(renderToStaticMarkup(createElement(AggregatedTaxSummary, { aggregated: agg })));
    expect(house).toContain("양도소득금액 | 105,600,000");
    expect(house).not.toContain("비과세 양도소득금액");
    expect(s).toContain("양도소득금액 (합산) | 245,600,000");
    expect(s).not.toContain("비과세 양도소득금액");
  });
});
