/**
 * 이월과세(§97의2①) 주택의 다주택 중과 한시배제 보유기간 — 명부(정밀) 경로 = fallback.
 *
 * 계획서: `docs/00-pm/carryover-surcharge-suspension-holding.plan.md`.
 * 영 §167의10①12의2 본문 「법 제95조제4항에 따른 보유기간이 2년 … 이상인 주택」 → 소득세법 §95④ 단서: §97의2① 자산은
 * 증여자가 해당 자산을 취득한 날부터 기산한다. ④가 싣는 명부 양도 행 취득일은 증여 등기일이라, 종전 정밀 경로는 증여 2년 안 양도를
 * 한시배제에서 뺐다(실측 수정 전: 단순 842,435,000 · 채무 인수 623,110,000 — fallback은 374,610,000 · 349,270,000).
 * 사례: 서울 강남구(조정) · 2주택 · 양도 2026-03-01 15억 · 당초 증여 2025-06-01 평가 10억 · 증여자 취득 2000-06-01 1억 · 직계존속.
 * route 경유(⑧ → ④ → ⑫ → ⑭ → 엔진). 「명부」 = 같은 주택 수의 명부(`rosterForDeclaredCount`), 「fallback」 = 명부 없음(⑧은 막지만 API 직접 호출은 닿는다).
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never); });
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function form(co: Record<string, unknown>, roster: boolean, transferDate = "2026-03-01"): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate, contractTotalPrice: "1,500,000,000", isOneHousehold: false, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    isRegulatedArea: true, wasRegulatedAtAcquisition: true, isRegulatedAreaTouched: true, wasRegulatedAtAcquisitionTouched: true,
  });
  f.assets[0] = {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "",
    actualSalePrice: "1500000000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2025-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100,000,000",
      giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", ...co },
  } as AssetForm;
  return roster ? rosterForDeclaredCount(f) : f;
}
async function run(f: TransferFormData) {
  let body: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response; }));
  try { await callTransferTaxAPI(f); } catch { /* 본문만 필요 */ }
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const json = (await res.json()) as { data?: Body };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return { body, data: json.data!, agg: (json.data?.aggregated ?? json.data?.result) as Body };
}
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f).map((i) => i.message));
const DEBT = { giftDebtAssumed: true, giftAssumedDebt: "400,000,000" };

describe("명부 경로 — 이월과세 주택의 12의2 보유기간은 증여자 취득일부터(§95④ 단서)", () => {
  it("C-1: 🔴 증여 2025-06-01 · 양도 2026-03-01 — 한시배제(종전 0.65 · 842,435,000) = fallback 374,610,000", async () => {
    const f = form({}, true);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    // ④가 싣는 양도 행 취득일은 증여 등기일 그대로다(주택 수 선후 등 다른 축)
    expect(r.body.houses[0].acquisitionDate).toBe("2025-06-01");
    expect([r.data.mode, r.agg.appliedRate, r.agg.isSurchargeSuspended, r.agg.determinedTax]).toEqual(["single", 0.42, true, 374_610_000]);
    expect(r.agg.determinedTax).toBe((await run(form({}, false))).agg.determinedTax);
  }, 60_000);

  it("C-2: 🔴 채무 인수(매입분) — 증여분 한시배제(종전 0.62 · 합계 623,110,000) · 매입분은 증여 등기일 기산 그대로(단기 70%)", async () => {
    const f = form(DEBT, true);
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    const props = r.agg.properties as Body[];
    expect(props.map((p) => [p.propertyId, p.appliedRate, p.determinedTax])).toEqual([
      ["primary", 0.42, 211_020_000],
      ["primary__purchased", 0.7, 140_000_000],
    ]);
    expect(r.agg.determinedTax).toBe(349_270_000);
    expect((await run(form(DEBT, false))).agg.determinedTax).toBe(349_270_000);
  }, 60_000);

  it("C-3: 대조 — 한시배제 창 밖(양도 2026-07-01)은 두 경로 모두 중과(불변)", async () => {
    for (const roster of [true, false]) {
      const r = await run(form({}, roster, "2026-07-01"));
      expect([r.agg.appliedRate, r.agg.surchargeType, r.agg.determinedTax]).toEqual([0.65, "multi_house_2", 842_435_000]);
    }
  }, 60_000);

  it("C-4: 대조 — 증여자 보유도 2년 미만(증여자 취득 2025-01-01)이면 두 경로 모두 중과(fallback 종전 838,500,000)", async () => {
    for (const roster of [true, false]) {
      const r = await run(form({ donorAcquisitionDate: "2025-01-01" }, roster));
      expect([r.agg.appliedRate, r.agg.surchargeType, r.agg.determinedTax]).toEqual([0.65, "multi_house_2", 842_435_000]);
    }
  }, 60_000);

  it("C-5: 회귀 — 증여 등기일부터 세어도 2년 이상(2024-03-01 · 2023-06-01)이면 종전과 같다", async () => {
    for (const gift of ["2024-03-01", "2023-06-01"]) {
      const r = await run(form({ giftRegistryDate: gift }, true));
      expect([r.agg.appliedRate, r.agg.isSurchargeSuspended, r.agg.determinedTax]).toEqual([0.42, true, 374_610_000]);
    }
  }, 60_000);
});
