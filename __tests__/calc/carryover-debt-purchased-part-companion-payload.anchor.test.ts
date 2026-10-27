/**
 * anchor ④ — 함께 양도 둘째 자산의 이월과세 채무 키: 폼 → ④ 본문 `companionAssets[i].carryoverTaxation.giftAssumedDebt`.
 * 노출·전송·차단이 같은 술어(`carryoverPurchasedPartScope`)를 읽는지 — 둘째 자산도 apply면 싣고, 부담부증여(unsupported)·OFF면 싣지 않는다.
 * 설계서 ui.design §3(④ 호출부 3곳 중 컴패니언 `transfer-tax-api-companion-payload.ts`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

type Body = { companionAssets?: { carryoverTaxation?: { giftAssumedDebt?: number } }[] };

async function bodyOf(over: Partial<AssetForm>, co: Record<string, unknown>): Promise<Body> {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "2500000000";
  f.householdHousingCount = "2";
  f.assetSplitMode = "companion";
  f.bundledSaleMode = "actual";
  const first = { ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000" } as AssetForm;
  const second = {
    ...makeDefaultAsset(2), assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "", actualSalePrice: "1500000000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100000000", giftDateValuation: "1000000000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", ...co },
    ...over,
  } as AssetForm;
  f.assets = [first, second];
  withTestAddress(f);
  let captured: Body = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => { captured = JSON.parse(String(init.body)); return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response; }));
  try { await callTransferTaxAPI(f); } catch { /* 본문만 필요 */ }
  return captured;
}
const debtOf = (b: Body) => b.companionAssets?.[0]?.carryoverTaxation?.giftAssumedDebt;

describe("④ 함께 양도 둘째 자산(컴패니언) — 채무 키", () => {
  it("P-1 apply ∧ ON·4억 → 컴패니언 carryoverTaxation.giftAssumedDebt = 4억", async () => {
    expect(debtOf(await bodyOf({}, { giftDebtAssumed: true, giftAssumedDebt: "400,000,000" }))).toBe(400_000_000);
  });
  it("P-2 OFF(값이 남아 있어도)·채무 0 → 키 없음", async () => {
    expect(debtOf(await bodyOf({}, { giftDebtAssumed: false, giftAssumedDebt: "400,000,000" }))).toBeUndefined();
    expect(debtOf(await bodyOf({}, { giftDebtAssumed: true, giftAssumedDebt: "0" }))).toBeUndefined();
  });
  it("P-3 둘째 자산이 지금 양도도 부담부증여(unsupported) → 남은 ON이어도 키 없음", async () => {
    expect(debtOf(await bodyOf({ transferType: "burdened_gift" }, { giftDebtAssumed: true, giftAssumedDebt: "400,000,000" }))).toBeUndefined();
  });
});
