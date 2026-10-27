/**
 * anchor: 축 B(같은 물건 지분 분할) × 부담부증여 — 결과 명세 취득가액·개산공제 = 지분 카드 합.
 * 계획서 `docs/02-design/features/bg-axis-b-card-acquisition-sum.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 수정 전: 명세는 첫 지분 카드 값으로 다시 계산한 물건 전체 값이었다. 지분마다 따로 받는 값(입주권 승계취득가액·원조합원 여부,
 * 감정가액·매매사례가액, 취득시 기준시가)이 다르면 세액과 갈렸다(§2.2 표의 「현재 표시」 값). 세액은 그대로다 — 「수정 전 세액」은 같은 시료의 측정값.
 * 시료: 입주권 = `transfer.route.bg-axis-b-right-share-inputs.anchor.test.ts`(평가 15억 · 채무 6억 · 채무비율 40% · 지분 50%),
 *       주택 = `__tests__/calc/axis-b-burdened-gift-presumed.anchor.test.ts`(시가 10억 · 채무 6억 · 채무비율 60% · 지분 60/40).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

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
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;

// ── 입주권 ──
const RBASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const first = (over: A) =>
  ({
    ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
    acquisitionCause: "purchase", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000",
    bgDonorRelation: "lineal_descendant", bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", standardPriceAtAcq: "", standardPriceAtTransfer: "", ...HALF, ...over,
  }) as AssetForm;
const share = (over: A) =>
  ({ ...makeDefaultAsset(2), assetId: "s", ...HALF, acquisitionCause: "purchase", redevApprovalDate: "2018-06-01", ...over }) as AssetForm;
/** 승계 — 승계취득가액 3억 + 추가분담금 1억 = 4억(물건 전체). */
const SUCC: A = { ...successorRightTogglePatch(true), acquisitionDate: "2020-01-01", successorRightAcqPrice: "300,000,000", successorRightAddedContribution: "100,000,000" };
const SUCC6: A = { ...SUCC, successorRightAcqPrice: "500,000,000" };
/** 원조합원 — 종전 부동산 3억(첫 카드 칸) · 권리가액 9억 · 청산금 납부 1억(지분 해당분). */
const ORIG: A = {
  isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", redevOriginalAssetType: "housing", redevRightsValue: "900,000,000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100,000,000", redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74",
};
const ACQ3 = { bgActualAcquisitionTotal: "300,000,000" };
const rights = (p: AssetForm, s: AssetForm) =>
  Object.assign(createDefaultTransferFormData(), RBASE, { assetSplitMode: "fractional", contractTotalPrice: "1500000000", assets: [p, s] }) as TransferFormData;

// ── 주택 ──
const PRES: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "appraisal" };
const house = (id: number, num: string, acq: string, over: A) =>
  ({
    ...makeDefaultAsset(id), assetId: id === 1 ? "p" : `s${id}`, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: acq, ownershipNumerator: num, ownershipDenominator: "100", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000", standardPriceAtTransfer: "1000000001",
    standardPriceAtAcq: "500000001", ...over,
  }) as AssetForm;
const houses = (a: A, b: A) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1000000000", totalTransferExpense: "0", householdHousingCount: "2",
    isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
    assets: [house(1, "60", "2009-03-01", a), house(2, "40", "2012-03-01", b)],
  }) as TransferFormData;

async function run(f: TransferFormData) {
  const r = await runCalc(f);
  const d = (r.json as { data?: { transferBurdenedGiftBreakdown?: TransferBurdenedGiftBreakdown; aggregated?: { totalTax: number } } } | undefined)?.data;
  const bg = d?.transferBurdenedGiftBreakdown;
  return {
    fields: r.issues.map((i) => i.field),
    status: r.status,
    tax: d?.aggregated?.totalTax,
    shown: bg ? bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice : undefined,
    est: bg ? bg.perAsset.land.estimatedDeduction + bg.perAsset.building.estimatedDeduction : undefined,
    cards: bg?.cards?.map((c) => c.breakdown.perAsset.land.acquisitionPrice + c.breakdown.perAsset.building.acquisitionPrice),
    filing: bg?.cards?.map((c) => c.redevFilingAcquisition),
  };
}

describe("입주권 — 취득가액 = 지분 카드 합 (Q-1 a · Q-2 a)", () => {
  it.each([
    // [이름, 폼, 카드별, 합(수정 전 표시), 카드별 신고서 취득가액, 세액(수정 전과 같다)]
    ["승계 4억 + 승계 4억", () => rights(first(SUCC), share(SUCC)), [80_000_000, 80_000_000], 160_000_000, [undefined, undefined], 163_966_000],
    ["승계 4억 + 승계 6억 (수정 전 160,000,000)", () => rights(first(SUCC), share(SUCC6)), [80_000_000, 120_000_000], 200_000_000, [undefined, undefined], 146_366_000],
    ["원 3억 + 원 3억", () => rights(first({ ...ORIG, ...ACQ3 }), share(ORIG)), [60_000_000, 60_000_000], 120_000_000, [100_000_000, 100_000_000], 129_470_000],
    ["원 3억 + 승계 4억 (수정 전 120,000,000)", () => rights(first({ ...ORIG, ...ACQ3 }), share(SUCC)), [60_000_000, 80_000_000], 140_000_000, [100_000_000, undefined], 146_718_000],
    ["승계 4억 + 원 3억 (수정 전 160,000,000)", () => rights(first({ ...SUCC, ...ACQ3 }), share(ORIG)), [80_000_000, 60_000_000], 140_000_000, [undefined, 100_000_000], 146_718_000],
  ] as const)("%s", async (_n, f, cards, shown, filing, tax) => {
    const r = await run(f());
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.cards).toEqual(cards);
    expect(r.shown).toBe(shown);
    expect(r.filing).toEqual(filing);
    expect(r.tax).toBe(tax);
  });
});

describe("주택 — 감정가액·매매사례가액·기준시가도 지분 합 (Q-1 a)", () => {
  it.each([
    ["감정가액 4억 / 5억 (수정 전 240,000,000 · 3,600,000)", { ...PRES, bgPresumedAcquisitionTotal: "400000000", standardPriceAtAcq: "200000000" }, { ...PRES, bgPresumedAcquisitionTotal: "500000000", standardPriceAtAcq: "300000000" }, [144_000_000, 120_000_000], 264_000_000, 4_320_000, 77_025_995],
    ["매매사례가액 4억 / 5억", { ...PRES, bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "400000000", standardPriceAtAcq: "200000000" }, { ...PRES, bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "500000000", standardPriceAtAcq: "300000000" }, [144_000_000, 120_000_000], 264_000_000, 4_320_000, 77_025_995],
    ["기준시가 평가 · 취득시 기준시가 2억 / 3억 (수정 전 119,999,999 · 3,599,999)", { standardPriceAtAcq: "200000000" }, { standardPriceAtAcq: "300000000" }, [72_000_000, 72_000_000], 144_000_000, 4_320_000, 113_861_616],
    ["실지취득가 4억(첫 카드 칸 병합) — 수정 전에도 같았다", { ...PRES, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400000000", standardPriceAtAcq: "200000000" }, { ...PRES, bgAcquisitionMethod: "actual", standardPriceAtAcq: "300000000" }, [144_000_000, 96_000_000], 240_000_000, 0, 85_968_520],
  ] as const)("%s", async (_n, a, b, cards, shown, est, tax) => {
    const r = await run(houses(a, b));
    expect(r.fields).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.cards).toEqual(cards);
    expect(r.shown).toBe(shown);
    expect(r.est).toBe(est);
    expect(r.tax).toBe(tax);
  });
});
