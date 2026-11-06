/**
 * route anchor — 조특법 §99·§99의3 리뷰 NH-33(Q-14 (a)) · NH-75: 겸용주택 × §99·§99의3 양도소득금액 **주택분 차감**.
 * body → ⑫ Zod → ⑭ route(`buildMixedUseAssetInput`) → 겸용 엔진. 세율표는 mock(`makeMockRatesWithHouseEngine`)이라 정본 세액이 아니다.
 *
 * NH-75: 감면 패널의 §99·§99의3 입력(15개 이상 칸)은 ⑫·⑭를 지나 엔진 입력까지 오지만 겸용 엔진이 읽지 않았다 — 칸을 바꿔도 세액이 안 움직였다.
 * 아래 «입력 바꾸면 세액이 달라진다» 가 이 배선(⑫ strip 없음 · ⑭ 매핑 · 엔진 소비)을 고정한다.
 *
 * 시료(1주택 · 중과 없음): §99의3 수정 전 총부담 = 감면 미선택 대조 → 수정 후 차감분만큼 낮다.
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
  total: {
    totalPayable: number; transferTax: number; ruralSurtax: number;
    incomeDeduction?: { appliedId: string; reducibleIncome: number; taxBeforeDeduction: number; taxReduction: number; ruralSurtax: number };
    reductionDetails?: { new993Detail?: { isEligible: boolean } };
  };
  steps: { id: string; title: string }[];
  warnings: string[];
};
async function post(acq: string, over: Record<string, unknown>): Promise<Mixed> {
  const body = { ...BASE(acq), propertyType: "mixed-use-house", mixedUse: mixedUse(acq), houses: houses(acq, 1), householdHousingCount: 1, reductions: [], ...over };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withIdentityStdInBody(body)),
  }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { result: Mixed } }).data.result;
}
const ACQ993 = "2003-09-01";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

describe("NH-33 route — 겸용 × §99의3 주택분 차감", () => {
  it("차감 반영: 총부담이 감면 미선택 대조보다 낮고, 농특세 = 차감 감면세액 × 20%, 상세·step이 실린다", async () => {
    const control = await post(ACQ993, {});
    const selected = await post(ACQ993, { reductions: [r993] });
    expect(control.total.incomeDeduction).toBeUndefined();
    expect(selected.total.incomeDeduction?.appliedId).toBe("new_99_3");
    expect(selected.total.incomeDeduction!.reducibleIncome).toBeGreaterThan(0);
    expect(selected.total.transferTax).toBe(control.total.transferTax - selected.total.incomeDeduction!.taxReduction);
    expect(selected.total.ruralSurtax).toBe(Math.floor(selected.total.incomeDeduction!.taxReduction * 0.2));
    expect(selected.total.totalPayable).toBeLessThan(control.total.totalPayable);
    expect(selected.total.reductionDetails?.new993Detail?.isEligible).toBe(true);
    expect(selected.steps.some((s) => s.id === "income-deduction-new-housing")).toBe(true);
    expect(selected.warnings.some((w) => w.includes("반영되지 않았습니다"))).toBe(false);
  });

  it("짝 — 계약일이 §99의3 기간 밖이면 불성립: 총부담 = 대조 · 사유 step", async () => {
    const control = await post(ACQ993, {});
    const selected = await post(ACQ993, { reductions: [{ ...r993, contractDate993: "2005-03-01" }] });
    expect(selected.total.totalPayable).toBe(control.total.totalPayable);
    expect(selected.total.incomeDeduction).toBeUndefined();
    expect(selected.steps.find((s) => s.id === "income-deduction-new-housing")?.title).toContain("적용 불가");
  });

  it("짝 — 미등기양도는 감면 미적용(조특법 §129②): 미등기 대조와 같다", async () => {
    const base = await post(ACQ993, { isUnregistered: true });
    const selected = await post(ACQ993, { isUnregistered: true, reductions: [r993] });
    expect(selected.total.totalPayable).toBe(base.total.totalPayable);
  });
});

describe("NH-75 route — 감면 입력이 ⑫ strip·⑭ 매핑을 지나 엔진에서 쓰인다", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["standardPriceAtTransfer993", { standardPriceAtTransfer993: 300_000_000 }],
    ["standardPriceAt5Years", { standardPriceAt5Years: 300_000_000 }],
    ["standardPriceAtAcquisition993", { standardPriceAtAcquisition993: 50_000_000 }],
    ["firstContract993", { firstContract993: "no" }],
    ["hasOccupancyAtContract", { hasOccupancyAtContract: true }],
    ["contractDate993", { contractDate993: "2005-03-01" }],
  ];
  it.each(cases)("%s 를 바꾸면 총부담이 달라진다", async (_k, patch) => {
    const base = await post(ACQ993, { reductions: [r993] });
    const changed = await post(ACQ993, { reductions: [{ ...r993, ...patch }] });
    expect(changed.total.totalPayable).not.toBe(base.total.totalPayable);
  });
});
