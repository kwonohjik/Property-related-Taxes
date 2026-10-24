/**
 * PR-7b-1 — 의제취득일(1985.1.1.) 전 상속·증여 상가·건물 × 부담부증여 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * 사용자 결정: Q-24(시가 → max(①,②,③) × 채무비율) · Q-25(기준시가 → 의제취득일 기준시가 × 채무비율) ·
 *   Q-27(상가 기준시가 평가의 의제취득일 기준시가 = §164⑥ 8칸이 다 차 있으면 그 값, 아니면 칸 값) · Q-14(증여는 ① 필수).
 * 종전(master e465896ae)에는 상가·건물이 범위 밖이라 ④가 상속 의제 입력을 싣지 않고 §159가 사용자가 고른 산정방식 하나로 정했다.
 *
 * 화면 경로(폼 → ⑧ → ④ body → route ⑫⑭ → 엔진). 시료: 1983-07-26 상속 상가 · 2023-02-16 부담부증여 · 양도시 기준시가 400,000,000 ·
 * 의제취득일 기준시가 칸 200,000,000. 시가 평가 = 시가 920,000,000 · 채무 460,000,000(β 0.5). 기준시가 평가 = 채무 200,000,000(β 0.5). 세율은 mock.
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

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
};
const MARKET = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000" };
const STANDARD = { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "200000000" };
/** §164⑥ 8칸 — 취득당시 기준시가 509,090,909 */
const CB8 = {
  cbExclusiveArea: "50",
  cbSharedArea: "20",
  cbLandArea: "100",
  cbUnitPriceAtFirstOrAcq: "10000000",
  cbLandPricePerSqmAtAcq: "500000",
  cbLandPricePerSqmAtFirst: "700000",
  cbBuildingStdPriceAtAcq: "30000000",
  cbBuildingStdPriceAtFirst: "40000000",
  cbAcqBuildingStdBy164_5: true,
};

const form = (over: Record<string, unknown>): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16",
    filingDate: "2023-04-30",
    totalTransferExpense: "0",
    householdHousingCount: "0",
    isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), ...CB, ...over } as AssetForm],
  }) as TransferFormData;

async function run(over: Record<string, unknown>) {
  const f = form(over);
  const issues = allIssues(f);
  const body = await captureBody(f);
  const r = await postTransfer(body);
  const bg = r.result?.transferBurdenedGiftBreakdown;
  return { issues, body, status: r.status, tax: r.result?.determinedTax, bg, acq: bg ? bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice : undefined };
}

describe("기준시가 평가 (Q-25 · Q-27)", () => {
  it("S-1 의제취득일 기준시가 칸 200,000,000 × 0.5 → 9,936,000 (종전과 같다 — 종전 취득시 기준시가 칸 값)", async () => {
    const r = await run(STANDARD);
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed?.basis).toBe("deemed_std");
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(200_000_000);
    expect(r.acq).toBe(100_000_000);
    expect(r.tax).toBe(9_936_000);
  });

  it("S-2 §164⑥ 8칸이 다 차면 그 값 509,090,909이 의제취득일 기준시가 (종전 칸 값 200,000,000 · 9,936,000)", async () => {
    const r = await run({ ...STANDARD, ...CB8 });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(509_090_909);
    expect(r.acq).toBe(254_545_454);
    // 양도가액(채무 200,000,000) < 취득가액 254,545,454 → 양도차손 · 세액 0 (종전 칸 값이면 100,000,000 · 9,936,000)
    expect(r.tax).toBe(0);
  });

  it("S-2b 칸을 비우고 §164⑥ 8칸만 채워도 ⑧이 통과한다(원천 = §164⑥) · 의제취득일 기준시가 509,090,909", async () => {
    const r = await run({ ...STANDARD, ...CB8, standardPriceAtAcq: "" });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed?.stdAtDeemed).toBe(509_090_909);
  });

  it("S-3 §164⑥ 8칸 중 하나가 비면 칸 값 — ⑧이 일부 입력을 막는다", async () => {
    const r = await run({ ...STANDARD, ...CB8, cbBuildingStdPriceAtFirst: "" });
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("S-4 칸도 §164⑥도 없으면 ⑧이 의제취득일 기준시가 칸을 요구한다", async () => {
    const r = await run({ ...STANDARD, standardPriceAtAcq: "" });
    expect(r.issues.map((i) => i.field)).toContain("standardPriceAtAcq");
  });
});

