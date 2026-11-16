/**
 * anchor — 겸용주택 × 부담부증여 × **함께 양도(컴패니언) 묶음** (MB-6 중 컴패니언 해제 · PR-B 엔진·API 단계).
 *
 * 계획서: docs/00-pm/bg-mixed-use-m2-bundle-share.plan.md §3.2·§5 (Q-3 ① · Q-4 · Q-7).
 *  · Q-3 ①: 묶음 안 겸용 BG는 채무 귀속을 「구분 불분명」만 받는다 — B := 재배분된 `assumedDebtOverride`, 귀속 = {0, 0, B_i}.
 *  · Q-4: 묶음 안 겸용 BG는 보충적평가 승만 계산한다(비보충 승은 400).
 *  · Q-7: 결과는 자산별 슬롯 `aggregated.mixedUseBgDetailsByAsset`에 4부분 breakdown, 증여세는 계약 단위 1회(`aggregated.burdenedGift`).
 *
 * 오라클: 묶음의 자산별 양도차익 합 = 같은 자산을 **단건**으로 각자 계산한 합(각자의 B_i를 자기 채무로 둔 단건). §159①의 신고 단위 단일 채무비율 B/ΣA가
 * 자산별 B_i = B × A_i/ΣA 로 보존되기 때문이다(`apportionCompanionBurdenedGiftDebt`).
 * 시료: 주택(기준시가 6억·취득시 3억·채무 2억) + 겸용(양도시 기준시가 12억 = 주택 6억 + 상가 6억·채무 6억 불분명) — ΣA 18억 · 총채무 8억 · B = [266,666,666, 533,333,334].
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
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;

/** 부담부증여 주택(기준시가 모드) — 양도시 기준시가 6억 · 취득시 3억 */
const house = (id: number, debt: string, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `h${id}`, addressJibun: `제주특별자치도 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000", actualSalePrice: "", standardPriceAtTransfer: "600000000", standardPriceAtAcq: "300000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt, bgMortgageSetAmount: debt,
}), ...over) as AssetForm;

/** 겸용(기준시가 모드) — 주택 100㎡·상가 100㎡ · 양도시 6억 + 상가 6억 · 취득시 3억 + 3억 */
const mixed = (id: number, debt: string, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `m${id}`, addressJibun: `제주특별자치도 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
  isMixedUseHouse: true, mixedAcqPerPartMode: false, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt, bgMortgageAttribution: "unallocated", bgMortgageSetAmount: debt,
}), ...over) as AssetForm;

const FORM = { transferDate: "2024-03-01", filingDate: "2024-05-31", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const bundle = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }, extra)) as TransferFormData;
const single = (a: AssetForm): TransferFormData =>
  rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, { assets: [a], contractTotalPrice: "" })) as TransferFormData;

async function postBody(body: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as Loose };
}
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  return { ...(await postBody(body)), body: body as Loose };
}
/** 단건 양도차익 — 주택은 `result.transferGain`, 겸용은 주택분+상가분 */
const gainOfSingle = (j: Loose): number => {
  const r = j.data.result;
  return r.housingPart ? r.housingPart.transferGain + r.commercialPart.transferGain : r.transferGain;
};

