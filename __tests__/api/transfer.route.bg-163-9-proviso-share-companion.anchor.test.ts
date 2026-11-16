/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후) — 함께 양도 컴패니언 · 축 B 지분 카드의 ② §164 가액.
 * 계획서 docs/00-pm/bg-163-9-proviso-post-deemed.plan.md §11(§8 「남은 것」 측정).
 *
 * 오라클 = 지분율 × 채무비율 × (시가 − max(① 평가액, ② §164 가액)) — ① · ②는 물건 전체 기준 입력, 지분율은 시스템이 곱한다.
 * 화면 경로(⑧ 0건 · ④ 본문 · ⑫ · ⑭)로 계산한다. 세율은 mock — 양도차익으로 본다.
 */
import { describe, expect, it, vi } from "vitest";
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
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
type A = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LAND_BASE: A = { assetKind: "land", acquisitionArea: "100", transferArea: "100", landAreaM2: "100", landNature: "independent", companionLandNature: "independent", standardPriceAtTransfer: "300000000" };
/** 상속 1988-06-01(단서 1호) · §164④ = 238,883,100(1990 ㎡당 500만 · 등급 100/90/80 · 양도시 기준시가 3억) */
const INH_LAND: A = { acquisitionCause: "inheritance", acquisitionDate: "1988-06-01", inheritanceStartDate: "1988-06-01", decedentAcquisitionDate: "1980-01-01", inheritanceValuationMethod: "supplementary" };
const SEC164_4: A = { pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000", pre1990Grade_current: "100", pre1990Grade_prev: "90", pre1990Grade_atAcq: "80" };
const NO_164: A = { pre1990Enabled: false, pre1990PricePerSqm_1990: "", pre1990Grade_current: "", pre1990Grade_prev: "", pre1990Grade_atAcq: "" };
const PUR: A = { acquisitionCause: "purchase", acquisitionDate: "2015-01-01" };
const bg = (market: string, debt: string, landField: boolean): A => ({
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: market,
  bgMortgageDebtAmount: debt, bgMortgageSetAmount: debt, bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual",
  [landField ? "bgActualAcquisitionLand" : "bgActualAcquisitionTotal"]: "100000000",
});
const mk = (n: number, id: string, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, { assetId: id, addressJibun: `제주특별자치도 테스트동 ${id}` }, ...o) as AssetForm;
const form = (assets: AssetForm[], over: A) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets, contractTotalPrice: "", ...over,
  }))) as TransferFormData;

async function gains(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as A;
  expect(res.status, JSON.stringify(j.error ?? null)).toBe(200);
  return (j.data.aggregated.properties as A[]).map((p) => p.transferGain as number);
}

describe("BGPC — 함께 양도 컴패니언(상속 토지 1988 · 시가 5억 · 채무 2억)", () => {
  const purchase = mk(1, "p", LAND_BASE, PUR, bg("500000000", "200000000", true), { actualSalePrice: "500000000" });
  const inherited = (...o: A[]) => mk(2, "c", LAND_BASE, INH_LAND, bg("500000000", "200000000", true), { actualSalePrice: "500000000" }, ...o);
  it("BGPC-1 컴패니언 — 2/5 × (5억 − max(1억, 238,883,100)) = 104,446,760 (단건과 같다)", async () => {
    expect(await gains(form([purchase, inherited(SEC164_4)], { contractTotalPrice: "1000000000" }))).toEqual([160_000_000, 104_446_760]);
  });
  it("BGPC-2 순서를 바꿔 주 자산이어도 같다", async () => {
    const asPrimary = mk(1, "c", LAND_BASE, INH_LAND, bg("500000000", "200000000", true), SEC164_4, { actualSalePrice: "500000000" });
    const asCompanion = mk(2, "p", LAND_BASE, PUR, bg("500000000", "200000000", true), { actualSalePrice: "500000000" });
    expect(await gains(form([asPrimary, asCompanion], { contractTotalPrice: "1000000000" }))).toEqual([104_446_760, 160_000_000]);
  });
  it("BGPC-3 ② 칸을 비우면 평가액만(Q-25 a) — 160,000,000", async () => {
    expect(await gains(form([purchase, inherited(NO_164)], { contractTotalPrice: "1000000000" }))).toEqual([160_000_000, 160_000_000]);
  });
});

