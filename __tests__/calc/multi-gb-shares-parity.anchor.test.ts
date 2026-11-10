/**
 * anchor(④·⑧·⑫·⑭·⑦ 다건) — 일반건물 지분 분할 취득을 연간 합산에 넣을 수 있다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 GS · Q-1 a · Q-2 a).
 *
 * 단건은 지분마다 토지·건물 카드를 만들어 합산 엔진을 1회 부른다(`calculateGeneralBuildingFractional`). 연간 합산 펼침은 같은 지분 조각
 * (`buildSharePiece`)·같은 지분 양도가액(`shareTransferPrices`)·같은 결과 상세 조립(`assembleShareDetail`)으로 카드를 만든다.
 * 카드 id 접미사는 복합 `<자산id>.<지분번호>`다(Q-2 a) — `cardSuffixOf`는 자산 부분(결과 행 묶음·자산 상세 키),
 * `shareIndexOf`는 지분 번호(지분 짝·지분 echo 키)를 돌려준다. 단건 축 B(`land#0`)·함께 양도(`land#asset-…`)는 점이 없어 종전 그대로다.
 *
 * 지분 × 부담부증여(GS-6)는 단건과 같은 지분 §159 카드로 펼치고, 물건 전체 §159·증여세 명세(`burdenedGiftWholeInfo`)를 결과 상세에 1회 싣는다(트랙 GS-BG).
 * 지분 × 부담부증여 × 이월과세(GS-6b · 트랙 GB-BG-CO): 지분별 A·B 비교 단위(키 = 복합 접미사)로 펼친다 — 단건 지분 경로와 같은 조각 함수.
 * 지분 × 이월과세(지분 자산 단위·건물만)는 단건과 같아 막지 않는다(GS-5).
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
import { MULTI_COMPANION_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { cardSuffixOf, shareIndexOf, isSameShare, shareCardSuffix, baseCardId } from "@/lib/tax-engine/general-building-share-id";
import { gbAssetBlockView } from "@/components/calc/results/transfer/gb-result-block-views";
import { multiFormAssetOf, multiFormPropertyIdOf } from "@/components/calc/results/transfer/multi-result-groups";
import { gbFormulaInputsOf } from "@/components/calc/results/transfer/DetailedStatementGbAsset";
import { gbCarryoverAcqDateOverride } from "@/components/calc/results/transfer/FilingFormTableDateHelpers";
import { sameDayBuildingDonorDate } from "../api/_helpers/gb-bg-building-donor-date";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;

/** 일반건물 10억 · 토지 100㎡ · 건물 200㎡ · 환산 — 지분 60%(2009 취득) + 40%(2015 취득). 단건 132,951,280. */
const GB: Partial<AssetForm> = {
  assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", useEstimatedAcquisition: true,
  landAcqMode: "estimated", buildingAcqMode: "estimated", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
  gbZoneType: "general_residential", addressJibun: "테스트 9", regionCode: "2826010100", actualSalePrice: "1000000000",
};

function sharesForm(share2: Partial<AssetForm> = {}, share1: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2024-06-01", isOneHousehold: false, residencePeriodMonths: "0", contractTotalPrice: "1000000000",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true, assetSplitMode: "fractional",
  });
  f.assets = [
    { ...makeDefaultAsset(1), ...GB, acquisitionDate: "2009-03-01", ownershipNumerator: "60", ownershipDenominator: "100", ...share1 } as AssetForm,
    { ...makeDefaultAsset(2), ...GB, acquisitionDate: "2015-03-01", ownershipNumerator: "40", ownershipDenominator: "100", ...share2 } as AssetForm,
  ];
  return f;
}

/** 같은 해 나중에 양도한 아파트(단건 87,373,000). */
const APT = (() => {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2024-09-01", isOneHousehold: false, residencePeriodMonths: "0", contractTotalPrice: "900000000",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true,
  });
  f.assets = [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000", fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "2826010100" } as AssetForm];
  return f;
})();

const CO = {
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: "10000000",
  useEstimatedAcquisition: false, giftTaxAmount: "0", donorCapitalExpenditure: "", giftDateValuation: "300000000",
  donorRelation: "spouse" as const, donorSameHousehold: "no" as const,
};