describe("묶음 안 겸용 BG — 오라클: 자산별 단건(자기 채무 = B_i) 합", () => {
  it("[CP-1] 주택 BG(채무 2억) + 겸용 BG(채무 6억 불분명) — ⑧ 통과 · 200 · B_i = [266,666,666, 533,333,334] · 양도차익 합 = 단건 합 · 증여가액 18억", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000")]);
    const issues = allIssues(f);
    expect(issues).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    const agg = r.j.data.aggregated;
    // 재배분 — 컴패니언 겸용에 실린 신고 단위 채무
    expect(r.body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride).toBe(533_333_334);
    expect(r.body.burdenedGiftInfo.assumedDebtOverride).toBe(266_666_666);
    const h1 = await post(single(house(1, "266666666")));
    const m1 = await post(single(mixed(1, "533333334")));
    expect(h1.status).toBe(200);
    expect(m1.status).toBe(200);
    expect(agg.totalTransferGain).toBe(gainOfSingle(h1.j) + gainOfSingle(m1.j));
    // 증여세는 계약 단위 1회 — 증여가액 ΣA = 18억 · 채무 8억
    expect(agg.burdenedGift.giftValuation.max).toBe(1_800_000_000);
    expect(agg.burdenedGift.assumedDebtAmount).toBe(800_000_000);
    // Q-7 — 겸용 자산별 4부분 명세 슬롯(컴패니언 assetId 키) · 증여세는 자산별로 계산하지 않는다(계약 단위 1회 = aggregated.burdenedGift)
    const d = agg.mixedUseBgDetailsByAsset.m2;
    expect(Object.keys(d.perPart).sort()).toEqual(["commercialBuilding", "commercialLand", "housingBuilding", "housingLand"]);
    expect(d.assumedDebtAmount).toBe(533_333_334);
    expect(d.giftTax).toBeUndefined();
    expect(d.debtAttribution).toMatchObject({ housing: 0, commercial: 0, unallocated: 533_333_334 });
    expect(agg.burdenedGift.giftTax).toBeDefined();
    expect(agg.mixedUseBgDetailsByAsset.h1).toBeUndefined();
    expect(r.j.data.aggregated.warnings.some((w: string) => w.includes("함께 양도(여러 물건) 묶음 안의 겸용주택 부담부증여입니다"))).toBe(true);
  });

  it("[CP-2] 주 자산이 겸용 BG · 컴패니언 주택 BG — 같은 오라클 · 명세 슬롯 키 primary", async () => {
    const f = bundle([mixed(1, "600000000"), house(2, "200000000")]);
    expect(allIssues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    const agg = r.j.data.aggregated;
    expect(r.body.burdenedGiftInfo.assumedDebtOverride).toBe(533_333_333);
    const h1 = await post(single(house(1, "266666667")));
    const m1 = await post(single(mixed(1, "533333333")));
    expect(agg.totalTransferGain).toBe(gainOfSingle(h1.j) + gainOfSingle(m1.j));
    expect(agg.mixedUseBgDetailsByAsset.primary.assumedDebtAmount).toBe(533_333_333);
    expect(agg.burdenedGift.giftValuation.max).toBe(1_800_000_000);
  });

  it("[CP-3] 겸용 + 겸용 두 건 — 둘 다 4부분 명세 · 단건 합과 일치", async () => {
    const f = bundle([mixed(1, "300000000"), mixed(2, "600000000")]);
    const issues = allIssues(f);
    expect(issues.filter((m) => !/같은 날 양도하는 주택/.test(m))).toEqual([]);
    const body = await captureBody(f);
    const r = await postBody(body);
    // 같은 날 주택 2채 안내는 ⑧ 전용(양도 순서 입력 경로 없음) — 서버는 막지 않는다
    expect(r.status).toBe(200);
    const agg = r.j.data.aggregated;
    expect(Object.keys(agg.mixedUseBgDetailsByAsset).sort()).toEqual(["m2", "primary"]);
    expect(agg.mixedUseBgDetailsByAsset.primary.assumedDebtAmount + agg.mixedUseBgDetailsByAsset.m2.assumedDebtAmount).toBe(900_000_000);
  });
});