/** 축 B 60/40 · 시가 10억 · 채무 4억(0.4) · 자산 1 매매 실지 1억 → 0.6 × 0.4 × 9억 = 216,000,000. 지분 2는 상속 · 토글 켬 · 실지 1억(물건 전체). */
const KINDS: { name: string; base: A; share: A; blank: A; land: boolean; expected: number }[] = [
  { name: "토지 §164④ 238,883,100", base: LAND_BASE, share: { ...INH_LAND, ...SEC164_4 }, blank: NO_164, land: true, expected: 121_778_704 },
  {
    name: "단독주택 §164⑦ 173,076,923(증여 2005-04-29)",
    base: { assetKind: "housing", acquisitionArea: "200", transferArea: "200", standardPriceAtTransfer: "800000000" },
    share: {
      acquisitionCause: "gift", acquisitionDate: "2005-04-29", donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other", giftSameHousehold: "no", inheritanceAssetKind: "house_individual",
      inhHouseValLandArea: "200", inhHouseValLandPricePerSqmAtTransfer: "3000000", inhHouseValLandPricePerSqmAtFirst: "1000000", inhHouseValHousePriceAtFirst: "300000000",
      inhHouseValLandPricePerSqmAtInheritance: "500000", inhHouseValBuildingStdPriceAtFirst: "60000000", inhHouseValBuildingStdPriceAtInheritance: "50000000",
    },
    blank: { inhHouseValLandArea: "", inhHouseValLandPricePerSqmAtTransfer: "", inhHouseValLandPricePerSqmAtFirst: "", inhHouseValHousePriceAtFirst: "", inhHouseValLandPricePerSqmAtInheritance: "", inhHouseValBuildingStdPriceAtFirst: "", inhHouseValBuildingStdPriceAtInheritance: "" },
    land: false, expected: 132_307_693,
  },
  {
    name: "건물 §164⑤ 2억(상속 1999)",
    base: { assetKind: "building", standardPriceAtTransfer: "300000000" },
    share: { acquisitionCause: "inheritance", acquisitionDate: "1999-06-01", inheritanceStartDate: "1999-06-01", decedentAcquisitionDate: "1980-01-01", inheritanceValuationMethod: "supplementary", inhBuildingSec164Value: "200000000" },
    blank: { inhBuildingSec164Value: "" }, land: false, expected: 128_000_000,
  },
];

describe("BGPS — 축 B 상속 · 증여 지분 카드(토글 켬)의 ② §164 가액", () => {
  for (const k of KINDS) {
    const p = mk(1, "p", k.base, PUR, bg("1000000000", "400000000", k.land), { actualSalePrice: "1000000000", ownershipNumerator: "60", ownershipDenominator: "100" });
    const s = (...o: A[]) => mk(2, "s", { ownershipNumerator: "40", ownershipDenominator: "100", bgShareOwnAcquisition: true, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100000000", bgActualAcquisitionTotal: "100000000" }, k.share, ...o);
    const AB = { assetSplitMode: "fractional", contractTotalPrice: "1000000000" };
    it(`${k.name} — 지분 2 = 0.4 × 0.4 × (10억 − ②) = ${k.expected.toLocaleString()}`, async () => {
      expect(await gains(form([p, s()], AB))).toEqual([216_000_000, k.expected]);
    });
    it(`${k.name} — ② 칸을 비우면 평가액만: 0.16 × 9억 = 144,000,000`, async () => {
      expect(await gains(form([p, s(k.blank)], AB))).toEqual([216_000_000, 144_000_000]);
    });
  }
  it("상가 §164⑥ 509,090,909(상속 2003 · 면적 3칸은 자산 1 · 취득 쪽 5칸은 지분 카드) — 0.16 × (10억 − 509,090,909) = 78,545,455", async () => {
    // 지분 카드 ③ §164⑥ 섹션에 보이는 칸이 지분 값이다(`commercial-share-object-fields.ts` — 2026-11-16 전에는 자산 1 값으로 덮여 ⑧ 「누락」이었다).
    const ACQ = { cbUnitPriceAtFirstOrAcq: "10000000", cbLandPricePerSqmAtAcq: "500000", cbLandPricePerSqmAtFirst: "700000", cbBuildingStdPriceAtAcq: "30000000", cbBuildingStdPriceAtFirst: "40000000", cbAcqBuildingStdBy164_5: true };
    const p = mk(1, "p", { assetKind: "commercial_building", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000", cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100" }, PUR, bg("1000000000", "400000000", false),
      { actualSalePrice: "1000000000", ownershipNumerator: "60", ownershipDenominator: "100" });
    const s = mk(2, "s", { ownershipNumerator: "40", ownershipDenominator: "100", bgShareOwnAcquisition: true, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100000000" },
      { acquisitionCause: "inheritance", acquisitionDate: "2003-06-01", inheritanceStartDate: "2003-06-01", decedentAcquisitionDate: "1990-01-01", ...ACQ });
    expect(await gains(form([p, s], { assetSplitMode: "fractional", contractTotalPrice: "1000000000" }))).toEqual([216_000_000, 78_545_455]);
  });
});
