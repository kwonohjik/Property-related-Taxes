/**
 * 다건 계산 — 상속·증여 §164 기준시가(②) 입력이 있으면 단건 계산기로 보낸다.
 * 계획서 `docs/02-design/features/multi-sec163-9-clause-b-drop.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * 다건 ④(`buildPropertyPayload`)는 상속·증여 취득가액으로 ①(신고가액)만 싣고 §163⑨ 단서 ② 운반이 없다. 종전 다건 ⑧ 가드는 ①이 있으면
 * 통과시켜 화면에서 채운 ②가 조용히 빠졌다(상속 주택 ① 3억 + ② 7.2억 → 282,711,000 = ① 단독 ↔ ① 7.2억 149,006,000).
 * 판정은 단건 ④·⑧과 같은 단일 소스(`sec164-required-fields.ts`)의 `triggered`(② 전용 칸 — 공유 면적 칸 제외)다. 세율 mock.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 상속 주택 · 2000-06-01 · ① 3억 · 양도 2026-02-16 13억 */
const mk = (a: A) => Object.assign(createDefaultTransferFormData(), {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000",
  assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "housing", actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000",
    acquisitionCause: "inheritance", acquisitionDate: "2000-06-01", inheritanceStartDate: "2000-06-01", publishedValueAtInheritance: "300000000",
    inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01", standardPriceAtTransfer: "900000000", ...a } as AssetForm],
}) as TransferFormData;
/** ② 주택 §164⑤ — 720,000,000 */
const IND: A = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
const GIFT: A = { acquisitionCause: "gift", publishedValueAtInheritance: "", inheritanceStartDate: "", fixedAcquisitionPrice: "300000000", donorAcquisitionDate: "1980-01-01", decedentAcquisitionDate: "" };
const LANDA: A = { assetKind: "land", landNature: "standalone", acquisitionArea: "200", acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", inheritanceAssetKind: "land" };
/** ② 토지 §164④ — 480,000,000 */
const GRADE: A = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
/** D2 — 건물 상속 + 토지 매매(`transfer.route.split-building-sec164.d2-4a` 시료). 건물 몫 ②는 다건도 파트 페이로드로 싣는다. */
const D2: A = {
  assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01",
  decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
  hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
  buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
  buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
  inheritanceAssetKind: "house_individual", acquisitionArea: "200", inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
};

const guard = (a: A) => validateMultiSupportedMode(mk(a));

async function single(f: TransferFormData) {
  let body: L = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response; }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await CALC_POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return ((await res.json()) as L).data?.result?.determinedTax as number;
}
async function multi(f: TransferFormData) {
  const payload = buildPropertyPayload(f) as L;
  const res = await MULTI_POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify({ taxYear: 2026, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }) }));
  const j = (await res.json()) as L;
  return { status: res.status, tax: (j.data?.result?.totalTax ?? j.data?.totalTax) as number, payload };
}

describe("MB-1 ② 입력이 있으면 다건 ⑧이 막는다", () => {
  it.each([
    ["상속 주택 ① + ② 전부", IND],
    ["상속 주택 ② 한 칸만(부분 입력)", { inheritanceAssetKind: "house_individual", inhHouseValHousePriceAtFirst: "900000000" }],
    ["상속 주택 ②만(① 비움)", { ...IND, publishedValueAtInheritance: "" }],
    ["증여 주택 ① + ②", { ...GIFT, ...IND }],
    ["상속 토지 1988 ① + ② 등급", { ...LANDA, ...GRADE }],
  ] as [string, A][])("%s", (_n, a) => {
    expect(guard(a)).toBe(MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE);
  });
  it("문구 — 단건 안내와 ② 비움 안내 · §163⑨ 단서 인용", () => {
    expect(MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE).toContain("단건 계산기에서만 지원됩니다");
    expect(MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE).toContain("② 칸을 비우면");
    expect(MULTI_SEC164_CLAUSE_B_UNSUPPORTED_MESSAGE).toContain("소득세법 시행령 §163⑨ 단서");
  });
});

describe("MB-2 막지 않는다 — ② 비움 · 구간 밖 · 공유 면적 칸 · D2 · 다른 차단이 먼저", () => {
  it("상속 주택 ① 단독 → 통과 · 다건 282,711,000 = 단건 257,010,000 × 1.1(지방소득세 포함)", async () => {
    const a = { inheritanceAssetKind: "house_individual" };
    expect(guard(a)).toBeNull();
    const m = await multi(mk(a));
    expect(m.status).toBe(200);
    expect(m.tax).toBe(282_711_000);
    expect(await single(mk(a))).toBe(257_010_000);
  });
  it.each([
    ["상속 토지 1988 · 면적만(공유 칸)", LANDA],
    ["상속 주택 2010(② 구간 밖) · 남은 ② 값", { ...IND, acquisitionDate: "2010-06-01", inheritanceStartDate: "2010-06-01" }],
    ["매매 주택 · 남은 ② 값", { ...IND, acquisitionCause: "purchase", publishedValueAtInheritance: "", fixedAcquisitionPrice: "300000000" }],
    ["D2 건물 상속 + 토지 매매 · 건물 ② 채움", D2],
  ] as [string, A][])("%s → 통과", (_n, a) => {
    expect(guard(a)).toBeNull();
  });
  it("D2 — 다건 route 200 · 단건과 같은 세액 ×1.1(건물 ②는 파트 페이로드로 실린다)", async () => {
    const m = await multi(mk(D2));
    expect(m.status).toBe(200);
    expect(JSON.stringify(m.payload)).toContain("buildingSec164Value");
    expect(m.tax).toBe(Math.floor((await single(mk(D2))) * 1.1));
  });
  it("재개발 — 기존 차단 문구가 먼저(재개발·재건축은 단건 계산기에서만)", () => {
    expect(guard({ ...IND, assetKind: "redevelopment_apt", redevSubject: "apt", redevOriginalAssetType: "housing", redevApprovalDate: "2015-03-01" })).toBe(MULTI_REDEVELOPMENT_UNSUPPORTED_MESSAGE);
  });
});