describe("묶음 안 겸용 BG — 시가 모드(⑬ 본문 `housingAppraisal`·`debtAttribution` 전달)", () => {
  const MKT = { bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "actual", bgHousingAppraisalDeclared: "none" };
  it("[CP-10] 주택 시가 7.5억·겸용 시가 15억(구분 감정평가 없음) · 채무 2억 + 6억 → 200 · B_i = [266,666,666, 533,333,334] · 양도차익 합 = 단건 합", async () => {
    const h = (id: number, debt: string) => house(id, debt, x({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "750000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" }));
    const m = (id: number, debt: string) => mixed(id, debt, x({ ...MKT, bgMarketValueAtTransfer: "1500000000", bgActualAcquisitionTotal: "700000000" }));
    const f = bundle([h(1, "200000000"), m(2, "600000000")]);
    expect(allIssues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(r.body.companionAssets[0].burdenedGiftInfo.housingAppraisal).toEqual({ exists: false });
    expect(r.body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride).toBe(533_333_334);
    const h1 = await post(single(h(1, "266666666")));
    const m1 = await post(single(m(1, "533333334")));
    expect(r.j.data.aggregated.totalTransferGain).toBe(gainOfSingle(h1.j) + gainOfSingle(m1.j));
    expect(r.j.data.aggregated.burdenedGift.giftValuation.max).toBe(2_250_000_000);
  });
});

describe("묶음 안 겸용 BG — 증여자 상속 취득(§163⑨ 평가액 = 취득가액)", () => {
  it("[CP-11] 컴패니언 겸용이 상속 취득 · 시가 모드 · 평가액 3.5억씩 → ⑧·⑫ 통과 200 · 단건 합과 일치(⑫ `bgActualAcquisitionMissing` 상속·증여 면제 · 엔진 MB-8·11)", async () => {
    const inh = x({
      bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000", bgHousingAppraisalDeclared: "none", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "",
      acquisitionCause: "inheritance", inheritanceStartDate: "2010-03-15", decedentAcquisitionDate: "2000-01-01",
      mixedHousingInheritedValueOverride: "350000000", mixedCommercialInheritedValueOverride: "350000000",
    });
    const h = (id: number, debt: string) => house(id, debt, x({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "750000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" }));
    const f = bundle([h(1, "200000000"), mixed(2, "600000000", inh)]);
    expect(allIssues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    const ov = [r.body.burdenedGiftInfo.assumedDebtOverride, r.body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride];
    const h1 = await post(single(h(1, String(ov[0]))));
    const m1 = await post(single(mixed(1, String(ov[1]), inh)));
    expect(r.j.data.aggregated.totalTransferGain).toBe(gainOfSingle(h1.j) + gainOfSingle(m1.j));
    expect(r.j.data.aggregated.mixedUseBgDetailsByAsset.m2.deemedCause).toBe("inheritance");
  });
});

describe("묶음 × 공유지분 — 컴패니언·주 자산 겸용이 지분 50%인 함께 양도 (PR-A 단건 규약 위)", () => {
  const SH = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
  it("[CP-8] 컴패니언 겸용 지분 50% · 인수 채무 3억 + 주택 채무 2억 → 200 · B_i = [2.5억, 2.5억] · 양도차익 242,500,006 = 단건 합 · 증여가액 12억(주택 6억 + 겸용 지분분 6억)", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "300000000", SH)]);
    expect(allIssues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    const agg = r.j.data.aggregated;
    expect(r.body.burdenedGiftInfo.assumedDebtOverride).toBe(250_000_000);
    expect(r.body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride).toBe(250_000_000);
    const h1 = await post(single(house(1, "250000000")));
    const m1 = await post(single(mixed(1, "250000000", SH)));
    expect(agg.totalTransferGain).toBe(242_500_006);
    expect(agg.totalTransferGain).toBe(gainOfSingle(h1.j) + gainOfSingle(m1.j));
    expect(agg.burdenedGift.giftValuation.max).toBe(1_200_000_000);
    expect(agg.mixedUseBgDetailsByAsset.m2.ownershipRatio).toBe(0.5);
  });

  it("[CP-9] 주 자산 겸용 지분 50% + 컴패니언 주택 — 같은 오라클", async () => {
    const f = bundle([mixed(1, "300000000", SH), house(2, "200000000")]);
    expect(allIssues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    const ov = [r.body.burdenedGiftInfo.assumedDebtOverride, r.body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride];
    const m1 = await post(single(mixed(1, String(ov[0]), SH)));
    const h1 = await post(single(house(1, String(ov[1]))));
    expect(r.j.data.aggregated.totalTransferGain).toBe(gainOfSingle(h1.j) + gainOfSingle(m1.j));
    expect(r.j.data.aggregated.mixedUseBgDetailsByAsset.primary.ownershipRatio).toBe(0.5);
  });
});

