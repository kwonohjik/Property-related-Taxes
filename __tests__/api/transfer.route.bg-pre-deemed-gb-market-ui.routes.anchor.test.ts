/**
 * PR-7b-6b — 의제취득일(1985.1.1.) 전 상속·증여 일반건물 × 부담부증여 × 시가 평가 — **화면 경로**(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진).
 * 계획서 `docs/02-design/features/inheritance-pre-deemed-bg-pr7b.plan.md` §6 PR-7b-6 · 사용자 결정 Q-28(파트별) · Q-29(상속 ① 필수) · G-5(증여 ① 필수) ·
 * L-1 (a)(2026-10-24 — 공유 단건·함께 양도 카드는 ①②를 지분으로 줄이지 않는다).
 *
 * 시료: 1983-07-26 상속 · 2023-02-16 부담부증여 · 시가 10억 · 채무 5억(β 0.5) · 양도시 토지 2억(100㎡ × 2,000,000) · 건물 2억 ·
 * 취득시(의제취득일) 토지 3천만 · 건물 3천만 → ③ = 7,500만씩. 세율은 mock.
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const GB: Loose = {
  addressJibun: "서울 강남구 테스트동 8-8",
  assetKind: "general_building",
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  useEstimatedAcquisition: false,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000",
  gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "300,000",
  gbAcqBuildingValue: "30,000,000",
  gbZoneType: "general_residential",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgMortgageDebtAmount: "500000000",
  bgLendingDepositTotal: "0",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
};
/** 계획서 Q-28 시료 — ① 토지 6억 · 건물 1천만 */
const REPORTED = { publishedValueAtInheritance: "600,000,000", gbBuildingInheritedValue: "10,000,000" };
/** 토지만 1983 상속 · 건물 1995 매매(분리 ON) */
const LAND_ONLY = {
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "1983-07-26",
  acquisitionDate: "1995-05-01",
  gbBuildingAcquisitionCause: "purchase",
  publishedValueAtInheritance: "600,000,000",
};

const form = (over: Loose = {}, assets?: AssetForm[]): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: assets ?? [{ ...makeDefaultAsset(1), ...GB, ...over } as AssetForm],
  }) as TransferFormData;

async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const data = r.json?.data;
  const bg = data?.transferBurdenedGiftBreakdown;
  return {
    issues,
    body,
    status: r.status,
    error: r.json?.error,
    tax: data?.aggregated?.determinedTax,
    bg,
    acq: bg ? [bg.perAsset.land.acquisitionPrice, bg.perAsset.building.acquisitionPrice] : undefined,
  };
}

