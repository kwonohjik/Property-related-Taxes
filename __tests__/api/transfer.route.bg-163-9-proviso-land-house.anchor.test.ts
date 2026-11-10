/**
 * 부담부증여 × 「소득세법 시행령」 §163⑨ 단서(의제취득일 이후 · 기준시가 고시 전) — 토지 1호 · 단독주택 2호 (PR-1).
 * 계획서 docs/00-pm/bg-163-9-proviso-post-deemed.plan.md · 사용자 결정 Q-24 a · Q-25 a · Q-26 a · Q-27 a.
 *
 * §159①1호 A = 법 §97①1호 가액 — 상속 · 증여 자산은 §163⑨ 본문 · 단서에 따라 「평가액과 §164④(⑦) 가액 중 큰 금액」이다.
 * 수정 전에는 부담부증여가 실지 칸 값(평가액)만 A로 썼다(토지 +55,553,240 · 주택 +36,538,461 과대 — 계획서 §1.1).
 * 기대값 = 같은 사실의 일반 양도 A(STEP 0.45) × 채무비율. 세율은 mock — 양도차익으로 본다.
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

const HH = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};

/** 토지 · 상속 1988-06-01(단서 1호 · 개별공시지가 1990.8.30. 전) · 평가액 1억 · 1990 공시지가 ㎡당 500만 · 시가 5억 */
const LAND: Loose = {
  addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "1988-06-01",
  decedentAcquisitionDate: "1980-01-01", actualSalePrice: "500,000,000", publishedValueAtInheritance: "100,000,000",
  inheritanceValuationMethod: "supplementary", standardPriceAtTransfer: "300,000,000", fixedAcquisitionPrice: "",
  acquisitionArea: "100", transferArea: "100",
  pre1990Enabled: true, pre1990PricePerSqm_1990: "5,000,000", pre1990Grade_current: "100", pre1990Grade_prev: "90", pre1990Grade_atAcq: "80",
};
/** 단독주택 · 증여 2005-04-29(단서 2호 · 개별주택가격 2005.4.30. 전) · 평가액 1억 · 시가 12억 */
const HOUSE: Loose = {
  addressJibun: "제주특별자치도 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "gift", acquisitionDate: "2005-04-29",
  donorAcquisitionDate: "2000-01-01", giftDonorRelation: "other", giftSameHousehold: "no",
  inheritanceAssetKind: "house_individual", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "1,200,000,000",
  standardPriceAtTransfer: "800,000,000", acquisitionArea: "200", transferArea: "200",
  inhHouseValLandArea: "200", inhHouseValLandPricePerSqmAtTransfer: "3,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtInheritance: "500,000",
  inhHouseValBuildingStdPriceAtFirst: "60,000,000", inhHouseValBuildingStdPriceAtInheritance: "50,000,000",
};
/** 부담부증여 시가 · 실지 — ①(평가액)은 실지 칸(Q-24 a): 토지는 토지 칸, 주택은 총액 칸 */
const bg = (market: string, debt: string, actual: string, land = false): Loose => ({
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: market,
  bgMortgageDebtAmount: debt, bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual",
  ...(land ? { bgActualAcquisitionLand: actual } : { bgActualAcquisitionTotal: actual }),
});

function form(a: Loose): TransferFormData {
  const { contractTotal, ...rest } = a;
  const assets = [{ ...makeDefaultAsset(1), ...rest }];
  const total = contractTotal ?? String(a.actualSalePrice).replace(/,/g, "");
  return rosterForDeclaredCount(
    Object.assign(createDefaultTransferFormData(), { ...HH, contractTotalPrice: total, assets: assets as AssetForm[] }),
  ) as TransferFormData;
}

async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const res = (r.result ?? {}) as Loose;
  return {
    fe8: allIssues(f).map((i) => i.field),
    status: r.status,
    sentInh: body.inheritedAcquisition !== undefined,
    gain: res.transferGain as number | undefined,
    bgAcq: res.burdenedGiftBreakdown
      ? (res.burdenedGiftBreakdown.perAsset.land.acquisitionPrice + res.burdenedGiftBreakdown.perAsset.building.acquisitionPrice) as number
      : undefined,
    err: r.json?.error,
  };
}

