/**
 * 큰 동순위 묶음이 route에서 끝까지 계산되는지 — 토지 지분 11건·겸용 지분 3건은 순열 생성으로 프로세스가 죽었다.
 * 10건 이하 값은 수정 전 원본에서 뽑은 값이다.
 */
import { describe, expect, it, vi } from "vitest";
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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LAND = { assetKind: "land", addressJibun: "서울 A 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase", acquisitionDate: "2015-03-03", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000" };
const MIXED = { assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "500000000", capitalExpenditure: "100000000", transferExpense: "20000000", residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50", mixedUseTotalLandArea: "300", mixedTransferHousingPrice: "1600000000", mixedTransferCommercialBuildingPrice: "200000000", mixedTransferLandPricePerSqm: "1000000", mixedAcqHousingPrice: "400000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "300000", addressJibun: "서울 A 1", gbZoneType: "general_residential", zoneType: "general_residential" };

const PINS = { PIN_L7: 616_221_969, PIN_L10: 616_258_500, PIN_M2: 147_073_726 };

function form(kind: "land" | "mixed", n: number) {
  let f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "2000000000", assetSplitMode: "fractional", bundledSaleMode: "actual", householdHousingCount: "1", isOneHousehold: true, residencePeriodMonths: "120" });
  const num = String(Math.round(10000 / n) / 100);
  f.assets = Array.from({ length: n }, (_, i) => ({ ...makeDefaultAsset(i + 1), ...(kind === "mixed" ? MIXED : LAND), assetId: `A${i + 1}`, ownershipNumerator: num, ownershipDenominator: "100", ownershipRemainderThirdParty: "" }));
  if (kind === "mixed") f = withIdentityHousingBuildingStdOnForm(f as never) as L;
  return f;
}

async function totals(kind: "land" | "mixed", n: number) {
  const body = (await captureBody(form(kind, n) as never)) as L;
  const r = await postTransfer(body);
  expect(r.status).toBe(200);
  const a = (r.json?.data as L).aggregated as L;
  return { totalTax: a.totalTax, sale: (a.properties as L[]).reduce((s, p) => s + p.transferPrice, 0), count: a.properties.length };
}

describe("큰 동순위 묶음 route", () => {
  it("토지 지분 11건 — ⑧ 통과, 200, 양도가액 합 = 총액", async () => {
    expect(allIssues(form("land", 11) as never)).toEqual([]);
    const t = await totals("land", 11);
    expect(t.count).toBe(11);
    expect(t.sale).toBe(2_000_000_000);
    expect(t.totalTax).toBeGreaterThan(0);
  }, 60_000);

  it("겸용 지분 3건 — 200으로 끝난다", async () => {
    const t = await totals("mixed", 3);
    expect(t.totalTax).toBeGreaterThan(0);
  }, 60_000);

  it.each([
    ["land", 7, "PIN_L7"],
    ["land", 10, "PIN_L10"],
    ["mixed", 2, "PIN_M2"],
  ] as const)("%s %i건 — 세액은 수정 전과 같다", async (kind, n, pin) => {
    const t = await totals(kind, n);
    expect(t.totalTax).toBe(PINS[pin]);
  }, 60_000);
});