describe("묶음 안 겸용 BG — 막는 조합(Q-3 ① · Q-4 · 축 B)", () => {
  const msgOf = (j: Loose) => JSON.stringify(j?.error ?? j);
  it("[CP-4] 주택·상가 귀속을 입력하면(구분 불분명 외) ⑧·⑫ 모두 막는다(MB-19) — 묶음은 채무를 자산가액 비율로 재배분하므로", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000", x({ bgMortgageAttribution: "housing" }))]);
    expect(allIssues(f).some((m) => m.includes("구분 불분명"))).toBe(true);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(msgOf(r.j)).toContain("채무 귀속을 「구분 불분명」으로만 받습니다");
  });

  it("[CP-5] 비보충 승(담보 승 — 근저당 13억 > 보충 12억)이면 ⑧·⑫ 모두 막는다(MB-20 · Q-4)", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "1300000000")]);
    expect(allIssues(f).length).toBeGreaterThan(0);
    const body = await captureBody(f);
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(msgOf(r.j)).toContain("합산 증여가액이 자산별 평가액의 합과 어긋나");
  });

  it("[CP-6] 직접 API — 재배분 채무(assumedDebtOverride)가 없으면 400(MB-21) · 대조군은 200", async () => {
    const f = bundle([house(1, "200000000"), mixed(2, "600000000")]);
    const body = (await captureBody(f)) as Loose;
    expect((await postBody(body)).status).toBe(200);
    delete body.companionAssets[0].burdenedGiftInfo.assumedDebtOverride;
    const r = await postBody(body);
    expect(r.status).toBe(400);
    expect(msgOf(r.j)).toContain("재배분한 채무");
  });

  it("[CP-7] 축 B(같은 물건 지분 60/40 분할 취득)는 계속 막는다(MB-6 · PR-C) — ⑧·⑫", async () => {
    const f = rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), FORM, {
      assets: [mixed(1, "600000000", x({ ownershipNumerator: "60", ownershipDenominator: "100" })), mixed(2, "600000000", x({ ownershipNumerator: "40", ownershipDenominator: "100" }))],
      contractTotalPrice: "", assetSplitMode: "fractional",
    })) as TransferFormData;
    expect(allIssues(f).some((m) => m.includes("지분 분할 취득"))).toBe(true);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(msgOf(r.j)).toContain("지분 분할 취득");
  });
});


/** 파트 카드 leaf — 겸용 엔진(`calcMixedUseTransferTax`)을 BG로 1회 돌려 카드 4장으로 펼친다. 카드 집계 = 단건 × 1.1(지방소득세). */
describe("파트 카드 leaf — BG 키 중화", () => {
  const TD = new Date("2024-03-01");
  const ACQ = new Date("2010-03-15");
  const info = {
    valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, marketValueAtTransfer: 1.5e9,
    acquisitionMethod: "actual", actualAcquisitionTotal: 700e6, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1.2e9, landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 450e6 + 2_500_000 * 50 + 25e6, donorRelation: "lineal_descendant",
    debtAttribution: { housing: 0, commercial: 0, unallocated: 600e6 }, housingAppraisal: { exists: false },
  } as BurdenedGiftInfo;
  const a = {
    isMixedUseHouse: true, residentialFloorArea: 150, nonResidentialFloorArea: 50, buildingFootprintArea: 100, totalLandArea: 200, landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: 900e6, commercialBuildingPrice: 50e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 150e6 },
    acquisitionStandardPrice: { housingPrice: 450e6, commercialBuildingPrice: 25e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 75e6 },
    residencePeriodYears: 10, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: true, acquisitionCause: "purchase", burdenedGift: info,
  } as MixedUseAssetInput;
  const rates = makeMockRates() as never;
  it("[CP-0] 카드 4장은 BG 키(burdenedGiftInfo·transferType)를 갖지 않고, 집계 총세액 8,632,800 = 단건 7,848,000 × 1.1 (BG 키가 남으면 190,014,000)", () => {
    const ce = {
      propertyType: "housing", transferPrice: 1, acquisitionPrice: 0, expenses: 0, acquisitionDate: ACQ, transferDate: TD, isOneHousehold: true, householdHousingCount: 1,
      residencePeriodMonths: 120, isRegulatedArea: false, wasRegulatedAtAcquisition: false, reductions: [], acquisitionCause: "purchase", burdenedGiftInfo: info, transferType: "burdened_gift",
    } as never;
    const single = calcMixedUseTransferTax(1, TD, a, rates);
    expect(single.total.determinedTax).toBe(7_848_000);
    const cards = buildMixedUsePartCards(ce, a, 1, TD, rates, "asset-2", "겸용");
    for (const c of cards) {
      expect((c as Loose).burdenedGiftInfo).toBeUndefined();
      expect((c as Loose).transferType).toBeUndefined();
    }
    const agg = calculateTransferTaxAggregate({ taxYear: 2024, properties: cards, annualBasicDeductionUsed: 0, priorReductionUsage: [] } as never, rates);
    expect((agg as Loose).totalTax).toBe(8_632_800);
  });
});
