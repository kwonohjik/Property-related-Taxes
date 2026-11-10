/**
 * §155⑳ 장기임대주택 보유자 거주주택 특례 경로 — 표시용 echo(`exemptGrossGain`·`expenses`·`capitalExpenditureForDisplay`).
 *
 * 종전: 이 경로(`transfer-tax-rental-housing-step.ts`)는 `isExempt:true` + gross `transferGain`만 싣고 echo를 싣지 않았다.
 * 소비처(상세명세서·신고서)의 규칙은 `isExempt ? (exemptGrossGain ?? 0) : transferGain`이라
 *  - 전액 비과세: 「전체 양도차익」 0 · 취득가액 = 양도가액 − 0 − 경비 → 양도가액 전액(시료 10억 → 1,000,000,000, 정답 300,000,000)
 *  - 비과세·과세 모두: `result.expenses` 없음 → 양도비가 0으로 찍히고 취득가액에 흡수(20,000,000 → 취득가액 320,000,000)
 * 세액은 불변(표시 전용). 시료: 강남 주택 취득 2015-01-01 · 취득가 3억 · 양도 2026-09-18 · 임대주택 1채(⑳ 성립) · 양도비 20,000,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";

const GANGNAM = "1168010100";
const RENTAL: HouseEntry = {
  id: "h4", region: "capital", regionCode: GANGNAM, acquisitionDate: "2013-06-01", officialPrice: "300000000",
  isInherited: false, isLongTermRental: true, isApartment: false, isOfficetel: false, isUnsoldHousing: false,
};

function form(price: string, expense: string) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, addressJibun: "서울 강남구 역삼동 1" };
  Object.assign(f, { householdNoPresaleRightsConfirmed: true, transferDate: "2026-09-18", contractTotalPrice: price, residencePeriodMonths: "0", householdHousingCount: "2", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: [RENTAL] });
  const a = f.assets[0];
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  if (expense) (a as unknown as Record<string, string>).transferExpense = expense;
  return f;
}

async function run(price: string, expense: string) {
  const f = form(price, expense);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  expect(r.issues).toEqual([]);
  expect(r.r.rentalHousingExceptionDetail?.applied).toBe(true);
  const items = buildStatementItems(r.r, f, f.assets[0], undefined, undefined);
  return { r, items };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, d) => loadFallbackTransferRates(d as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

describe("§155⑳ 특례 경로 — 표시용 echo", () => {
  it("🔑 전액 비과세(10억) + 양도비 2천만 — gross 양도차익·경비 echo · 명세서 취득가액 3억·양도비 2천만", async () => {
    const { r, items } = await run("1,000,000,000", "20,000,000");
    expect(r.r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.r.exemptGrossGain).toBe(680_000_000);
    expect(r.r.expenses).toBe(20_000_000);
    expect(items.get("acquisitionPrice")?.value).toBe(300_000_000);
    expect(items.get("expenses")?.value).toBe(20_000_000);
    expect(String(items.get("taxableGain")?.formula)).toContain((680_000_000).toLocaleString());
  });

  it("전액 비과세(10억) 양도비 없음 — 명세서 취득가액이 양도가액 전액(10억)으로 찍히지 않는다", async () => {
    const { r, items } = await run("1,000,000,000", "");
    expect(r.r.exemptGrossGain).toBe(700_000_000);
    expect(items.get("acquisitionPrice")?.value).toBe(300_000_000);
    expect(String(items.get("taxableGain")?.formula)).toContain((700_000_000).toLocaleString());
  });

  it("🔑 고가주택 부분과세(15억) + 양도비 2천만 — 양도비가 취득가액에 흡수되지 않는다 · exemptGrossGain 불필요(비과세 아님)", async () => {
    const { r, items } = await run("1,500,000,000", "20,000,000");
    expect(r.r.isExempt).toBe(false);
    expect(r.r.exemptGrossGain).toBeUndefined();
    expect(r.r.expenses).toBe(20_000_000);
    expect(items.get("acquisitionPrice")?.value).toBe(300_000_000);
    expect(items.get("expenses")?.value).toBe(20_000_000);
  });

  it("세액 불변 — 15억 시료 totalTax 22,709,500 (양도비 0)", async () => {
    const { r } = await run("1,500,000,000", "");
    expect(r.totalTax).toBe(22_709_500);
  });
});