describe("PR-7b-6b 일반건물 부담부증여 · 시가 평가 · 의제취득일 전 파트 — 화면 경로", () => {
  it("S-1 두 파트 다 1983 상속 · ① 입력 · 산정방식 없음 — ⑧ 통과 · ④ ①② 전송·방식 미전송 · 18,137,250(파트별 6.75억 × 0.5)", async () => {
    const r = await run(form(REPORTED));
    expect(r.issues).toEqual([]);
    expect(r.body.generalBuildingValuation.landPreDeemedClauseA).toEqual({ reported: 600_000_000, sec164: 30_000_000 });
    expect(r.body.generalBuildingValuation.buildingPreDeemedClauseA).toEqual({ reported: 10_000_000, sec164: 30_000_000 });
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([300_000_000, 37_500_000]);
    expect(r.tax).toBe(18_137_250);
  });

  it.each([
    ["토지 ① 없음", { publishedValueAtInheritance: "" }, "publishedValueAtInheritance"],
    ["건물 ① 없음", { gbBuildingInheritedValue: "" }, "gbBuildingInheritedValue"],
  ])("S-2 %s → ⑧ ① 필수(Q-29) · 선언 칸을 요구하지 않는다", async (_l, over, field) => {
    const issues = allIssues(form({ ...REPORTED, ...over }));
    expect(issues.map((i) => i.field)).toEqual([field]);
  });

  it("S-3 화면에 남은 산정방식(감정가액 · 금액 없음)이 있어도 두 파트 다면 ④가 싣지 않아 그대로 계산(리뷰 D-1b와 같은 축)", async () => {
    const r = await run(form({ ...REPORTED, bgAcquisitionMethod: "appraisal" }));
    expect(r.issues).toEqual([]);
    expect(r.body.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
    expect(r.tax).toBe(18_137_250);
  });

  it("S-4 토지만 1983 상속 · 건물 1995 매매 — 산정방식 필수 · K-4는 건물 칸만 요구 · 토지 실지 칸 값은 싣지 않는다", async () => {
    expect(allIssues(form(LAND_ONLY)).map((i) => i.field)).toContain("bgAcquisitionMethod");
    expect(allIssues(form({ ...LAND_ONLY, bgAcquisitionMethod: "actual" })).map((i) => i.field)).toContain("bgActualAcquisitionBuilding");
    const r = await run(form({ ...LAND_ONLY, bgAcquisitionMethod: "actual", bgActualAcquisitionBuilding: "40,000,000", bgActualAcquisitionLand: "999,999,999" }));
    expect(r.issues).toEqual([]);
    expect(r.body.generalBuildingValuation.landPreDeemedClauseA).toBeDefined();
    expect(r.body.generalBuildingValuation.buildingPreDeemedClauseA).toBeUndefined();
    expect(r.body.burdenedGiftInfo.actualLandAcquisitionPrice).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.acq).toEqual([300_000_000, 20_000_000]);
    expect([r.bg.perAsset.land.acquisitionMethod, r.bg.perAsset.building.acquisitionMethod]).toEqual(["actual", "actual"]);
  });

  it("S-4b 토지만 1983 상속 · 건물 감정가액(K-7) — 건물 감정가액 칸만 요구 · 토지 감정가액 칸 값은 싣지 않는다", async () => {
    const k7 = { ...LAND_ONLY, bgAcquisitionMethod: "appraisal" };
    expect(allIssues(form(k7)).map((i) => i.field)).toContain("bgPresumedAcquisitionBuilding");
    const r = await run(form({ ...k7, bgPresumedAcquisitionBuilding: "40,000,000", bgPresumedAcquisitionLand: "999,999,999" }));
    expect(r.issues).toEqual([]);
    expect(r.body.burdenedGiftInfo.presumedLandAcquisitionPrice).toBeUndefined();
    expect(r.acq).toEqual([300_000_000, 20_000_000]);
    expect(r.bg.perAsset.building.acquisitionMethod).toBe("appraisal");
  });

  it("S-5 1983 증여 두 파트 — ① = 파트 증여 신고가액 칸(필수 · G-5)", async () => {
    const gift = {
      acquisitionCause: "gift",
      gbBuildingAcquisitionCause: "gift",
      donorAcquisitionDate: "1970-01-01",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "1983-07-26",
    };
    expect(allIssues(form(gift)).map((i) => i.field)).toContain("landAcquisitionPrice");
    const r = await run(form({ ...gift, landAcquisitionPrice: "600,000,000", buildingAcquisitionPrice: "10,000,000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.generalBuildingValuation.landPreDeemedClauseA.reported).toBe(600_000_000);
    expect(r.acq).toEqual([300_000_000, 37_500_000]);
  });

  it("S-6 시가 평가 · 담보 승(시가 4억) — 파트 ①을 요구하지 않고 산정방식은 요구 · 의제취득일 기준시가 × 채무비율(95,756,000)", async () => {
    const collateral = { bgMarketValueAtTransfer: "400000000" };
    expect(allIssues(form(collateral)).map((i) => i.field)).toEqual(["bgAcquisitionMethod"]);
    const r = await run(form({ ...collateral, bgAcquisitionMethod: "converted" }));
    expect(r.issues).toEqual([]);
    expect(r.bg.acquisitionMethodUsed).toBe("standard_price");
    expect(r.tax).toBe(95_756_000);
  });

  it("S-7 공유 단건(지분 60%) — ①②는 물건 전체 금액 그대로 싣는다(L-1 (a) · §159가 지분 축소를 하지 않는 경로)", async () => {
    const r = await run(form({ ...REPORTED, ownershipNumerator: "60", ownershipDenominator: "100" }));
    expect(r.body.generalBuildingValuation.landPreDeemedClauseA).toEqual({ reported: 600_000_000, sec164: 30_000_000 });
    expect(r.body.generalBuildingValuation.buildingPreDeemedClauseA).toEqual({ reported: 10_000_000, sec164: 30_000_000 });
  });

  it("S-8 축 B 60/40 — 지분 몫으로 줄여 실어 단건과 같은 세액(18,137,250)", async () => {
    const share = (id: number, n: string) =>
      ({ ...makeDefaultAsset(id), ...GB, ...REPORTED, ownershipNumerator: n, ownershipDenominator: "100" }) as unknown as AssetForm;
    const f = Object.assign(form({}, [share(1, "60"), share(2, "40")]), { assetSplitMode: "fractional" }) as TransferFormData;
    const r = await run(f);
    expect(r.issues).toEqual([]);
    const shares = r.body.generalBuildingShares as Loose[];
    expect(shares.map((s) => s.valuation.landPreDeemedClauseA.reported)).toEqual([360_000_000, 240_000_000]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(18_137_250);
  });

  it("S-8b 축 B — 지분 카드(저장값 「일반」)도 병합값으로 판정해 그 지분 ①을 요구한다", async () => {
    const primary = { ...makeDefaultAsset(1), ...GB, ...REPORTED, ownershipNumerator: "60", ownershipDenominator: "100" } as unknown as AssetForm;
    const share = {
      ...makeDefaultAsset(2),
      ...GB,
      transferType: "regular",
      bgValuationMode: undefined,
      ownershipNumerator: "40",
      ownershipDenominator: "100",
    } as unknown as AssetForm;
    const f = Object.assign(form({}, [primary, share]), { assetSplitMode: "fractional" }) as TransferFormData;
    expect(allIssues(f).map((i) => i.field)).toContain("publishedValueAtInheritance");
    // 총 양도가액 — 지분 카드 저장값 「일반」 때문에 ⑧이 요구하는 기존 한계(계획서 §8 · 입력해도 세액 같음)
    const ok = Object.assign(form({}, [primary, { ...share, ...REPORTED } as AssetForm]), { assetSplitMode: "fractional", contractTotalPrice: "500,000,000" }) as TransferFormData;
    expect(allIssues(ok).map((i) => `${i.field}:${i.message}`)).toEqual([]);
    expect((await run(ok)).tax).toBe(18_137_250);
  });

  it("S-8c 축 B 이질 지분(리뷰 F-1) — 지분 2(토지 1995 매수 · 건물 1983 상속)의 토지 실지 칸을 첫 카드에서 받아 계산한다", async () => {
    const primary = { ...makeDefaultAsset(1), ...GB, ...REPORTED, bgAcquisitionMethod: "actual", ownershipNumerator: "60", ownershipDenominator: "100" } as unknown as AssetForm;
    const share = {
      ...makeDefaultAsset(2),
      ...GB,
      transferType: "regular",
      bgValuationMode: undefined,
      hasSeperateLandAcquisitionDate: true,
      acquisitionCause: "purchase",
      landAcquisitionDate: "1995-05-01",
      acquisitionDate: "1983-07-26",
      gbBuildingInheritedValue: "10,000,000",
      gbBuildingDecedentAcquisitionDate: "1970-01-01",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
    } as unknown as AssetForm;
    const f = (p: AssetForm) => Object.assign(form({}, [p, share]), { assetSplitMode: "fractional", contractTotalPrice: "500,000,000" }) as TransferFormData;
    expect(allIssues(f(primary)).map((i) => i.field)).toContain("bgActualAcquisitionLand");
    const r = await run(f({ ...primary, bgActualAcquisitionLand: "50,000,000" } as AssetForm));
    expect(r.issues.map((i) => `${i.field}:${i.message}`)).toEqual([]);
    expect(r.status).toBe(200);
    const shares = r.body.generalBuildingShares as Loose[];
    expect(shares.map((x) => [!!x.valuation.landPreDeemedClauseA, !!x.valuation.buildingPreDeemedClauseA])).toEqual([[true, true], [false, true]]);
    expect(shares[1].burdenedGiftInfo.actualLandAcquisitionPrice).toBe(50_000_000);
  });

  it("S-9 함께 양도 카드 일반건물(지분 50%) — 카드 ①②도 물건 전체 금액(L-1 (a))", async () => {
    const land = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      acquisitionArea: "100",
      transferArea: "100",
      landNature: "standalone",
      standardPriceAtAcq: "100,000,000",
      standardPriceAtTransfer: "200,000,000",
      transferType: "burdened_gift",
      bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "0",
      bgMortgageDebtAmount: "100000000",
      bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "200000000",
      bgAcquisitionMethod: "converted",
    } as unknown as AssetForm;
    const gb = { ...makeDefaultAsset(2), ...GB, ...REPORTED, ownershipNumerator: "1", ownershipDenominator: "2" } as unknown as AssetForm;
    const body = (await captureBody(form({}, [land, gb]))) as Loose;
    const c = (body.companionAssets as Loose[]).find((x) => x.assetKind === "general_building")!;
    expect(c.generalBuildingValuation.landPreDeemedClauseA).toEqual({ reported: 600_000_000, sec164: 30_000_000 });
    expect(c.burdenedGiftInfo.acquisitionMethod).toBeUndefined();
  });

  it("S-10 기준시가 평가 — ①②를 싣지 않는다(의제취득일 기준시가 × 채무비율 · Q-25)", async () => {
    const r = await run(form({ ...REPORTED, bgValuationMode: "sangjeungbeop_standard" }));
    expect(r.body.generalBuildingValuation.landPreDeemedClauseA).toBeUndefined();
    expect(r.tax).toBe(95_756_000);
  });
});
