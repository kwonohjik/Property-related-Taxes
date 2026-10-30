/**
 * anchor — **함께 부담부증여 첫 자산(주 자산)에 채무가 없는 묶음** (계획서 `docs/00-pm/bg-bundle-primary-zero-debt.plan.md`).
 *
 * 종전: 채무를 컴패니언에만 입력하면(주 자산 0) ⑧ 은 통과(묶음은 채무 > 0 을 신고 단위로 판정)하는데 ⑫ 가 `transferPrice: Too small: expected number to be >0` 로 400 이었다.
 * 원인: ④ 가 주 자산 `transferPrice` placeholder(Zod 가 양수를 요구 — 엔진이 다시 계산해 값은 응답에 영향이 없다)를 **주 자산 자신의 채무**로 실어 0 이 됐다.
 * 반대(채무를 주 자산에만)는 200 이었다 — 같은 자산이면 두 입력 위치의 결과가 같아야 한다.
 *
 * · PZ-1 오라클 — 같은 자산 쌍에서 채무 위치만 바꾼 거울 쌍과 양도차익·증여가액·증여세가 ±0 같다(주택 2건 · 3건 · 일반건물 2건).
 * · PZ-2 placeholder — 모든 경우 본문 `transferPrice` 가 양수이고, 값을 바꿔도(1 · 합계 · 50억) 응답이 같다.
 * · PZ-3 대조 — 모든 자산의 채무가 0 이면 ⑧ 이 종전대로 막는다. 단건 채무 0 도 막는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 부담부증여 주택(기준시가 모드): 양도시 기준시가 10억 · 보증금 2억 + 차입금 2억 → 보충적평가(10억)가 담보평가(4억)를 이긴다. */
const house = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000", actualSalePrice: "", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "200000000",
}), ...over) as AssetForm;
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const bundle = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }, extra) as TransferFormData;
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any, body }; // eslint-disable-line @typescript-eslint/no-explicit-any
}


const DEBT = (d: string) => x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: d, bgMortgageSetAmount: "1,000" });
const NONE = x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0" });
const GBDEBT = x({ bgMortgageDebtAmount: "300,000,000", bgMortgageSetAmount: "300,000,000" });
const ZERO = x({ bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0" });
/** 시가 모드 일반건물(토지·건물 취득 실가 각 2.5억) — 시가 10억. 담보 승으로 만들려면 MORT. */
const gbM = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `g${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", gbBuildingAcquisitionCause: "purchase",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual",
  bgActualAcquisitionLand: "250000000", bgActualAcquisitionBuilding: "250000000",
}), ...over) as AssetForm;


async function raw(body: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function outcome(assets: AssetForm[]) {
  const f = bundle(assets);
  const r = await post(f);
  const g = r.status === 200 ? r.j.data.aggregated : undefined;
  return { issues: allIssues(f).map(String), status: r.status, tp: (r.body as { transferPrice: number }).transferPrice, gain: g?.totalTransferGain as number | undefined, giftValue: g?.burdenedGift?.giftValuation?.max as number | undefined, giftTax: g?.burdenedGift?.giftTax?.finalTax as number | undefined };
}

describe("PZ-1 채무 위치만 다른 거울 쌍은 같은 결과", () => {
  it.each([
    ["주택 2건(채무 2억)", () => [house(1, NONE), house(2, DEBT("200000000"))], () => [house(1, DEBT("200000000")), house(2, NONE)]],
    ["주택 3건(채무 3억 — 주 자산·첫 컴패니언 0)", () => [house(1, NONE), house(2, NONE), house(3, DEBT("300000000"))], () => [house(1, DEBT("300000000")), house(2, NONE), house(3, NONE)]],
    ["주택 3건(채무 3억 — 주 자산 0, 컴패니언 둘에 분산)", () => [house(1, NONE), house(2, DEBT("100000000")), house(3, DEBT("200000000"))], () => [house(1, DEBT("200000000")), house(2, DEBT("100000000")), house(3, NONE)]],
    ["일반건물 2건(시가 모드 채무 3억)", () => [gbM(1, ZERO), gbM(2, GBDEBT)], () => [gbM(1, GBDEBT), gbM(2, ZERO)]],
  ] as const)("%s", async (_l, zeroFirst, mirror) => {
    const z = await outcome(zeroFirst());
    const m = await outcome(mirror());
    expect(z.issues.map((m) => m.slice(0, 120))).toEqual([]);
    expect(z.status).toBe(200);
    expect(m.status).toBe(200);
    expect([z.gain, z.giftValue, z.giftTax]).toEqual([m.gain, m.giftValue, m.giftTax]);
    expect(z.gain).toBeGreaterThan(0);
  });
});

describe("PZ-2 주 자산 transferPrice placeholder", () => {
  it("채무가 컴패니언에만 있어도 본문 transferPrice 는 양수 · 값을 바꿔도 응답이 같다", async () => {
    const f = bundle([house(1, NONE), house(2, DEBT("200000000"))]);
    const body = (await captureBody(f)) as { transferPrice: number };
    expect(body.transferPrice).toBe(200_000_000); // 신고 단위 채무 합계
    const ref = JSON.stringify((await raw(body)).j.data);
    for (const tp of [1, 5_000_000_000]) expect(JSON.stringify((await raw({ ...body, transferPrice: tp })).j.data)).toBe(ref);
  });
  it("placeholder — 단건은 자기 채무 · 묶음은 신고 단위 합계(주 자산에 채무가 있어도 자산 합계로 바뀐다 — 응답에는 영향 없음)", async () => {
    const single = (await captureBody(Object.assign(createDefaultTransferFormData(), FORM, { assets: [house(1, DEBT("200000000"))] }) as TransferFormData)) as { transferPrice: number };
    expect(single.transferPrice).toBe(200_000_000);
    const both = (await captureBody(bundle([house(1, DEBT("200000000")), house(2, DEBT("100000000"))]))) as { transferPrice: number };
    expect(both.transferPrice).toBe(300_000_000);
  });
});

describe("PZ-3 대조 — 채무가 하나도 없으면 종전대로 막는다", () => {
  it("묶음의 모든 자산 채무 0 — ⑧ 차단(신고 단위 합계 0)", () => {
    expect(allIssues(bundle([house(1, NONE), house(2, NONE)])).length).toBeGreaterThan(0);
  });
  it("단건 채무 0 — ⑧ 차단", () => {
    expect(allIssues(Object.assign(createDefaultTransferFormData(), FORM, { assets: [house(1, NONE)] }) as TransferFormData).length).toBeGreaterThan(0);
  });
});
