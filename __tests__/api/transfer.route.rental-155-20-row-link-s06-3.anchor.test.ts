/**
 * S06-3 route anchor — 장기임대 행에 조특법 소유주택 제외(§99의2)를 겹쳐 선언해도 「그 밖의 주택」(일반주택 h6)은 남는다
 * → ⑳ 세대 구성 불성립 → 비과세 특례·13호 장기임대 거주주택 중과 배제가 열리지 않는다(leaf: `rental-residence-composition-row-link-s06-3`).
 * 계산기 ④(callTransferTaxAPI body) → ⑫⑭ route. 수정 전 A: totalTax 102,086,600 · applied=true · 13호 배제.
 * 정확한 세액은 §99의2 제외의 15호 축 상호작용이 있어 고정하지 않는다 — applied·배제 사유·「과세가 늘었다」만 단언한다.
 */
import { describe, it, vi, beforeEach, expect } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import { runCalc } from "../calc/_one-house-pr3a-calc-route";

type Form = ReturnType<typeof createDefaultTransferFormData>;
const GANGNAM = "1168010100";
const ROW: HouseEntry = { id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2012-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
const sp = (date: string): SpecialHouseExclusionFormItem => ({ article: "unsold_99_2", houseAcquisitionDate: date, houseContractDate: date, isNationalHousing: false, requirementsConfirmed: true }) as SpecialHouseExclusionFormItem;
const RENTAL: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2013-06-01", isLongTermRental: true, isApartment: false };
const RENTAL_99_2: HouseEntry = { ...RENTAL, countExclusion: { kind: "special", special: sp("2013-06-01") } };
const GEN: HouseEntry = { ...ROW, id: "h6", acquisitionDate: "2013-06-01" };
const GEN_99_2: HouseEntry = { ...GEN, countExclusion: { kind: "special", special: sp("2013-06-01") } };

function form(houses: HouseEntry[]): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, addressJibun: "서울 강남구 역삼동 1" };
  Object.assign(f, { householdNoPresaleRightsConfirmed: true, transferDate: "2026-09-18", contractTotalPrice: "2,000,000,000", residencePeriodMonths: "0", householdHousingCount: String(houses.length + 1), isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses });
  const a = f.assets[0];
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  return f;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

describe("S06-3 계산기 — 임대 행 자신의 §99의2 선언", () => {
  it("A [h4 장기임대+§99의2, h6 일반] — h6이 남으므로 ⑳ 불성립 · 13호 배제 없음 · 과세가 늘어난다", async () => {
    const r = await runCalc(form([RENTAL_99_2, GEN]));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.r.rentalHousingExceptionDetail?.applied).not.toBe(true);
    expect((r.r.multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((x: { type: string }) => x.type)).not.toContain("long_term_rental_residence");
    expect(r.totalTax).toBeGreaterThan(102_086_600);
  });
  it("C 긍정 짝 [h4 장기임대, h6 일반+§99의2] — 정당하게 ⑳ 성립 102,086,600 유지", async () => {
    const r = await runCalc(form([RENTAL, GEN_99_2]));
    expect(r.r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.totalTax).toBe(102_086_600);
  });
});
