/**
 * anchor: 승계 입주권 부담부증여 — 취득가액은 승계 블록 2칸(승계취득가액 + 추가분담금)이 정본이다.
 * 계획서 `docs/02-design/features/bg-successor-rtmi-acquisition-input.plan.md` Q-1 (a) · Q-2 (a).
 *
 * 수정 전: 부담부증여 ④가 원조합원용 「종전 부동산 실지취득가액」(`bgActualAcquisitionTotal`)만 읽었다. ⑧은 그 칸과 승계 2칸을
 *         둘 다 요구했고, 승계 블록 값(산정 방식 포함)은 세액에 쓰이지 않았다(카드 3억 · 승계 3억 + 1억 → 165,060,000).
 * 수정 후: 승계면 ④가 승계 합계를 싣고 ⑧은 카드 칸을 요구하지 않는다. 산정 방식은 부담부증여에서 실거래가로 읽는다.
 * 대조 세액은 수정 전 「카드 = 승계 합계(4억)」 값이다 — 단건 149,060,000 · 함께 양도 199,706,621.
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
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type A = Record<string, unknown>;
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
/** 원조합원 입주권 부담부증여(기준시가 평가 — 권리가액 12억 + 납입 2억 + 프리미엄 1억 · 채무 6억). */
const RIGHT: A = {
  assetId: "r", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase",
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
  bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", standardPriceAtAcq: "", standardPriceAtTransfer: "",
};
/** 승계조합원(인가 후 2020-01-01 취득) · 승계취득가액 3억 + 추가분담금 1억. 부담부증여 카드 칸은 기본으로 비운다(화면에 없다). */
const succ = (over: A = {}) =>
  ({
    ...makeDefaultAsset(2), ...RIGHT, acquisitionDate: "2020-01-01", ...successorRightTogglePatch(true),
    successorRightAcqPrice: "300,000,000", successorRightAddedContribution: "100,000,000", bgActualAcquisitionTotal: "", ...over,
  }) as AssetForm;
const H = {
  ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 A 1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard",
  bgMortgageDebtAmount: "200000000", bgLendingDepositTotal: "0", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000",
} as AssetForm;
const one = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] }) as TransferFormData;
const two = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "companion", assets: [H, a] }) as TransferFormData;
const MKT: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,500,000,000", bgAcquisitionMethod: "actual" };
const STD: A = {
  successorRightStdPaidAtAcq: "250,000,000", successorRightStdPremiumAtAcq: "50,000,000",
  successorRightStdPaidAtTransfer: "500,000,000", successorRightStdPremiumAtTransfer: "100,000,000",
};

async function run(f: TransferFormData) {
  const r = await runCalc(f);
  const res = r.result as { determinedTax?: number } | undefined;
  const agg = (r.json as { data?: { aggregated?: { totalTax?: number } } } | undefined)?.data?.aggregated?.totalTax;
  const bg = r.body.burdenedGiftInfo as { actualAcquisitionTotal?: number } | undefined;
  return {
    fields: r.issues.map((i) => i.field),
    status: r.status,
    tax: res?.determinedTax ?? agg,
    bgActual: bg?.actualAcquisitionTotal,
    acquisitionMethod: r.body.acquisitionMethod,
  };
}

describe("단건 — 승계 합계가 실지취득가액이다", () => {
  it("카드 칸 없이(비움) ⑧ 통과 · ④ 4억 · 대조 149,060,000", async () => {
    expect(await run(one(succ()))).toMatchObject({ fields: [], status: 200, tax: 149_060_000, bgActual: 400_000_000 });
  });
  it("카드에 다른 값(3억)이 남아 있어도 읽지 않는다 — 수정 전 165,060,000", async () => {
    expect(await run(one(succ({ bgActualAcquisitionTotal: "300,000,000" })))).toMatchObject({ fields: [], tax: 149_060_000, bgActual: 400_000_000 });
  });
  it("승계취득가액을 바꾸면 세액이 따라간다(수정 전에는 그대로였다)", async () => {
    const r = await run(one(succ({ successorRightAcqPrice: "900,000,000" })));
    expect(r).toMatchObject({ fields: [], status: 200, bgActual: 1_000_000_000 });
    expect(r.tax).toBeLessThan(149_060_000);
  });
  it("시가 평가도 같다 — 카드 비움 · ⑧ 통과 · 149,060,000", async () => {
    expect(await run(one(succ(MKT)))).toMatchObject({ fields: [], status: 200, tax: 149_060_000, bgActual: 400_000_000 });
  });
  it("승계 2칸을 비우면 ⑧이 승계취득가액을 요구한다(화면에 있는 칸)", async () => {
    expect((await run(one(succ({ successorRightAcqPrice: "", successorRightAddedContribution: "" })))).fields).toEqual(["successorRightAcqPrice"]);
  });
});

