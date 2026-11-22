/**
 * 의제취득일 전 상속·증여 × 부담부증여 — ③ 분모 echo가 결과 `preDeemed.convertedDenominator`로 나간다 (NIT R-c03-11 · 세액 불변).
 *
 * 시료·세액은 `transfer.route.bg-pre-deemed-159.routes.anchor.test.ts`의 M-1·M-2와 같다(토지 184.2㎡ · 1983-07-26 상속 · 2023-02-16 부담부증여 ·
 * 채무 460,000,000 · 양도시 기준시가 1,243,350,000 · 의제취득일 기준시가 202,620,000 · 시가 920,000,000). 화면 경로(폼 → ⑧ → ④ → route → 엔진).
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
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "920000000",
};
const form = (over: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...LAND, ...over } as AssetForm],
  }) as TransferFormData;

describe("③ 분모 echo — 화면 경로", () => {
  it("M-1 ① 3억 채택: 분모 1,243,350,000이 실리고 ③ 149,925,925 = 증여가액 × 의제취득일 기준시가 ÷ 분모 · 세액 61,570,000 불변", async () => {
    const r = await runCalc(form({ publishedValueAtInheritance: "300000000", bgAcquisitionMethod: "converted" }));
    const p = r.result?.transferBurdenedGiftBreakdown?.preDeemed;
    expect(r.status).toBe(200);
    expect(p).toMatchObject({ basis: "three_way", selected: "reported", converted: 149_925_925, convertedDenominator: 1_243_350_000 });
    expect(Math.floor((920_000_000 * p!.stdAtDeemed) / p!.convertedDenominator!)).toBe(p!.converted);
    expect(r.result.determinedTax).toBe(61_570_000);
  });

  it("M-2 ③ 채택: 같은 분모 · 세액 80,721,398 불변", async () => {
    const r = await runCalc(form({ preDeemedClauseAUnconfirmed: true, bgAcquisitionMethod: "", bgActualAcquisitionLand: "100000000" }));
    const p = r.result?.transferBurdenedGiftBreakdown?.preDeemed;
    expect(p).toMatchObject({ basis: "three_way", selected: "converted", convertedDenominator: 1_243_350_000 });
    expect(r.result.determinedTax).toBe(80_721_398);
  });

  it("기준시가 평가(deemed_std)에는 3자 비교가 없어 분모 echo도 없다 — 세액 80,931,647 불변", async () => {
    const r = await runCalc(form({ bgValuationMode: "sangjeungbeop_standard" }));
    expect(r.result?.transferBurdenedGiftBreakdown?.preDeemed).toEqual({ basis: "deemed_std", stdAtDeemed: 202_620_000 });
    expect(r.result.determinedTax).toBe(80_931_647);
  });
});
