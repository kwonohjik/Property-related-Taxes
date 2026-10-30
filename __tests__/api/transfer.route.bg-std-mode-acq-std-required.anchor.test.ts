/**
 * anchor — 부담부증여 **기준시가 모드: 양도인의 취득시 기준시가 필수** (⑫·엔진 가드).
 *
 * §159①1호 괄호: 기준시가로 양도가액을 산정하면 취득가액은 「취득시 기준시가 × 채무비율」이다. 이 값이 0이면 취득가액도 0이 되어 양도차익이 통째로 부풀지만
 * (실측: 주택·토지 단건 194,000,000 → 400,000,000) ⑧만 막고 ⑫는 200이었다 — API 직접 호출에서 침묵 오답. 양도시 기준시가의 짝 가드
 * (`isStandardMode && supplementary === 0`)는 이미 있었고 취득시 쪽만 없었다. 시가 모드 담보 승은 엔진이 이미 400이다(`collateralForcedStdInMarketMode`).
 *
 * · SA-1 주택·토지 단건 — 비우면 400(취득시 기준시가 안내), 채우면 200 ∧ 양도차익 194,000,000.
 * · SA-2 함께 양도 묶음 — 주 자산·컴패니언 어느 쪽이든 비우면 400.
 * · SA-3 시가 모드 보충적평가 승(괄호 미발동) — 취득시 기준시가 없이 실지취득가액만으로 200(과차단 없음).
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
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
/** 보증금 2억 + 차입금 2억(설정액 2억) — 양도시 기준시가 10억의 보충적평가가 이긴다. */
const DEBT = x({ bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "200000000" });
const BLANK = x({ standardPriceAtAcq: "", standardPricePerSqmAtAcq: "" });
const BASE = {
  acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000",
  useEstimatedAcquisition: false, transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
};
const house = (id: number, o: Record<string, unknown> = {}) =>
  Object.assign({ ...makeDefaultAsset(id) }, x({ ...BASE, assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing" }), DEBT, x(o)) as AssetForm;
const land = (id: number, o: Record<string, unknown> = {}) =>
  Object.assign({ ...makeDefaultAsset(id) }, x({ ...BASE, assetId: `l${id}`, addressJibun: `강원 홍천군 테스트리 ${id}`, assetKind: "land", landNature: "standalone", acquisitionArea: "300", transferArea: "300" }), DEBT, x(o)) as AssetForm;
/** 시가 모드 · 실지취득가액 · 보충적평가 승(채무 3억 — 시가 10억이 이긴다) — 취득시 기준시가를 쓰지 않는다. */
const MARKET_SUPPLEMENTARY = x({
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000",
});

async function post(assets: AssetForm[]) {
  const f = Object.assign(createDefaultTransferFormData(), FORM, {
    assets, contractTotalPrice: assets.length > 1 ? "" : "1,000,000,000", ...(assets.length > 1 ? { assetSplitMode: "companion", bundledSaleMode: "actual" } : {}),
  }) as TransferFormData;
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const ASK = "취득시 기준시가";

describe.each([["주택", house], ["토지", land]] as const)("SA-1 %s 단건 — 기준시가 모드", (_k, mk) => {
  it("취득시 기준시가를 비우면 400 (종전 200 · 양도차익 400,000,000)", async () => {
    const r = await post([mk(1, BLANK)]);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(ASK);
  });
  it("채우면 200 ∧ 양도차익 194,000,000", async () => {
    const r = await post([mk(1)]);
    expect(r.status).toBe(200);
    expect(r.j.data.result.transferGain).toBe(194_000_000);
  });
});

describe("SA-2 함께 양도 묶음 — 기준시가 모드", () => {
  it.each([
    ["주택 · 주 자산 비움", () => [house(1, BLANK), house(2)]],
    ["주택 · 컴패니언 비움", () => [house(1), house(2, BLANK)]],
    ["토지 · 컴패니언 비움", () => [land(1), land(2, BLANK)]],
  ] as const)("%s ⇒ 400", async (_l, mk) => {
    const r = await post(mk());
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.j)).toContain(ASK);
  });
  it("둘 다 채우면 200", async () => {
    expect((await post([house(1), house(2)])).status).toBe(200);
  });
});

describe("SA-3 시가 모드 보충적평가 승 — 괄호 미발동이라 취득시 기준시가 없이 계산한다(과차단 없음)", () => {
  it.each([
    ["주택", () => [house(1, { ...MARKET_SUPPLEMENTARY, ...BLANK })]],
    ["토지", () => [land(1, { ...MARKET_SUPPLEMENTARY, ...BLANK })]],
  ] as const)("%s ⇒ 200", async (_l, mk) => {
    expect((await post(mk())).status).toBe(200);
  });
});
