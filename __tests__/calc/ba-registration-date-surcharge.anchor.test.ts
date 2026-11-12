/**
 * anchor — 바목 9억 상한의 기준일(지자체 민간임대주택 등록일)이 다주택 중과 세액까지 닿는다 (V-5 · 엔진 격자는
 * `__tests__/tax-engine/rental-article/ba-aja-registration-date-gate.anchor.test.ts`).
 *
 * 시료: 강남 · 2주택 · 양도 주택 2016 취득 10억(일반) · 명부 1행 = 바목 장기일반 건설임대(임대개시 기준시가 7억 · 2호 · 298/149 이내).
 * 부칙<제35349호> 제15조① — 9억은 2025.2.28. 이후 「민간임대주택으로 등록한」 주택만. 지자체 등록이 그 전이면 6억이라 7억 주택은 2호 아님.
 *
 * | # | 지자체 등록 · 세무서 등록 | 기대 |
 * |---|---|---|
 * | S-1 | 2025-01-15 · 2025-03-10 | 2호 아님 → 2주택 중과 299,816,000 (종전: 10호 배제 150,766,000) |
 * | S-2 | [짝] 2025-03-10 · 2025-01-15 | 2호 → 일반주택 10호 배제 150,766,000 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const GANGNAM = "1168010100";

function form(rentalRegistrationDate: string, businessRegistrationDate: string) {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2026-06-01",
    isOneHousehold: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    contractTotalPrice: "1,000,000,000",
    householdHousingCount: "2",
    householdNoPresaleRightsConfirmed: true,
    houses: [
      {
        id: "h2",
        region: "capital",
        regionCode: GANGNAM,
        acquisitionDate: "2012-06-01",
        officialPrice: "700000000",
        isInherited: false,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        isRegisteredRental: true,
        rentalType: "F",
        rentalRegistrationDate,
        rentalRegisteredDate: rentalRegistrationDate,
        businessRegistrationDate,
        rentalStartOfficialPrice: "700000000",
        rentIncreaseUnder5Pct: true,
        rentalStartDate: "2025-06-01", // PR-2 Q-3 — 연수 "1" 대신(양도 2026-06-01까지 1년 · 두 등록일보다 뒤라 자르지 않음)
        hasMinimum2Units: true,
        rentalLandArea: "200",
        rentalTotalFloorArea: "100",
      } as HouseEntry,
    ],
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    addressJibun: "서울 강남구 테스트동 1-1",
    acquisitionCause: "purchase",
    acquisitionDate: "2016-08-12",
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "500,000,000",
    useEstimatedAcquisition: false,
    regionCode: GANGNAM,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
  });
  return f;
}

type Mh = { surchargeType: string; exclusionReasons: { type: string }[] };
const mh = (r: { result: unknown }) => (r.result as { multiHouseSurchargeEvaluation: Mh }).multiHouseSurchargeEvaluation;

describe("바목 9억 상한 기준일 × 다주택 중과 (V-5)", () => {
  it("S-1 지자체 등록 2025.2.28. 전 · 세무서 등록 후 → 6억 상한 → 2주택 중과", async () => {
    const r = await runCalc(form("2025-01-15", "2025-03-10"));
    expect(r.issues).toEqual([]);
    expect(mh(r).surchargeType).toBe("multi_house_2");
    expect(r.result.totalTax).toBe(299_816_000);
  });

  it("S-2 [짝] 지자체 등록 2025.2.28. 후 → 9억 상한 → 일반주택 10호 배제", async () => {
    const r = await runCalc(form("2025-03-10", "2025-01-15"));
    expect(r.issues).toEqual([]);
    expect(mh(r).surchargeType).toBe("none");
    expect(mh(r).exclusionReasons.map((e) => e.type)).toEqual(["only_general_two_house"]);
    expect(r.result.totalTax).toBe(150_766_000);
  });
});