async function single(f: TransferFormData) {
  const s = await runSingle(f);
  expect(s.status, JSON.stringify(s.json).slice(0, 400)).toBe(200);
  return { ...s, aggregated: (s.json.data as Obj).aggregated as Obj };
}
async function multi(forms: TransferFormData[]) {
  const m = await postMulti(await buildMultiBody(forms));
  expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
  return m;
}
const gainsOf = (rows: Obj[]) => rows.map((p) => p.transferGain);
const withBuildingDonorDate = (f: TransferFormData): TransferFormData => ({ ...f, assets: f.assets.map(sameDayBuildingDonorDate) });

describe("다건 — 일반건물 지분 분할 취득", () => {
  it("[GS-0] 카드 접미사 정본 — 복합 `<자산id>.<지분번호>`는 자산·지분을 따로 읽고, 단건 축 B·함께 양도는 종전 그대로", () => {
    const id = `land#${shareCardSuffix("prop-1700000000-3", 1)}`;
    expect(id).toBe("land#prop-1700000000-3.1");
    expect(cardSuffixOf(id)).toBe("prop-1700000000-3");
    expect(shareIndexOf(id)).toBe(1);
    expect(baseCardId(id)).toBe("land");
    expect(isSameShare(id, "building#prop-1700000000-3.1")).toBe(true);
    expect(isSameShare(id, "building#prop-1700000000-3.0")).toBe(false);
    expect(multiFormPropertyIdOf(id)).toBe("prop-1700000000-3");
    // 종전 규약
    expect([cardSuffixOf("land#0"), shareIndexOf("land#0")]).toEqual(["0", 0]);
    expect([cardSuffixOf("land#asset-1700000000-2"), shareIndexOf("land#asset-1700000000-2")]).toEqual(["asset-1700000000-2", undefined]);
    expect([cardSuffixOf("land"), shareIndexOf("land")]).toEqual([undefined, undefined]);
  });

  it("[GS-1] ⑧ — 일반건물 전 지분 묶음은 막지 않는다 · 그 밖의 한 건 내 다자산은 계속 막는다", () => {
    expect(validateMultiSupportedMode(sharesForm())).toBeNull();
    const companion = sharesForm();
    companion.assetSplitMode = "companion";
    expect(validateMultiSupportedMode(companion)).toBe(MULTI_COMPANION_UNSUPPORTED_MESSAGE);
    // 둘째 지분에만 있는 차단 사유도 그 지분 규칙으로 막는다(첫 자산만 보면 새어 나간다).
    const share2Reduction = sharesForm({ reductions: [{ type: "unsold_98" } as never] });
    expect(validateMultiSupportedMode(share2Reduction)).toBe(MULTI_RATE_SPECIAL_REDUCTION_UNSUPPORTED_MESSAGE);
  });

  it("[GS-2] ④ — 다건 페이로드의 `generalBuildingShares`가 단건 ④와 같다", async () => {
    const f = sharesForm();
    const s = await single(f);
    const m = buildPropertyPayload(f) as Obj;
    expect(m.generalBuildingShares).toEqual(s.body.generalBuildingShares);
    expect((m.generalBuildingShares as unknown[]).length).toBe(2);
  });

  it("[GS-3] 🔴 1건 — 단건과 같은 세액·같은 카드 양도차익(132,951,280) · 카드 id는 복합 접미사", async () => {
    const f = sharesForm();
    const s = await single(f);
    const m = await multi([f]);
    expect(s.aggregated.totalTax).toBe(132_951_280);
    expect(m.totalTax).toBe(132_951_280);
    expect(gainsOf(m.props)).toEqual(gainsOf(s.aggregated.properties as Obj[]));
    expect(m.props.map((p) => p.propertyId)).toEqual(["land#p1.0", "building#p1.0", "land#p1.1", "building#p1.1"]);
  }, 60_000);

  it("[GS-4] 🔴 아파트와 함께 — 지분 카드 양도차익 그대로(251,993,544)", async () => {
    const m = await multi([sharesForm(), APT]);
    expect(m.totalTax).toBe(251_993_544);
    expect(gainsOf(m.props)).toEqual([148_200_000, 148_200_000, 98_800_000, 98_800_000, 300_000_000]);
  }, 60_000);

  it("[GS-5] 지분 × 이월과세 — 단건과 같은 세액(지분 전체 182,393,200 · 건물만 157,672,240)", async () => {
    const cases: [Partial<AssetForm>, number][] = [
      [{ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01", carryover: CO }, 182_393_200],
      [{ gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: CO }, 157_672_240],
    ];
    for (const [share2, tax] of cases) {
      const f = sharesForm(share2);
      expect(validateMultiSupportedMode(f)).toBeNull();
      const s = await single(f);
      const m = await multi([f]);
      expect(s.aggregated.totalTax).toBe(tax);
      expect(m.totalTax).toBe(tax);
    }
  }, 60_000);

  it("[GS-6] 🔴 지분 × 부담부증여 — 단건과 같은 세액(59,564,296)·같은 카드 양도차익 · 물건 전체 §159·증여세 명세도 단건과 같다", async () => {
    const BG = {
      transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "300,000,000",
      bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false,
      bgActualAcquisitionLand: "60,000,000", bgActualAcquisitionBuilding: "60,000,000",
    } as Partial<AssetForm>;
    const f = sharesForm({ transferType: "burdened_gift" }, BG);
    expect(validateMultiSupportedMode(f)).toBeNull();
    const s = await single(f);
    expect(s.aggregated.totalTax).toBe(59_564_296);
    const m = await multi([f]);
    expect(m.totalTax).toBe(59_564_296);
    // 양도가액 = 채무 인수분(지분 안분) — 일반 양도(132,951,280)로 조용히 계산되지 않는다
    expect(gainsOf(m.props)).toEqual(gainsOf(s.aggregated.properties as Obj[]));
    expect(gainsOf(m.props)).toEqual([79_200_000, 79_200_000, 52_800_000, 52_800_000]);
    // 결과 명세 — 물건 전체 채무 3억·증여세 1회(지분마다 쪼개면 증여재산공제가 두 번 빠진다) · 단건 `transferBurdenedGiftBreakdown`과 같다
    const data = m.json.data as Obj;
    const bd = ((data.generalBuildingDetailsByAsset as Obj).p1 as Obj).burdenedGiftBreakdown as Obj;
    expect(bd).toEqual((s.json.data as Obj).transferBurdenedGiftBreakdown);
    expect(bd.assumedDebtAmount).toBe(300_000_000);
    expect((bd.giftTax as Obj).finalTax).toBe(130_950_000);
    // 아파트와 함께 — 지분 카드 양도차익 그대로
    const both = await multi([f, APT]);
    expect(gainsOf(both.props)).toEqual([79_200_000, 79_200_000, 52_800_000, 52_800_000, 300_000_000]);
  }, 60_000);

  it("[GS-6b] 🔴 지분 × 부담부증여 × 이월과세 — 지분별 [A]/[B] 비교 단위 · 단건과 같은 세액·채택·물건 전체 명세", async () => {
    const BG = {
      transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "300,000,000",
      bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false,
      bgActualAcquisitionLand: "60,000,000", bgActualAcquisitionBuilding: "60,000,000",
    } as Partial<AssetForm>;
    const share2 = {
      ...BG, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01", carryover: CO,
      bgActualAcquisitionLand: "40,000,000", bgActualAcquisitionBuilding: "40,000,000",
      bgCoDonorActualAcquisitionLand: "5,000,000", bgCoDonorActualAcquisitionBuilding: "5,000,000",
    } as Partial<AssetForm>;
    // 당초 증여자의 건물 취득일(⑧ 필수)은 토지와 같은 날로 채운다(`sameDayBuildingDonorDate`) — 화면 검증을 지나는 폼이어야 한다.
    const f = withBuildingDonorDate(sharesForm(share2, BG));
    expect(validateMultiSupportedMode(f)).toBeNull();
    expect([0, 1, 2, 3, 4].flatMap((st) => collectStepIssues(st, f))).toEqual([]);
    const s = await single(f);
    const m = await multi([f]);
    const data = m.json.data as Obj;
    const sUnits = s.aggregated.burdenedGiftCarryoverUnits as Record<string, Obj>;
    const mUnits = data.burdenedGiftCarryoverUnits as Record<string, Obj>;
    expect([m.totalTax, Object.keys(mUnits)]).toEqual([s.aggregated.totalTax, ["p1.1"]]);
    expect([s.aggregated.totalTax, mUnits["p1.1"].adoptedScenario, mUnits["p1.1"].determinedTaxA, mUnits["p1.1"].determinedTaxB]).toEqual([64_861_192, "B", 52_845_200, 58_964_720]);
    for (const k of ["adoptedScenario", "determinedTaxA", "determinedTaxB"]) expect(mUnits["p1.1"][k], k).toEqual(sUnits["1"][k]);
    expect(gainsOf(m.props)).toEqual(gainsOf(s.aggregated.properties as Obj[]));
    const bd = ((data.generalBuildingDetailsByAsset as Obj).p1 as Obj).burdenedGiftBreakdown;
    expect(bd).toEqual((s.json.data as Obj).transferBurdenedGiftBreakdown);

    // A 채택 시료 — 당초 증여자 취득이 최근이면(장특 차이 작음) 취득가액 치환으로 A 결정세액이 커져 §97의2①을 적용한다.
    //   지분 상세(산식 재료)·물건 전체 명세 취득 열이 A 조각으로 다시 조립되는지(`finalizeShareDetails`)를 단건과 대조한다.
    const fa = withBuildingDonorDate(sharesForm({ ...share2, carryover: { ...CO, donorAcquisitionDate: "2019-01-01" } } as Partial<AssetForm>, BG));
    const sa = await single(fa);
    const ma = await multi([fa]);
    const ua = ((ma.json.data as Obj).burdenedGiftCarryoverUnits as Record<string, Obj>)["p1.1"];
    expect([ma.totalTax, ua.adoptedScenario, ua.determinedTaxA, ua.determinedTaxB]).toEqual([sa.aggregated.totalTax, "A", 61_874_000, 58_964_720]);
    expect(gainsOf(ma.props)).toEqual(gainsOf(sa.aggregated.properties as Obj[]));
    const detailA = ((ma.json.data as Obj).generalBuildingDetailsByAsset as Obj).p1 as Obj;
    expect(detailA.burdenedGiftBreakdown).toEqual((sa.json.data as Obj).transferBurdenedGiftBreakdown);
    // 상세 전체 — 다건 카드 id는 복합 접미사(`land#p1.1`)라 자산 부분만 지우면 단건 지분 상세(`land#1`)와 같아야 한다(채택 조각으로 조립).
    // 신고서·명세서 취득일 — A 채택 지분 카드는 당초 증여자 취득일(§95④ 단서). 키는 복합 접미사 통째(`p1.1`)로 찾는다.
    const mAgg = ma.json.data as AggregateTransferResult;
    expect([gbCarryoverAcqDateOverride(mAgg, "land#p1.1"), gbCarryoverAcqDateOverride(mAgg, "building#p1.1"), gbCarryoverAcqDateOverride(mAgg, "land#p1.0")])
      .toEqual(["2019-01-01", "2019-01-01", undefined]);
    const restA: Obj = { ...detailA };
    delete restA.burdenedGiftBreakdown;
    expect(JSON.stringify(restA).replaceAll("p1.", "")).toBe(JSON.stringify(sa.aggregated.generalBuildingValuationDetail));
  }, 60_000);

  it("[GS-7] ⑦ — 자산 블록 뷰는 지분별 블록을 그리고, 명세서·폼 조회는 그 카드 지분의 값을 읽는다", async () => {
    const f = sharesForm();
    const m = await multi([f]);
    const aggregated = m.json.data as unknown as AggregateTransferResult;
    const view = gbAssetBlockView(aggregated, "p1", "p1", f.assets[0]);
    expect(view.shares?.map((sh) => [sh.key, sh.label, sh.ownershipRatio])).toEqual([["0", "자산 1", 0.6], ["1", "자산 2", 0.4]]);
    expect(view.shares?.map((sh) => sh.partConverted("land"))).toEqual([true, true]);

    const props = aggregated.properties as PerPropertyBreakdown[];
    const share1Land = props.find((p) => p.propertyId === "land#p1.1")!;
    expect(multiFormAssetOf(f, share1Land.propertyId)).toBe(f.assets[1]);
    expect(multiFormAssetOf(f, "land#p1.0")).toBe(f.assets[0]);
    const inputs = gbFormulaInputsOf(share1Land, undefined, aggregated.generalBuildingDetailsByAsset, props, undefined, { totalTransferPrice: 0, asset: undefined });
    expect(inputs.totalTransferPrice).toBe(400_000_000);
    const inputs0 = gbFormulaInputsOf(props[0], undefined, aggregated.generalBuildingDetailsByAsset, props, undefined, { totalTransferPrice: 0, asset: undefined });
    expect(inputs0.totalTransferPrice).toBe(600_000_000);
  }, 60_000);
});
