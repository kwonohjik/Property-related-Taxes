/**
 * §155⑳ 2020.7.10./7.11. 컷오프 = 지자체 임대사업자등록 **신청일** (사용자 결정 2026-11-04 D-1).
 *
 * 소득세법 시행령 §155⑳ 본문 「2020년 7월 10일 이전에 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록 신청
 * (…)을 한 주택으로 한정」 · §167의3①2호 마목 2) 「2020년 7월 11일 이후 … 임대사업자등록 신청을 한 … 아파트」.
 * 종전 엔진은 세무서 사업자등록일과의 max로 판정해, 7.10. 이전 신청 + 7.11. 이후 세무서 등록 아파트를 마목 2)로 떨어뜨렸다.
 * 계획서 `docs/00-pm/rental-155-20-review-fixes.plan.md` §3 M-1 · §6 C-1~C-4.
 *
 * | # | 주장 |
 * |---|---|
 * | C-1 | 아파트 · 신청 7.9. · 세무서 8.3. · 10억 → 가목 ⑳ 성립 RH-A1 · 0 (종전 마목 불성립 299,816,000) |
 * | C-2 | 같은 입력 20억 → RH-A2 · 77,341,000 (종전 998,178,500) |
 * | C-3 | [짝] 신청 7.11. · 세무서 7.9. 아파트 → 마목 2) 제한 유지(불성립) |
 * | C-4 | 비아파트 · 신청 7.9. · 세무서 8.3. · 72개월 → 가목 5년 충족 · ㉑ 대기 없음 (종전 마목 8년 대기) |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

/** 거주주택 2012 취득 · 거주 60개월 · 양도 2027-01-05 · 조정 · 주택 수 2 · 임대 1호(장기일반 매입 · 수도권 기준시가 3억 · 72개월). */
function form(biz: string, rent: string, isApartment: boolean, price = "1,000,000,000") {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2027-01-05", householdHousingCount: "2", isOneHousehold: true, isRegulatedArea: true, wasRegulatedAtAcquisition: false, contractTotalPrice: price });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2012-08-12", actualSalePrice: price, fixedAcquisitionPrice: "500,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "60" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: biz, rentalRegistrationDate: rent, isApartment, standardPriceAtRentalStart: "300,000,000", rentalInputMode: "direct" as const, rentalMonths: "72", requirementsConfirmed: true }],
  };
  return f;
}

type Detail = { applied?: boolean; scenarioId?: string; eligibility?: { periodPendingUnitIndexes?: number[]; perUnitVerdicts?: { article?: string }[] } };
const detail = (r: { result: unknown }) => (r.result as { rentalHousingExceptionDetail?: Detail }).rentalHousingExceptionDetail;

describe("§155⑳ 2020.7.10. 컷오프 — 지자체 등록 신청일 기준 (D-1)", () => {
  it("C-1 아파트 · 신청 2020-07-09 · 세무서 2020-08-03 · 10억 → 가목 성립 · 0", async () => {
    const r = await runCalc(form("2020-08-03", "2020-07-09", true));
    expect(detail(r)?.scenarioId).toBe("RH-A1");
    expect(r.result.totalTax).toBe(0);
  });

  it("C-2 같은 입력 20억 → RH-A2 · 77,341,000", async () => {
    const r = await runCalc(form("2020-08-03", "2020-07-09", true, "2,000,000,000"));
    expect(detail(r)?.scenarioId).toBe("RH-A2");
    expect(r.result.totalTax).toBe(77_341_000);
  });

  it("C-2 [짝] 두 등록이 모두 7.9.인 입력과 같은 세액 — 세무서 등록일은 컷오프에 들어가지 않는다", async () => {
    const r = await runCalc(form("2020-07-09", "2020-07-09", true, "2,000,000,000"));
    expect(r.result.totalTax).toBe(77_341_000);
  });

  it("C-3 [짝] 신청 2020-07-11 · 세무서 2020-07-09 아파트 → 마목 2) 아파트 제한으로 ⑳ 불성립", async () => {
    const r = await runCalc(form("2020-07-09", "2020-07-11", true));
    expect(detail(r)?.applied).toBe(false);
    expect(r.result.totalTax).toBeGreaterThan(0);
  });

  it("C-4 비아파트 · 신청 7.9. · 세무서 8.3. · 72개월 → 가목 5년 충족이라 ㉑ 대기 호 없음", async () => {
    const r = await runCalc(form("2020-08-03", "2020-07-09", false));
    expect(detail(r)?.scenarioId).toBe("RH-A1");
    expect(detail(r)?.eligibility?.periodPendingUnitIndexes ?? []).toEqual([]);
  });
});
