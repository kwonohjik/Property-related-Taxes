/**
 * PR-7b-0 — 부담부증여 × 의제취득일 전 상속 입력의 ⑫ 면제 범위 · 일반건물 환산 플래그 잔존
 * (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §3.1 B-1·B-2).
 *
 * B-1 (PR-7a 회귀 · API 직접 호출만): 시가 평가 body에서 산정방식을 빼고 `inheritedAcquisition`(pre-deemed)을 실으면
 *     ⑫가 자산 종류를 보지 않고 통과시켰다. 엔진이 3자 max를 쓰지 않는 재개발·일반건물은 §159 legacy 분기로 떨어져 취득가액 0.
 *     → ⑫ 면제는 엔진이 3자 max를 §159에 넘기는 자산(토지·주택·건물·상가, 재개발 정보 없음)만.
 * B-2 (기존): 일반건물 일반 양도에서 켠 환산 플래그가 부담부증여 전환 뒤 남으면 ④가 환산 경로로 보내 §159가 빠졌다.
 *
 * 화면 경로(폼 → ④ body)를 만든 뒤 B-1은 body를 API 직접 호출처럼 고친다. 세율은 mock.
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
import { buildInheritedAcquisitionPayload } from "@/lib/calc/transfer-tax-api-inheritance";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Body = Record<string, any>;

const form = (a: Record<string, unknown>, transferDate: string, extra: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate,
    filingDate: transferDate.slice(0, 4) + "-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    ...extra,
    assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;

/** API 직접 호출 — 산정방식을 빼고 의제취득일 전 상속 입력을 싣는다. */
const directPreDeemed = (body: Body, ia: unknown) => ({
  ...body,
  inheritedAcquisition: ia,
  burdenedGiftInfo: { ...body.burdenedGiftInfo, acquisitionMethod: undefined },
});
const fieldErrorsOf = (r: { json?: any }) => Object.keys(r.json?.error?.fieldErrors ?? {});
const taxOf = (r: { json?: any; result?: any }) => r.json?.data?.aggregated?.determinedTax ?? r.result?.determinedTax;
const bgOf = (r: { json?: any; result?: any }) =>
  r.json?.data?.transferBurdenedGiftBreakdown ?? r.json?.data?.aggregated?.transferBurdenedGiftBreakdown ?? r.result?.transferBurdenedGiftBreakdown;

// ── 재개발 완공 아파트 · 1980 상속 종전주택 · 2026 부담부증여 · β 0.4 ──
const REDEV: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "redevelopment_apt",
  actualSalePrice: "525,000,000",
  redevSubject: "apt",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23",
  redevRightsValue: "219,218,500",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "92,781,500",
  redevCompletionDate: "2012-09-01",
  redevManagementDisposalHousingPrice: "132,000,000",
  redevAcquisitionHousingPrice: "85,034,988",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-01-01",
  inheritanceStartDate: "1980-01-01",
  decedentAcquisitionDate: "1970-01-01",
  inheritanceAssetKind: "house_individual",
  preDeemedClauseAUnconfirmed: true,
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "525,000,000",
  bgMortgageDebtAmount: "210,000,000",
  bgDonorRelation: "lineal_descendant",
  standardPriceAtTransfer: "400,000,000",
  bgAcquisitionMethod: "converted",
};
const REDEV_IA = { mode: "pre-deemed", inheritanceStartDate: "1980-01-01", assetKind: "house_individual", reportedValue: 200_000_000 };

// ── 일반건물 · 토지 100㎡ · 건물 200㎡ · 2023 부담부증여 ──
const GB: Record<string, unknown> = {
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
  preDeemedClauseAUnconfirmed: true,
};
const GB_MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "converted" };
const GB_IA = { mode: "pre-deemed", inheritanceStartDate: "1983-07-26", assetKind: "land", reportedValue: 600_000_000, standardPriceAtDeemedDate: 30_000_000 };
const GB_2005_STD = {
  bgValuationMode: "sangjeungbeop_standard",
  acquisitionDate: "2005-07-26",
  inheritanceStartDate: "2005-07-26",
  preDeemedClauseAUnconfirmed: false,
};

// ── 토지 · 1983 상속 · 2023 부담부증여 · β 0.5 (PR-7a 시료 — 화면이 의제취득일 전 상속 입력을 싣는다) ──
const LAND: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
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
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "920000000",
  publishedValueAtInheritance: "300000000",
};

