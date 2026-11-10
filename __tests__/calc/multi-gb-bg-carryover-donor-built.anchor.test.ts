/**
 * anchor — 연간 합산 · 일반건물 부담부증여 × 이월과세 × **당초 증여자 신축·증축**(소득세법 §114조의2)
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 GB-BG-CO-DNB — 종전에는 ⑧·⑫가
 * 「…당초 증여자 신축·증축 가산세(소득세법 §114조의2)는 단건 계산기에서만 지원됩니다.」로 막았다).
 *
 *  · DNB-1 A 채택 — 단건 F27과 같은 세액(135,291,640 · 가산세 2,500,000) · 같은 echo · 같은 고지
 *  · DNB-2 B 채택(②3호) — 가산세 0 · scenario_b echo(단건과 같다)
 *  · DNB-3 이월과세 배제(5년 경과) — 비교 단위 없음 · carryover_excluded echo(단건과 같다)
 *  · DNB-4 아파트와 함께 — 자산별 echo는 그 자산 키에만 · 가산세는 그 자산 건물 카드에만
 *  · DNB-5 형제 안전망 — 지분 분할 취득 + 증여자 신축은 계속 ⑧(건별)·⑫(지분 스키마)가 막는다
 * 단건 값은 `__tests__/api/transfer.route.gb-bg-carryover-donor-built.pipeline.anchor.test.ts` PL-1과 같은 사실이다.
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
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { sameDayBuildingDonorDate } from "../api/_helpers/gb-bg-building-donor-date";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { resultDonorBuiltEchoes } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 일반건물 · 부담부증여 K-5 · 이월과세(A 채택) · 당초 증여자 신축 2022-01-10 — PL-1과 같은 사실. `co`/`over`로 한 칸씩 바꾼다. */
function gbAsset(co: Record<string, unknown> = {}, over: Partial<AssetForm> = {}): AssetForm {
  return sameDayBuildingDonorDate({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1", regionCode: "1168010100",
    assetKind: "general_building", acquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "carryover_gift",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAcquisitionMethod: "converted",
    bgActualAcquisitionLand: "250,000,000", bgActualAcquisitionBuilding: "250,000,000",
    bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000",
      giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no",
      donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10",
      ...co,
    },
    ...over,
  } as AssetForm);
}
function formOf(assets: AssetForm[], over: Obj = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets, contractTotalPrice: "1,000,000,000", totalTransferExpense: "0",
    householdHousingCount: "2", isOneHousehold: false, residencePeriodMonths: "0",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true, ...over,
  } as TransferFormData;
}
/** 같은 해 나중에 양도한 아파트. */
const APT = formOf(
  [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000", fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "2826010100" } as AssetForm],
  { contractTotalPrice: "900000000", transferDate: "2026-09-01" },
);
const NOTICE_APPLIED = "증여자가 신축·증축한 건물에 소득세법 §114조의2 환산취득가액 가산세를 적용했습니다";
const NOTICE_NONE = "증여자 신축분 소득세법 §114조의2 가산세는 붙지 않았습니다";

async function both(f: TransferFormData) {
  expect(validateMultiSupportedMode(f)).toBeNull();
  expect([0, 1, 2, 3, 4].flatMap((st) => collectStepIssues(st, f))).toEqual([]);
  const s = await runSingle(f);
  expect(s.status, JSON.stringify(s.json).slice(0, 400)).toBe(200);
  const m = await postMulti(await buildMultiBody([f]));
  expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
  return { sAgg: (s.json.data as Obj).aggregated as Obj, m: m.json.data as Obj, mTotal: m.totalTax };
}
const unitOf = (d: Obj) => {
  const u = d.burdenedGiftCarryoverUnits?.p1;
  return u ? [u.adoptedScenario, u.determinedTaxA, u.determinedTaxB] : undefined;
};
const has = (warnings: string[], s: string) => warnings.some((w) => w.includes(s));

describe("연간 합산 — 일반건물 부담부증여 × 이월과세 × 당초 증여자 신축(§114조의2)", () => {
  it("[DNB-1] 🔴 A 채택 — 단건과 같은 세액 135,291,640 · 가산세 2,500,000(건물 카드만) · 같은 echo · 같은 고지", async () => {
    const { sAgg, m, mTotal } = await both(formOf([gbAsset()]));
    expect([mTotal, m.determinedTax, m.penaltyTax]).toEqual([135_291_640, 120_492_400, 2_500_000]);
    expect([mTotal, m.determinedTax, m.penaltyTax]).toEqual([sAgg.totalTax, sAgg.determinedTax, sAgg.penaltyTax]);
    expect(unitOf(m)).toEqual(["A", 120_492_400, 99_000_000]);
    expect(m.donorBuiltPenaltyByAsset.p1.echo).toEqual(sAgg.donorBuiltPenalty);
    expect(m.donorBuiltPenaltyByAsset.p1.echo).toMatchObject({ applied: true, base: 50_000_000, penalty: 2_500_000, burdenedGift: { method: "estimated" } });
    const pen = (m.properties as Obj[]).map((p) => [p.propertyId, p.penaltyTax ?? 0]);
    expect(pen).toEqual([["land#p1", 0], ["building#p1", 2_500_000]]);
    expect(has(m.warnings, NOTICE_APPLIED)).toBe(true);
    expect(has(sAgg.warnings, NOTICE_APPLIED)).toBe(true);
    // 결과 4뷰(상세명세서·신고서·PDF)는 다건도 어댑터(`aggregateToFilingResult`)의 echo 목록을 읽는다 — 자산 이름으로 귀속한다.
    const filing = aggregateToFilingResult(m as never) as unknown as Parameters<typeof resultDonorBuiltEchoes>[0];
    expect(resultDonorBuiltEchoes(filing)).toEqual([{ label: m.donorBuiltPenaltyByAsset.p1.label, echo: sAgg.donorBuiltPenalty }]);
  }, 60_000);

  it("[DNB-2] B 채택(②3호 — 증여세 2억이면 A 86,870,780 < B) — 가산세 0 · scenario_b echo · 중립 고지 · 단건과 같다", async () => {
    const { sAgg, m, mTotal } = await both(formOf([gbAsset({ giftTaxAmount: "200,000,000" })]));
    expect([mTotal, m.penaltyTax]).toEqual([108_900_000, 0]);
    expect([mTotal, m.determinedTax]).toEqual([sAgg.totalTax, sAgg.determinedTax]);
    expect(unitOf(m)).toEqual(["B", 86_870_780, 99_000_000]);
    expect(m.donorBuiltPenaltyByAsset.p1.echo).toEqual(sAgg.donorBuiltPenalty);
    expect(m.donorBuiltPenaltyByAsset.p1.echo).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
    expect([has(m.warnings, NOTICE_NONE), has(m.warnings, NOTICE_APPLIED)]).toEqual([true, false]);
  }, 60_000);

  it("[DNB-3] 이월과세 배제(2014 증여 · 5년 경과) — 비교 단위 없음 · carryover_excluded echo · 단건과 같다", async () => {
    const { sAgg, m, mTotal } = await both(formOf([gbAsset({ giftRegistryDate: "2014-01-01", donorAcquisitionDate: "2010-01-01", donorBuiltDate: "2012-01-10" })]));
    expect([mTotal, m.penaltyTax]).toEqual([107_580_000, 0]);
    expect(mTotal).toBe(sAgg.totalTax);
    expect(unitOf(m)).toBeUndefined();
    expect(m.donorBuiltPenaltyByAsset.p1.echo).toEqual(sAgg.donorBuiltPenalty);
    expect(m.donorBuiltPenaltyByAsset.p1.echo).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
    expect(has(m.warnings, NOTICE_NONE)).toBe(true);
  }, 60_000);

  it("[DNB-4] 아파트와 함께 — echo는 일반건물 자산 키에만 · 가산세는 그 건물 카드에만 · 토글을 끄면 echo·가산세 없음", async () => {
    const on = await postMulti(await buildMultiBody([formOf([gbAsset()]), APT]));
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    const d = on.json.data as Obj;
    expect(Object.keys(d.donorBuiltPenaltyByAsset)).toEqual(["p1"]);
    expect(d.penaltyTax).toBe(2_500_000);
    expect((d.properties as Obj[]).filter((p) => (p.penaltyTax ?? 0) > 0).map((p) => p.propertyId)).toEqual(["building#p1"]);
    expect(has(d.warnings, NOTICE_APPLIED)).toBe(true);
    const off = await postMulti(await buildMultiBody([formOf([gbAsset({ donorBuilt: false })]), APT]));
    const od = off.json.data as Obj;
    expect([off.status, od.donorBuiltPenaltyByAsset, od.penaltyTax]).toEqual([200, undefined, 0]);
  }, 60_000);

  it("[DNB-5] 형제 안전망 — 지분 분할 취득 + 증여자 신축은 ⑧(건별)이 끄라고 알리고 ⑫(지분 스키마)가 400", async () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
    const f = formOf([gbAsset({}, { ...half, assetId: "a1", assetLabel: "자산 1" }), gbAsset({}, { ...half, assetId: "a2", assetLabel: "자산 2" })], { assetSplitMode: "fractional" });
    expect([0, 1, 2, 3, 4].flatMap((st) => collectStepIssues(st, f)).map((i) => i.message).join("\n")).toContain("지분 분할 취득·함께 부담부증여 묶음에서는 당초 증여자 신축·증축 가산세");
    const m = await postMulti(await buildMultiBody([f]));
    expect(m.status).toBe(400);
    expect(JSON.stringify(m.json)).toContain("지분 분할 취득의 부담부증여는 당초 증여자 신축·증축 가산세(소득세법 §114조의2)를 아직 지원하지 않습니다");
  }, 60_000);
});
