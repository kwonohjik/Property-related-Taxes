/**
 * anchor: 상업용건물 × 부담부증여 — 「환산취득가 사용」 토글(`useEstimatedAcquisition`)과 cb* 칸을 읽지 않는다
 * (계획서 `docs/02-design/features/bg-stale-acq-mode-flags.plan.md` V-2 · 사용자 결정 2026-11-12 a · `bgIgnoresCommercialEstimated`).
 *
 * 수정 전 실측: 토글을 켜도 세액은 같았고(시가·기준시가 × 실지·K-5), 칸을 비운 채 켜 두면 ⑧이 「전용면적을 입력하세요」로 막았다
 * (주 자산·함께 양도 자산 모두). 세액 값은 수정 전 probe와 같다 — 이 수정은 세액을 바꾸지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { runCalc } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const form = (assets: AssetForm[]) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-06-01", filingDate: "2024-06-01", contractTotalPrice: "500000000", totalTransferExpense: "0",
    isOneHousehold: false, householdHousingCount: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  }, { assets }) as TransferFormData;

/** 환산 블록 칸 전부(취득 2012 → 호별고시 이후 구간). */
const CB = {
  cbExclusiveArea: "100", cbSharedArea: "20", cbLandArea: "30", cbUnitPriceAtTransfer: "3000000", cbUnitPriceAtFirstOrAcq: "1500000",
  cbLandPricePerSqmAtTransfer: "5000000", cbLandPricePerSqmAtAcq: "2000000",
};
/** 상가 · 부담부증여 · 시가 5억 · 담보채무 2억 · 실지 1.2억(K-4). */
const cb = (o: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "a", addressJibun: "서울특별시 강남구 테스트동 1-1", assetKind: "commercial_building",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000",
    bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "240000000", bgDonorRelation: "lineal_descendant",
    bgGiftBuildingStdPriceAtTransfer: "300000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000",
    acquisitionCause: "purchase", acquisitionDate: "2012-01-01", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "120000000", ...o,
  }) as unknown as AssetForm;
const K5 = { bgAcquisitionMethod: "converted", bgActualAcquisitionTotal: "" };

describe("CE-1 주 자산 — 토글을 켜도 막지 않고 세액이 같다", () => {
  it.each([
    ["K-4 실지 · 칸 비움", {}, {}, 24_117_000],
    ["K-4 실지 · 칸 채움", {}, CB, 24_117_000],
    ["K-5 환산 · 칸 비움", K5, {}, 11_661_120],
    ["K-5 환산 · 칸 채움", K5, CB, 11_661_120],
  ])("%s", async (_n, method, cells, tax) => {
    const off = await runCalc(form([cb(method)]));
    const on = await runCalc(form([cb({ ...method, ...cells, useEstimatedAcquisition: true })]));
    expect(off.issues).toEqual([]);
    expect(on.issues).toEqual([]);
    expect(on.body.commercialBuildingValuation).toBeUndefined();
    expect(on.body.useEstimatedAcquisition).toBe(false);
    expect(on.status).toBe(200);
    expect(on.result.determinedTax).toBe(tax);
    expect(off.result.determinedTax).toBe(tax);
  });
});

describe("CE-2 함께 양도 자산(자산 2)도 같다", () => {
  // 매매에서 남은 실거래가(`fixedAcquisitionPrice`) — 부담부증여 카드에 없는 칸이다. 켬·끔이 같은 값을 보내야 한다.
  const two = (c: AssetForm) => form([cb({ assetId: "p", addressJibun: "서울특별시 강남구 테스트동 9-9" }), { ...c, assetId: "c", fixedAcquisitionPrice: "90000000" } as AssetForm]);
  it("칸을 비운 채 켜도 ⑧이 막지 않고 결과가 끈 것과 같다", async () => {
    const off = await runCalc(two(cb()));
    const on = await runCalc(two(cb({ useEstimatedAcquisition: true })));
    expect(on.issues).toEqual([]);
    expect(on.status).toBe(200);
    expect(on.json.data).toEqual(off.json.data);
  });
});

describe("CE-3 일반 양도는 그대로 — 토글이 세액을 바꾸고 칸이 비면 막는다", () => {
  const reg = (o: Record<string, unknown> = {}) => cb({ transferType: "regular", ...o });
  it("칸 채움 → 환산 객체 전송 · 49,750,480 (끔 + 실지 1.2억은 88,854,000)", async () => {
    const on = await runCalc(form([reg({ useEstimatedAcquisition: true, ...CB })]));
    expect(on.issues).toEqual([]);
    expect(on.body.commercialBuildingValuation).toBeDefined();
    expect(on.body.useEstimatedAcquisition).toBe(true);
    expect(on.result.determinedTax).toBe(49_750_480);
    const off = await runCalc(form([reg({ fixedAcquisitionPrice: "120000000" })]));
    expect(off.result.determinedTax).toBe(88_854_000);
  });
  it("칸 비움 → ⑧ 전용면적", async () => {
    const on = await runCalc(form([reg({ useEstimatedAcquisition: true })]));
    expect(on.issues.map((i) => i.field)).toContain("cbExclusiveArea");
  });
});
