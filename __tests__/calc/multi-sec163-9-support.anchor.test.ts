/**
 * 다건 계산 — 상속·증여 §163⑨ 취득가액(① 평가액 · ② §164 기준시가 · 의제 전 ③ 환산)을 단건과 같은 경로로 계산한다.
 * 계획서 `docs/02-design/features/multi-sec163-9-support.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * 다건 엔진은 자산마다 단건 엔진을 부른다 — 기대값의 정본은 **다건 totalTax = ⌊단건 결정세액 × 1.1⌋**(지방소득세 포함).
 * 종전 다건은 ①만 싣고 ②를 버렸다(상속 주택 ① 3억 + ② 7.2억 → 282,711,000) · #2888이 그 입력을 막았다. 세율 mock.
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
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Record<string, unknown>;
type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 상속 주택 · 2000-06-01 · ① 3억 · 양도 2026-02-16 13억 */
const mk = (a: A) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "1300000000",
  assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-1", assetKind: "housing", actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000",
    acquisitionCause: "inheritance", acquisitionDate: "2000-06-01", inheritanceStartDate: "2000-06-01", publishedValueAtInheritance: "300000000",
    inheritanceValuationMethod: "supplementary", decedentAcquisitionDate: "1980-01-01", standardPriceAtTransfer: "900000000", ...a } as AssetForm],
})) as TransferFormData;
/** ② 주택 §164⑤ — 720,000,000 */
const IND: A = { inheritanceAssetKind: "house_individual", inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000",
  inhHouseValHousePriceAtFirst: "900000000", inhHouseValLandPricePerSqmAtInheritance: "800000" };
const GIFT: A = { acquisitionCause: "gift", publishedValueAtInheritance: "", inheritanceStartDate: "", fixedAcquisitionPrice: "300000000", donorAcquisitionDate: "1980-01-01", giftDonorRelation: "lineal", giftSameHouseholdAtTransfer: "no", decedentAcquisitionDate: "" };
const LANDA: A = { assetKind: "land", landNature: "standalone", acquisitionArea: "200", acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", inheritanceAssetKind: "land" };
/** ② 토지 §164④ — 480,000,000 */
const GRADE: A = { pre1990GradeMode: "value", pre1990Grade_current: "100000", pre1990Grade_prev: "100000", pre1990Grade_atAcq: "80000", pre1990PricePerSqm_1990: "3000000" };
/** 의제취득일 전(1984) 상속 토지 — ③ 환산 분자(의제취득일 기준시가)·분모(양도시 기준시가) */
const PRE: A = { ...LANDA, acquisitionDate: "1984-06-01", inheritanceStartDate: "1984-06-01", decedentAcquisitionDate: "1970-01-01" };
const D2: A = {
  assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01",
  decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
  hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
  buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
  buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
  inheritanceAssetKind: "house_individual", acquisitionArea: "200", inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
};

async function single(f: TransferFormData) {
  let body: L = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response; }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await CALC_POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const j = (await res.json()) as L;
  return { tax: j.data?.result?.determinedTax as number, acq: j.data?.result?.inheritedAcquisitionDetail?.acquisitionPrice as number | undefined };
}
async function multi(f: TransferFormData) {
  const payload = buildPropertyPayload(f) as L;
  const res = await MULTI_POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify({ taxYear: 2026, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }) }));
  const j = (await res.json()) as L;
  return { status: res.status, fieldErrors: Object.keys(j.error?.fieldErrors ?? {}), tax: (j.data?.result?.totalTax ?? j.data?.totalTax) as number, payload };
}
/** ⑧ — 다건 화면 가드 + 건별 단건 ⑧ */
const issues = (f: TransferFormData) => [validateMultiSupportedMode(f), ...[0, 1, 2, 3].map((st) => validateStepDetailed(st, f)?.message ?? null)].filter(Boolean);

