/**
 * 상세명세서 — 일괄(함께 양도) × §155⑳ 특례 × 12억 초과(부분과세)의 자산별 행.
 *
 * 종전: §155⑳ 경로는 장기보유특별공제를 **전체 양도차익** 기준으로 산정하는데(`longTermHoldingDeduction` 672,000,000 = 1,200,000,000 × 56%),
 * 일반 경로는 **과세분** 기준(134,400,000 = 240,000,000 × 56%)이다. 명세서 자산별 행은 둘 다 «과세대상 = min(차익, 양도소득금액 + 장특)» 으로 역산해
 * 특례 경로에서 「과세대상양도차익 777,600,000 × 86.4% = 672,000,000」이라는 법정 공제율에 없는 숫자를 찍었다(세액은 정확 — 일반 경로와 같은 79,681,800).
 * 시료: 강남 주택 15억(취득 2015-01-01 · 취득가 3억 · 거주 48개월 · 임대주택 1채로 ⑳ 성립) + 컴패니언 토지 3억, 일괄 actual 모드.
 *   전체 차익 1,200,000,000 · 장특 56% 672,000,000 · 12억 초과분 비율 20% → 양도소득금액 105,600,000 · 비과세 양도소득금액 422,400,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";

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

function form(house: string, rh: boolean) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, actualSalePrice: house, addressJibun: "서울 강남구 역삼동 1" } as never;
  f.assets.push({ ...makeDefaultAsset(2), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" } as never);
  const total = Number(house.replace(/,/g, "")) + 300_000_000;
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: String(total), bundledSaleMode: "actual", residencePeriodMonths: "0", householdHousingCount: rh ? "2" : "1", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: rh ? [RENTAL] : [] });
  const a = f.assets[0] as unknown as { residenceInputMode: string; residencePeriodMonthsAsset: string; rentalHousingException: object };
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  if (rh) {
    a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  }
  return f;
}

/** 첫 자산(주택) 행의 값·산식 */
async function houseRow(key: string, house: string, rh: boolean) {
  const f = form(house, rh);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  const items = buildStatementItems(aggregateToFilingResult(agg) as never, f, f.assets[0], { properties: agg.properties, aggregated: agg }, undefined);
  const row = items.get(key)?.perAsset?.[0];
  return { value: row?.value, formula: String(row?.formula), totalTax: agg.totalTax as number | undefined };
}

describe("상세명세서 — 일괄 × §155⑳ × 12억 초과 자산별 행", () => {
  it("🔑 장특 행 — 전체 양도차익 기준 «1,200,000,000 × 56% = 672,000,000» (86.4% 아님)", async () => {
    const r = await houseRow("ltDeduction", "1,500,000,000", true);
    expect(r.value).toBe(672_000_000);
    expect(r.formula).toContain("전체 양도차익 1,200,000,000 × 56% = 672,000,000");
    expect(r.formula).not.toContain("86.4%");
  });

  it("🔑 양도소득금액 행 — (전체 차익 − 장특 − 비과세 양도소득금액) = 105,600,000", async () => {
    const r = await houseRow("incomeAmount", "1,500,000,000", true);
    expect(r.value).toBe(105_600_000);
    expect(r.formula).toContain("1,200,000,000 - 672,000,000 - 422,400,000(비과세 양도소득금액) = 105,600,000");
  });

  it("🔑 과세대상 양도차익 행 — 값 불변(777,600,000) · 산식은 전체 차익에서 비과세 양도소득금액을 뺀 것", async () => {
    const r = await houseRow("taxableGain", "1,500,000,000", true);
    expect(r.value).toBe(777_600_000);
    expect(r.formula).toContain("전체 양도차익 1,200,000,000 − 비과세 양도소득금액 422,400,000 = 777,600,000");
  });

  it("짝 — 일반 경로(§155⑳ 없음) 15억은 종전 문구 그대로: 과세분 기준 «240,000,000 × 56%»", async () => {
    const lt = await houseRow("ltDeduction", "1,500,000,000", false);
    expect(lt.value).toBe(134_400_000);
    expect(lt.formula).toContain("과세대상양도차익 240,000,000 × 56% = 134,400,000");
    const tg = await houseRow("taxableGain", "1,500,000,000", false);
    expect(tg.formula).toContain("양도차익 1,200,000,000과 (양도소득금액 105,600,000 + 장특공제 134,400,000) 중 작은 금액 = 240,000,000");
  });

  it("짝 — §155⑳ 전액 비과세(10억)는 «비과세 자산»(#3149)·부분과세 문구가 붙지 않는다", async () => {
    const lt = await houseRow("ltDeduction", "1,000,000,000", true);
    expect(lt.formula).toContain("비과세 자산 — 장특공제 미적용");
    expect(lt.formula).not.toContain("비과세 양도소득금액");
  });

  it("세액 불변 — §155⑳ 15억과 일반 15억의 총세액이 같다", async () => {
    const a = await houseRow("ltDeduction", "1,500,000,000", true);
    const b = await houseRow("ltDeduction", "1,500,000,000", false);
    expect(a.totalTax).toBe(b.totalTax);
  });
});

import { rhPartialBasis } from "@/components/calc/results/transfer/DetailedStatementRhPartialFormulas";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

describe("rhPartialBasis — 적용 조건", () => {
  const base = { rentalHousingApplied: true, isExempt: false, transferGain: 1_200_000_000, longTermHoldingDeduction: 672_000_000, income: 105_600_000 } as unknown as PerPropertyBreakdown;
  it("특례 + 부분과세 → 전체 차익·비과세 양도소득금액", () => {
    expect(rhPartialBasis(base)).toEqual({ gross: 1_200_000_000, nontaxableIncome: 422_400_000 });
  });
  it("특례 표지가 없으면(일반 경로·구 이력) null — 종전 문구", () => {
    expect(rhPartialBasis({ ...base, rentalHousingApplied: undefined })).toBeNull();
  });
  it("전액 비과세는 null — 🔑 #3159 이후 exemptGrossGain이 실려 가드가 없으면 «전체 700,000,000 − 비과세 700,000,000»이 된다", () => {
    expect(rhPartialBasis({ ...base, isExempt: true, exemptGrossGain: 700_000_000, longTermHoldingDeduction: 0, income: 0 } as unknown as PerPropertyBreakdown)).toBeNull();
  });
  it("전액 과세(안분 없음: 차익 − 장특 = 소득)는 null", () => {
    expect(rhPartialBasis({ ...base, longTermHoldingDeduction: 600_000_000, income: 600_000_000 })).toBeNull();
  });
  it("토지·건물 분리(splitDetail)는 장특 기준이 파트별이라 null", () => {
    expect(rhPartialBasis({ ...base, splitDetail: {} } as unknown as PerPropertyBreakdown)).toBeNull();
  });
});
