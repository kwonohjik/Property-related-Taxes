/**
 * route anchor — 조특법 §99·§99의3 리뷰 PR-6: NH-09 (겸용주택 × 감면주택 다주택 중과 배제 자동 주입).
 * body → ⑫ Zod → ⑭ route(`buildMixedUseAssetInput`) → 겸용 엔진. 세율표는 mock(`makeMockRatesWithHouseEngine`)이라 정본 세액이 아니다.
 *
 * 기대값 = «같은 사실에서 양도 주택 행에 5호 수동 토글(`houses[].isTaxSpecialExemption`)을 켠 대조»(리뷰 probe f70v M2 · N2와 같은 사실).
 * ⚠️ NH-33(Q-14 (a))으로 겸용 경로가 §99·§99의3 양도소득금액을 주택분에서 차감한다 — §99의3 3주택 값은 211,470,601에서
 *    171,343,201로 갱신했다(중과 배제 + 차감). 수동 토글 대조·감면 미선택 대조 구조는 그대로다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const house = (id: string, acq: string, over: Record<string, unknown> = {}) => ({
  id, region: "capital" as const, acquisitionDate: acq, officialPrice: 800_000_000, isInherited: false, isLongTermRental: false, ...over,
});
const houses = (acq: string, n: number, sellingOver: Record<string, unknown> = {}) => [
  house("selling", acq, sellingOver),
  ...Array.from({ length: n - 1 }, (_, i) => house(`h${i + 2}`, "2015-03-01")),
];
const r993 = {
  type: "new_99_3", contractDate993: "2002-03-01", acquisitionType993: "from_builder", firstContract993: "yes" as const, region993: "outside_speculation",
  standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000, standardPriceAtTransfer993: 400_000_000,
  exclusiveAreaSqm993: 84, isResident993: true, isHousingConstructionBusiness993: false, hasOccupancyAtContract: false,
  isRecontractExcluded993: false, recontractUnavoidableCause993: false, isRedevelopedNewHouse993: false,
};
const r99 = {
  type: "new_99", contractDate99: "1998-06-01", acquisitionType99: "from_builder", firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: 400_000_000,
  exclusiveAreaSqm99: 84, isResident99: true, isHousingConstructionBusiness99: false, hasOccupancyAtContract99: false,
  isRecontractExcluded99: false, recontractUnavoidableCause99: false, isRedevelopedNewHouse99: false,
};
const BASE = (acq: string) => ({
  transferPrice: 1_100_000_000, acquisitionPrice: 300_000_000, acquisitionDate: acq, transferDate: "2026-06-01",
  expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 3, isRegulatedArea: true,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true,
  annualBasicDeductionUsed: 0, residencePeriodMonths: 0, sellingHouseId: "selling",
});
const mixedUse = (acq: string, over: Record<string, unknown> = {}) => ({
  isMixedUseHouse: true as const, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
  landAcquisitionDate: acq, buildingAcquisitionDate: acq,
  transferStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
  acquisitionStandardPrice: { housingPrice: 100_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 500_000 },
  residencePeriodYears: 0, zoneType: "general_residential" as const, isOneHouseExempt: false, ...over,
});

type Mixed = {
  total: { totalPayable: number };
  warnings: string[];
  steps: { id: string }[];
  multiHouseSurcharge?: { surchargeType: string; exclusionReasons: { type: string }[] };
};
async function post(acq: string, over: Record<string, unknown>, mu: Record<string, unknown> = {}): Promise<Mixed> {
  const body = { ...BASE(acq), propertyType: "mixed-use-house", mixedUse: mixedUse(acq, mu), houses: houses(acq, 3), reductions: [], ...over };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withIdentityStdInBody(body)),
  }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { result: Mixed } }).data.result;
}
const ACQ993 = "2003-09-01";
const ACQ99 = "1999-01-01";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

describe("NH-09 route — 겸용 × §99의3·§99 × 조정 다주택", () => {
  it("§99의3 3주택: 현재 399,379,198 → 수동 토글 대조 171,343,201(중과 배제 + 주택분 차감)", async () => {
    const control = await post(ACQ993, {});
    const selected = await post(ACQ993, { reductions: [r993] });
    const manual = await post(ACQ993, { reductions: [r993], houses: houses(ACQ993, 3, { isTaxSpecialExemption: true }) });
    expect(control.total.totalPayable).toBe(399_379_198);
    expect(manual.total.totalPayable).toBe(171_343_201);
    expect(selected.total.totalPayable).toBe(manual.total.totalPayable);
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(selected.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(true);
    expect(selected.warnings.some((w) => w.includes("다주택 중과 배제를 반영"))).toBe(true);
  });

  it("§99의3 2주택(소령 §167의10①2호)도 수동 토글 대조와 같다", async () => {
    const two = (over: Record<string, unknown> = {}) => ({ householdHousingCount: 2, houses: houses(ACQ993, 2, over), reductions: [r993] });
    const selected = await post(ACQ993, two());
    const manual = await post(ACQ993, two({ isTaxSpecialExemption: true }));
    const control = await post(ACQ993, { householdHousingCount: 2, houses: houses(ACQ993, 2) });
    expect(selected.total.totalPayable).toBe(manual.total.totalPayable);
    expect(selected.total.totalPayable).toBeLessThan(control.total.totalPayable);
  });

  it("§99 3주택 30억(F-46 사례, 1998 계약 84㎡): 수동 토글 대조와 같다", async () => {
    const big = { transferPrice: 3_000_000_000, reductions: [r99] };
    const selected = await post(ACQ99, big);
    const manual = await post(ACQ99, { ...big, houses: houses(ACQ99, 3, { isTaxSpecialExemption: true }) });
    const control = await post(ACQ99, { transferPrice: 3_000_000_000 });
    expect(selected.total.totalPayable).toBe(manual.total.totalPayable);
    expect(selected.total.totalPayable).toBeLessThan(control.total.totalPayable);
  });

  it("짝 — 고가(§99 170㎡·6억 초과)이면 감면 불성립 → 중과 유지 = 감면 미선택 대조", async () => {
    const selected = await post(ACQ99, { transferPrice: 3_000_000_000, reductions: [{ ...r99, exclusiveAreaSqm99: 170 }] });
    const control = await post(ACQ99, { transferPrice: 3_000_000_000 });
    expect(selected.total.totalPayable).toBe(control.total.totalPayable);
    expect(selected.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(false);
  });

  it("짝 — 비조정·1주택은 중과 판정 불변(차이는 주택분 차감뿐)", async () => {
    const nonReg = await post(ACQ993, { isRegulatedArea: false, reductions: [r993] });
    const nonRegCtl = await post(ACQ993, { isRegulatedArea: false });
    // 중과 판정은 같고(비조정), 차이는 주택분 차감(NH-33)뿐이다
    expect(nonReg.multiHouseSurcharge?.surchargeType).toBe(nonRegCtl.multiHouseSurcharge?.surchargeType);
    expect(nonReg.total.totalPayable).toBeLessThan(nonRegCtl.total.totalPayable);
    const one = { householdHousingCount: 1, houses: houses(ACQ993, 1) };
    const oneSel = await post(ACQ993, { ...one, reductions: [r993] });
    const oneCtl = await post(ACQ993, one);
    expect(oneSel.multiHouseSurcharge?.surchargeType).toBe(oneCtl.multiHouseSurcharge?.surchargeType);
    expect(oneSel.total.totalPayable).toBeLessThan(oneCtl.total.totalPayable);
  });
});