describe("BG163P — 부담부증여 × §163⑨ 단서(의제취득일 이후)", () => {
  it("L0 토지 일반 양도 대조 — A = §164④ 238,883,100(단서 1호 큰 금액)", async () => {
    const r = await run(LAND);
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(261_116_900);
  });
  it("L1 토지 부담부증여 — A = max(1억, 238,883,100) × 2/5", async () => {
    const r = await run({ ...LAND, ...bg("500,000,000", "200,000,000", "100,000,000", true) });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(104_446_760);
  });
  it("H0 주택 일반 양도 대조 — A = §164⑦ 173,076,923(단서 2호 큰 금액)", async () => {
    const r = await run(HOUSE);
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(1_026_923_077);
  });
  it("L2 토지 — 평가액이 크면 평가액(3억 × 2/5)", async () => {
    const r = await run({ ...LAND, ...bg("500,000,000", "200,000,000", "300,000,000", true) });
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(80_000_000);
  });
  it("L3 토지 — §164④ 칸을 비우면 평가액만(Q-25 a · 막지 않는다)", async () => {
    const r = await run({
      ...LAND, ...bg("500,000,000", "200,000,000", "100,000,000", true),
      pre1990Enabled: false, pre1990PricePerSqm_1990: "", pre1990Grade_current: "", pre1990Grade_prev: "", pre1990Grade_atAcq: "",
    });
    expect([r.fe8, r.status, r.sentInh]).toEqual([[], 200, false]);
    expect(r.gain).toBe(160_000_000);
  });
  it("L5 토지 — §164④ 칸 일부만 입력하면 ⑧이 그 칸을 짚는다(일반 양도와 같은 all-or-nothing)", async () => {
    const r = await run({ ...LAND, ...bg("500,000,000", "200,000,000", "100,000,000", true), pre1990Enabled: false, pre1990Grade_prev: "" });
    expect(r.fe8).toEqual(["pre1990Grade_prev"]);
  });
  it("L4 토지 — 단서 밖(상속 1991)은 평가액만 · 싣지 않는다", async () => {
    const r = await run({ ...LAND, ...bg("500,000,000", "200,000,000", "100,000,000", true), acquisitionDate: "1991-06-01" });
    expect([r.status, r.sentInh]).toEqual([200, false]);
    expect(r.gain).toBe(160_000_000);
  });
  it("H1 주택 부담부증여 — A = max(1억, 173,076,923) × 6/12", async () => {
    const r = await run({ ...HOUSE, ...bg("1,200,000,000", "600,000,000", "100,000,000") });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBe(513_461_539);
  });
  it("H2 주택 — 평가액이 크면 평가액(2억 × 6/12)", async () => {
    const r = await run({ ...HOUSE, ...bg("1,200,000,000", "600,000,000", "200,000,000") });
    expect([r.fe8, r.status]).toEqual([[], 200]);
    expect(r.gain).toBe(500_000_000);
  });
  it("H3 주택 — 단서 밖(증여 2005-05-01)은 평가액만 · 싣지 않는다", async () => {
    const r = await run({ ...HOUSE, ...bg("1,200,000,000", "600,000,000", "100,000,000"), acquisitionDate: "2005-05-01" });
    expect([r.status, r.sentInh]).toEqual([200, false]);
    expect(r.gain).toBe(550_000_000);
  });
  it("H4 주택 — 기준시가 평가는 §163⑨를 쓰지 않는다(싣지 않는다)", async () => {
    const r = await run({
      ...HOUSE, ...bg("1,200,000,000", "600,000,000", "100,000,000"), bgValuationMode: "sangjeungbeop_standard",
      bgStdPriceAtTransfer: "800,000,000", bgStdPriceAtAcquisition: "50,000,000",
    });
    expect(r.sentInh).toBe(false);
  });
  it("H6 주택 — §164⑦ 칸 일부만 입력하면 ⑧이 막는다", async () => {
    const r = await run({ ...HOUSE, ...bg("1,200,000,000", "600,000,000", "100,000,000"), inhHouseValHousePriceAtFirst: "" });
    expect(r.fe8).toEqual(["inhHouseValHousePriceAtFirst"]);
  });
  it("H5 주택 지분 1/2(축 A) — 물건 전체 재료 · 채무 × 1/2 · 계약 총액 × 1/2 → 양도차익 절반(0~+1원)", async () => {
    const r = await run({
      ...HOUSE, ...bg("1,200,000,000", "300,000,000", "100,000,000"), contractTotal: "600000000",
      ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes",
    });
    expect([r.fe8, r.status, r.err]).toEqual([[], 200, undefined]);
    expect(r.gain).toBeGreaterThanOrEqual(256_730_769);
    expect(r.gain).toBeLessThanOrEqual(256_730_770);
  });
});
