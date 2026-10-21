/**
 * anchor: 부담부증여 묶음의 안분 키·계약서 가액 (계획서 `docs/00-pm/burdened-gift-bundle-hidden-stdprice.plan.md` PR-1).
 *
 * **전 자산 부담부증여 묶음**은 양도가액을 §159가 정한다 — 엔진 STEP 0.48이 route 안분값을 덮어쓰므로
 * (`transfer-tax-burdened-gift-step.ts:161-164`) 안분 키와 계약서 가액은 세액에 쓰이지 않는다(총액 1원도 같은 세액, §1.2).
 * 그런데 ⑩·route가 그 값을 요구해, 양도시 기준시가를 다른 칸으로 받는 자산(입주권·시가 모드·일반건물·겸용)이 있으면
 * 화면에 칸이 없는 채로 400이었다(BG-1·BG-2). 실가 거래 모드는 ⑧ 합계 검증과 ⑩이 부담부증여 자산에도 계약서 가액을 요구했다(BG-3).
 *
 * **일반 양도 + 부담부증여 혼합 묶음**은 설계된 적이 없다 — 부담부증여 자산이 §166⑥ 안분에 끼어 일반 자산의 양도가액이 깎이고
 * (600,000,000 → 171,428,571), 채무 재배분이 주 자산 기준으로 어긋난다. 명시 차단한다(BG-4 · Q-2 a).
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
import { runCalc, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
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
/** 시가 모드 부담부증여 — 양도시 기준시가는 `bgMarketValueAtTransfer`가 받는다(공용 칸 없음). */
const marketHouse = () =>
  house({
    assetId: "m", addressJibun: "서울 강남구 테스트동 4-4", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "800000000", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000",
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", standardPriceAtTransfer: "", standardPriceAtAcq: "", actualSalePrice: "",
  });
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const bundle = (assets: AssetForm[], bundledSaleMode: "actual" | "apportioned", contractTotalPrice = "") =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets, contractTotalPrice, assetSplitMode: "companion", bundledSaleMode }) as TransferFormData;

const MIXED_MESSAGE = "일반 양도 자산과 부담부증여 자산은 함께 양도로 계산할 수 없습니다";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agg = (r: { json: any }) => r.json?.data?.aggregated;
const gains = (r: Awaited<ReturnType<typeof runCalc>>) =>
  (agg(r)?.properties ?? []).map((p: { transferGain: number }) => p.transferGain);

