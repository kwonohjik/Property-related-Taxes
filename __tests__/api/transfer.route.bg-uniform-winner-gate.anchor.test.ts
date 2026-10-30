/**
 * anchor — 함께 부담부증여 **⑧ 균일 승자 과차단 해제** (계획서 `docs/00-pm/bg-sidebar-gb-bundle-and-gate.plan.md` Q-2).
 *
 * ⑧ 승자 게이트(`transfer-tax-validate.ts`)는 비보충 승자(담보 §66·임대 §61⑤)를 전부 막았다. 그러나 ⑫·엔진은 균일 승자 쌍을 맞게 계산한다
 * (합산 증여가액 = ΣAᵢ · 양도차익 = 단건 합 · #2750·#2753 격자). 또 묶음의 자산은 담보 승 판정(`wholeValuation`)을 건너뛰어 ⑧의 「채무액이 증여가액 초과」 분모가
 * 담보평가액이 아니라 시가였다(담보 1.2B > 시가 1.0B인 정당한 쌍이 막힘).
 *
 * · UW-1 균일 승자(100% 소유) — ⑧ 통과 ∧ ⑫ 200 ∧ 증여가액 = ΣA ∧ 양도차익 = 단건 합(±0). 일반건물 시가 모드 담보 쌍(두 규칙 모두) · 주택 기준시가 담보 쌍 · 임대 쌍.
 * · UW-2 여전히 막힘 — 혼합 승자(⑧·⑫ 모두) · 지분·시가 모드 이월과세·입주권·겸용 자산의 비보충 승자(⑧; 화면·엔진의 취득가액 처리를 확인하지 못한 범위 — 기준시가 모드 이월과세는 풀렸다).
 * · UW-3 분모 — 시가 모드 묶음에서 채무가 그 자산의 증여가액(담보평가액)을 넘으면 여전히 막힌다.
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
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { companionBurdenedGiftValuations } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
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
/** 담보 승 주택 — 차입금 15억 > 기준시가 10억. */
const HM = x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,500,000,000" });
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const bundle = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }, extra) as TransferFormData;
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any, body }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const RENT = x({ bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0", bgAnnualRentTotal: "120000000" });
/** 시가 모드 일반건물(토지·건물 취득 실가 각 2.5억) — 시가 10억. 담보 승으로 만들려면 MORT. */
const gbM = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `g${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", gbBuildingAcquisitionCause: "purchase",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential", gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "100000000", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual",
  bgActualAcquisitionLand: "250000000", bgActualAcquisitionBuilding: "250000000",
}), ...over) as AssetForm;
const MORT = x({ bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" });

async function probe(assets: AssetForm[]) {
  const f = bundle(assets);
  const v = companionBurdenedGiftValuations(assets.map((a) => buildBurdenedGiftInfo(a)), assets.map((a) => getOwnershipRatio(a)));
  const issues = allIssues(f).map(String);
  const r = await post(f);
  const g = r.status === 200 ? r.j.data.aggregated : undefined;
  return { modes: v.map((q) => q.selectedMode[0]).join(""), sumA: v.reduce((s, q) => s + q.value, 0), issues, status: r.status, giftValue: g?.burdenedGift?.giftValuation?.max as number | undefined, gain: g?.totalTransferGain as number | undefined };
}
async function singleGain(a: AssetForm): Promise<number> {
  const r = await post(Object.assign(createDefaultTransferFormData(), FORM, { assets: [a] }) as TransferFormData);
  expect(r.status).toBe(200);
  return (r.j.data.aggregated?.totalTransferGain ?? r.j.data.result.transferGain) as number;
}
const GATE = "함께 양도와 같이 계산하지 않습니다";
const MIXED = "자산 1 담보평가(상증법 §66) · 자산 2 보충적평가: 증여재산 평가 방식이 달라 함께 양도와 같이 계산할 수 없습니다";
// `allIssues`가 메시지를 80자로 자르므로 「초과합니다」가 아니라 앞부분(채무액 · 증여가액)으로 가린다.
const EXCESS = "채무액(";

describe("UW-1 균일 승자(100% 소유) — ⑧ 통과 · ⑫ 200 · 증여가액 = ΣA · 양도차익 = 단건 합", () => {
  it.each([
    ["일반건물 시가 모드 담보 쌍(담보 1.2B > 시가 1.0B — 게이트와 분모 두 규칙)", () => [gbM(1, MORT), gbM(2, MORT)], "mm"],
    ["주택 기준시가 담보 쌍", () => [house(1, HM), house(2, HM)], "mm"],
    ["주택 기준시가 임대 쌍", () => [house(1, RENT), house(2, RENT)], "rr"],
  ] as const)("%s", async (_l, mk, modes) => {
    const assets = mk();
    const r = await probe(assets);
    expect(r.modes).toBe(modes);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.giftValue).toBe(r.sumA);
    expect(r.gain).toBe((await singleGain(assets[0])) + (await singleGain(assets[1])));
  });
});

describe("UW-2 여전히 막힘 — 혼합 승자 · 지분·이월과세·입주권·겸용의 비보충 승자", () => {
  it("혼합 승자(담보 + 보충) — ⑧ 1건(혼합 안내) · ⑫ 400", async () => {
    const r = await probe([house(1, HM), house(2)]);
    expect(r.modes).toBe("ms");
    expect(r.issues.filter((m) => m.includes(MIXED)).length).toBe(1);
    expect(r.issues.some((m) => m.includes(GATE))).toBe(false);
    expect(r.status).toBe(400);
  });

  it.each([
    ["지분 50% 담보 승", () => [house(1, HM), house(2, HM, x({ ownershipNumerator: "50", ownershipDenominator: "100" }))], "지분 보유"],
    // 기준시가 모드 이월과세는 풀렸다(`transfer.route.bg-carryover-std-uniform-bundle.anchor.test.ts` CU-1) — 시가 모드만 막힌다(담보 승이 취득가액을 당초 증여자 기준시가로 강제하는 화면은 2단계).
    ["시가 모드 이월과세 담보 승", () => [house(1, HM), house(2, HM, x({ acquisitionCause: "carryover_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" }))], "이월과세"],
    ["조합원입주권 담보 승", () => [house(1, HM), house(2, HM, x({ assetKind: "right_to_move_in" }))], "조합원입주권"],
    ["겸용주택 담보 승", () => [house(1, HM), house(2, HM, x({ isMixedUseHouse: true }))], "겸용주택"],
  ] as const)("%s — 해당 자산만 ⑧이 막는다", async (_l, mk, reason) => {
    const f = bundle(mk());
    const gate = allIssues(f).map(String).filter((m) => m.includes(GATE));
    expect(gate.length).toBe(1);
    expect(gate[0]).toContain(`자산 2:`);
    expect(gate[0]).toContain(`${reason} 자산은`);
  });
});

describe("UW-3 분모 — 묶음 자산의 채무는 그 자산의 증여가액(담보 승이면 담보평가액)과 비교한다", () => {
  it("시가 모드 담보 쌍: 채무 1.2B ≤ 담보평가액 1.2B → 통과, 채무 1.5B > 담보평가액 1.2B(설정액) → 「초과」", async () => {
    expect(allIssues(bundle([gbM(1, MORT), gbM(2, MORT)])).map(String).filter((m) => m.includes(EXCESS))).toEqual([]);
    const over = allIssues(bundle([gbM(1, MORT, x({ bgMortgageDebtAmount: "1,500,000,000" })), gbM(2, MORT)])).map(String).filter((m) => m.includes(EXCESS));
    expect(over.length).toBe(1);
    expect(over[0]).toContain("자산 1");
    expect(over[0]).toContain("증여가액(1,200,000,000원)"); // 분모 = 담보평가액(시가 1,000,000,000원이 아니다)
  });
});
