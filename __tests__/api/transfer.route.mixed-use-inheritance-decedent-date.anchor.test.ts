/**
 * 상속받은 겸용주택 — 피상속인 취득일이 겸용 엔진에 닿지 않던 결함.
 *
 * 화면(`CompanionAcqInheritanceBlock`)은 피상속인 취득일을 받고 ④는 최상위 본문에 싣지만, 겸용 엔진 입력
 * (`buildMixedUseAssetInput`)이 그 값을 옮기지 않아 두 축이 상속개시일로 판정됐다.
 *  - 「소득세법」 §104②1호 — 상속받은 자산의 단기보유 세율 보유기간은 피상속인 취득일부터.
 *    종전: 피상속인 2000 취득 · 상속 2023-09 · 양도 2024-06 → 주택 단기 70%(317,678,570).
 *  - 「조세특례제한법」 §77⑨ — 상속받은 토지등의 「소급 2년 이전 취득」은 피상속인 취득일로.
 * 장기보유특별공제 보유기간은 상속개시일 기산 그대로다(「소득세법」 §95④).
 * route 경유(⑧ → ④ → ⑫ → ⑭ → 겸용 엔진).
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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
type Form = ReturnType<typeof createDefaultTransferFormData>;
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
const issues = (f: Form) => [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
async function run(f: Form, extra: Record<string, unknown> = {}) {
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ data: {} }), { status: 200 }); }));
  try { await callTransferTaxAPI(f).catch(() => undefined); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), ...extra }) }));
  return { status: res.status, json: await res.json(), body: body as Record<string, unknown> };
}
const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, acquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: true,
  addressRoad: "서울 강남구 테헤란로 1", residentialFloorArea: "60", nonResidentialFloorArea: "40", buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600", mixedZoneType: "general_residential", mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000", mixedTransferLandPricePerSqm: "2000000", mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000", mixedAcqLandPricePerSqm: "1000000",
};
function mixedForm(over: Record<string, unknown> = {}): Form {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], residenceInputMode: "direct", residencePeriods: [], ...MIXED, ...over } as Form["assets"][number];
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1,200,000,000", householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0" });
  return withIdentityHousingBuildingStdOnForm(f, { acqN: 90_000_000 });
}
const INH = { acquisitionCause: "inheritance", acquisitionDate: "2023-09-01", useEstimatedAcquisition: false,
  mixedHousingInheritedValueOverride: "400000000", mixedCommercialInheritedValueOverride: "200000000" };
const PE = { reductions: [{ type: "public_expropriation", cashCompensation: 1_200_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2024-03-01" }] };
const total = (r: Awaited<ReturnType<typeof run>>) => r.json.data.result.total;
async function calc(over: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const f = mixedForm(over);
  expect(issues(f)).toEqual([]);
  const r = await run(f, extra);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return total(r);
}

describe("상속 겸용주택 — 피상속인 취득일 (상속 2023-09-01 · 양도 2024-06-01)", () => {
  it("대조: 매매 2023-09-01 → 주택 단기 70% (종전과 같음)", async () => {
    const t = await calc({ acquisitionDate: "2023-09-01" });
    expect(t.appliedRate).toBe(0.7);
    expect(t.determinedTax).toBe(393_644_285);
  }, 60_000);

  it("§104②1호 — 피상속인 2000 취득 → 단기세율 아님, 누진(종전 70% · 317,678,570)", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01" });
    expect(t.rateBasis).toBe("progressive");
    expect(t.determinedTax).toBe(215_010_000);
  }, 60_000);

  // 계획서 docs/00-pm/non-heir-bequest-followups.plan.md §1 B — 수유자는 「상속받은 자산」이 아니다(서면4팀-3304).
  it("수유자 — 피상속인 2000 취득이어도 통산하지 않는다 → 주택 단기 70%", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01", nonHeirBequest: true });
    expect([t.appliedRate, t.determinedTax]).toEqual([0.7, 317_678_571]); // 피상속인 취득일이 닿지 않던 종전 값(317,678,570)과 같고, 상가 40% 파트 합산 1회 절사로 +1(계획서 p3 §9.1)
  }, 60_000);

  it("긍정 짝 — 피상속인 2023-06-01 취득(1년 이상 2년 미만) → 60%", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2023-06-01" });
    expect(t.appliedRate).toBe(0.6);
    expect(t.determinedTax).toBe(257_928_570);
  }, 60_000);

  it("토지를 다른 날(2023-10-01) 취득 → 그 토지엔 피상속인 취득일을 쓰지 않는다(주택분 = 늦은 취득 기준, 70%)", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01", landAcquisitionDate: "2023-10-01",
      hasSeperateLandAcquisitionDate: true, mixedAcqLandPricePerSqmAtBuildingAcq: "1000000" });
    expect(t.appliedRate).toBe(0.7);
    expect(t.determinedTax).toBe(279_083_108);
  }, 60_000);

  it("§77⑨ — 사업인정고시 2024-03-01 · 피상속인 2000 취득 → 감면 성립(종전 불성립)", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01" }, PE);
    expect(t.reductionDetails.publicExpropriationDetail.isEligible).toBe(true);
    expect(t.reductionAmount).toBe(21_501_000);
    expect(t.determinedTax).toBe(193_509_000);
  }, 60_000);

  // 계획서 docs/00-pm/sp69-77-non-heir-bequest.plan.md Q-1 (b) — 수유자는 §77⑨ 소급도 하지 않는다(겸용은 엔진이 취득일을 직접 만든다).
  it("§77⑨ × 수유자 — 피상속인 2000 취득이어도 상속개시일(2023-09-01)로 판정 → 불성립 + 확인 필요 고지", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2000-01-01", nonHeirBequest: true }, PE);
    expect(t.reductionDetails.publicExpropriationDetail.isEligible).toBe(false);
    expect(t.reductionDetails.publicExpropriationDetail.notEligibleReason).toContain("상속인이 아닌 수유자");
    expect(t.reductionAmount).toBe(0);
  }, 60_000);

  it("§77 긍정 짝 — 피상속인도 소급 2년 안(2023-06-01) 취득 → 불성립", async () => {
    const t = await calc({ ...INH, decedentAcquisitionDate: "2023-06-01" }, PE);
    expect(t.reductionDetails.publicExpropriationDetail.isEligible).toBe(false);
    expect(t.reductionAmount).toBe(0);
  }, 60_000);
});
