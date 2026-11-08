/**
 * anchor — 겸용주택 × 조특법 §98 시리즈: 주택분 양도소득금액에서 5년간 발생분을 차감한다
 * (리뷰 `unsold-98-series-review-2026-11.md` US-13 · US-71 · Q-14 (a) 사용자 결정 2026-11-08).
 *
 * API 본문 → ⑫ Zod(`reductionSchema`) → ⑭ route(`mixed-use-asset-input`) → 겸용 엔진. 세율표는 mock(`makeMockRates`).
 * 시료: 리뷰 R1 — F17-B 본문(주거 60㎡ · 비주거 40㎡ · 양도 15억 · 취득 3억)을 2009-08-01 동시 취득 · 2022-02-16 양도로 바꿨다.
 *
 * | 시료 | 수정 전 총부담 | 수정 후 |
 * |---|---|---|
 * | 감면 미선택 | 220,716,936 | 220,716,936 |
 * | §98의3(비과밀 100% · 기준시가 2억→3억→4억) | 220,716,936 + 「명문 규정 없음」 고지 | **141,729,720** (차감 176,415,000) |
 *
 * 리뷰 R1의 근사 법령상 값은 141,135,720(차감 176,415,000 · 과세표준 385,613,000)이었다. 차감·과세표준은 같고, 세액 차이 540,000은
 * 리뷰 근사가 2023년 이후 누진공제(25,940,000)를 쓴 탓이다 — 2022-02-16 양도분은 2021~2022 표(40% 구간 25,400,000)다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

const U983 = {
  type: "unsold_98_3",
  residencyType983: "resident",
  houseType983: "purchased",
  contractDate983: "2009-06-15",
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: false,
  isUnsoldConfirmed983: true,
  isFirstContract983: true,
  isNotOccupiedAtContract983: true,
  isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000,
  standardPriceAt5Years983: 300_000_000,
  standardPriceAtTransfer983: 400_000_000,
};

const MIXED = {
  transferPrice: 1_500_000_000,
  transferDate: "2022-02-16",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-08-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2009-08-01",
    buildingAcquisitionDate: "2009-08-01",
    transferStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 150_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
    residencePeriodYears: 0,
    isOneHouseExempt: false,
    zoneType: "general_residential" as const,
  },
};

type Result = {
  housingPart: { incomeAmount: number };
  total: { totalPayable: number; ruralSurtax: number; incomeDeduction?: { appliedId: string; reducibleIncome: number }; reductionDetails?: Record<string, unknown> };
  warnings: string[];
  steps: { id: string; title: string }[];
};
async function post(over: object = {}): Promise<Result> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withIdentityStdInBody({ ...MIXED, ...over })),
    }),
  );
  const json = (await res.json()) as { data?: { result: Result }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("US-13 겸용 × §98의3 — 주택분 차감 (route)", () => {
  it("R1 §98의3 매입형: 주택분 소득 × (3억 − 2억) ÷ (4억 − 2억)을 주택분에서만 뺀다 · 농특세 비과세", async () => {
    const control = await post();
    const r = await post({ reductions: [U983] });
    expect(control.total.totalPayable).toBe(220_716_936);
    expect(r.total.incomeDeduction?.appliedId).toBe("unsold_98_3");
    expect(r.housingPart.incomeAmount).toBe(352_830_000);
    expect(r.total.incomeDeduction?.reducibleIncome).toBe(176_415_000); // 352,830,000 × 1억 ÷ 2억
    expect((r.total as { taxBase?: number }).taxBase).toBe(385_613_000);
    // 385,613,000 × 40% − 25,400,000(2021~2022 누진공제) = 128,845,200 · 지방소득세 12,884,520
    expect(r.total.totalPayable).toBe(141_729_720);
    expect(r.total.ruralSurtax).toBe(0);
    expect(r.total.reductionDetails?.unsold983Detail).toBeDefined();
    expect(r.steps.some((s) => s.title.includes("§98의3") && s.title.includes("(주택분)"))).toBe(true);
    expect(r.warnings.some((w) => /명문 규정이 없습니다/.test(w))).toBe(false);
  });
});
