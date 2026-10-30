/**
 * ⑫ 거주 상한 — API 겸용주택(`mixed-use-house`)도 UI ⑧과 같은 규칙으로 막는다
 * (계획서 `docs/02-design/features/mixed-use-residence-cap-api.plan.md` Q-1 a — O-14의 «남은 갭»).
 *
 * 종전: `residenceMonthsOverflowIssue`가 `propertyType: "housing"`만 보아 겸용은 `mixedUse.residencePeriodYears`가 보유기간을 넘어도 400 없이 장특 거주분을 받았다
 * (실측: 보유 3년 · 거주 10년 → 거주분 12% → 40% · 총세액 186,112,055 → 150,314,609, −35,797,446). 최상위 `residencePeriodMonths`는 겸용 경로가 읽지 않는다.
 * 겸용의 거주는 연수(`floor(개월 / 12)`)로 오므로 **연수 × 12**(실제 개월의 하한)가 보유 개월을 넘을 때만 막는다 → ⑧ 통과 ⇒ ⑫ 통과(막다른 길 없음).
 * 법 근거: 「소득세법」 §95② 표2 «보유기간 중 거주기간» · 시행령 §154① 괄호 «그 보유기간 중 거주기간» — 주택과 같은 leaf(`directResidenceMonthsOverflowError`).
 *
 * 기준: 취득 2018-06-01 · 양도 2026-06-01 = 보유 96개월(8년).
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { residenceMonthsOverflowIssue } from "@/lib/api/transfer-tax-schema-household-refines";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 건물·토지 2018-06-01 취득 · 2026-06-01 10억 양도 · 1세대 1주택 */
const MIXED = {
  transferPrice: 1_000_000_000,
  transferDate: "2026-06-01",
  acquisitionPrice: 400_000_000,
  acquisitionDate: "2018-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2018-06-01",
    buildingAcquisitionDate: "2018-06-01",
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 5,
    zoneType: "general_residential" as const,
    isOneHouseExempt: true,
  },
};

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const withYears = (years: number, over: Loose = {}) => ({ ...MIXED, ...over, mixedUse: { ...MIXED.mixedUse, residencePeriodYears: years, ...(over.mixedUse ?? {}) } });
async function post(body: Loose) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withIdentityStdInBody(body)) }),
  );
  return { status: res.status, json: (await res.json()) as Loose };
}

describe("⑫ 겸용주택 거주 상한 — 라우트", () => {
  it("🔑 C1 거주 8년(= 보유 96개월, 경계 포함): 통과", async () => {
    const r = await post(withYears(8));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("🔑 C2 거주 9년(108개월 > 96): 400 — 필드 `mixedUse.residencePeriodYears` · 취득일 · 상한 96개월을 알린다", async () => {
    const r = await post(withYears(9));
    expect(r.status).toBe(400);
    const msg = JSON.stringify(r.json.error);
    expect(msg).toContain("residencePeriodYears");
    expect(msg).toContain("108개월");
    expect(msg).toContain("96개월");
    expect(msg).toContain("2018-06-01");
  });

  it("🔑 C3 거주 20년: 400 (종전 200 · 거주분 40%)", async () => {
    expect((await post(withYears(20))).status).toBe(400);
  });

  it("C4 1세대1주택이 아니면(isOneHousehold false) 거주는 쓰이지 않으므로 상한도 걸지 않는다 — ⑧과 같은 조건", async () => {
    const r = await post(withYears(20, { isOneHousehold: false }));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

describe("⑫ 겸용주택 거주 상한 — 단위(`residenceMonthsOverflowIssue`)", () => {
  const base = {
    propertyType: "mixed-use-house", isOneHousehold: true, acquisitionDate: "2018-06-01", transferDate: "2026-06-01",
    mixedUse: { residencePeriodYears: 8, landAcquisitionDate: "2018-06-01", buildingAcquisitionDate: "2018-06-01" },
  };
  const withYearsU = (years: number, over: Loose = {}) => ({ ...base, ...over, mixedUse: { ...base.mixedUse, residencePeriodYears: years, ...(over.mixedUse ?? {}) } });

  it("U1 경계: 8년 통과 · 9년 차단(문구에 108개월·96개월)", () => {
    expect(residenceMonthsOverflowIssue(base)).toBeNull();
    const msg = residenceMonthsOverflowIssue(withYearsU(9));
    expect(msg).toContain("108개월");
    expect(msg).toContain("96개월");
  });

  it("U2 연수 하한: 거주 연수 × 12가 상한 이하면 통과 — 보유 8년 11개월(107개월)에 거주 8년(96개월)·연수 8은 실제 8년 11개월까지 허용(⑧ 통과 ⇒ ⑫ 통과)", () => {
    expect(residenceMonthsOverflowIssue(withYearsU(8, { transferDate: "2027-05-15" }))).toBeNull();
  });

  it("U3 통산 후보가 더 이른 날이면 그 날짜가 기준 — 겸용 토지 취득일 2010-06-01이면 거주 15년 통과 · 17년 차단", () => {
    const early = { mixedUse: { landAcquisitionDate: "2010-06-01" } };
    expect(residenceMonthsOverflowIssue(withYearsU(15, early))).toBeNull();
    expect(residenceMonthsOverflowIssue(withYearsU(17, early))).toContain("보유 기산 후보 중 가장 이른 날(2010-06-01");
  });

  it("U4 증여자 취득일(통산)도 후보 — 2012-06-01이면 거주 14년 통과", () => {
    expect(residenceMonthsOverflowIssue(withYearsU(14, { donorAcquisitionDate: "2012-06-01" }))).toBeNull();
    expect(residenceMonthsOverflowIssue(withYearsU(15, { donorAcquisitionDate: "2012-06-01" }))).not.toBeNull();
  });

  it("U5 판정 안 하는 경우: 거주 연수 없음 · 1세대1주택 아님 · 재개발 · 취득일 없음", () => {
    expect(residenceMonthsOverflowIssue({ ...base, mixedUse: { ...base.mixedUse, residencePeriodYears: undefined } })).toBeNull();
    expect(residenceMonthsOverflowIssue(withYearsU(20, { isOneHousehold: false }))).toBeNull();
    expect(residenceMonthsOverflowIssue(withYearsU(20, { redevelopment: { subject: "apt" } }))).toBeNull();
    expect(residenceMonthsOverflowIssue(withYearsU(20, { acquisitionDate: undefined }))).toBeNull();
  });

  it("U6 겸용이 아닌 다른 유형은 건드리지 않는다 — 토지 · 일반건물", () => {
    expect(residenceMonthsOverflowIssue(withYearsU(20, { propertyType: "land" }))).toBeNull();
    expect(residenceMonthsOverflowIssue(withYearsU(20, { propertyType: "building" }))).toBeNull();
  });
});