describe("남은 추계 플래그(Q-2 a) — 부담부증여에서는 실거래가로 읽는다", () => {
  const FLAGS: [string, A][] = [
    ["환산", { useEstimatedAcquisition: true }],
    ["감정", { isAppraisalAcquisition: true, fixedAcquisitionPrice: "500,000,000" }],
    ["매매사례", { isSalesCaseAcquisition: true, similarSalesValue: "500,000,000" }],
  ];
  it.each(FLAGS)("%s — 기준시가 칸 없이 ⑧ 통과 · 200 · 149,060,000", async (_n, fl) => {
    expect(await run(one(succ(fl)))).toMatchObject({ fields: [], status: 200, tax: 149_060_000, bgActual: 400_000_000 });
  });
  it.each(FLAGS)("%s — 기준시가 칸이 있어도 같다", async (_n, fl) => {
    expect(await run(one(succ({ ...fl, ...STD })))).toMatchObject({ fields: [], status: 200, tax: 149_060_000 });
  });
  it("저장된 플래그는 지우지 않는다", async () => {
    const f = one(succ({ isAppraisalAcquisition: true }));
    await run(f);
    expect(f.assets[0].isAppraisalAcquisition).toBe(true);
  });
});

describe("함께 양도(주택 + 승계 입주권) — 같은 leaf", () => {
  it("카드 비움 · ⑧ 통과 · 대조 199,706,621", async () => {
    expect(await run(two(succ()))).toMatchObject({ fields: [], status: 200, tax: 199_706_621 });
  });
  it("카드 9억이 남아 있어도 읽지 않는다 — 수정 전 106,682,632", async () => {
    expect(await run(two(succ({ bgActualAcquisitionTotal: "900,000,000" })))).toMatchObject({ fields: [], tax: 199_706_621 });
  });
  it("남은 환산·감정 플래그도 실거래가로 읽는다", async () => {
    expect(await run(two(succ({ useEstimatedAcquisition: true })))).toMatchObject({ fields: [], status: 200, tax: 199_706_621 });
    expect(await run(two(succ({ isAppraisalAcquisition: true })))).toMatchObject({ fields: [], status: 200, tax: 199_706_621 });
  });
});

describe("범위 — 원조합원·일반 양도는 종전대로", () => {
  /** 원조합원(인가 전 2009-07-01 취득) — §166 입력 포함. */
  const orig = (over: A = {}) =>
    ({
      ...makeDefaultAsset(2), ...RIGHT, acquisitionDate: "2009-07-01", isSuccessorRightToMoveIn: false, redevOriginalAssetType: "housing",
      redevRightsValue: "900,000,000", redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "0",
      useEstimatedAcquisition: false, bgActualAcquisitionTotal: "300,000,000", ...over,
    }) as AssetForm;
  it("원조합원은 「종전 부동산 실지취득가액」 칸을 계속 요구한다", async () => {
    expect((await run(one(orig({ bgActualAcquisitionTotal: "" })))).fields).toContain("bgActualAcquisitionTotal");
  });
  it("원조합원은 카드 값을 그대로 싣는다", async () => {
    expect(await run(one(orig()))).toMatchObject({ fields: [], status: 200, bgActual: 300_000_000 });
  });
  it("일반 양도 승계는 산정 방식을 그대로 읽는다 — 감정이면 ④ appraisal", async () => {
    const reg = succ({ transferType: "regular", bgValuationMode: "", bgMortgageDebtAmount: "", actualSalePrice: "1,500,000,000", isAppraisalAcquisition: true, fixedAcquisitionPrice: "500,000,000", ...STD });
    const f = Object.assign(one(reg), { contractTotalPrice: "1500000000" });
    expect(await run(f)).toMatchObject({ fields: [], status: 200, acquisitionMethod: "appraisal" });
  });
});
