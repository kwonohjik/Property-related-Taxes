/**
 * 다주택 중과 명부의 2호 장기임대 행 — 「주택법」 도시형 생활주택인 아파트 (V-11 · `docs/00-pm/rental-155-20-review-fixes.plan.md`).
 *
 * 소령 §167의3①2호 가목2) 괄호 「「주택법」에 따른 도시형 생활주택인 아파트는 제외한다. 이하 이 목, 나목2)ㆍ라목8) 및 마목4)에서
 * 같다」 — 양도기한(⑪ 2027.12.31.)만 비적용한다. V-10(#2897)이 엔진 2호 판정(`toNormalizedFromHouse`)에 같은 필드를 읽게 했지만,
 * 명부 2호 행에는 그 칸이 없어(3호 칸에만 있음) 2호 행 단독 도시형 아파트는 늘 양도기한이 걸렸다.
 *
 * 시료: 강남 · 양도 주택 2016 취득 10억 · 명부 1행 = 가목 장기임대 아파트(2018.1.1. 등록 · 3억 · 8년 · ⑪ 연장 사유 없음).
 *
 * | # | 주장 |
 * |---|---|
 * | R-1 | 2028-06-01 양도 · 도시형 아님 → 명부 행이 2호 아님 → 2주택 중과 (종전과 같음) |
 * | R-2 | 같은 입력 + 명부 행 도시형 → 2호 → 양도 주택 10호 배제 |
 * | R-3 | [짝] 기한 안(2027-12-20)이면 도시형 여부와 무관하게 배제 |
 * | R-4 | ④ — 묻는 범위(2호 · 아파트 · 가·나·라·마목)에서 「예」일 때만 싣고, 그때 ⑪ 연장 사실은 싣지 않는다 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const GANGNAM = "1168010100";
const rentalRow = (patch: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "h2",
    region: "capital",
    regionCode: GANGNAM,
    acquisitionDate: "2015-06-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: true,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    isRegisteredRental: true,
    rentalType: "A",
    rentalRegistrationDate: "2018-01-01",
    businessRegistrationDate: "2018-01-01",
    rentalStartOfficialPrice: "300000000",
    rentIncreaseUnder5Pct: true,
    rentalStartDate: "2018-01-01", // PR-2 Q-3 — 연수 "8" 대신(등록일과 같은 날 · 양도 2027~2028까지 5년 이상)
    rentalAptDeadlineExtension: { status: "none" },
    ...patch,
  }) as HouseEntry;

function form(transferDate: string, row: HouseEntry) {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate,
    isOneHousehold: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    contractTotalPrice: "1,000,000,000",
    houses: [row],
    householdHousingCount: "2",
    householdNoPresaleRightsConfirmed: true,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
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

describe("명부 2호 행 도시형 생활주택인 아파트 — 양도기한만 비적용 (V-11)", () => {
  it("R-1 도시형 아님 · 2028-06-01 → 2주택 중과", async () => {
    const r = await runCalc(form("2028-06-01", rentalRow()));
    expect(r.issues.filter((i) => !i.includes("소재지"))).toEqual([]);
    expect(mh(r).surchargeType).toBe("multi_house_2");
    expect(r.result.totalTax).toBe(R1_TAX);
  });

  it("R-2 명부 행 도시형 → 2호 → 양도 주택 10호 배제", async () => {
    const r = await runCalc(form("2028-06-01", rentalRow({ isUrbanLifeHousingApartment: true })));
    expect(r.issues.filter((i) => !i.includes("소재지"))).toEqual([]);
    expect(mh(r).surchargeType).toBe("none");
    expect(mh(r).exclusionReasons.map((e) => e.type)).toEqual(["only_general_two_house"]);
    expect(r.result.totalTax).toBe(EXCLUDED_TAX);
  });

  it("R-3 [짝] 2027-12-20 양도는 도시형 아니어도 배제", async () => {
    const r = await runCalc(form("2027-12-20", rentalRow()));
    expect(mh(r).surchargeType).toBe("none");
    expect(r.result.totalTax).toBe(EXCLUDED_TAX);
  });

  it("R-4 ④ — 범위 안 「예」만 싣고 ⑪ 연장 사실은 뺀다 · 아파트 아님이면 남은 값을 싣지 않는다", () => {
    const pick = (row: HouseEntry) => (buildOtherHousesPayload([row]) as Record<string, unknown>[])[0];
    const urban = pick(rentalRow({ isUrbanLifeHousingApartment: true }));
    expect(urban.isUrbanLifeHousingApartment).toBe(true);
    expect(urban.rentalAptDeadlineExtension).toBeUndefined();

    const plain = pick(rentalRow());
    expect(plain.isUrbanLifeHousingApartment).toBeUndefined();
    expect(plain.rentalAptDeadlineExtension).toEqual({ confirmedNone: true });

    expect(pick(rentalRow({ isApartment: false, isUrbanLifeHousingApartment: true })).isUrbanLifeHousingApartment).toBeUndefined();
  });
});

const R1_TAX = 299_816_000;
const EXCLUDED_TAX = 141_966_000;
