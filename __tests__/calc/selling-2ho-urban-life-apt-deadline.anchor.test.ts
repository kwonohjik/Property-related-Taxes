/**
 * 양도 주택 **자신의** 2호 장기임대 선언 — 「주택법」 도시형 생활주택인 아파트 (V-12 · 사용자 결정 2026-11-05).
 *
 * 소령 §167의3①2호 가목2) 괄호 「「주택법」에 따른 도시형 생활주택인 아파트는 제외한다. 이하 이 목, 나목2)ㆍ라목8) 및 마목4)에서
 * 같다」 — 양도기한(⑪ 2027.12.31.)만 비적용. V-11(#2899)은 명부 2호 행에 칸을 열었지만 양도 주택의 2호 선언에는 칸이 없어,
 * 엔진이 이 사실을 읽는데도(`HouseInfo.isUrbanLifeHousingApartment`) 입력 경로가 없었다(과다 과세 방향).
 *
 * 같은 사실을 3호 후단(①3호 — 매입 장기일반·단기 아파트)도 묻는다. 결정: **3호 칸이 묻는 범위면 3호의 답**, 아니면 2호 토글
 * (`effectiveSellingUrbanLife`). 3호 라디오에는 「모름」이 없다 — 고르지 않으면 종전대로 엔진이 「모름」으로 읽는다.
 *
 * 시료: 강남 · 양도 주택 2016 취득 10억 = 가목 장기임대 아파트(2018.1.1. 등록 · 3억 · 8년 · ⑪ 연장 사유 없음) · 명부 1행 = 일반 아파트.
 *
 * | # | 주장 |
 * |---|---|
 * | S-1 | 2028-06-01 · 도시형 아님 → 양도 주택이 2호 아님 → 2주택 중과 (종전과 같음) |
 * | S-2 | 같은 입력 + 2호 토글 도시형 → 10호 배제 · ④ 도시형 true · ⑪ 연장 사실 미전송 |
 * | S-3 | [짝] 기한 안(2027-12-20)이면 도시형 여부와 무관하게 배제 |
 * | S-4 | 3호가 묻는 범위면 3호 답이 이긴다(2호 토글 켜도 3호 「아님」이면 false · 3호 「예」면 2호 토글 없이 true) |
 * | S-5 | 3호를 켰지만 묻지 않는 범위(건설임대)면 3호의 옛 값을 싣지 않고 2호 토글을 쓴다 |
 * | S-6 | ⑧ 2호 ⑪ 「연장 사유 있음」 미완 검사도 유효 사실로 — 도시형이면 묻지 않는다 |
 * | S-7 | 양도 주택 교체 — 명부 행 ↔ 양도 주택에서 유효 사실이 옮겨진다 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry, RentalDeclaration, TaxIncentiveRentalFacts } from "@/lib/stores/calc-wizard-asset-nbl";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { collectSellingHouseSurchargeIssues } from "@/lib/calc/transfer-tax-validate-surcharge-axis";
import { effectiveSellingUrbanLife } from "@/lib/calc/tax-incentive-rental-scope";
import { swapSellingHouse } from "@/lib/calc/swap-selling-house";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const GANGNAM = "1168010100";
const R1_TAX = 299_816_000;
const EXCLUDED_TAX = 141_966_000;

const ltr = (patch: Partial<RentalDeclaration> = {}): RentalDeclaration => ({
  isLongTermRental: true,
  isApartment: true,
  isRegisteredRental: true,
  rentalType: "A",
  rentalRegistrationDate: "2018-01-01",
  businessRegistrationDate: "2018-01-01",
  rentalStartOfficialPrice: "300000000",
  rentIncreaseUnder5Pct: true,
  rentalPeriodYears: "8",
  rentalAptDeadlineExtension: { status: "none" },
  ...patch,
});

/** 3호 — 매입 · 장기일반 · 아파트(2호 칸 공유) → 도시형 질문이 열리는 범위 */
const tirAsking = (patch: Partial<TaxIncentiveRentalFacts> = {}): TaxIncentiveRentalFacts => ({
  isTaxIncentiveRental: true,
  isNationalSizeHousing: true,
  isTaxIncentiveRentalPurchase: true,
  taxIncentiveRentalRegistrationType: "long_term_general",
  taxIncentiveRentalAptDeadlineExtension: { status: "none" },
  ...patch,
});

const otherRow = {
  id: "h2",
  region: "capital",
  regionCode: GANGNAM,
  acquisitionDate: "2015-06-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionOrigin: "general",
} as HouseEntry;

