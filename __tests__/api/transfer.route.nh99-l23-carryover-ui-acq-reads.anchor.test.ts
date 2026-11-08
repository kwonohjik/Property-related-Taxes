/**
 * route anchor — 이월과세 화면·⑧의 취득일 읽기 수정(L23)은 **세액을 바꾸지 않는다**.
 *
 * 화면·⑧만 칸 없는 `acquisitionDate` 잔재를 읽었고, ④ 와이어·엔진은 L21부터 증여 등기접수일만 읽는다. 그래서 같은 등기접수일(G)에서
 * 잔재(S)가 무엇이든(빔·이른 날·늦은 날·G와 같음) 와이어 `acquisitionDate`와 총세액이 같다 — 이 파일이 그것을 고정한다.
 * 모든 셀에서 ⑧ 이슈도 같이 본다(⑧ 통과 ⇔ 계산 200).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { runCalc, houseRow } from "../calc/_helpers/redev-one-house-route";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultRentalUnit, RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never);
});

const STALES = ["", "2005-01-01", "2030-01-01", "G"] as const; // "G" = 등기접수일과 같은 잔재

function form(S: string, G: string, extra: Partial<AssetForm> = {}, over: Record<string, unknown> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2023-03-01", contractTotalPrice: "1,500,000,000", isOneHousehold: true, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isRegulatedArea: true, wasRegulatedAtAcquisition: true, isRegulatedAreaTouched: true, wasRegulatedAtAcquisitionTouched: true, ...over });
  f.assets[0] = {
    ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: S === "G" ? G : S, actualSalePrice: "1500000000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: G, donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
    ...extra,
  } as AssetForm;
  f.houses = [houseRow("h1", "2015-01-01")];
  return withTestAddress(rosterForDeclaredCount(f));
}

describe("세액 불변 — N5 다주택 중과(한시배제 창 안 · 양도 2023-03-01)", () => {
  for (const G of ["2018-05-05", "2022-03-01"]) {
    it(`등기접수일 ${G}: 잔재 4종(빔·2005·2030·G) → 와이어 취득일 = G · 총세액 동일`, async () => {
      const ref = await runCalc(form("", G));
      expect(ref.status).toBe(200);
      expect(ref.result.totalTax).toBeGreaterThan(0);
      for (const S of STALES) {
        const r = await runCalc(form(S, G));
        expect((r.body as { acquisitionDate?: string }).acquisitionDate, `S=${S}`).toBe(G);
        expect(r.status, `S=${S}`).toBe(200);
        expect(r.result.totalTax, `S=${S}`).toBe(ref.result.totalTax);
        expect(r.issues.filter((i) => i.field === "acquisitionDate"), `S=${S}`).toEqual([]);
      }
    }, 60_000);
  }
});

describe("세액 불변 — N4 장기임대 거주주택 특례 선언(양도 2024-06-01)", () => {
  const rh = () =>
    ({
      ...RENTAL_HOUSING_EXCEPTION_DEFAULTS, applyException: true, scenario: "A",
      rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2016-06-01", rentalRegistrationDate: "2016-06-01", standardPriceAtRentalStart: "300,000,000", rentalInputMode: "direct", rentalMonths: "96", requirementsConfirmed: true }],
    }) as AssetForm["rentalHousingException"];
  const rform = (S: string, G: string) =>
    form(S, G, { rentalHousingException: rh(), residenceInputMode: "direct", residencePeriodMonthsAsset: "30" }, { transferDate: "2024-06-01", householdHousingCount: "1", isOneHousehold: true });
  for (const G of ["2020-01-01", "2023-01-01"]) {
    it(`등기접수일 ${G}: 잔재 빔·2005·2030·G → 와이어 취득일 = G · 총세액 동일 · ⑧ 취득일 막다른 길 없음`, async () => {
      const ref = await runCalc(rform("", G));
      expect(ref.status).toBe(200);
      expect(ref.result.totalTax).toBeGreaterThan(0);
      for (const S of STALES) {
        const r = await runCalc(rform(S, G));
        expect((r.body as { acquisitionDate?: string }).acquisitionDate, `S=${S}`).toBe(G);
        expect(r.result?.totalTax, `S=${S}`).toBe(ref.result?.totalTax);
        expect(r.issues.some((i) => i.field === "acquisitionDate" || /거주주택 (취득일|증여 등기접수일)을 입력/.test(i.message)), `S=${S}`).toBe(false);
      }
    }, 60_000);
  }
});

describe("세액 불변 — ③ 감면 패널 선택(§99의2 existing_one_house 5년 경과 셀)", () => {
  const std = { standardPriceAtAcquisition992: "200,000,000", standardPriceAt5Years992: "300,000,000", standardPriceAtTransfer992: "400,000,000" };
  const red = { type: "unsold_99_2", houseType992: "existing_one_house", contractDate992: "2013-06-01", usageApprovalDate992: "", acquisitionPrice992: "550,000,000", exclusiveAreaSqm992: "84", ...std };
  it("잔재 빔·2005·2030·G 모두 같은 와이어·같은 총세액 (⑧ 기준시가 요구는 등기접수일 기준이라 G=2010에서 입력 필요, 입력 시 통과)", async () => {
    const mk = (S: string) => form(S, "2010-01-01", { reductions: [red as never] }, { transferDate: "2024-06-01", householdHousingCount: "1" });
    const ref = await runCalc(mk(""));
    expect(ref.status).toBe(200);
    expect(ref.result.totalTax).toBeGreaterThan(0);
    for (const S of STALES) {
      const r = await runCalc(mk(S));
      expect((r.body as { acquisitionDate?: string }).acquisitionDate, `S=${S}`).toBe("2010-01-01");
      expect(r.result?.totalTax, `S=${S}`).toBe(ref.result?.totalTax);
      expect(r.issues.filter((i) => /5년 경과 양도는/.test(i.message)), `S=${S}`).toEqual([]);
    }
  }, 60_000);
});
