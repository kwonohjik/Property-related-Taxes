/**
 * anchor — 함께 부담부증여 **컴패니언 ⑧↔⑫ 정합**: 비일반건물(주택) 컴패니언 · 일반건물+주택 혼합 종류 · 컴패니언 매매사례가액 (측정, 계획서 `docs/00-pm/bg-companion-parity.plan.md`)
 *
 * · PB-1 비일반건물 — #2746 의 ⑫ 혼합 승자 규칙(`bgBundleMixedWinner`)은 주 자산이 **일반건물**일 때만 주 자산을 집계에 넣고 기준시가 **4칸**(양도시·취득시 토지·건물)이 모두 > 0 일 때만 판정한다.
 *   주택은 토지 칸이 0 이라(`std4키 0101`) 판정이 보류되어, ⑧ 이 막는 혼합 승자 쌍을 ⑫ 가 200 으로 통과시키고 합산 증여가액이 ΣA 보다 작다 — 같은 ΣA 를 보충 승으로 만든 오라클과 비교해 증여세 과소.
 *   (균일 담보 승은 ⑫ 가 맞다 — 증여가액 = ΣA · 양도차익 = 단건 합.)
 * · PB-2 컴패니언 매매사례가액 — ⑧ 은 막고 ⑫ 는 해당 필드를 정의하지 않는다(`transfer-tax-schema-sub.ts` 컴패니언 스키마에 `acquisitionMethod`·`similarSalesValue` 없음). `fixedAcquisitionPrice` 가 있으면 플래그를 버리고 실가로 계산해
 *   플래그 없는 대조군과 같은 값이고, 없으면 400. 결함 아님(API 계약 밖).
 *
 * 이 파일은 **현재 동작의 기록**이다 — PB-1 의 「⑫ 200」이 결함이다(구현 PR 이 400 으로 뒤집는다).
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
import { buildBurdenedGiftInfo, companionBurdenedGiftValuations } from "@/lib/calc/transfer-tax-api-burdened-gift";
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
/** 오라클: 같은 평가액(15억)을 보충 승으로 만든 주택 — 기준시가 15억 · 담보 설정액을 1,000 으로 눌러 담보평가가 못 이기게 하고 채무 15억은 그대로 인수. */
const HSUPF = x({ standardPriceAtTransfer: "1500000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "1,500,000,000", bgMortgageSetAmount: "1,000" });
/** 부담부증여 일반건물(기준시가 모드): 보증금 0 · 차입금 5억 → 보충 승. */
const gb = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false, acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
  transferType: "burdened_gift", transferCause: "general", bgDonorRelation: "lineal_descendant", bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "205000000", bgActualAcquisitionBuilding: "150000000", landAcquisitionDate: "2010-05-01",
  bgLendingDepositTotal: "0", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000",
}), ...over) as AssetForm;
const GM = x({ bgMortgageDebtAmount: "1,600,000,000", bgMortgageSetAmount: "1,600,000,000" });

const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const bundle = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }, extra) as TransferFormData;
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any, body }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function cell(assets: AssetForm[]) {
  const f = bundle(assets);
  const gate = allIssues(f).map(String).filter((m) => m.includes("함께 양도와 같이")).length;
  const v = companionBurdenedGiftValuations(assets.map((a) => buildBurdenedGiftInfo(a)), assets.map((a) => getOwnershipRatio(a)));
  const r = await post(f);
  const g = r.status === 200 ? r.j.data.aggregated : undefined;
  return {
    gate, status: r.status, modes: v.map((q) => q.selectedMode[0]).join(""), sumA: v.reduce((s, q) => s + q.value, 0),
    wholeMax: g?.burdenedGift?.giftValuation?.max as number | undefined, giftTax: g?.burdenedGift?.giftTax?.finalTax as number | undefined, gain: g?.totalTransferGain as number | undefined,
  };
}
async function singleGain(a: AssetForm): Promise<number> {
  const r = await post(Object.assign(createDefaultTransferFormData(), FORM, { assets: [a] }) as TransferFormData);
  expect(r.status).toBe(200);
  // 단건 주택은 mode "single"(`result.transferGain`), 일반건물은 aggregated 로 온다.
  return (r.j.data.aggregated?.totalTransferGain ?? r.j.data.result.transferGain) as number;
}

