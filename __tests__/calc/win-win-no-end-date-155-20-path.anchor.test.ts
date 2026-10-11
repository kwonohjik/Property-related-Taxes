/**
 * 결정 #45 조건 — 「별건 S06-5(⑳ 거주주택 특례 경로의 고가주택 장기보유공제 0)를 이 건과 함께 또는 먼저 고친다」.
 *
 * 종료일 없는 상생임대는 2027-12-31까지 양도에서 성립으로 읽는다(#45). 그 양도가 §155⑳ 경로(RH-B2, 15억 · 거주 0개월)로 들어와도
 * 「특례 성립 + 장기보유공제 0」이 되지 않아야 한다 — 2호 부분은 소령 §161④ 문언대로 표2 보유분을 적용한다(#15, 이 PR에 함께 싣는다).
 * 종전(#15 없이): 같은 입력의 2호 부분 gain95Table2 1,011,000,000(공제 0) · part2 50,550,000 · 총세액 227,883,150.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

/** B(§154⑩ 표준 경로) · 2009-08 취득 · 양도가 15억 · 거주 0개월 · (선택) 종료일 없는 상생임대 사실을 판정 메뉴에서 넘겨받음. */
function form(transferDate: string, winWin: boolean, leaseEnd = "") {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate, householdHousingCount: "1", isOneHousehold: true, isRegulatedArea: false, wasRegulatedAtAcquisition: false, contractTotalPrice: "1,500,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "1,500,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "0" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException, applyException: true, scenario: "B", rentalUnits: [],
    priorResidenceTransferDate: "2016-08-25", standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000", postRegistrationResidenceMonths: "0", wasRegisteredRentalOrChildcare: true,
  };
  if (winWin) {
    Object.assign(f, {
      importedOneHouseFacts: {
        ...oneHouseJudgmentExtraDefaults,
        winWinRentalSpecial: true, winWinRentalContractDate: "2023-01-10", winWinRentalIncreaseRatePct: "5",
        winWinRentalPriorLeaseMonths: "24", winWinRentalLeaseMonths: "24", winWinRentalLeaseEndDate: leaseEnd,
      },
    });
  }
  return f;
}

describe("#45 × #15 — 종료일 없는 상생임대 + ⑳ 경로 + 고가주택 + 거주 2년 미만", () => {
  it("[WH-1] 2027-06-01 양도 · 종료일 없음: 특례(RH-B2)가 성립하고 2호 부분 공제는 표2 보유분 40%다 — 공제 0이 아니다", async () => {
    const r = await runCalc(form("2027-06-01", true));
    const d = r.result.rentalHousingExceptionDetail;
    expect(d.scenarioId).toBe("RH-B2");
    expect(d.formulaTrace.gain95Table2).toBe(606_600_000);
    expect(d.formulaTrace.part2).toBe(30_330_000);
    expect(d.formulaTrace.gain95Table2).not.toBe(1_011_000_000);
    expect(r.result.totalTax).toBe(218_541_510);
  });

  it("[WH-2] 짝 — 상생임대 사실이 없거나(없음) 종료일이 있어도 같은 세액이다 (상생임대 판단이 ⑳ 장특을 흔들지 않는다)", async () => {
    for (const [ww, end] of [[false, ""], [true, "2024-03-01"]] as const) {
      const r = await runCalc(form("2027-06-01", ww, end));
      expect(r.result.rentalHousingExceptionDetail.formulaTrace.part2).toBe(30_330_000);
      expect(r.result.totalTax).toBe(218_541_510);
    }
  });

  it("[WH-3] 2028-06-01 양도 · 종료일 없음(불성립 영역)도 ⑳ 2호 공제는 같다 — 세액 218,541,510", async () => {
    const r = await runCalc(form("2028-06-01", true));
    expect(r.result.rentalHousingExceptionDetail.formulaTrace.part2).toBe(30_330_000);
    expect(r.result.totalTax).toBe(218_541_510);
  });
});
