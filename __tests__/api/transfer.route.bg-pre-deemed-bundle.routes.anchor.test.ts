/**
 * PR-7b-5 — 함께 양도(컴패니언)·지분 분할 취득(축 B) × 의제취득일(1985.1.1.) 전 상속 × 부담부증여 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * D-1(사용자 결정 Q-33): 묶음 결과의 §159 명세는 증여세 때문에 물건 전체를 다시 계산하는데(M-0.5) 의제취득일 전 규칙을 몰라 취득가액을
 * 시가 평가면 0, 기준시가 평가면 등급 환산 전 칸 값으로 그렸다 — 세액에 쓰인 카드별 값과 달랐다. → 의제 카드가 있으면 카드별 결과 합 + 카드별 명세.
 * B-3/D-2(Q-34): 축 B에서 첫 지분이 의제취득일 전 상속이고 다른 지분이 매매면 산정방식을 받을 곳이 없었다(⑤ 숨김 · ⑧·⑫ 요구) — ⑤ 재노출.
 * 세액은 바뀌지 않는다(카드별 엔진은 PR-7a부터 단건과 같다).
 *
 * 시료(PR-7a 토지 · 계획서 §2.1): 184.2㎡ · 1983-07-26 상속 · 2023-02-16 부담부증여 · 채무 460,000,000 · 양도시 기준시가 1,243,350,000 ·
 * 칸 202,620,000 · 시가 920,000,000 · 등급 218/218/200 · 1990 단가 1,100,000. 지분은 50/50. 세율은 mock.
 */
import { describe, expect, it, vi } from "vitest";

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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { bgFractionalHasOutOfScopeShare } from "@/lib/calc/bg-pre-deemed-shares";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const LAND: Record<string, unknown> = {
  assetKind: "land",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "460000000",
  standardPriceAtTransfer: "1243350000",
  standardPriceAtAcq: "202620000",
  acquisitionArea: "184.2",
  transferArea: "184.2",
  landNature: "standalone",
};
const GRADE = { pre1990Enabled: true, pre1990Grade_current: "218", pre1990Grade_prev: "218", pre1990Grade_atAcq: "200", pre1990PricePerSqm_1990: "1100000", pre1990PricePerSqm_atTransfer: "6750000", pre1990GradeMode: "number" };
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000" };
const STD = { bgValuationMode: "sangjeungbeop_standard" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", addressJibun: "서울 A 1" };
const PURCHASE = { acquisitionCause: "purchase", acquisitionDate: "1990-07-26", inheritanceStartDate: "" };

const form = (assets: Record<string, unknown>[], contractTotalPrice: string): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    contractTotalPrice,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...LAND, ...a }) as AssetForm),
  }) as TransferFormData;

const companion = (a: Record<string, unknown>) =>
  form([{ ...a, addressJibun: "서울 A 1", actualSalePrice: "920000000" }, { ...a, addressJibun: "서울 B 2", actualSalePrice: "920000000" }], "1840000000");

async function run(f: TransferFormData) {
  const fields = allIssues(f).map((i: { field?: string }) => i.field);
  const r = await postTransfer(await captureBody(f));
  const d = r.json?.data as { transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown; aggregated?: { determinedTax: number; properties: { acquisitionPrice: number }[] } } | undefined;
  const bg = d?.transferBurdenedGiftBreakdown;
  return {
    fields,
    status: r.status,
    bg,
    shown: bg ? bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice : undefined,
    cardSum: (d?.aggregated?.properties ?? []).reduce((s, p) => s + p.acquisitionPrice, 0),
    props: (d?.aggregated?.properties ?? []).map((p) => p.acquisitionPrice),
    tax: d?.aggregated?.determinedTax,
  };
}