describe("MS-1 격자 — 다건 = ⌊단건 × 1.1⌋", () => {
  it.each([
    ["상속 주택 2000 ① + ②", IND, 149_006_000, ["inheritedAcquisition", "inheritedHouseValuation"]],
    ["상속 주택 2000 ②만(① 비움)", { ...IND, publishedValueAtInheritance: "" }, 149_006_000, ["inheritedAcquisition", "inheritedHouseValuation"]],
    ["상속 주택 2000 ①만", { inheritanceAssetKind: "house_individual" }, 282_711_000, ["inheritedAcquisition"]],
    ["증여 주택 2000 ① + ②", { ...GIFT, ...IND }, 149_006_000, ["inheritedAcquisition", "inheritedHouseValuation"]],
    ["상속 토지 1988 ① + ②", { ...LANDA, ...GRADE }, 224_499_000, ["inheritedAcquisition", "pre1990Land"]],
    ["상속 토지 1988 ②만", { ...LANDA, ...GRADE, publishedValueAtInheritance: "" }, 224_499_000, ["inheritedAcquisition", "pre1990Land"]],
    ["상속 주택 2010 ①만(② 구간 밖)", { inheritanceAssetKind: "house_individual", acquisitionDate: "2010-06-01", inheritanceStartDate: "2010-06-01" }, 282_711_000, ["inheritedAcquisition"]],
  ] as [string, A, number, string[]][])("%s", async (_n, a, multiTax, keys) => {
    const f = mk(a);
    if (a.acquisitionCause !== "gift") expect(issues(f)).toEqual([]);
    const s = await single(f);
    const m = await multi(f);
    expect(m.status).toBe(200);
    expect(m.tax).toBe(multiTax);
    expect(m.tax).toBe(Math.floor(s.tax * 1.1));
    for (const k of keys) expect(m.payload[k]).toBeDefined();
  });
  it("D2(건물 상속 + 토지 매매) — 기존 파트 경로 그대로 · 다건 = ⌊단건 × 1.1⌋", async () => {
    const f = mk(D2);
    const m = await multi(f);
    expect(m.status).toBe(200);
    expect(m.tax).toBe(Math.floor((await single(f)).tax * 1.1));
  });
});

describe("MS-2 의제취득일 전(1984) 상속 토지 — ③ 환산 3자 max도 같은 경로(V-1)", () => {
  it.each([
    ["① 3억 · ③ 칸(의제취득일 기준시가 5억 · 양도시 9억)", { ...PRE, standardPriceAtAcq: "500000000", useStandardPriceAtAcqOverride: true, useStandardPriceAtTransferOverride: true }],
    ["① 3억만", PRE],
  ] as [string, A][])("%s → 다건 = ⌊단건 × 1.1⌋ · 본문 inheritedAcquisition.mode = pre-deemed", async (_n, a) => {
    const f = mk(a);
    const s = await single(f);
    const m = await multi(f);
    expect(m.status).toBe(200);
    expect(m.payload.inheritedAcquisition?.mode).toBe("pre-deemed");
    expect(m.tax).toBe(Math.floor(s.tax * 1.1));
  });
});

describe("MS-2b ③이 실제로 채택된다(① 단독과 다른 세액)", () => {
  it("③ 칸 있는 행 143,701,555 < ① 단독 282,711,000", async () => {
    const withConv = await multi(mk({ ...PRE, standardPriceAtAcq: "500000000", useStandardPriceAtAcqOverride: true, useStandardPriceAtTransferOverride: true }));
    const onlyReported = await multi(mk(PRE));
    expect(withConv.tax).toBeLessThan(onlyReported.tax);
    expect(withConv.tax).toBe(143_701_555);
    expect(onlyReported.tax).toBe(282_711_000);
  });
});

describe("MS-3 ⑫ — 상가 §164⑥ 키는 계속 거절(다건이 상업용 건물을 막는다)", () => {
  it("commercialInheritanceValuation을 붙이면 400", async () => {
    const f = mk(IND);
    const payload = buildPropertyPayload(f) as L;
    const res = await MULTI_POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify({ taxYear: 2026, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload, commercialInheritanceValuation: { exclusiveArea: 10 } }] }) }));
    expect(res.status).toBe(400);
  });
});
