/**
 * anchor: 사이드바(⑥) 부담부증여 양도가액 — 계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` PR-3 (Q-1 a).
 *
 * 부담부증여 자산의 양도가액은 엔진이 §159로 정한다(소득세법 시행령 §159①). 사이드바는 그 값을 다른 곳에서 읽었다 —
 * 안분 프리뷰(§166⑥ 안분값 10억/6억 · 혼합 묶음 171,428,571), 화면에 없는 계약서 가액(7억), 「-」.
 * 이제 계산 전에는 「계산 후 표시」, 계산 후에는 엔진 값이다. ⑧이 막는 혼합 묶음은 「-」 + 「함께 양도 불가」.
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

import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 원조합원 입주권 부담부증여 — 일반 기준시가 두 칸이 화면에 없다(#2351 Playwright 0개). */
const right = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(2), assetId: "o", addressJibun: "서울 강남구 테스트동 9-9",
    assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
    acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay",
    redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false,
    standardPriceAtAcq: "", standardPriceAtTransfer: "", ...over,
  }) as AssetForm;
const house = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "400000000",
    useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
/** 부담부증여 주택(보충적 평가) — 양도시 기준시가 칸이 화면에 있다(§159 C의 입력). */
const bgHouse = (over: Record<string, unknown> = {}) =>
  house({
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", standardPriceAtTransfer: "1000000000",
    standardPriceAtAcq: "500000000", actualSalePrice: "", ...over,
  });
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const bundle = (assets: AssetForm[], bundledSaleMode: "actual" | "apportioned", contractTotalPrice = "") =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets, contractTotalPrice, assetSplitMode: "companion", bundledSaleMode }) as TransferFormData;


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (f: TransferFormData, res: any = null) =>
  computeTransferPerAssetSummary(f, res).rows.map((r) => ({ sale: r.salePrice, pending: r.salePending, note: r.saleTransferNote ?? (r.saleIsApportioned ? "기준시가 안분" : undefined) }));
const pend = { sale: 0, pending: true, note: undefined };
const blocked = { sale: 0, pending: false, note: "함께 양도 불가" };
const h2 = () => bgHouse({ assetId: "h2", addressJibun: "서울 강남구 테스트동 3-3", standardPriceAtTransfer: "600000000", standardPriceAtAcq: "300000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0" });
const g = () => bgHouse({ assetId: "g", addressJibun: "서울 강남구 테스트동 6-6" });
const singleForm = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] }) as TransferFormData;

describe("SB-1 혼합 묶음(⑧ 차단) — 전 자산 「-」 + 「함께 양도 불가」 (종전 안분값)", () => {
  it.each([
    ["일반 주(주) + 부담부증여 주택 · 안분 6억 (종전 171,428,571 / 428,571,429)", () => bundle([house(), g()], "apportioned", "600000000")],
    ["일반 주(주) + 입주권(숨은 키 5억) · 안분 6억 (종전 266,666,667 / 333,333,333)", () => bundle([house(), right({ standardPriceAtTransfer: "500000000" })], "apportioned", "600000000")],
    ["부담부증여 주(주) + 일반 · 안분 16억", () => bundle([bgHouse(), house({ assetId: "h3", addressJibun: "서울 강남구 테스트동 5-5" })], "apportioned", "1600000000")],
    ["일반 주(주) + 부담부증여 주택 · 실가 거래", () => bundle([house(), g()], "actual", "600000000")],
  ] as const)("%s", async (_l, mk) => {
    const f = mk();
    expect(rows(f)).toEqual([blocked, blocked]);
    expect(computeTransferPerAssetSummary(f, null).totalSalePrice).toBe(0);
    const r = await runCalc(f);
    expect(r.issues.some((i) => i.message.startsWith("일반 양도 자산과 부담부증여 자산은"))).toBe(true);
  });
});

describe("SB-2 전 자산 부담부증여 묶음 — 계산 전 「계산 후 표시」, 계산 후 엔진 §159 값", () => {
  it.each([
    ["주택 2건 · 안분 16억 (종전 계산 전 1,000,000,000 / 600,000,000)", () => bundle([bgHouse(), h2()], "apportioned", "1600000000"), [250_000_000, 150_000_000]],
    ["주택 + 입주권 · 안분 빈칸", () => bundle([bgHouse(), right()], "apportioned", ""), [400_000_000, 600_000_000]],
    ["주택 2건 · 실가 거래 (종전 계산 전 「-」)", () => bundle([bgHouse(), h2()], "actual", ""), [250_000_000, 150_000_000]],
  ] as const)("%s", async (_l, mk, after) => {
    const f = mk();
    expect(rows(f)).toEqual([pend, pend]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    const props = (r.json?.data?.aggregated?.properties ?? []).map((p: { transferPrice: number }) => p.transferPrice);
    expect(props).toEqual(after);
    expect(rows(f, r.json?.data).map((x) => x.sale)).toEqual(after);
    expect(rows(f, r.json?.data).every((x) => !x.pending && x.note === undefined)).toBe(true);
  });
});

describe("SB-3 단건 부담부증여 — 계산 전 「계산 후 표시」, 계산 후 결과 명세의 §159 양도가액", () => {
  it.each([
    ["숨은 계약서 가액 없음 (종전 계산 전후 「-」)", ""],
    ["숨은 계약서 가액 7억 (종전 계산 전후 700,000,000)", "700000000"],
  ] as const)("%s", async (_l, hidden) => {
    const f = singleForm(bgHouse({ actualSalePrice: hidden }));
    expect(rows(f)).toEqual([pend]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    const brkd = r.json?.data?.result?.transferBurdenedGiftBreakdown;
    const engine = brkd.perAsset.land.transferPrice + brkd.perAsset.building.transferPrice;
    expect(engine).toBeGreaterThan(0);
    expect(rows(f, r.json?.data)).toEqual([{ sale: engine, pending: false, note: undefined }]);
  });
});

describe("SB-5 축 B 부담부증여(같은 물건 지분) — 혼합이 아니다", () => {
  it("지분 카드의 저장 양도 형태가 일반이어도 첫 카드 값(부담부증여)으로 본다 — 「계산 후 표시」", () => {
    const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
    const f = Object.assign(createDefaultTransferFormData(), BASE, {
      assets: [bgHouse(half), house({ ...half, assetId: "s2", transferType: "general" })], assetSplitMode: "fractional",
    }) as TransferFormData;
    expect(rows(f)).toEqual([pend, pend]);
  });
});

describe("SB-4 대조 — 부담부증여 없는 묶음은 종전대로 안분 프리뷰", () => {
  it("일반 주택 2건 · 안분 13억 → 기준시가 안분값", () => {
    const f = bundle([house(), house({ assetId: "h4", addressJibun: "서울 강남구 테스트동 7-7", standardPriceAtTransfer: "900000000" })], "apportioned", "1300000000");
    expect(rows(f)).toEqual([
      { sale: 400_000_000, pending: false, note: "기준시가 안분" },
      { sale: 900_000_000, pending: false, note: "기준시가 안분" },
    ]);
  });
});
