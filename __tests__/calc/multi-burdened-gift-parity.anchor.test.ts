/**
 * anchor(④·⑧·⑫·⑭·⑦ 다건) — 부담부증여(소득세법 시행령 §159) 자산을 연간 합산에 넣을 수 있다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 BG · Q-1 a · Q-3 a).
 *
 * 합산 엔진은 부담부증여를 이미 계산한다(엔진 STEP 0.48이 채무 안분으로 양도가액·취득가액을 정한다). 막던 것은 ⑧·⑫와
 * ④·⑭의 `transferType`·`burdenedGiftInfo` 배관, 그리고 양도가액 placeholder(단건 ④ = 인수 채무 합계)였다.
 *
 * 연간 합산 자산은 **각자 다른 증여**다 — 자산별 §159·증여세 명세를 자산 행에 싣는다(BG-4 · 엔진 echo
 * `PerPropertyBreakdown.transferBurdenedGiftBreakdown`, 일반건물은 `generalBuildingDetailsByAsset[자산].burdenedGiftBreakdown`).
 * 묶음(축 B·함께 양도 — `burdenedGiftWholeInfo`)은 물건 전체 1건이 맡으므로 자산별 echo를 싣지 않는다(BG-5 · V-BG1).
 *
 * 일반건물 부담부증여 × 배우자등 이월과세(BG-6 · 트랙 GB-BG-CO): 카드 세트 A·B를 집계 외부 비교 단위로 넘긴다(단건 F27·묶음과 같은 재료) —
 * 연간 합산은 그 해 전체 결정세액으로 비교한다. 1건이면 단건과 같다(B 71,321,800 · A 88,752,400 · 무신고 가산세 포함).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { MULTI_BURDENED_GIFT_WHOLE_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";
import { sameDayBuildingDonorDate } from "../api/_helpers/gb-bg-building-donor-date";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;

function baseForm(asset: Partial<AssetForm>, over: Obj = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2024-06-01", isOneHousehold: false, residencePeriodMonths: "0", contractTotalPrice: "",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true, ...over,
  });
  f.assets = [{ ...makeDefaultAsset(1), ...asset } as AssetForm];
  return f;
}

const form = baseForm;

const BG = {
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgDonorRelation: "lineal_descendant",
} as Partial<AssetForm>;

/** 주택 — 시가 10억 · 인수 채무 3억 · 실지취득가액 4억(단건 38,879,500). */
const BG_HOUSE: Partial<AssetForm> = {
  ...BG, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", addressJibun: "테스트 7", regionCode: "2826010100",
  bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400,000,000",
  standardPriceAtTransfer: "800000000",
};

/** 토지 — 감정가액(문제 20 상황 1 · 단건 2,591,556). */
const BG_LAND: Partial<AssetForm> = {
  ...BG, assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2018-10-20", addressJibun: "테스트 8", regionCode: "2826010100",
  bgMarketValueAtTransfer: "400,000,000", bgMortgageDebtAmount: "80,000,000", bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "250,000,000",
  standardPriceAtTransfer: "320,000,000", standardPriceAtAcq: "180,000,000",
};

/** 일반건물 — 실지취득가액 토지·건물 각 1억(단건 47,245,000 · 일반건물 부담부증여는 실지 경로만). */
const BG_GB: Partial<AssetForm> = {
  ...BG, assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual", gbLandArea: "100", gbBuildingArea: "200",
  gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", addressJibun: "테스트 9", regionCode: "2826010100",
  bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "300,000,000", bgAcquisitionMethod: "actual",
  bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "100,000,000",
};

const CO = {
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: "300000000",
  useEstimatedAcquisition: false, giftTaxAmount: "60000000", donorCapitalExpenditure: "40000000", giftDateValuation: "600000000",
  donorRelation: "spouse" as const, donorSameHousehold: "no" as const,
};

