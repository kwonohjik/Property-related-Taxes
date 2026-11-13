/**
 * anchor — 양도차손 조기 반환 결과의 **표시 echo** (「취득가액 0 · 필요경비 0」) · 계획서 docs/00-pm/loss-case-early-return-echo-omission.plan.md (Q-1 a)
 *
 * `buildLossTransferTaxResult` 가 정상 반환·비과세 조기 반환이 싣는 `expenses`·`estimatedBase`·`estimatedDeduction`·`estimatedStdPrice*`·`swap*`·§164⑨ 특례 상세를 싣지 않아,
 * 신고서는 필요경비를 취득가액에 흡수(환산 손실 302,940,000 / 비어 있음)하고 명세서 1단계는 환산 손실을 0 · 0 으로 찍었다. **세액은 처음부터 정확**(양도차손 = 결정세액 0).
 *
 *  · LE-1 환산 손실 · LE-2 실가 손실 · LE-3 환산 + 공매 손실(특례 카드·다건) · LE-4 이월과세 A + 공매 손실 · LE-7 §97②2호 단서 swap 손실
 *  · LE-5 양도차익 대조(불변) · LE-6 세액·가산세 불변
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const COMMON = {
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
  householdHousingCount: 2, residencePeriodMonths: 0, reductions: [] as unknown[], annualBasicDeductionUsed: 0,
};
/** 건물 · 양도가 3억 · 환산(취득시 198M / 양도시 200M → 환산취득가 297,000,000 · 개산공제 5,940,000 · 양도차익 −2,940,000) */
const plain = (over: object = {}) => ({
  ...COMMON, propertyType: "building", transferPrice: 300_000_000, transferDate: "2026-03-01", acquisitionPrice: 0, acquisitionDate: "2015-01-01", expenses: 0,
  useEstimatedAcquisition: true, standardPriceAtAcquisition: 198_000_000, standardPriceAtTransfer: 200_000_000, acquisitionCause: "purchase", ...over,
});
/** 실가 — 취득가 3.2억 · 경비 5백만 → 양도차익 −25,000,000 */
const ACTUAL = { useEstimatedAcquisition: false, acquisitionPrice: 320_000_000, expenses: 5_000_000, standardPriceAtAcquisition: undefined, standardPriceAtTransfer: undefined };
/** 환산 + 공매 150M: 분모 min(400M, 150M) = 150M → 환산취득가 300M × 200M ÷ 150M = 400,000,000 · 개산공제 6,000,000 · 차익 −106,000,000 */
const AUCTION_LOSS = { standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000, isAuctionTransfer: true, auctionPrice: 150_000_000 };
const CT = { giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", useEstimatedAcquisition: true, giftTaxAmount: 0, giftDateValuation: 800_000_000 };
/** 이월과세 A · 공매 2억 → 환산 300,000,000 · 개산공제 6,000,000 · 차익 −6,000,000 */
const carry = (over: object = {}, ctOver: object = {}) => ({
  ...plain({ acquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01", standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000, ...over }),
  donorAcquisitionDate: "2015-01-01", carryoverTaxation: { ...CT, ...ctOver },
});
const AUCTION_2 = { isAuctionTransfer: true, auctionPrice: 200_000_000 };

interface R {
  transferGain: number; determinedTax: number; totalTax: number; penaltyBase?: number; penaltyTax?: number; swapApplied?: boolean;
  estimatedBase?: number; estimatedDeduction?: number; expenses?: number; estimatedStdPriceAtAcquisition?: number; estimatedStdPriceAtTransfer?: number;
  auctionValuationDetail?: unknown; capitalExpenditureForDisplay?: number;
  carryoverTaxationDetail?: { scenarioA: { acquisitionPrice: number } };
}
const req = (u: string, b: object) => new NextRequest(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
async function single(body: object): Promise<R> {
  const res = await SINGLE(req("http://localhost/api/calc/transfer", body));
  const json = (await res.json()) as { data?: { result: R }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}
async function multi(body: object) {
  const res = await MULTI(req("http://localhost/api/calc/transfer/multi", { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [{ propertyId: "p1", propertyLabel: "p1", ...body }] }));
  const json = (await res.json()) as { data?: { properties: { transferGain: number; acquisitionPrice: number; necessaryExpense: number }[] }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.properties[0];
}
/** 신고서 표(`buildRows`)·상세명세서(`buildStatementItems`)의 취득가액·필요경비 */
function shown(r: R) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-01"; f.contractTotalPrice = "300000000";
  f.assets[0] = { ...f.assets[0], assetKind: "building", actualSalePrice: "300000000" } as never;
  const rows = buildRows(r as never, "single", f, f.assets[0]);
  const cell = (l: string) => rows.find((x) => x.label === l)?.values.total;
  const items = buildStatementItems(r as never, f, f.assets[0], undefined, undefined);
  return { formAcq: cell("취득가액"), formExp: cell("필요경비"), stmtAcq: items.get("acquisitionPrice")?.value, stmtExp: items.get("expenses")?.value };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("LE-1 환산 양도차손", () => {
  it("LE-1-1 결과에 환산 근거가 실린다: 환산취득가 297,000,000 · 개산공제 5,940,000 · 필요경비 5,940,000 · 기준시가 198M/200M", async () => {
    const r = await single(plain());
    expect(r).toMatchObject({ transferGain: -2_940_000, determinedTax: 0, totalTax: 0, estimatedBase: 297_000_000, estimatedDeduction: 5_940_000, expenses: 5_940_000, estimatedStdPriceAtAcquisition: 198_000_000, estimatedStdPriceAtTransfer: 200_000_000, capitalExpenditureForDisplay: 0 });
  });
  it("LE-1-2 신고서 297,000,000 / 5,940,000 · 명세서 1단계 297,000,000 / 5,940,000 (종전 302,940,000 / 비어 있음 · 0 / 0)", async () => {
    expect(shown(await single(plain()))).toEqual({ formAcq: 297_000_000, formExp: 5_940_000, stmtAcq: 297_000_000, stmtExp: 5_940_000 });
  });
  it("LE-1-3 다건 합산 열도 같다", async () => {
    expect(await multi(plain())).toMatchObject({ transferGain: -2_940_000, acquisitionPrice: 297_000_000, necessaryExpense: 5_940_000 });
  });
});

describe("LE-2 실가 양도차손", () => {
  it("LE-2-1 필요경비 5,000,000이 취득가액에 흡수되지 않는다: 신고서 320,000,000 / 5,000,000 · 명세서 320,000,000 / 5,000,000 (종전 325,000,000 / 비어 있음 · 325,000,000 / 0)", async () => {
    const r = await single(plain(ACTUAL));
    expect(r).toMatchObject({ transferGain: -25_000_000, determinedTax: 0, expenses: 5_000_000 });
    expect(shown(r)).toEqual({ formAcq: 320_000_000, formExp: 5_000_000, stmtAcq: 320_000_000, stmtExp: 5_000_000 });
    expect(r.estimatedBase).toBeUndefined(); // 실가는 환산 근거를 싣지 않는다
  });
});

describe("LE-3 환산 + 공매(영 §164⑨ 2호) 양도차손", () => {
  it("LE-3-1 특례 근거 카드가 실리고 환산취득가 400,000,000 · 개산공제 6,000,000 (종전 카드 없음)", async () => {
    const r = await single(plain(AUCTION_LOSS));
    expect(r).toMatchObject({ transferGain: -106_000_000, determinedTax: 0, estimatedBase: 400_000_000, estimatedDeduction: 6_000_000, expenses: 6_000_000 });
    expect(r.auctionValuationDetail).toBeTruthy();
  });
  it("LE-3-2 신고서 400,000,000 / 6,000,000 · 명세서 400,000,000 / 6,000,000 (종전 406,000,000 / 비어 있음 · 0 / 0)", async () => {
    expect(shown(await single(plain(AUCTION_LOSS)))).toEqual({ formAcq: 400_000_000, formExp: 6_000_000, stmtAcq: 400_000_000, stmtExp: 6_000_000 });
  });
  it("LE-3-3 다건 합산 열: 취득가액 400,000,000 / 필요경비 6,000,000 (종전 150,000,000 / 256,000,000 — 합계 406,000,000은 같다)", async () => {
    expect(await multi(plain(AUCTION_LOSS))).toMatchObject({ transferGain: -106_000_000, acquisitionPrice: 400_000_000, necessaryExpense: 6_000_000 });
  });
});

describe("LE-3b 환산 + 수용(영 §164⑨ 1호) 양도차손", () => {
  // 수용 per-sqm: min(양도시 4억, 보상액 1.5억, 보상기초 3억) = 1.5억 → 환산취득가 400,000,000
  const EXPR = { transferCause: "public_expropriation", transferArea: 100, standardPricePerSqmAtTransfer: 4_000_000, compensationPerSqm: 1_500_000, compensationBasisStdPrice: 3_000_000 };
  it("LE-3b-1 per-sqm: 수용 카드가 실리고 신고서 400,000,000 / 6,000,000", async () => {
    const r = await single(plain({ standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000, ...EXPR }));
    expect((r as unknown as { expropriationValuationDetail?: unknown }).expropriationValuationDetail).toBeTruthy();
    expect(shown(r)).toEqual({ formAcq: 400_000_000, formExp: 6_000_000, stmtAcq: 400_000_000, stmtExp: 6_000_000 });
  });
  it("LE-3b-2 일체 주택 총액(라목): 주택 수용 카드가 실린다", async () => {
    const r = await single(plain({ propertyType: "housing", standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000, transferCause: "public_expropriation", housingCompensationTotal: 150_000_000, housingCompensationBasisTotal: 250_000_000 }));
    expect((r as unknown as { housingExpropriationValuationDetail?: unknown }).housingExpropriationValuationDetail).toBeTruthy();
    expect(r.estimatedBase).toBe(400_000_000);
  });
});

describe("LE-4 이월과세 A + 공매 양도차손", () => {
  it("LE-4-1 신고서 300,000,000 / 6,000,000 · 명세서 300,000,000 / 6,000,000 · A 카드 취득가 300,000,000 (종전 306,000,000 / 비어 있음 · 0 / 0)", async () => {
    const r = await single(carry(AUCTION_2));
    expect(r).toMatchObject({ transferGain: -6_000_000, determinedTax: 0, estimatedBase: 300_000_000, estimatedDeduction: 6_000_000 });
    expect(r.carryoverTaxationDetail!.scenarioA.acquisitionPrice).toBe(300_000_000);
    expect(shown(r)).toEqual({ formAcq: 300_000_000, formExp: 6_000_000, stmtAcq: 300_000_000, stmtExp: 6_000_000 });
  });
});

describe("LE-5 양도차익 대조 — 불변", () => {
  it("LE-5-1 환산 이익: 285,000,000 / 5,700,000 (신고서·명세서)", async () => {
    const r = await single(plain({ standardPriceAtAcquisition: 190_000_000 }));
    expect(r).toMatchObject({ transferGain: 9_300_000, estimatedBase: 285_000_000, expenses: 5_700_000 });
    expect(shown(r)).toEqual({ formAcq: 285_000_000, formExp: 5_700_000, stmtAcq: 285_000_000, stmtExp: 5_700_000 });
  });
  it("LE-5-2 실가 이익: 250,000,000 / 5,000,000", async () => {
    const r = await single(plain({ ...ACTUAL, acquisitionPrice: 250_000_000 }));
    expect(r.transferGain).toBe(45_000_000);
    expect(shown(r)).toEqual({ formAcq: 250_000_000, formExp: 5_000_000, stmtAcq: 250_000_000, stmtExp: 5_000_000 });
  });
  it("LE-5-3 이월과세 A 이익: 150,000,000 / 6,000,000", async () => {
    const r = await single(carry());
    expect(r.transferGain).toBe(144_000_000);
    expect(shown(r)).toEqual({ formAcq: 150_000_000, formExp: 6_000_000, stmtAcq: 150_000_000, stmtExp: 6_000_000 });
  });
});

describe("LE-6 세액·가산세 불변", () => {
  it("LE-6-1 증여자 신축 가산세(DP-6) 공매 손실: penaltyBase 300,000,000 · 가산세 15,000,000 · 총납부 16,500,000 · 결정세액 0", async () => {
    const r = await single(carry(AUCTION_2, { donorBuilt: { buildingType: "new", constructionDate: "2022-01-10" }, donorAcquisitionDate: "2022-01-10" }));
    expect(r).toMatchObject({ transferGain: -6_000_000, determinedTax: 0, penaltyBase: 300_000_000, penaltyTax: 15_000_000, totalTax: 16_500_000 });
  });
  it("LE-6-2 순수 손실은 총납부 0 그대로", async () => {
    for (const body of [plain(), plain(ACTUAL), plain(AUCTION_LOSS), carry(AUCTION_2)]) expect(await single(body)).toMatchObject({ determinedTax: 0, totalTax: 0 });
  });
});

describe("LE-7 §97②2호 단서(swap) 양도차손", () => {
  // 자본적지출 310M > 환산취득가 297M + 개산공제 5.94M → 단서: 환산취득가액을 차감하지 않고 자본적지출을 필요경비로 → 차익 300M − 310M = −10M
  it("LE-7-1 swap 손실: 항등식 양도가 − 취득가 − 필요경비 = 양도차익이 신고서·명세서 모두 성립한다", async () => {
    const r = await single(plain({ capitalExpenditure: 310_000_000 }));
    expect(r.swapApplied).toBe(true);
    expect((r as unknown as { swapComparison?: unknown }).swapComparison).toBeTruthy();
    expect(r.transferGain).toBe(-10_000_000);
    const s = shown(r);
    expect(300_000_000 - ((s.formAcq ?? 0) as number) - ((s.formExp ?? 0) as number)).toBe(-10_000_000);
    expect(300_000_000 - (s.stmtAcq as number) - (s.stmtExp as number)).toBe(-10_000_000);
  });
});