describe("BG-1 전 자산 부담부증여 · 안분 — 화면에 없는 안분 키를 요구하지 않는다", () => {
  it.each([
    ["부담부증여 주택(주) + 입주권", () => [bgHouse(), right()]],
    ["입주권(주) + 부담부증여 주택", () => [right(), bgHouse()]],
    ["부담부증여 주택(주) + 시가 모드", () => [bgHouse(), marketHouse()]],
  ] as const)("%s: ⑧ 통과 · 200 · bundled", async (_l, mk) => {
    const r = await runCalc(bundle(mk(), "apportioned"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.json?.data?.mode).toBe("bundled");
  });

  it("세액은 숨은 키와 무관하다 — 키 없음 = 5억 = 9억 = 178,436,400", async () => {
    for (const k of ["", "500000000", "900000000"]) {
      const r = await runCalc(bundle([bgHouse(), right({ standardPriceAtTransfer: k })], "apportioned"));
      expect(agg(r)?.determinedTax).toBe(178_436_400);
      expect(gains(r)).toEqual([194_000_000, 400_000_000]);
    }
  });

  it("시가 모드 묶음도 키와 무관하다", async () => {
    const a = await runCalc(bundle([bgHouse(), marketHouse()], "apportioned"));
    const b = await runCalc(bundle([bgHouse(), { ...marketHouse(), standardPriceAtTransfer: "700000000" } as AssetForm], "apportioned"));
    expect(agg(a)?.determinedTax).toBe(agg(b)?.determinedTax);
    expect(gains(a)).toEqual(gains(b));
  });
});

describe("BG-2 전 자산 부담부증여 — 기존 세액 불변 (공용 칸이 있는 주택 2건)", () => {
  const h2 = (over: Record<string, unknown> = {}) =>
    bgHouse({ assetId: "h2", addressJibun: "서울 강남구 테스트동 3-3", standardPriceAtTransfer: "600000000", ...over });

  it("채무 각 4억: 63,584,000 · 총 양도가액(1원 · 16억 · 빈칸)과 무관", async () => {
    for (const total of ["", "1", "1600000000"]) {
      const r = await runCalc(bundle([bgHouse(), h2()], "apportioned", total));
      expect(agg(r)?.determinedTax).toBe(63_584_000);
      expect(gains(r)).toEqual([242_500_000, 42_500_000]);
    }
  });

  it("채무 4억 + 0 — 신고 단위 단일 비율 보존(121,250,000 + 72,750,000)", async () => {
    const r = await runCalc(
      bundle([bgHouse(), h2({ standardPriceAtAcq: "300000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0" })], "apportioned"),
    );
    expect(agg(r)?.determinedTax).toBe(36_647_000);
    expect(gains(r)).toEqual([121_250_000, 72_750_000]);
    // 표시 양도가액 = 확정 가액 Bᵢ = §159 양도가액(B 4억 × Aᵢ/ΣA). 종전엔 route 안분값 1,000,000,000 / 600,000,000이었다
    // (`transfer-companion-burdened-gift.plan.md` §1.3 기록 결함).
    expect((agg(r)?.properties ?? []).map((p: { transferPrice: number }) => p.transferPrice)).toEqual([250_000_000, 150_000_000]);
  });
});

describe("BG-3 전 자산 부담부증여 · 실가 거래 — 칸 없는 계약서 가액을 요구하지 않는다", () => {
  it.each([
    ["부담부증여 주택(주) + 입주권", () => [bgHouse(), right()], 178_436_400],
    ["부담부증여 주택 2건", () => [bgHouse(), bgHouse({ assetId: "h2", addressJibun: "서울 강남구 테스트동 3-3", standardPriceAtTransfer: "600000000" })], 63_584_000],
  ] as const)("%s: ⑧ 통과 · 200 · 안분 모드와 같은 세액", async (_l, mk, tax) => {
    const r = await runCalc(bundle(mk(), "actual"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(agg(r)?.determinedTax).toBe(tax);
  });

  it("숨은 계약서 가액이 남은 부담부증여 자산도 합계 검증에 걸리지 않는다(⑧·⑩) — 같은 세액", async () => {
    const r = await runCalc(bundle([bgHouse({ actualSalePrice: "600000000" }), right({ actualSalePrice: "300000000" })], "actual", "1600000000"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(agg(r)?.determinedTax).toBe(178_436_400);
  });
});

describe("BG-4 일반 양도 + 부담부증여 혼합 묶음 — 명시 차단", () => {
  it.each([
    ["일반 주택(주) + 부담부증여 주택 · 안분", () => bundle([house(), bgHouse()], "apportioned", "600000000")],
    ["일반 주택(주) + 입주권 · 안분", () => bundle([house(), right()], "apportioned", "600000000")],
    ["부담부증여 주택(주) + 일반 주택 · 안분", () => bundle([bgHouse(), house({ assetId: "hh" })], "apportioned", "600000000")],
    ["일반 주택(주) + 부담부증여 주택 · 실가", () => bundle([house(), bgHouse()], "actual", "600000000")],
  ] as const)("%s: ⑧ 차단 · ⑩ 400", async (_l, mk) => {
    const r = await runCalc(mk());
    expect(r.issues.some((i) => i.message.includes(MIXED_MESSAGE))).toBe(true);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json?.error ?? {})).toContain(MIXED_MESSAGE);
  });
});

describe("BG-5 부담부증여가 없는 묶음은 종전 그대로 (면제 범위 가드)", () => {
  const h2 = () => house({ assetId: "h2", addressJibun: "서울 강남구 테스트동 3-3", actualSalePrice: "700000000", standardPriceAtTransfer: "500000000" });

  it("안분 키가 없는 일반 컴패니언은 ⑩이 계속 400", async () => {
    const body = await captureBody(bundle([house(), h2()], "apportioned", "1300000000"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comps = (body.companionAssets as any[]).map((c) => ({ ...c, standardPriceAtTransfer: undefined, standardPriceAtTransferForApportion: undefined }));
    const r = await postTransfer({ ...body, companionAssets: comps });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json?.error ?? {})).toContain("apportioned 모드: 양도시 기준시가 필수");
  });

  it("주 자산 키가 없으면 ⑩이 계속 400", async () => {
    const body = await captureBody(bundle([house(), h2()], "apportioned", "1300000000"));
    const r = await postTransfer({ ...body, standardPriceAtTransferForApportion: undefined });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json?.error ?? {})).toContain("주 자산의 양도시점 기준시가 필수");
  });

  it("실가 거래 합계 불일치는 ⑧이 계속 막는다", async () => {
    const r = await runCalc(bundle([house(), h2()], "actual", "1000000000"));
    expect(r.issues.some((i) => i.message.includes("구분 기재된 양도가액 합"))).toBe(true);
  });

  it("실가 거래 일반 컴패니언의 계약서 가액이 없으면 ⑩이 계속 400", async () => {
    const body = await captureBody(bundle([house(), h2()], "actual", "1300000000"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comps = (body.companionAssets as any[]).map((c) => ({ ...c, fixedSalePrice: undefined }));
    const r = await postTransfer({ ...body, companionAssets: comps });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json?.error ?? {})).toContain("모든 자산의 계약서상 양도가액 필수");
  });

  it("일반 주택 2건 안분 세액 기준선", async () => {
    const r = await runCalc(bundle([house(), h2()], "apportioned", "1300000000"));
    expect(r.status).toBe(200);
    expect(agg(r)?.determinedTax).toBeGreaterThan(0);
  });
});
