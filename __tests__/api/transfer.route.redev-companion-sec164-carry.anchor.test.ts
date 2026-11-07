/**
 * 함께 양도하는 재개발 자산 — 상속·증여 §164 기준시가(②)를 주 자산처럼 운반한다.
 * 계획서 `docs/02-design/features/redev-companion-sec164-carry.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전 ④ `ownsAcquisitionSubobject`가 컴패니언 입주권·완공 아파트를 §163⑨ 운반에서 통째로 빼서 화면의 ② 칸이 버려졌다
 * (원조합원 입주권 2000 상속 ① 3억 · ② 7.2억 → 합산 266,250,000 = ① 단독). 소득세법 시행령 §163⑨ 단서 1호·2호 「많은 금액」은
 * 주 자산·함께 양도를 가리지 않는다. 기대값의 정본은 「컴패니언 ①을 ② 값으로 넣은 것」(같은 세액)이다. 세율 mock.
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

describe("CC-1 원조합원 종전 주택 — 컴패니언도 max(①,②)", () => {
  it.each([
    ["입주권", {}, 116_260_000, 266_250_000],
    ["완공 아파트", APT, 61_316_667, 205_070_000],
  ] as [string, A, number, number][])("%s 2000 상속 · ① 3억 + ② 7.2억 → ① 7.2억과 같은 세액 · ② 없으면 종전과 같다", async (_n, kind, withSec164, onlyReported) => {
    const r = await check(pair({ ...at("2000-06-01"), ...kind, ...IND }));
    expect(r.issue).toBe("");
    expect(r.comp.inheritedHouseValuation).toBeDefined();
    expect(r.comp.inheritedAcquisition?.reportedValue).toBe(300_000_000);
    expect(r.total).toBe(withSec164);
    const asReported = await check(pair({ ...at("2000-06-01"), ...kind, inheritanceAssetKind: "house_individual", publishedValueAtInheritance: "720000000" }));
    expect(asReported.total).toBe(withSec164);
    const none = await check(pair({ ...at("2000-06-01"), ...kind, inheritanceAssetKind: "house_individual" }));
    expect(none.comp.inheritedHouseValuation).toBeUndefined();
    expect(none.total).toBe(onlyReported);
  });
  it("②만 · ① 비움 → ⑧ 통과(종전 「함께 양도하는 자산은 §164 기준시가로 대신 계산하지 않습니다」) · 200 · 116,260,000", async () => {
    const r = await check(pair({ ...at("2000-06-01"), ...IND, publishedValueAtInheritance: "" }));
    expect(r.issue).toBe("");
    expect(r.status).toBe(200);
    expect(r.total).toBe(116_260_000);
  });
  it("① · ② 모두 비움 → ⑧ 「상속개시일 평가액」(규칙은 그대로)", async () => {
    const r = await check(pair({ ...at("2000-06-01"), inheritanceAssetKind: "house_individual", publishedValueAtInheritance: "" }));
    expect(r.issue).toContain("상속개시일 평가액(상속세 신고가액)을 입력하세요");
  });
});

describe("CC-2 원조합원 종전 토지(토지 출자) — 1990.8.30. 전 상속은 §164④와 비교", () => {
  it.each([
    ["입주권", {}, 211_650_000],
    ["완공 아파트", APT, 153_193_334],
  ] as [string, A, number][])("%s 1988 상속 · ① 3억 + ② 4.8억 → ① 4.8억과 같은 세액 · pre1990Land 운반", async (_n, kind, tax) => {
    const r = await check(pair({ ...at("1988-06-01"), ...LANDOM, ...kind, ...GRADE }));
    expect(r.issue).toBe("");
    expect(r.comp.pre1990Land).toBeDefined();
    expect(r.total).toBe(tax);
    const asReported = await check(pair({ ...at("1988-06-01"), ...LANDOM, ...kind, publishedValueAtInheritance: "480000000" }));
    expect(asReported.total).toBe(tax);
  });
  it("입주권 1988 ①만 → 264,570,000(종전과 같다) · ②만 → 200 · 211,650,000", async () => {
    expect((await check(pair({ ...at("1988-06-01"), ...LANDOM }))).total).toBe(264_570_000);
    const only = await check(pair({ ...at("1988-06-01"), ...LANDOM, ...GRADE, publishedValueAtInheritance: "" }));
    expect(only.issue).toBe("");
    expect(only.status).toBe(200);
    expect(only.total).toBe(211_650_000);
  });
  it("2010 상속(단서 1호 구간 밖) — 남은 등급 칸이 있어도 pre1990Land를 싣지 않는다 · 283,050,000", async () => {
    const r = await check(pair({ ...at("2010-06-01"), ...LANDOM, ...GRADE }));
    expect(r.comp.pre1990Land).toBeUndefined();
    expect(r.total).toBe(283_050_000);
  });
});

// ── 승계 완공 아파트 — #2876 anchor(`transfer.route.redev-successor-inherit-right-no-sec164`)와 같은 시료 ──
const SUCC: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "redevelopment_apt", actualSalePrice: "920,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
  redevIsSuccessorMember: "yes", redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0",
  standardPriceAtTransfer: "600,000,000", acquisitionCause: "inheritance", fixedAcquisitionPrice: "", publishedValueAtInheritance: "100,000,000",
  inheritanceValuationMethod: "supplementary", acquisitionDate: "2004-03-01", decedentAcquisitionDate: "2000-01-01", inheritanceAssetKind: "house_individual",
  inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "5,000,000", inhHouseValLandPricePerSqmAtFirst: "3,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtInheritance: "2,500,000",
};
const AFTER: A = { ...SUCC, redevApprovalDate: "2001-02-20", redevCompletionDate: "2003-12-01" };
const BEFORE: A = { ...SUCC, redevApprovalDate: "2003-02-20", redevCompletionDate: "2006-12-02" };
const NO_SEC164: A = { inhHouseValLandArea: "", inhHouseValLandPricePerSqmAtTransfer: "", inhHouseValLandPricePerSqmAtFirst: "", inhHouseValHousePriceAtFirst: "", inhHouseValLandPricePerSqmAtInheritance: "" };
const HOUSE: A = { addressJibun: "제주특별자치도 강남구 테스트동 2-2", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "200,000,000" };
const bundleS = (a: A) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1220000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE } as AssetForm, { ...makeDefaultAsset(2), ...a } as AssetForm],
  }))) as TransferFormData;

describe("CC-3 승계 완공 아파트 — 준공 뒤 받음만 운반 · 준공 전 받음은 ①만(#2876)", () => {
  it("준공 뒤 · ① 1억 + ② 2.5억 → 컴패니언 취득가액 250,000,000 · 합산 218,790,000(= ① 2.5억 · 종전 262,890,000)", async () => {
    const r = await check(bundleS(AFTER));
    expect(r.issue).toBe("");
    expect(r.comp.inheritedHouseValuation).toBeDefined();
    expect(r.compAcq).toBe(250_000_000);
    expect(r.total).toBe(218_790_000);
    expect((await check(bundleS({ ...AFTER, ...NO_SEC164, publishedValueAtInheritance: "250,000,000" }))).total).toBe(218_790_000);
  });
  it("준공 뒤 · ②만 → ⑧ 통과(종전 ① 칸 요구) · 218,790,000", async () => {
    const r = await check(bundleS({ ...AFTER, publishedValueAtInheritance: "" }));
    expect(r.issue).toBe("");
    expect(r.total).toBe(218_790_000);
  });
  it("준공 전 · ① 1억 + ② → 운반 안 함 · 262,890,000 · ②만이면 ⑧ ① 칸", async () => {
    const r = await check(bundleS(BEFORE));
    expect(r.comp.inheritedHouseValuation).toBeUndefined();
    expect(r.comp.inheritedAcquisition).toBeUndefined();
    expect(r.total).toBe(262_890_000);
    const only = await check(bundleS({ ...BEFORE, publishedValueAtInheritance: "" }));
    expect(only.issue).toContain("상속개시일 평가액(상속세 신고가액)을 입력하세요");
  });
});
