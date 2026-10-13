/**
 * #20(G8-1) 성립 B — 직전거주주택보유주택(§155⑳ 후단 · §154⑩)이 성립했는데 임대주택이 남아 있고 조정대상지역이라 다주택 중과가 붙는 경우.
 *
 * 사용자 결정(2026-10-14): 현행 유지 — B의 과세 기간분에도 중과를 적용하고 정면 해석 미확보를 확인 필요로 알린다. 시나리오 A는
 * 15호(§167의10①15호)로 중과를 배제한다(`qualifiesRentalResidenceDeeming`). 고지가 없어 침묵으로 중과가 붙던 것을 밝힌다.
 *
 * | # | 주장 |
 * |---|---|
 * | N-1 | B 성립 + 임대 포함 주택 수 2 + 조정 + 한시 배제 밖 → 중과 2주택 + 확인 필요 고지 |
 * | N-2 | 같은 입력이라도 중과가 안 붙으면(비조정 · 임대 제외 주택 수 1) 고지 없음 — 값은 입력 방식에 따라 갈린다(현행 · 결정 반영) |
 * | N-3 | 시나리오 A는 15호로 중과 배제 — 고지 없음 · B가 불성립이면 이 고지가 아니라 되돌림 고지 |
 * | N-4 | 고지 leaf 가드 — 중과 유형 · 시나리오 B · 요건 통과가 모두 있어야 한다(계산 경로로는 도달하지 못하는 방어 조건) |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { PRHP_SURCHARGE_UNVERIFIED_NOTICE, prhpSurchargeUnverifiedNotice } from "@/lib/tax-engine/transfer-tax-rental-housing-judge";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { runCalc } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

/** 2009 취득 · 양도 2026-08-01(한시 배제 2026-05-09 종료 뒤) · 15억 · 임대 1호(가목 5년 이상 80개월) 보유. */
function form(count: string, regulated: boolean, scenario: "A" | "B", postRegMonths = "30") {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2026-08-01", householdHousingCount: count, isOneHousehold: true, isRegulatedArea: regulated, wasRegulatedAtAcquisition: false, contractTotalPrice: "1,500,000,000" });
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-08-12", actualSalePrice: "1,500,000,000", fixedAcquisitionPrice: "489,000,000", useEstimatedAcquisition: false, residenceInputMode: "direct", residencePeriodMonthsAsset: "30" });
  f.assets[0].rentalHousingException = {
    ...f.assets[0].rentalHousingException,
    applyException: true,
    scenario,
    rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "80", requirementsConfirmed: true }],
    priorResidenceTransferDate: "2016-08-25",
    standardPriceAtAcquisitionForPhrp: "300,000,000",
    standardPriceAtPriorTransfer: "450,000,000",
    standardPriceAtTransferForPhrp: "500,000,000",
    postRegistrationResidenceMonths: postRegMonths,
    wasRegisteredRentalOrChildcare: true,
  };
  return f;
}

const warns = (r: { result: { warnings?: unknown } }) => ((r.result.warnings ?? []) as string[]);

describe("#20 성립 B 중과 — 확인 필요 고지", () => {
  it("N-1 B 성립 + 주택 수 2 + 조정 → 중과 2주택(+20%p)이 붙고 고지가 실린다", async () => {
    const r = await runCalc(form("2", true, "B"));
    expect(r.result.rentalHousingExceptionDetail.scenarioId).toBe("RH-B2");
    expect(r.result.surchargeType).toBe("multi_house_2");
    expect(r.result.totalTax).toBe(338_676_602);
    expect(warns(r)).toContain(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
  });

  it("N-2a [짝] 비조정이면 중과가 안 붙어 고지 없음 — 값은 임대 제외 입력과 같다", async () => {
    const r = await runCalc(form("2", false, "B"));
    expect(r.result.totalTax).toBe(216_673_182);
    expect(warns(r)).not.toContain(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
  });

  it("N-2b [짝] 임대 제외 주택 수 1이면 중과가 없다 — 같은 사실이 입력 방식에 따라 갈리는 현행(사용자 결정 2026-10-14: 유지)", async () => {
    const r = await runCalc(form("1", true, "B"));
    expect(r.result.surchargeType).toBeUndefined();
    expect(r.result.totalTax).toBe(216_673_182);
    expect(warns(r)).not.toContain(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
  });

  it("N-3a [짝] 시나리오 A는 15호로 중과를 배제한다 — 고지 없음", async () => {
    const r = await runCalc(form("2", true, "A"));
    expect(r.result.rentalHousingExceptionDetail.scenarioId).toBe("RH-A2");
    expect(r.result.surchargeType).toBeUndefined();
    expect(warns(r)).not.toContain(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
  });

  it("N-3b [짝] B가 불성립(등록 후 거주 2년 미만)이면 특례 고지가 아니므로 이 고지가 없다", async () => {
    const r = await runCalc(form("2", true, "B", "0"));
    expect(r.result.rentalHousingExceptionDetail?.scenarioId).toBeUndefined();
    expect(warns(r)).not.toContain(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
  });
});

describe("N-4 고지 leaf 가드", () => {
  const input = (scenario: "A" | "B", postRegistrationResidenceMonths: number, transferDate = "2026-08-01") =>
    ({
      isOneHousehold: true,
      transferDate: new Date(transferDate),
      acquisitionDate: new Date("2009-08-12"),
      rentalHousingException: {
        applyException: true,
        scenario,
        rentalUnits: [],
        priorResidenceTransferDate: new Date("2016-08-25"),
        wasRegisteredRentalOrChildcare: true,
        postRegistrationResidenceMonths,
      },
    }) as unknown as TransferTaxInput;

  it("B + 요건 통과 + 다주택 중과 → 고지", () => {
    expect(prhpSurchargeUnverifiedNotice(input("B", 30), "multi_house_2")).toBe(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
    expect(prhpSurchargeUnverifiedNotice(input("B", 30), "multi_house_3plus")).toBe(PRHP_SURCHARGE_UNVERIFIED_NOTICE);
  });
  it("[짝] 중과가 없거나(undefined·none) 중과 유형이 아니면 고지 없음", () => {
    expect(prhpSurchargeUnverifiedNotice(input("B", 30), undefined)).toBeUndefined();
    expect(prhpSurchargeUnverifiedNotice(input("B", 30), "none")).toBeUndefined();
  });
  it("[짝] 시나리오 A는 고지 없음", () => {
    expect(prhpSurchargeUnverifiedNotice(input("A", 30), "multi_house_2")).toBeUndefined();
  });
  it("[짝] B가 요건 미통과(특례 신설 2011.10.14. 전 양도)면 고지 없음", () => {
    expect(prhpSurchargeUnverifiedNotice(input("B", 30, "2011-01-01"), "multi_house_2")).toBeUndefined();
  });
});