// ── 상가 · 1983 상속 · 2023 부담부증여 · β 0.5 — 화면은 상가 부담부증여에 상속 의제 입력을 싣지 않는다(PR-7b-1 전) → API 직접 호출 시나리오 ──
const CB: Record<string, unknown> = {
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "commercial_building",
  acquisitionCause: "inheritance",
  acquisitionDate: "1983-07-26",
  inheritanceStartDate: "1983-07-26",
  decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "460000000",
  standardPriceAtTransfer: "400000000",
  standardPriceAtAcq: "200000000",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "920000000",
  bgAcquisitionMethod: "converted",
  publishedValueAtInheritance: "300000000",
};

describe("B-1 ⑫ 면제는 엔진이 3자 max로 받는 자산만", () => {
  it("재개발 — 산정방식 없음 + 의제취득일 전 상속 입력 → 400 산정방식 (종전 200 · 취득가액 0 · 26,042,413)", async () => {
    const body = await captureBody(form(REDEV, "2026-02-16", { contractTotalPrice: "525000000" }));
    const r = await postTransfer(directPreDeemed(body, REDEV_IA));
    expect(r.status).toBe(400);
    expect(fieldErrorsOf(r)).toContain("burdenedGiftInfo.acquisitionMethod");
  });

  it("재개발 — 산정방식(환산)이 있으면 종전 그대로 13,023,566", async () => {
    const body = await captureBody(form(REDEV, "2026-02-16", { contractTotalPrice: "525000000" }));
    const r = await postTransfer({ ...body, inheritedAcquisition: REDEV_IA, useEstimatedAcquisition: true });
    expect(r.status).toBe(200);
    expect(taxOf(r)).toBe(13_023_566);
  });

  it("일반건물 — 산정방식 없음 + 의제취득일 전 상속 입력 → 400 산정방식 (종전 200 · 취득가액 0 · 112,808,000)", async () => {
    const body = await captureBody(form({ ...GB, ...GB_MARKET }, "2023-02-16"));
    const r = await postTransfer(directPreDeemed(body, GB_IA));
    expect(r.status).toBe(400);
    expect(fieldErrorsOf(r)).toContain("burdenedGiftInfo.acquisitionMethod");
  });

  it("면제 경계 — 같은 토지 body의 propertyType만 바꾼다: 건물은 면제(3자 max) · 겸용·입주권·분양권은 산정방식 요구", async () => {
    const body = await captureBody(form(LAND, "2023-02-16"));
    const direct = directPreDeemed(body, body.inheritedAcquisition);
    const building = await postTransfer({ ...direct, propertyType: "building" });
    expect(building.status).toBe(200);
    expect(bgOf(building)?.preDeemed?.basis).toBe("three_way");
    for (const propertyType of ["mixed-use-house", "right_to_move_in", "presale_right"]) {
      const r = await postTransfer({ ...direct, propertyType });
      expect(fieldErrorsOf(r), propertyType).toContain("burdenedGiftInfo.acquisitionMethod");
    }
  });

  it("일반건물 — 화면 경로(환산)는 종전 그대로 91,920,600", async () => {
    const f = form({ ...GB, ...GB_MARKET }, "2023-02-16");
    expect(allIssues(f)).toEqual([]);
    const r = await postTransfer(await captureBody(f));
    expect(r.status).toBe(200);
    expect(taxOf(r)).toBe(91_920_600);
  });

  it("상가 — 엔진이 3자 max로 받는 자산은 종전처럼 면제한다(③ 460,000,000 × 0.5 → 39,492,000)", async () => {
    const a = { ...makeDefaultAsset(1), ...CB } as AssetForm;
    const body = await captureBody(form(CB, "2023-02-16"));
    const ia = buildInheritedAcquisitionPayload({ ...a, transferType: "regular" } as AssetForm, 1, false).inheritedAcquisition;
    const r = await postTransfer(directPreDeemed(body, ia));
    expect(r.status).toBe(200);
    expect(bgOf(r)?.preDeemed?.selected).toBe("converted");
    expect(taxOf(r)).toBe(39_492_000);
  });
});

describe("B-2 일반건물 부담부증여는 남은 환산 플래그로 환산 경로에 가지 않는다", () => {
  it("2005 상속 · 기준시가 평가 — 환산 플래그 잔존 95,756,000 = 잔존 없음 (종전 91,681,200 · §159 누락)", async () => {
    const clean = await postTransfer(await captureBody(form({ ...GB, ...GB_2005_STD }, "2023-02-16")));
    expect(taxOf(clean)).toBe(95_756_000);
    for (const stale of [
      { useEstimatedAcquisition: true },
      { useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated" },
    ]) {
      const f = form({ ...GB, ...GB_2005_STD, ...stale }, "2023-02-16");
      expect(allIssues(f)).toEqual([]);
      const r = await postTransfer(await captureBody(f));
      expect(r.status).toBe(200);
      expect(bgOf(r)?.acquisitionMethodUsed).toBe("standard_price");
      expect(taxOf(r)).toBe(95_756_000);
    }
  });
});