describe("PB-1 비일반건물 묶음 — ⑧ 이 막는 혼합 승자를 ⑫ 가 통과시켜 합산 증여가액이 ΣA 보다 작다 (현재 동작의 기록 = 결함)", () => {
  it("주택 쌍: 보충+보충은 ⑧ 통과 · 200 / 담보+보충(어느 쪽이든)은 ⑧ 게이트 · ⑫ 200 · 증여가액 2.0B(ΣA 2.5B) · 증여세 4,850,000 vs 같은 ΣA 오라클 101,850,000 = 97,000,000 과소", async () => {
    const supsup = await cell([house(1), house(2)]);
    expect([supsup.gate, supsup.status, supsup.wholeMax, supsup.sumA]).toEqual([0, 200, 2_000_000_000, 2_000_000_000]);
    for (const assets of [[house(1, HM), house(2)], [house(1), house(2, HM)]]) {
      const c = await cell(assets);
      expect([c.gate > 0, c.status, c.wholeMax, c.sumA, c.giftTax]).toEqual([true, 200, 2_000_000_000, 2_500_000_000, 4_850_000]);
    }
    const orc = await cell([house(1, HSUPF), house(2)]);
    expect([orc.gate, orc.status, orc.wholeMax, orc.sumA, orc.giftTax]).toEqual([0, 200, 2_500_000_000, 2_500_000_000, 101_850_000]);
  }, 120_000);
  it("주택 쌍: 둘 다 담보 승(균일)은 ⑧ 게이트 · ⑫ 200 · 증여가액 = ΣA(3.0B) · 양도차익 = 단건 합 — ⑫ 가 맞다", async () => {
    const c = await cell([house(1, HM), house(2, HM)]);
    const sum = (await singleGain(house(1, HM))) + (await singleGain(house(2, HM)));
    expect([c.gate > 0, c.status, c.wholeMax, c.sumA, c.gain]).toEqual([true, 200, 3_000_000_000, 3_000_000_000, sum]);
  }, 120_000);
  it("일반건물 + 주택 혼합 종류 6셀: 보충+보충은 ⑧ 통과 · 200 / 한쪽만 담보 승이면 ⑧ 게이트 · ⑫ 200 · 증여가액 < ΣA (주 자산이 주택이든 일반건물이든)", async () => {
    const ss = await cell([gb(1), house(2)]);
    expect([ss.gate, ss.status, ss.wholeMax === ss.sumA]).toEqual([0, 200, true]);
    const rows: [string, AssetForm[]][] = [
      ["GBsup+hmort", [gb(1), house(2, HM)]], ["GBmort+hsup", [gb(1, GM), house(2)]],
      ["hsup+GBmort", [house(1), gb(2, GM)]], ["hmort+GBsup", [house(1, HM), gb(2)]],
    ];
    const out: Record<string, [boolean, number, boolean]> = {};
    for (const [name, assets] of rows) { const c = await cell(assets); out[name] = [c.gate > 0, c.status, c.wholeMax! < c.sumA]; }
    expect(out).toEqual({ "GBsup+hmort": [true, 200, true], "GBmort+hsup": [true, 200, true], "hsup+GBmort": [true, 200, true], "hmort+GBsup": [true, 200, true] });
  }, 120_000);
});

describe("PB-2 컴패니언 매매사례가액 — ⑧ 이 막고 ⑫ 는 필드가 없어 무시(실가 값 있으면 대조군과 같음) · 없으면 400 — 결함 아님", () => {
  const ord = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
    assetId: `o${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "400000000", useEstimatedAcquisition: false,
  }), ...over) as AssetForm;
  const run = async (assets: AssetForm[]) => {
    const f = bundle(assets, { contractTotalPrice: "1200000000" });
    const blocked = allIssues(f).map(String).some((m) => m.includes("첫 번째 자산에서만"));
    const r = await post(f);
    return { blocked, status: r.status, gain: r.status === 200 ? (r.j.data.aggregated.totalTransferGain as number) : undefined, fe: r.status === 400 ? Object.keys(r.j.error.fieldErrors ?? {}) : undefined };
  };
  it("컴패니언 매매사례: ⑧ 차단 · ⑫ 는 실가(fixedAcq) 있으면 200 · 대조군과 양도차익 같음 / 비면 400(fixedAcquisitionPrice)", async () => {
    const control = await run([ord(1), ord(2)]);
    const withFixed = await run([ord(1), ord(2, x({ isSalesCaseAcquisition: true, similarSalesValue: "250000000" }))]);
    const blank = await run([ord(1), ord(2, x({ isSalesCaseAcquisition: true, similarSalesValue: "250000000", fixedAcquisitionPrice: "" }))]);
    expect([control.blocked, control.status]).toEqual([false, 200]);
    expect([withFixed.blocked, withFixed.status, withFixed.gain]).toEqual([true, 200, control.gain]);
    expect([blank.blocked, blank.status, blank.fe]).toEqual([true, 400, ["companionAssets.0.fixedAcquisitionPrice"]]);
  }, 120_000);
  it("주 자산 매매사례는 지원 조합 — ⑧ 이 매매사례 차단을 걸지 않고 ⑫ 200", async () => {
    const r = await run([ord(1, x({ isSalesCaseAcquisition: true, similarSalesValue: "250000000", fixedAcquisitionPrice: "" })), ord(2)]);
    expect([r.blocked, r.status]).toEqual([false, 200]);
  }, 120_000);
});