describe("시가 평가 (Q-24)", () => {
  it("M-1 ① 3억 < ③ 460,000,000(920M × 2억/4억) → ③ × 0.5 = 230,000,000 · 39,492,000 · 산정방식 미전송", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "300000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100000000" });
    expect(r.issues).toEqual([]);
    expect((r.body.burdenedGiftInfo as Record<string, unknown>).acquisitionMethod).toBeUndefined();
    expect(r.bg?.preDeemed?.selected).toBe("converted");
    expect(r.acq).toBe(230_000_000);
    expect(r.tax).toBe(39_492_000); // 종전: 고른 실지 1억 → 88,170,000
  });

  it("M-2 ① 5억 > ③ → ① × 0.5 = 250,000,000 · 실제 경비(자본적지출 3억 × 0.5) · 4,665,000", async () => {
    const r = await run({ ...MARKET, publishedValueAtInheritance: "500000000", capitalExpenditure: "300000000" });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed?.selected).toBe("reported");
    expect(r.acq).toBe(250_000_000);
    expect(r.tax).toBe(4_665_000);
  });

  // 🔄 A안(2026-10-24 · 계획서 commercial-pre-deemed-converted-numerator.plan.md) — ③의 분자도 §164⑥ 값이라 ③ = 920M × 509,090,909 ÷ 4억.
  //    종전에는 ③이 칸 값 2억으로 460,000,000이라 ② 509,090,909 채택 × 0.5 = 254,545,454 · 34,021,364였다.
  it("M-3 §164⑥ 8칸 → ③ 1,170,909,090(분자 §164⑥) 채택 × 0.5 = 585,454,545 · 양도차손 0 (종전 ② 채택 · 34,021,364)", async () => {
    const r = await run({ ...MARKET, ...CB8, publishedValueAtInheritance: "300000000" });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed?.selected).toBe("converted");
    expect(r.bg?.preDeemed?.sec164).toBe(509_090_909);
    expect(r.bg?.preDeemed?.converted).toBe(1_170_909_090);
    expect(r.acq).toBe(585_454_545);
    expect(r.tax).toBe(0);
  });

  it("M-4 ① 없이 「확인할 수 없음」 선언 → ③ 230,000,000", async () => {
    const r = await run({ ...MARKET, preDeemedClauseAUnconfirmed: true });
    expect(r.issues).toEqual([]);
    expect(r.acq).toBe(230_000_000);
  });
});

describe("증여 · 건물(토지 제외)", () => {
  const GIFT = { acquisitionCause: "gift", inheritanceStartDate: "", donorAcquisitionDate: "1975-01-01" };

  it("G-1 증여 상가 시가 — ①(증여 신고가액)이 없으면 ⑧이 막는다(Q-14 · 종전에는 통과)", async () => {
    const r = await run({ ...MARKET, ...GIFT });
    expect(r.issues.map((i) => i.field)).toContain("fixedAcquisitionPrice");
  });

  it("G-2 증여 상가 시가 · ① 3억 → ③ 230,000,000 · 39,492,000", async () => {
    const r = await run({ ...MARKET, ...GIFT, fixedAcquisitionPrice: "300000000" });
    expect(r.issues).toEqual([]);
    expect(r.acq).toBe(230_000_000);
    expect(r.tax).toBe(39_492_000);
  });

  it("B-1 건물(토지 제외) 시가 · ① 3억 → ③ 230,000,000 (② 후보 없음)", async () => {
    const r = await run({ ...MARKET, assetKind: "building", publishedValueAtInheritance: "300000000" });
    expect(r.issues).toEqual([]);
    expect(r.bg?.preDeemed?.sec164).toBeNull();
    expect(r.acq).toBe(230_000_000);
  });

  it("B-2 1985 이후 상속 상가는 범위 밖 — 종전대로 고른 산정방식(환산 → 230,000,000)", async () => {
    const r = await run({ ...MARKET, acquisitionDate: "1990-07-26", inheritanceStartDate: "1990-07-26", bgAcquisitionMethod: "converted", publishedValueAtInheritance: "300000000" });
    expect(r.body.inheritedAcquisition).toBeUndefined();
    expect(r.bg?.preDeemed).toBeUndefined();
    expect(r.bg?.acquisitionMethodUsed).toBe("converted");
  });
});

describe("지분 · 함께 양도", () => {
  it("W-1 공유지분 1/2 · 기준시가 · §164⑥ 8칸 — 안분 전 509,090,909을 의제취득일 기준시가로 넣고 지분 축소 → 127,272,727 (API 직접 — 지분 단독은 ⑧이 다른 이유로 막는다)", async () => {
    const body = await captureBody(form({ ...STANDARD, ...CB8, bgMortgageDebtAmount: "100000000" }));
    const r = await postTransfer({ ...body, ownershipRatio: 0.5 });
    expect(r.status).toBe(200);
    const bg = r.result?.transferBurdenedGiftBreakdown;
    expect(bg?.preDeemed?.stdAtDeemed).toBe(509_090_909);
    expect(bg.perAsset.land.acquisitionPrice + bg.perAsset.building.acquisitionPrice).toBe(127_272_727);
  });

  it("W-2 함께 양도 카드 상가도 같은 빌더 — 의제취득일 전 상속 입력과 §164⑥이 실리고 산정방식은 싣지 않는다", async () => {
    const land = {
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 2-2",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      transferType: "regular",
      actualSalePrice: "500000000",
      fixedAcquisitionPrice: "300000000",
      acquisitionArea: "100",
      transferArea: "100",
      landNature: "standalone",
      standardPriceAtTransfer: "400000000",
    } as unknown as AssetForm;
    const commercial = { ...makeDefaultAsset(2), ...CB, ...STANDARD, ...CB8 } as unknown as AssetForm;
    const f = Object.assign(form({}), { contractTotalPrice: "500000000", assets: [land, commercial] }) as TransferFormData;
    const body = await captureBody(f);
    const companion = (body.companionAssets as Record<string, unknown>[] | undefined)?.find((c) => c.assetKind === "commercial_building");
    expect(companion?.inheritedAcquisition).toMatchObject({ mode: "pre-deemed" });
    expect(companion?.commercialInheritanceValuation).toBeDefined();
    expect((companion?.burdenedGiftInfo as Record<string, unknown>).acquisitionMethod).toBeUndefined();
  });
});