describe("D-1 묶음 §159 명세 — 의제 카드가 있으면 카드별 결과 합 (Q-33)", () => {
  it("D1-a 컴패니언 · 시가 ① 3억 × 2 → 명세 취득가액 300,000,000(종전 0) = 카드 합 · 카드별 3자 max 명세 · 세액 146,660,000 그대로", async () => {
    const r = await run(companion({ ...MARKET, publishedValueAtInheritance: "300000000" }));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.shown).toBe(300_000_000);
    expect(r.shown).toBe(r.cardSum);
    expect(r.bg?.cards?.map((c) => c.breakdown.preDeemed?.selected)).toEqual(["reported", "reported"]);
    expect(r.tax).toBe(146_660_000);
  });

  it("D1-b 컴패니언 · 기준시가 · 토지 등급 × 2 → 62,482,582(종전 칸 값 149,925,925) · 카드별 deemed_std", async () => {
    const r = await run(companion({ ...STD, ...GRADE }));
    expect(r.fields).toEqual([]);
    expect(r.shown).toBe(62_482_582);
    expect(r.shown).toBe(r.cardSum);
    expect(r.bg?.cards?.map((c) => c.breakdown.preDeemed?.basis)).toEqual(["deemed_std", "deemed_std"]);
    expect(r.tax).toBe(214_569_025);
  });

  it("D1-c 축 B · 상속 + 상속 · 시가 ① 1.5억씩 → 75,000,000(종전 0)", async () => {
    const r = await run(form([{ ...MARKET, ...HALF, publishedValueAtInheritance: "150000000" }, { ...MARKET, ...HALF, publishedValueAtInheritance: "150000000" }], "920000000"));
    expect(r.fields).toEqual([]);
    expect(r.shown).toBe(75_000_000);
    expect(r.shown).toBe(r.cardSum);
    expect(r.tax).toBe(81_520_000);
  });

  it("D1-d 축 B · [상속 등급 · 매매] 기준시가 → 53,102,126(종전 74,962,962) · 카드별 기준 deemed_std / standard_price", async () => {
    const r = await run(form([{ ...STD, ...GRADE, ...HALF }, { ...STD, ...HALF, ...PURCHASE }], "920000000"));
    expect(r.fields).toEqual([]);
    expect(r.props).toEqual([15_620_645, 37_481_481]);
    expect(r.shown).toBe(53_102_126);
    expect(r.bg?.cards?.map((c) => c.breakdown.preDeemed?.basis ?? c.breakdown.acquisitionMethodUsed)).toEqual(["deemed_std", "standard_price"]);
    expect(r.tax).toBe(86_921_080);
  });

  it("D1-e 축 B(매매 + 매매)는 의제 카드가 없어도 카드별 — 지분 값이 같아 합은 종전 물건 전체 값과 같다(74,962,962)", async () => {
    // 종전에는 「cards 없음」을 고정했다 — 축 B는 늘 카드별로 바뀌었다(`bg-axis-b-card-acquisition-sum.plan.md` Q-1 a).
    const r = await run(form([{ ...STD, ...HALF, ...PURCHASE }, { ...STD, ...HALF, ...PURCHASE }], "920000000"));
    expect(r.fields).toEqual([]);
    expect(r.bg?.cards?.map((c) => c.breakdown.acquisitionMethodUsed)).toEqual(["standard_price", "standard_price"]);
    expect(r.shown).toBe(74_962_962);
    expect(r.shown).toBe(r.cardSum);
  });

  it("D1-f 대조 — 함께 양도(다른 물건) · 의제 카드 없음은 종전 그대로(cards 없음)", async () => {
    const r = await run(companion({ ...STD, ...PURCHASE }));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.bg).toBeDefined();
    expect(r.bg?.cards).toBeUndefined();
  });
});

describe("B-3/D-2 축 B · 의제 지분 + 범위 밖 지분 — 첫 카드에서 산정방식을 받는다 (Q-34)", () => {
  const shares = (first: Record<string, unknown>) =>
    form([{ ...MARKET, ...HALF, publishedValueAtInheritance: "150000000", ...first }, { ...MARKET, ...HALF, ...PURCHASE }], "920000000");

  it("D2-a 산정방식이 없으면 ⑧이 자산 2를 요구한다(첫 카드가 그 칸을 다시 보인다 — 화면 테스트)", async () => {
    const r = await run(shares({}));
    expect(r.fields).toContain("bgAcquisitionMethod");
  });

  it("D2-b 첫 카드에서 실지(토지 2억)를 고르면 매매 지분은 그 값(× β × 지분), 의제 지분은 3자 max — 37,500,000 / 50,000,000", async () => {
    const r = await run(shares({ bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "200000000" }));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.props).toEqual([37_500_000, 50_000_000]);
    expect(r.bg?.cards?.map((c) => c.breakdown.preDeemed?.basis ?? c.breakdown.acquisitionMethodUsed)).toEqual(["three_way", "actual"]);
    expect(r.shown).toBe(87_500_000);
  });

  it("D2-c 판정 — 의제 지분만이면 false · 범위 밖 지분이 섞이면 true · 지분 1개는 false", () => {
    const asAssets = (f: TransferFormData) => f.assets;
    expect(bgFractionalHasOutOfScopeShare(asAssets(form([{ ...MARKET, ...HALF }, { ...MARKET, ...HALF }], "920000000")))).toBe(false);
    expect(bgFractionalHasOutOfScopeShare(asAssets(shares({})))).toBe(true);
    expect(bgFractionalHasOutOfScopeShare(asAssets(form([{ ...MARKET }], "920000000")))).toBe(false);
  });
});

