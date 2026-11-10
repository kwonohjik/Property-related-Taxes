/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서 2호(의제취득일 이후 · 상가 기준시가 최초고시 2005.1.1. 전) — 상가 · 오피스텔 §164⑥ (PR-2).
 * 계획서 docs/00-pm/bg-163-9-proviso-post-deemed.plan.md §9 · 사용자 결정 Q-24 a · Q-25 a · Q-26 a · Q-27 a.
 *
 * 시료: 2003-06-01 상속(증여) 상가 · 평가액 1억 · §164⑥ 8칸(취득당시 기준시가 509,090,909) · 시가 9.2억 · 채무 4.6억(β 0.5).
 * 일반 양도는 큰 금액(509,090,909)을 쓴다. 수정 전 부담부증여는 실지 칸 1억만 써 양도차익 410,000,000(큰 금액이면 205,454,546 · +204,545,454 과대).
 * ② 칸은 ③ 취득정보 `CommercialInheritanceStdPriceSection`(일반 양도와 같은 칸). 세율 mock — 양도차익으로 본다.
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
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** §164⑥ 8칸 — 취득당시 기준시가 509,090,909(`transfer.route.bg-pre-deemed-commercial.routes.anchor.test.ts`와 같은 재료) */
const CB8: Loose = {
  cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100", cbUnitPriceAtFirstOrAcq: "10000000", cbLandPricePerSqmAtAcq: "500000",
  cbLandPricePerSqmAtFirst: "700000", cbBuildingStdPriceAtAcq: "30000000", cbBuildingStdPriceAtFirst: "40000000", cbAcqBuildingStdBy164_5: true,
};
const CB: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "commercial_building", acquisitionCause: "inheritance", acquisitionDate: "2003-06-01",
  inheritanceStartDate: "2003-06-01", decedentAcquisitionDate: "1990-01-01", actualSalePrice: "920000000", standardPriceAtTransfer: "400000000",
  standardPriceAtAcq: "200000000", publishedValueAtInheritance: "100000000", inheritanceValuationMethod: "supplementary", ...CB8,
};
const GIFT: Loose = { acquisitionCause: "gift", inheritanceStartDate: "", fixedAcquisitionPrice: "100000000", donorAcquisitionDate: "1990-01-01", giftDonorRelation: "other", giftSameHousehold: "no" };
const bg = (actual = "100000000", debt = "460000000"): Loose => ({
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: debt,
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: actual,
});
const BLANK8 = Object.fromEntries(Object.keys(CB8).map((k) => [k, k === "cbAcqBuildingStdBy164_5" ? false : ""]));

function form(a: Loose): TransferFormData {
  const { contractTotal, ...rest } = a;
  return rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, contractTotalPrice: contractTotal ?? "920000000",
    assets: [{ ...makeDefaultAsset(1), ...rest } as AssetForm],
  })) as TransferFormData;
}
async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const res = (r.result ?? {}) as Loose;
  return { fe8: allIssues(f).map((i) => i.field), status: r.status, err: r.json?.error, sentInh: body.inheritedAcquisition !== undefined, gain: res.transferGain as number | undefined };
}

describe("BG163C — 부담부증여 × §163⑨ 단서 2호 · 상가 §164⑥", () => {
  it("C0 일반 양도 대조 — A = §164⑥ 509,090,909(큰 금액)", async () => {
    const r = await run(CB);
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(410_909_091);
  });
  it("C1 상속 부담부증여 — A = max(1억, 509,090,909) × 0.5", async () => {
    const r = await run({ ...CB, ...bg() });
    expect([r.fe8, r.status, r.err, r.sentInh]).toEqual([[], 200, undefined, true]);
    expect(r.gain).toBe(205_454_546);
  });
  it("C2 증여 부담부증여 — 같은 값", async () => {
    const r = await run({ ...CB, ...GIFT, ...bg() });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(205_454_546);
  });
  it("C3 평가액이 크면 평가액(6억 × 0.5)", async () => {
    const r = await run({ ...CB, ...bg("600000000") });
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(160_000_000);
  });
  it("C4 §164⑥ 칸을 비우면 평가액만(Q-25 a · 싣지 않는다)", async () => {
    const r = await run({ ...CB, ...bg(), ...BLANK8 });
    expect([r.fe8, r.status, r.sentInh]).toEqual([[], 200, false]);
    expect(r.gain).toBe(410_000_000);
  });
  it("C5 §164⑥ 칸 일부만 입력하면 ⑧이 막는다(일반 양도와 같은 all-or-nothing)", async () => {
    const r = await run({ ...CB, ...bg(), cbBuildingStdPriceAtFirst: "" });
    expect(r.fe8).toEqual(["cbBuildingStdPriceAtFirst"]);
  });
  it("C6 단서 밖(상속 2006) — 평가액만 · 싣지 않는다", async () => {
    const r = await run({ ...CB, ...bg(), acquisitionDate: "2006-06-01", inheritanceStartDate: "2006-06-01" });
    expect([r.status, r.sentInh]).toEqual([200, false]);
    expect(r.gain).toBe(410_000_000);
  });
  it("C7 기준시가 평가 — §163⑨를 쓰지 않는다(싣지 않는다)", async () => {
    const r = await run({ ...CB, ...bg(), bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", bgMortgageDebtAmount: "200000000" });
    expect(r.sentInh).toBe(false);
  });
  it("C8 지분 1/2(축 A) — 물건 전체 재료 · 채무 × 1/2 · 계약 총액 × 1/2 → 양도차익 절반(0~+1원)", async () => {
    const r = await run({ ...CB, ...bg("100000000", "230000000"), ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", contractTotal: "460000000" });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBeGreaterThanOrEqual(102_727_273);
    expect(r.gain).toBeLessThanOrEqual(102_727_274);
  });
});