/** 같은 해 나중에 양도한 아파트(단건 87,373,000). */
const APT = form(
  { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000", fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "2826010100" },
  { contractTotalPrice: "900000000", transferDate: "2024-09-01" },
);

async function single(f: TransferFormData) {
  const s = await runSingle(f);
  expect(s.status, JSON.stringify(s.json).slice(0, 400)).toBe(200);
  return s;
}
async function multi(forms: TransferFormData[]) {
  const m = await postMulti(await buildMultiBody(forms));
  expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
  return m;
}
const bgOf = (p: Obj | undefined) => p?.transferBurdenedGiftBreakdown as Obj | undefined;

describe("다건 — 부담부증여(소령 §159)", () => {
  it("[BG-0] ⑧ — 주택·토지·일반건물 부담부증여는 막지 않는다", () => {
    for (const a of [BG_HOUSE, BG_LAND, BG_GB]) expect(validateMultiSupportedMode(form(a)), a.assetKind).toBeNull();
  });

  it("[BG-0b] ④ — 다건 페이로드의 `transferType`·`burdenedGiftInfo`·양도가액 placeholder가 단건 ④와 같다", async () => {
    const f = form(BG_HOUSE);
    const s = await single(f);
    const m = buildPropertyPayload(f) as Obj;
    expect(m.transferType).toBe("burdened_gift");
    expect(m.burdenedGiftInfo).toEqual(s.body.burdenedGiftInfo);
    expect(m.transferPrice).toBe(300_000_000);
    expect(m.transferPrice).toBe(s.body.transferPrice);
    expect(m.burdenedGiftWholeInfo).toBeUndefined();
  });

  it("[BG-1] 🔴 1건 — 단건과 같은 세액 · 같은 자산별 §159 명세(주택 38,879,500 · 토지 2,591,556)", async () => {
    for (const [asset, date, tax] of [[BG_HOUSE, "2024-06-01", 38_879_500], [BG_LAND, "2023-06-01", 2_591_556]] as const) {
      const f = form(asset, { transferDate: date });
      const s = await single(f);
      const m = await multi([f]);
      expect(s.totalTax).toBe(tax);
      expect(m.totalTax).toBe(tax);
      expect(m.props[0].transferGain).toBe(s.r.transferGain);
      expect(bgOf(m.props[0])).toEqual(s.r.transferBurdenedGiftBreakdown);
      expect(bgOf(m.props[0])).toBeDefined();
    }
  }, 60_000);

  it("[BG-2] 🔴 아파트와 함께 — 부담부증여 자산 양도차익 그대로 · 명세는 그 자산 행에만", async () => {
    const m = await multi([form(BG_HOUSE), APT]);
    expect(m.props[0].transferGain).toBe(180_000_000);
    expect(m.props[1].transferGain).toBe(300_000_000);
    expect(m.totalTax).toBe(151_470_000);
    expect(bgOf(m.props[0])).toBeDefined();
    expect(bgOf(m.props[1])).toBeUndefined();
  }, 60_000);

  it("[BG-3] 🔴 일반건물 — 단건과 같은 세액(47,245,000) · 명세는 자산 상세에 1회(카드에는 없다)", async () => {
    const f = form(BG_GB);
    const s = await single(f);
    const m = await multi([f]);
    const sData = s.json.data as Obj;
    expect((sData.aggregated as Obj).totalTax).toBe(47_245_000);
    expect(m.totalTax).toBe(47_245_000);
    const detail = ((m.json.data as Obj).generalBuildingDetailsByAsset as Record<string, Obj>).p1;
    expect(detail.burdenedGiftBreakdown).toEqual(sData.transferBurdenedGiftBreakdown);
    expect(m.props.map((p) => bgOf(p))).toEqual([undefined, undefined]);
    const withApt = await multi([f, APT]);
    expect(withApt.totalTax).toBe(160_446_000);
  }, 60_000);

  it("[BG-4] 주택 부담부증여 × 이월과세 — 단건과 같은 세액(47,746,600)", async () => {
    const f = form({ ...BG_HOUSE, acquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01", carryover: CO, bgCoDonorActualAcquisitionTotal: "300,000,000" });
    expect(validateMultiSupportedMode(f)).toBeNull();
    const s = await single(f);
    const m = await multi([f]);
    expect(s.totalTax).toBe(47_746_600);
    expect(m.totalTax).toBe(s.totalTax);
  }, 60_000);

  it("[BG-5] 엔진 — 묶음 명세(`burdenedGiftWholeInfo`)가 있으면 자산별 echo를 싣지 않는다(V-BG1)", async () => {
    const body = await buildMultiBody([form(BG_HOUSE)]);
    const p = (body.properties as Obj[])[0];
    const item = {
      propertyId: "p1", propertyLabel: "p1", propertyType: "housing", transferPrice: 300_000_000, transferDate: new Date("2024-06-01"),
      acquisitionPrice: 0, acquisitionDate: new Date("2015-03-01"), expenses: 0, useEstimatedAcquisition: false,
      householdHousingCount: 0, residencePeriodMonths: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
      isNonBusinessLand: false, isOneHousehold: false, reductions: [], transferType: "burdened_gift", burdenedGiftInfo: p.burdenedGiftInfo,
    } as unknown as TransferTaxItemInput;
    const rates = makeMockRates();
    const annual = calculateTransferTaxAggregate({ taxYear: 2024, properties: [item], annualBasicDeductionUsed: 0 }, rates);
    expect(annual.properties[0].transferBurdenedGiftBreakdown).toBeDefined();
    expect(annual.burdenedGift).toBeUndefined();
    const bundle = calculateTransferTaxAggregate(
      { taxYear: 2024, properties: [item], annualBasicDeductionUsed: 0, burdenedGiftWholeInfo: p.burdenedGiftInfo as never, burdenedGiftDate: new Date("2024-06-01") },
      rates,
    );
    expect(bundle.properties[0].transferBurdenedGiftBreakdown).toBeUndefined();
    expect(bundle.burdenedGift).toBeDefined();
  });

  it("[BG-6] 🔴 일반건물 부담부증여 × 이월과세 — 단건과 같은 세액(71,321,800) · [A]/[B] 비교 명세 · 묶음 명세 직접 입력은 거부", async () => {
    // 당초 증여자의 건물 취득일(⑧ 필수)은 토지와 같은 날로 채운다(`sameDayBuildingDonorDate`).
    const form = (asset: Partial<AssetForm>, over: Obj = {}) => {
      const f0 = baseForm(asset, over);
      return { ...f0, assets: f0.assets.map(sameDayBuildingDonorDate) };
    };
    const f = form({
      ...BG_GB, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01",
      carryover: { ...CO, donorAcquisitionPrice: "10000000" }, bgCoDonorActualAcquisitionLand: "5,000,000", bgCoDonorActualAcquisitionBuilding: "5,000,000",
    });
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect([0, 1, 2, 3, 4].flatMap((st) => collectStepIssues(st, f))).toEqual([]);
    const s = await single(f);
    const sAgg = (s.json.data as Obj).aggregated as Obj;
    expect(sAgg.totalTax).toBe(71_321_800);
    const m = await multi([f]);
    expect(m.totalTax).toBe(71_321_800);
    const mData = m.json.data as Obj;
    const unit = (mData.burdenedGiftCarryoverUnits as Record<string, Obj>).p1;
    const sDetail = sAgg.burdenedGiftCarryoverDetail as Obj;
    for (const k of ["adoptedScenario", "determinedTaxA", "determinedTaxB", "applicablePeriodYears", "giftTaxAmount"]) expect(unit[k], k).toEqual(sDetail[k]);
    // [A]/[B] 요약 — 다건 카드 id·라벨은 자산 접미사가 붙는다(`land#p1` · `p1 토지`). 금액·기산일만 단건과 같아야 한다.
    const amounts = (sc: unknown) => {
      const { parts, ...dates } = sc as { parts: Obj[] };
      return { ...dates, parts: parts.map(({ acquisitionPrice, transferGain }) => ({ acquisitionPrice, transferGain })) };
    };
    expect(amounts(unit.scenarioA)).toEqual(amounts(sDetail.scenarioA));
    expect(amounts(unit.scenarioB)).toEqual(amounts(sDetail.scenarioB));
    expect([unit.adoptedScenario, unit.determinedTaxA, unit.determinedTaxB]).toEqual(["B", 50_132_000, 64_838_000]);
    expect(((mData.generalBuildingDetailsByAsset as Record<string, Obj>).p1).burdenedGiftBreakdown).toEqual((s.json.data as Obj).transferBurdenedGiftBreakdown);
    const withApt = await multi([f, APT]);
    const aptUnit = ((withApt.json.data as Obj).burdenedGiftCarryoverUnits as Record<string, Obj>).p1;
    expect([withApt.totalTax, (withApt.json.data as Obj).determinedTax, aptUnit.adoptedScenario, aptUnit.determinedTaxA, aptUnit.determinedTaxB]).toEqual([185_790_000, 168_900_000, "B", 153_420_000, 168_900_000]);

    // A 채택 시료 — 증여세·당초 증여자 자본적지출 0이면 A 결정세액이 더 크다(②3호 미발동 → §97의2① 적용).
    const fa = form({
      ...BG_GB, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01",
      carryover: { ...CO, donorAcquisitionDate: "2019-01-01", donorAcquisitionPrice: "10000000", giftTaxAmount: "0", donorCapitalExpenditure: "0" },
      bgCoDonorActualAcquisitionLand: "5,000,000", bgCoDonorActualAcquisitionBuilding: "5,000,000",
    });
    const sa = await single(fa);
    const saAgg = (sa.json.data as Obj).aggregated as Obj;
    const ma = await multi([fa]);
    const maData = ma.json.data as Obj;
    const u = (maData.burdenedGiftCarryoverUnits as Record<string, Obj>).p1;
    expect([ma.totalTax, saAgg.totalTax, u.adoptedScenario, u.determinedTaxA, u.determinedTaxB, u.giftTaxAmount]).toEqual([88_752_400, 88_752_400, "A", 80_684_000, 64_838_000, 0]);
    expect((maData.burdenedGiftCarryoverUnits as Record<string, Obj>).p1.adoptedScenario).toBe((saAgg.burdenedGiftCarryoverDetail as Obj).adoptedScenario);
    expect(((maData.generalBuildingDetailsByAsset as Record<string, Obj>).p1).burdenedGiftBreakdown).toEqual((sa.json.data as Obj).transferBurdenedGiftBreakdown);

    // 무신고 가산세(A 채택) — A 카드의 첫 카드도 가산세 입력·예정신고 세액 base를 받는다(빠지면 A 채택 시 가산세가 0으로 사라진다).
    const fp = { ...fa, enablePenalty: true, filingType: "none" } as TransferFormData;
    const sp = await single(fp);
    const mp = await multi([fp]);
    const spAgg = (sp.json.data as Obj).aggregated as Obj;
    expect(spAgg.penaltyTax).toBeGreaterThan(0);
    expect([(mp.json.data as Obj).penaltyTax, mp.totalTax]).toEqual([spAgg.penaltyTax, spAgg.totalTax]);

    const body = await buildMultiBody([form(BG_HOUSE)]);
    const p = (body.properties as Obj[])[0];
    const whole = await postMulti({ ...body, properties: [{ ...p, burdenedGiftWholeInfo: p.burdenedGiftInfo }] });
    expect(whole.status).toBe(400);
    expect(JSON.stringify(whole.json)).toContain(MULTI_BURDENED_GIFT_WHOLE_UNSUPPORTED_MESSAGE);
  }, 60_000);
});