describe("엔진 합산 — `withCardAcquisitions` (토지·건물 · 개산공제)", () => {
  it("E-1 의제 카드가 있으면 토지·건물 취득가액·개산공제가 카드 합이고 cards를 싣는다 · 나머지(증여세 등)는 물건 전체 값 그대로", async () => {
    const { withCardAcquisitions } = await import("@/lib/tax-engine/transfer-tax-aggregate-burdened-gift");
    const part = (acq: number, ded: number) => ({ acquisitionPrice: acq, estimatedDeduction: ded });
    const whole = { perAsset: { land: { ...part(1, 1), transferPrice: 9 }, building: { ...part(2, 2), transferPrice: 8 } }, gratuitousPortion: 777 } as unknown as TransferBurdenedGiftBreakdown;
    const card = (l: number, b: number, d: number, pre: boolean) =>
      ({ perAsset: { land: part(l, d), building: part(b, d * 2) }, ...(pre ? { preDeemed: { basis: "deemed_std", stdAtDeemed: 1 } } : {}) }) as unknown as TransferBurdenedGiftBreakdown;
    const rec = (id: string, b: TransferBurdenedGiftBreakdown) => ({ item: { propertyId: id, propertyLabel: id }, result: { transferBurdenedGiftBreakdown: b } });
    const out = withCardAcquisitions(whole, [rec("a", card(10, 20, 3, true)), rec("b", card(100, 200, 5, false))]);
    expect(out?.perAsset.land).toMatchObject({ acquisitionPrice: 110, estimatedDeduction: 8, transferPrice: 9 });
    expect(out?.perAsset.building).toMatchObject({ acquisitionPrice: 220, estimatedDeduction: 16, transferPrice: 8 });
    expect(out?.gratuitousPortion).toBe(777);
    expect(out?.cards?.map((c) => c.propertyId)).toEqual(["a", "b"]);
    // 의제 카드가 없으면 그대로(같은 객체)
    expect(withCardAcquisitions(whole, [rec("b", card(100, 200, 5, false))])).toBe(whole);
  });
});

describe("경계 — 카드 명세가 세액 값을 다 담지 못하는 묶음은 종전 표시 그대로(리뷰 게이트 반영)", () => {
  it("G-1 함께 양도 [의제 토지 기준시가 + 일반건물] — 일반건물 파트 카드엔 §159 명세가 없다 → cards 없음 · 종전 값 97,999,816 · 세액 67,976,514", async () => {
    const BG_STD = { transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "200,000,000" };
    const gb = {
      ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 2-2", assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
      gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
      gbBuildingAcquisitionCause: "purchase", ...BG_STD,
    };
    const landA = { ...makeDefaultAsset(1), ...LAND, ...GRADE, addressJibun: "서울 A 1", ...BG_STD, bgMortgageDebtAmount: "200000000" };
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-03-01", filingDate: "2026-05-31", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, assetSplitMode: "companion", contractTotalPrice: "",
      assets: [landA as AssetForm, gb as AssetForm],
    }) as TransferFormData;
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.bg?.cards).toBeUndefined();
    expect(r.shown).toBe(97_999_816);
    expect(r.tax).toBe(67_976_514);
  });

  it("G-2 함께 양도 [매매 주택 + 재개발 의제(① 1억 → ③ §166③)] — §166 경로 취득가액이 §159 슬롯과 다르다 → cards 없음 · 세액 31,552,700", async () => {
    const REDEV = {
      addressJibun: "서울 B 2", assetKind: "redevelopment_apt", actualSalePrice: "525,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
      redevApprovalDate: "2009-10-23", redevRightsValue: "219,218,500", redevSettlementDirection: "pay", redevSettlementAmount: "92,781,500", redevCompletionDate: "2012-09-01",
      redevManagementDisposalHousingPrice: "132,000,000", redevAcquisitionHousingPrice: "85,034,988", acquisitionCause: "inheritance", acquisitionDate: "1980-01-01",
      inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01", inheritanceAssetKind: "house_individual", transferType: "burdened_gift",
      bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "400,000,000", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "525,000,000",
      bgMortgageDebtAmount: "210,000,000", publishedValueAtInheritance: "100,000,000",
    };
    const HOUSING = {
      addressJibun: "서울 A 1", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01", transferType: "burdened_gift",
      bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000", bgMortgageDebtAmount: "120,000,000",
      bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000", standardPriceAtTransfer: "200,000,000",
    };
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: "825000000",
      assets: [{ ...makeDefaultAsset(1), ...HOUSING } as AssetForm, { ...makeDefaultAsset(2), ...REDEV } as AssetForm],
    }) as TransferFormData;
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.bg?.cards).toBeUndefined();
    expect(r.tax).toBe(31_552_700);
  });
});
