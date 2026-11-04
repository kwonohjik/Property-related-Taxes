/**
 * 다건·함께 양도 — 상속·증여 §163⑨ ② 채택 자산의 취득가액·필요경비 **표시 echo**(`resolveDisplayAcquisitionAndExpense`).
 * 계획서 `docs/02-design/features/multi-inherited-acq-display-echo.plan.md` (Q-1 a · Q-2 a).
 *
 * 종전 echo는 실가 자산의 취득가액을 route 입력 ①에서 읽어, ②가 채택되면 「취득가액 ① · 필요경비 = 차액」으로 표시했다
 * (상속 주택 ① 3억 + ② 7.2억 → 300,000,000 · 420,000,000). 정본은 단건 신고서와 같은 「양도가액 − 양도차익 − 엔진 필요경비」다.
 * 표시 전용 — 세액(다건 = ⌊단건 결정세액 × 1.1⌋)은 불변. 세율 mock.
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


async function singleRaw(f: TransferFormData) {
  let body: L = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response; }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await CALC_POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return (await res.json()) as L;
}
async function multiRaw(f: TransferFormData) {
  const payload = buildPropertyPayload(f) as L;
  const res = await MULTI_POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify({ taxYear: 2026, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }) }));
  return (await res.json()) as L;
}
const HALF: A = { ownershipNumerator: "1", ownershipDenominator: "2" };
const PRE3: A = { ...PRE, standardPriceAtAcq: "500000000", useStandardPriceAtAcqOverride: true, useStandardPriceAtTransferOverride: true };

describe("DE-1 다건 — 자산별 취득가액·필요경비 = 단건 신고서 정의 · 세액 불변", () => {
  it.each([
    ["상속 주택 ① + ②", IND, 720_000_000, 0, 149_006_000],
    ["상속 주택 ②만", { ...IND, publishedValueAtInheritance: "" }, 720_000_000, 0, 149_006_000],
    ["증여 주택 ① + ②", { ...GIFT, ...IND }, 720_000_000, 0, 149_006_000],
    ["상속 토지 1988 ① + ②", { ...LANDA, ...GRADE }, 480_000_000, 0, 224_499_000],
    ["상속 토지 1988 ②만", { ...LANDA, ...GRADE, publishedValueAtInheritance: "" }, 480_000_000, 0, 224_499_000],
    ["지분 1/2 주택 ① + ②", { ...IND, ...HALF }, 360_000_000, 0, null],
    ["지분 1/2 토지 1988 ① + ②", { ...LANDA, ...GRADE, ...HALF }, 240_000_000, 0, null],
    ["상속 주택 ① + ② · 감가상각비 5천만(§97③ — 채택값에서 뺀다)", { ...IND, depreciationAmount: "50000000" }, 670_000_000, 0, null],
    ["상속 주택 ①만(불변)", { inheritanceAssetKind: "house_individual" }, 300_000_000, 0, 282_711_000],
    ["의제 전 1984 ③(불변 · 환산 분기)", PRE3, 722_222_222, 15_000_000, 143_701_555],
    ["의제 전 1984 ①만(불변)", PRE, 300_000_000, 0, 282_711_000],
    ["D2(불변 · 분리 분기)", D2, 336_000_000, 0, 271_992_600],
  ] as [string, A, number, number, number | null][])("%s", async (_n, a, acq, exp, tax) => {
    const f = mk(a);
    const m = await multiRaw(f);
    const res = m.data?.result ?? m.data;
    const p = res.properties[0];
    const s = (await singleRaw(f)).data.result;
    expect(p.acquisitionPrice).toBe(acq);
    expect(p.necessaryExpense).toBe(exp);
    // 단건 신고서 정의(엔진 필요경비 · 양도가액 − 양도차익 − 필요경비)와 같다
    expect(p.necessaryExpense).toBe(s.expenses ?? 0);
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
    expect(p.transferGain).toBe(s.transferGain);
    expect(res.totalTax).toBe(Math.floor(s.determinedTax * 1.1));
    if (tax !== null) expect(res.totalTax).toBe(tax);
  });
});

describe("DE-2 함께 양도(단건 화면) — 같은 echo · 상속 자산 열", () => {
  const prim = () => ({ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "500000000", actualSalePrice: "800000000", fixedSalePrice: "800000000", standardPriceAtTransfer: "600000000" }) as AssetForm;
  it.each([
    ["상속 주택 ① + ②", IND, 720_000_000],
    ["상속 주택 ②만", { ...IND, publishedValueAtInheritance: "" }, 720_000_000],
    ["증여 주택 ① + ②", { ...GIFT, ...IND }, 720_000_000],
    ["상속 토지 1988 ① + ②", { ...LANDA, ...GRADE }, 480_000_000],
    ["상속 토지 1988 ②만", { ...LANDA, ...GRADE, publishedValueAtInheritance: "" }, 480_000_000],
    ["상속 주택 ①만(불변)", { inheritanceAssetKind: "house_individual" }, 300_000_000],
  ] as [string, A, number][])("%s", async (_n, a, acq) => {
    const comp = { ...mk(a).assets[0], assetId: "a2", addressJibun: "서울 강남구 테스트동 9-2" } as AssetForm;
    const f = { ...mk({}), contractTotalPrice: "2100000000", assets: [prim(), comp] } as TransferFormData;
    const j = await singleRaw(f);
    expect(j.data.mode).toBe("bundled");
    const p = j.data.aggregated.properties[1];
    expect(p.inheritedAcquisitionDetail.acquisitionPrice).toBe(acq);
    expect(p.acquisitionPrice).toBe(acq);
    expect(p.necessaryExpense).toBe(0);
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
  });
});
