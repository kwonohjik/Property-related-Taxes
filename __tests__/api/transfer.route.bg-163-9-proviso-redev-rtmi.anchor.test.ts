/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후) — 재개발 완공 아파트 · 조합원입주권 **원조합원**(PR-3 B1).
 * 계획서 docs/00-pm/remaining-4-measurements.plan.md §B · 사용자 결정 Q-44 a · Q-45 a.
 *
 * 시료: 시가 13억 · 채무 6.5억(β 0.5) · 청산금 납부 1억 · ① 종전 부동산 실지취득가액 칸(평가액) 3억.
 * 일반 양도는 이미 max(①, ②)를 쓴다(`transfer.route.redev-companion-sec164-carry.anchor.test.ts`). 수정 전 부담부증여는 ①만 써 450,000,000.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function postBody(body: Loose): Promise<{ status: number; data: Loose; error?: Loose }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: Loose; error?: Loose };
  return { status: res.status, data: json.data ?? {}, error: json.error };
}

async function check(f: TransferFormData) {
  const issue = [0, 1, 2, 3].map((st) => validateStepDetailed(st, f)).find(Boolean) ?? null;
  let body: Loose = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const r = await postBody(body);
  const agg = r.data?.aggregated as Loose | undefined;
  return {
    issue: issue ? String((issue as { message?: string }).message ?? issue) : "",
    body,
    comp: (body.companionAssets?.[0] ?? {}) as Loose,
    status: r.status,
    fieldErrors: Object.keys(r.error?.fieldErrors ?? {}),
    total: (agg?.totalDeterminedTax ?? agg?.determinedTax) as number | undefined,
    compAcq: ((agg?.properties as Loose[] | undefined)?.[1]?.acquisitionPrice) as number | undefined,
  };
}

// ── 원조합원(종전 자산 상속) — `original-member-163-9` · `original-member-land-164-4` anchor와 같은 시료 ──
const mkO = (assets: A[]) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000", bundledSaleMode: "actual",
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }))) as TransferFormData;
const LAND: A = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "200,000,000", fixedSalePrice: "200,000,000" };
const OM = (over: A): A => ({
  addressJibun: "제주특별자치도 강남구 테스트동 7-1", assetKind: "right_to_move_in", redevSubject: "right", redevApprovalLawBasis: "urban_renovation_art_74", redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay", redevApprovalDate: "2015-03-01", redevRightsValue: "500000000", redevPreApprovalExpenses: "0", redevIsSuccessorMember: "no",
  isSuccessorRightToMoveIn: false, useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevSettlementAmount: "100000000",
  actualSalePrice: "1,100,000,000", fixedSalePrice: "1,100,000,000", transferType: "regular",
  acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01",
  ...over,
});
const at = (dt: string): A => ({ acquisitionDate: dt, inheritanceStartDate: dt });
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt" };
/** ② 주택 §164⑤ — 720,000,000 */
const IND: A = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
/** ② 토지 출자 §164④ — 3,000,000 × 200㎡ × 80,000 ÷ 100,000 = 480,000,000 */
const LANDOM: A = { redevOriginalAssetType: "land", redevLandArea: "200" };
const GRADE: A = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
const pair = (o: A) => mkO([LAND, OM(o)]);


const BG: A = { transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1300000000",
  bgMortgageDebtAmount: "650000000", bgMortgageSetAmount: "650000000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" };
const single = (o: A) => rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000",
    assets: [{ ...makeDefaultAsset(1), ...OM({ actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", ...o }) } as AssetForm],
  }))) as TransferFormData;
async function one(o: A) {
  const r = await check(single(o));
  const res = await postBody(r.body);
  return { issue: r.issue, status: r.status, fe: r.fieldErrors, ia: r.body.inheritedAcquisition ? { rv: (r.body.inheritedAcquisition as Loose).reportedValue, mode: (r.body.inheritedAcquisition as Loose).mode } : null,
    gain: (res.data?.result as Loose)?.transferGain, err: JSON.stringify(res.error ?? null).slice(0, 200) };
}
describe("BGOM — 부담부증여 K-4 × §163⑨ 단서 · 재개발 · 입주권 원조합원(Q-44 a · Q-45 a)", () => {
  it.each([
    ["입주권 · 토지 출자 1988 — max(3억, §164④ 4.8억) × 0.5", { ...at("1988-06-01"), ...LANDOM, ...GRADE }, 360_000_000],
    ["입주권 · 주택 출자 2000 — max(3억, §164⑦ 7.2억) × 0.5", { ...at("2000-06-01"), ...IND }, 240_000_000],
    ["완공 아파트 · 토지 출자 1988", { ...at("1988-06-01"), ...APT, ...LANDOM, ...GRADE }, 360_000_000],
    ["완공 아파트 · 주택 출자 2000", { ...at("2000-06-01"), ...APT, ...IND }, 240_000_000],
  ] as [string, A, number][])("%s → 양도차익 %d(수정 전 450,000,000)", async (_n, o, gain) => {
    const r = await one({ ...o, ...BG });
    expect([r.issue, r.status, r.ia?.rv, r.ia?.mode]).toEqual(["", 200, 300_000_000, "post-deemed"]);
    expect(r.gain).toBe(gain);
  });
  it.each([["입주권", {}], ["완공 아파트", APT]] as [string, A][])("%s ② 비움 — 평가액만(싣지 않는다 · 450,000,000)", async (_n, kind) => {
    const r = await one({ ...at("2000-06-01"), ...kind, ...BG });
    expect([r.issue, r.status, r.ia]).toEqual(["", 200, null]);
    expect(r.gain).toBe(450_000_000);
  });
  it("평가액이 크면 평가액(① 8억 > ② 7.2억 → 6.5억 − 4억 − 0.5억 = 200,000,000)", async () => {
    const r = await one({ ...at("2000-06-01"), ...IND, ...BG, bgActualAcquisitionTotal: "800000000" });
    expect(r.gain).toBe(200_000_000);
  });
  it("증여 — 같은 값(입주권 주택 출자)", async () => {
    const r = await one({ ...at("2000-06-01"), ...IND, ...BG, acquisitionCause: "gift", publishedValueAtInheritance: "", fixedAcquisitionPrice: "300000000",
      inheritanceStartDate: "", donorAcquisitionDate: "1990-01-01", giftDonorRelation: "other", giftSameHousehold: "no" });
    expect([r.issue, r.status]).toEqual(["", 200]);
    expect(r.gain).toBe(240_000_000);
  });
});
