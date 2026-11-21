/**
 * anchor — 의제취득일(1985.1.1.) 전 상속·증여 × 부담부증여 — 상세 계산 명세서 취득가액·필요경비 산식(결과뷰 리뷰 R-c04-04·R-c04-05).
 *
 * 종전: 3자 max(시가 평가)에서도 매매 K-4·K-5 문구가 나왔다 — ③ 채택이면 「자산별 양도가액 × 취득시 기준시가 / 양도시 기준시가 (§176의2②2호)」
 * (엔진은 ③ 전체 환산 뒤 채무비율을 곱한다 · 근거는 §176조의2④), ①② 채택이면 「실지취득가액 … §159①1호 본문」(실제 가액은 상증법 평가액·§164 가액 · §163⑨).
 * 기준시가 모드는 존재하지 않는 「§159①1호 단서」를 인용했다(본문은 계산식 A의 괄호뿐 — 소득세법 시행령 MST 290841 제159조).
 * 값은 전부 엔진 echo — 세액은 바뀌지 않는다. 시료는 `transfer.route.bg-pre-deemed-159` · `-gb-market` anchor와 같다.
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
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildBgAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { buildBgExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

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
};
const PRE1990 = {
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1100000",
  pre1990PricePerSqm_atTransfer: "6750000",
  pre1990GradeMode: "number",
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000" };

const form = (over: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...LAND, ...over } as AssetForm],
  }) as TransferFormData;

async function statement(over: Record<string, unknown>) {
  const f = form(over);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const items = buildStatementItems(r.result, f, f.assets[0], undefined, undefined);
  return {
    acq: String(items.get("acquisitionPrice")!.formula),
    exp: String(items.get("expenses")!.formula),
    acqValue: items.get("acquisitionPrice")!.value,
  };
}

describe("단건 토지 · 시가 평가 3자 max (R-c04-05)", () => {
  it("PD-1 ③ 채택 — ③ 전체 환산 × 채무비율 · §176조의2④ (종전 «자산별 양도가액 × 취득시 기준시가 / 양도시 기준시가 · §176의2②2호»)", async () => {
    const s = await statement({ ...MARKET, preDeemedClauseAUnconfirmed: true });
    expect(s.acq).toBe(
      "취득가액 = ③ 환산취득가액 × 채무액 / 증여재산 평가액 (①②③ 중 큰 금액 · 소득세법 시행령 §176조의2④ · §159①1호)\n" +
        "        = 149,925,925 × 460,000,000 / 920,000,000\n        = 74,962,962",
    );
    expect(s.acqValue).toBe(74_962_962);
    expect(s.acq).not.toContain("§176의2②2호");
    // 개산공제 base는 의제취득일 기준시가다
    expect(s.exp).toContain("필요경비 = 의제취득일(1985.1.1.) 기준시가 × 채무액 / 증여재산 평가액 × 3%");
  });

  it("PD-2 ① 채택 — 상증법 평가액(신고가액) · §163⑨ (종전 «실지취득가액 … §159①1호 본문»)", async () => {
    const s = await statement({ ...MARKET, publishedValueAtInheritance: "300000000", bgAcquisitionMethod: "converted" });
    expect(s.acq).toBe(
      "취득가액 = ① 상증법 평가액(신고가액) × 채무액 / 증여재산 평가액 (①②③ 중 큰 금액 · 소득세법 시행령 §163⑨ · §159①1호)\n" +
        "        = 300,000,000 × 460,000,000 / 920,000,000\n        = 150,000,000",
    );
    expect(s.acq).not.toContain("실지취득가액");
    expect(s.exp).toContain("①·② 채택 — 실지거래가액 의제(소득세법 시행령 §163⑨)");
  });

  it("PD-3 ② 채택 — §164 가액", async () => {
    const s = await statement({ ...MARKET, ...PRE1990 });
    expect(s.acq).toContain("취득가액 = ② §164④~⑦ 취득당시 기준시가(의제취득일) × 채무액 / 증여재산 평가액");
    expect(s.acq).toContain("= 84,443,174 × 460,000,000 / 920,000,000\n        = 42,221,587");
  });

  it("PD-4 ③ 채택 + §97②2호 단서 — 종전 0 문구 그대로", async () => {
    const s = await statement({ ...MARKET, preDeemedClauseAUnconfirmed: true, capitalExpenditure: "300000000" });
    expect(s.acq).toBe("취득가액 = 0 (소득세법 §97②2호 단서 — 환산취득가액 대신 자본적지출·양도비를 필요경비로 정함)");
  });
});

describe("기준시가 평가 — §159①1호 괄호 (R-c04-04)", () => {
  it("PD-5 의제취득일 기준시가 × 채무비율 · «괄호» (종전 «소령 §159①1호 단서»)", async () => {
    const s = await statement({ bgValuationMode: "sangjeungbeop_standard" });
    expect(s.acq).toBe(
      "취득가액 = 의제취득일(1985.1.1.) 자산기준시가 × 채무액 / 증여재산 평가액 (소득세법 시행령 §159①1호 괄호 — 기준시가 모드 환산)\n" +
        "        = 202,620,000 × 460,000,000 / 1,243,350,000\n        = 74,962,962",
    );
    expect(s.acq).not.toContain("단서");
  });
});

describe("일반건물 파트별 3자 max (three_way_parts)", () => {
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
    bgGiftBuildingStdPriceAtTransfer: "200,000,000",
    gbAcqLandPricePerSqm: "300,000",
    gbAcqBuildingValue: "30,000,000",
    gbZoneType: "general_residential",
    transferType: "burdened_gift",
    bgDonorRelation: "lineal_descendant",
    bgMortgageDebtAmount: "500000000",
    bgLendingDepositTotal: "0",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1000000000",
    bgAcquisitionMethod: "converted",
    preDeemedClauseAUnconfirmed: true,
  };

  it("PD-6 토지 ① 6억 · 건물 ③ 7,500만 — 파트마다 채택 후보 이름과 근거", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2023-02-16",
      filingDate: "2023-04-30",
      totalTransferExpense: "0",
      householdHousingCount: "0",
      isOneHousehold: false,
      assets: [{ ...makeDefaultAsset(1), ...GB } as AssetForm],
    }) as TransferFormData;
    const body = (await captureBody(f)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    body.generalBuildingValuation.landPreDeemedClauseA = { reported: 600_000_000, sec164: 30_000_000 };
    body.generalBuildingValuation.buildingPreDeemedClauseA = { reported: 10_000_000, sec164: 30_000_000 };
    delete body.burdenedGiftInfo.acquisitionMethod;
    const r = await postTransfer(body);
    expect(r.status).toBe(200);
    const bg = r.json.data.transferBurdenedGiftBreakdown;
    expect(bg.preDeemed.basis).toBe("three_way_parts");
    const land = buildBgAcquisitionFormula(bg, bg.perAsset.land, bg.perAsset.land.acquisitionPrice);
    const building = buildBgAcquisitionFormula(bg, bg.perAsset.building, bg.perAsset.building.acquisitionPrice);
    expect(land).toBe(
      "취득가액 = ① 상증법 평가액(신고가액) × 채무액 / 증여재산 평가액 (①②③ 중 큰 금액 · 소득세법 시행령 §163⑨ · §159①1호)\n" +
        "        = 600,000,000 × 500,000,000 / 1,000,000,000\n        = 300,000,000",
    );
    expect(building).toBe(
      "취득가액 = ③ 환산취득가액 × 채무액 / 증여재산 평가액 (①②③ 중 큰 금액 · 소득세법 시행령 §176조의2④ · §159①1호)\n" +
        "        = 75,000,000 × 500,000,000 / 1,000,000,000\n        = 37,500,000",
    );
    expect(buildBgExpenseFormula(bg, bg.perAsset.building)).toContain("필요경비 = 의제취득일(1985.1.1.) 기준시가 × 채무액");
  });
});