function form(transferDate: string, se: TransferFormData["sellingHouseExclusion"]) {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate,
    isOneHousehold: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    contractTotalPrice: "1,000,000,000",
    houses: [otherRow],
    householdHousingCount: "2",
    householdNoPresaleRightsConfirmed: true,
    sellingHouseExclusion: se,
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

/** ④ 양도 주택 행 */
function sellingRow(f: TransferFormData): Record<string, unknown> {
  const rows = buildHousesPayload(f.assets[0], f.houses, 0, f.sellingHouseExclusion, f.transferDate) as Record<string, unknown>[];
  return rows.find((h) => h.id === "selling")!;
}

describe("양도 주택 2호 선언 도시형 생활주택인 아파트 — 양도기한만 비적용 (V-12)", () => {
  it("S-1 도시형 아님 · 2028-06-01 → 2주택 중과", async () => {
    const r = await runCalc(form("2028-06-01", { longTermRental: ltr() }));
    expect(r.issues.filter((i) => !i.includes("소재지"))).toEqual([]);
    expect(mh(r).surchargeType).toBe("multi_house_2");
    expect(r.result.totalTax).toBe(R1_TAX);
  });

  it("S-2 2호 토글 도시형 → 10호 배제 · ④ true · ⑪ 연장 사실 미전송", async () => {
    const f = form("2028-06-01", { longTermRental: ltr({ isUrbanLifeHousingApartment: true }) });
    const row = sellingRow(f);
    expect(row.isUrbanLifeHousingApartment).toBe(true);
    expect(row.rentalAptDeadlineExtension).toBeUndefined();
    const r = await runCalc(f);
    expect(r.issues.filter((i) => !i.includes("소재지"))).toEqual([]);
    expect(mh(r).surchargeType).toBe("none");
    expect(mh(r).exclusionReasons.map((e) => e.type)).toEqual(["long_term_rental_house"]);
    expect(r.result.totalTax).toBe(EXCLUDED_TAX);
  });

  it("S-3 [짝] 2027-12-20 양도는 도시형 아니어도 배제", async () => {
    const r = await runCalc(form("2027-12-20", { longTermRental: ltr() }));
    expect(mh(r).surchargeType).toBe("none");
    expect(r.result.totalTax).toBe(EXCLUDED_TAX);
  });

  it("S-4 3호가 묻는 범위면 3호 답이 이긴다", () => {
    // 2호 토글 켬 + 3호 「아님」 → false(3호 우선)
    const no = { longTermRental: ltr({ isUrbanLifeHousingApartment: true }), taxIncentiveRental: tirAsking({ isUrbanLifeHousingApartment: false }) };
    expect(effectiveSellingUrbanLife(no)).toBe(false);
    expect(sellingRow(form("2028-06-01", no)).isUrbanLifeHousingApartment).toBe(false);
    // 2호 토글 없음 + 3호 「예」 → true, 2호 ⑪ 연장 사실도 범위 밖
    const yes = { longTermRental: ltr(), taxIncentiveRental: tirAsking({ isUrbanLifeHousingApartment: true }) };
    const row = sellingRow(form("2028-06-01", yes));
    expect(row.isUrbanLifeHousingApartment).toBe(true);
    expect(row.rentalAptDeadlineExtension).toBeUndefined();
    // 3호가 묻는데 고르지 않음 → undefined(엔진 「모름」 — 2호 토글이 켜져 있어도 대신하지 않는다)
    const unanswered = { longTermRental: ltr({ isUrbanLifeHousingApartment: true }), taxIncentiveRental: tirAsking() };
    expect(effectiveSellingUrbanLife(unanswered)).toBeUndefined();
  });

  it("S-5 3호를 켰지만 묻지 않는 범위(건설임대)면 3호 옛 값 대신 2호 토글", () => {
    const stale = { isTaxIncentiveRentalPurchase: false, isUrbanLifeHousingApartment: true };
    expect(sellingRow(form("2028-06-01", { longTermRental: ltr(), taxIncentiveRental: tirAsking(stale) })).isUrbanLifeHousingApartment).toBeUndefined();
    expect(
      sellingRow(form("2028-06-01", { longTermRental: ltr({ isUrbanLifeHousingApartment: true }), taxIncentiveRental: tirAsking(stale) }))
        .isUrbanLifeHousingApartment,
    ).toBe(true);
  });

  it("S-6 ⑧ 2호 ⑪ 「연장 사유 있음」 미완 — 도시형(3호 답 포함)이면 묻지 않는다", () => {
    const has = { status: "has" as const };
    const msgs = (se: TransferFormData["sellingHouseExclusion"]) =>
      collectSellingHouseSurchargeIssues(form("2028-06-01", se)).map((i) => i.message).filter((m) => m.includes("장기임대 아파트: 양도기한"));
    expect(msgs({ longTermRental: ltr({ rentalAptDeadlineExtension: has }) })).toHaveLength(1);
    expect(msgs({ longTermRental: ltr({ rentalAptDeadlineExtension: has, isUrbanLifeHousingApartment: true }) })).toHaveLength(0);
    expect(
      msgs({ longTermRental: ltr({ rentalAptDeadlineExtension: has }), taxIncentiveRental: tirAsking({ isUrbanLifeHousingApartment: true }) }),
    ).toHaveLength(0);
  });

  it("S-7 양도 주택 교체 — 유효 사실이 행의 한 칸으로, 행의 칸이 2호 선언으로 옮겨진다", () => {
    const row2: HouseEntry = { ...otherRow, id: "h2", isLongTermRental: true, ...ltr({ isUrbanLifeHousingApartment: true }) } as HouseEntry;
    const base: OneHouseJudgmentFormData = {
      ...createInitialOneHouseJudgmentForm(),
      houses: [row2],
      sellingHouseExclusion: { longTermRental: ltr(), taxIncentiveRental: tirAsking({ isUrbanLifeHousingApartment: true }) },
    } as OneHouseJudgmentFormData;
    const { form: swapped } = swapSellingHouse(base, "h2");
    expect(swapped.sellingHouseExclusion?.longTermRental?.isUrbanLifeHousingApartment).toBe(true);
    const back = swapped.houses.find((h) => h.id === "h2")!;
    expect(back.isUrbanLifeHousingApartment).toBe(true); // 옛 양도 주택: 3호 답(true)이 유효 사실

    // 3호가 묻지 않는 범위(건설임대)의 옛 값은 행으로 옮기지 않는다 — 화면·④가 쓰지 않는 값이다
    const stale = swapSellingHouse(
      { ...base, sellingHouseExclusion: { longTermRental: ltr(), taxIncentiveRental: tirAsking({ isTaxIncentiveRentalPurchase: false, isUrbanLifeHousingApartment: true }) } },
      "h2",
    ).form.houses.find((h) => h.id === "h2")!;
    expect(stale.isUrbanLifeHousingApartment).toBeUndefined();
  });
});
