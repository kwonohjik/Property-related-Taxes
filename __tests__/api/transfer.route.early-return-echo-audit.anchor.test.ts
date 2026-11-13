/**
 * anchor — 조기 반환 분기 표시 echo 대조 후속 · 계획서 docs/00-pm/early-return-branches-echo-audit.plan.md (Q-1 a · Q-2 a)
 *
 *  · MP-1..4  다필지: 엔진이 `expenses`(= Σ(필지 expenses + estimatedDeduction))를 싣는다 — 신고서·명세서가 필요경비를 취득가액에 흡수하지 않는다
 *  · EX-1..3  전액 비과세: 환산 기준시가 echo(`estimatedStdPrice*`) + §164⑨ 특례 상세 3종
 *  · UN-1..2  불변: 세액·양도차익, 일반 과세/실가 비과세 표시
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calculateMultiParcelTransfer } from "@/lib/tax-engine/multi-parcel-transfer";

const COMMON = {
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
  householdHousingCount: 2, residencePeriodMonths: 0, reductions: [] as unknown[], annualBasicDeductionUsed: 0,
};
/** 다필지 토지 — 양도가 8억(면적 100㎡씩 → 4억씩 안분) */
const land = (parcels: object[], over: object = {}) => ({
  ...COMMON, propertyType: "land", transferPrice: 800_000_000, transferDate: "2026-03-01", acquisitionPrice: 0, acquisitionDate: "2015-01-01", expenses: 0,
  useEstimatedAcquisition: false, acquisitionCause: "purchase", parcels, ...over,
});
const P_ACTUAL = (id: string, price: number, expenses: number) => ({ id, acquisitionDate: "2015-01-01", acquisitionMethod: "actual", acquisitionPrice: price, acquisitionArea: 100, transferArea: 100, expenses });
const P_EST = (id: string) => ({ id, acquisitionDate: "2015-01-01", acquisitionMethod: "estimated", acquisitionArea: 100, transferArea: 100, standardPricePerSqmAtAcq: 500_000, standardPricePerSqmAtTransfer: 600_000 });
/** 전액 비과세 주택 — 환산: 양도 8억 · 취득시/양도시 기준시가 2억/4억 → 환산취득가 4억 · 개산공제 6백만 */
const exemptHouse = (over: object = {}) => ({
  ...COMMON, propertyType: "housing", transferPrice: 800_000_000, transferDate: "2026-03-01", acquisitionPrice: 0, acquisitionDate: "2015-01-01", expenses: 0,
  isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
  useEstimatedAcquisition: true, standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000, acquisitionCause: "purchase", ...over,
});

interface R {
  isExempt?: boolean; transferGain: number; determinedTax: number; totalTax: number; expenses?: number; estimatedBase?: number; estimatedDeduction?: number;
  estimatedStdPriceAtAcquisition?: number; estimatedStdPriceAtTransfer?: number; usedEstimatedAcquisition?: boolean;
  expropriationValuationDetail?: unknown; auctionValuationDetail?: unknown; housingExpropriationValuationDetail?: unknown;
  parcelDetails?: { acquisitionPrice: number; expenses: number; estimatedDeduction: number }[];
}
const req = (b: object) => new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
async function single(body: object): Promise<R> {
  const res = await SINGLE(req(body));
  const json = (await res.json()) as { data?: { result: R }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.result;
}
function shown(r: R, kind: "land" | "housing", price = "800000000") {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-03-01"; f.contractTotalPrice = price;
  f.assets[0] = { ...f.assets[0], assetKind: kind, actualSalePrice: price } as never;
  const rows = buildRows(r as never, "single", f, f.assets[0]);
  const cell = (l: string) => rows.find((x) => x.label === l)?.values.total;
  const items = buildStatementItems(r as never, f, f.assets[0], undefined, undefined);
  return { formAcq: cell("취득가액"), formExp: cell("필요경비"), stmtAcq: items.get("acquisitionPrice")?.value, stmtExp: items.get("expenses")?.value };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("MP 다필지 필요경비 echo (Q-1 a)", () => {
  it("MP-1 실가 두 필지(취득 2억·경비 3백만씩): 결과 expenses 6,000,000 · 신고서 400,000,000 / 6,000,000 · 명세서 같음 (종전 406,000,000 / 비어 있음 · 406,000,000 / 0)", async () => {
    const r = await single(land([P_ACTUAL("p1", 200_000_000, 3_000_000), P_ACTUAL("p2", 200_000_000, 3_000_000)]));
    expect(r.transferGain).toBe(394_000_000);
    expect(r.expenses).toBe(6_000_000);
    expect(shown(r, "land")).toEqual({ formAcq: 400_000_000, formExp: 6_000_000, stmtAcq: 400_000_000, stmtExp: 6_000_000 });
  });
  it("MP-2 다필지 손실(취득 7억씩·경비 3백만씩): 1,400,000,000 / 6,000,000", async () => {
    const r = await single(land([P_ACTUAL("p1", 700_000_000, 3_000_000), P_ACTUAL("p2", 700_000_000, 3_000_000)]));
    expect(r.expenses).toBe(6_000_000);
    expect(shown(r, "land")).toEqual({ formAcq: 1_400_000_000, formExp: 6_000_000, stmtAcq: 1_400_000_000, stmtExp: 6_000_000 });
  });
  it("MP-3 환산 + 실가 혼합: 필요경비 = 환산 필지 개산공제 + 실가 필지 경비, 신고서 항등식 성립", async () => {
    const r = await single(land([P_EST("p1"), P_ACTUAL("p2", 200_000_000, 4_000_000)]));
    const d = r.parcelDetails!;
    const sumExp = d.reduce((s, p) => s + p.expenses + p.estimatedDeduction, 0);
    const sumAcq = d.reduce((s, p) => s + p.acquisitionPrice, 0);
    expect(r.expenses).toBe(sumExp);
    expect(sumExp).toBeGreaterThan(4_000_000); // 개산공제가 더해져야 한다
    expect(shown(r, "land")).toEqual({ formAcq: sumAcq, formExp: sumExp, stmtAcq: sumAcq, stmtExp: sumExp });
    expect(800_000_000 - sumAcq - sumExp).toBe(r.transferGain);
  });
  it("MP-4 다필지는 환산 단일 근거가 없으므로 estimatedBase·usedEstimatedAcquisition을 싣지 않는다(불변)", async () => {
    const r = await single(land([P_EST("p1"), P_ACTUAL("p2", 200_000_000, 4_000_000)]));
    expect(r.estimatedBase).toBeUndefined();
    expect(r.usedEstimatedAcquisition).toBe(false);
  });
});

describe("MP-5 다필지 swap 필지(§97②2호 단서) — V-4", () => {
  // 환산 필지: 양도 4억 · 취득시/양도시 ㎡당 5만/6만 → 환산취득가 4억 × 5/6 · 개산공제 = 취득 기준시가 × 3%. 자본적지출이 크면 swap(개산공제 0 · expenses = 자본 + 양도비).
  // API 스키마에는 필지 capitalExpenditure가 없어(엔진 계약만) 엔진 함수로 확인한다.
  it("MP-5-1 swap 필지는 estimatedDeduction 0 · expenses = 직접 지출 — Σ(expenses + estimatedDeduction)이 이중 계상되지 않는다", () => {
    const r = calculateMultiParcelTransfer({
      totalTransferPrice: 800_000_000, transferDate: new Date("2026-03-01"), propertyType: "land",
      parcels: [
        { id: "swap", acquisitionDate: new Date("2015-01-01"), acquisitionMethod: "estimated", acquisitionArea: 100, transferArea: 100, standardPricePerSqmAtAcq: 500_000, standardPricePerSqmAtTransfer: 600_000, capitalExpenditure: 400_000_000 },
        { id: "plain", acquisitionDate: new Date("2015-01-01"), acquisitionMethod: "estimated", acquisitionArea: 100, transferArea: 100, standardPricePerSqmAtAcq: 500_000, standardPricePerSqmAtTransfer: 600_000 },
      ],
    } as never);
    const [a, b] = r.parcelResults;
    expect(a).toMatchObject({ swapApplied: true, acquisitionPrice: 0, estimatedDeduction: 0, expenses: 400_000_000 });
    expect(b.swapApplied).toBeFalsy();
    expect(b.expenses).toBe(0);
    expect(b.estimatedDeduction).toBeGreaterThan(0);
    // 항등식: 안분 양도가 − 취득가 − (expenses + 개산공제) = 필지 양도차익
    for (const pr of r.parcelResults) expect(pr.allocatedTransferPrice - pr.acquisitionPrice - pr.expenses - pr.estimatedDeduction).toBe(pr.transferGain);
  });
});

describe("EX 전액 비과세 환산 echo (Q-2 a)", () => {
  it("EX-1 환산 비과세: 기준시가 echo 200M/400M · 금액 정상 400,000,000 / 6,000,000", async () => {
    const r = await single(exemptHouse());
    expect(r).toMatchObject({ isExempt: true, estimatedBase: 400_000_000, estimatedDeduction: 6_000_000, estimatedStdPriceAtAcquisition: 200_000_000, estimatedStdPriceAtTransfer: 400_000_000 });
    expect(shown(r, "housing")).toEqual({ formAcq: 400_000_000, formExp: 6_000_000, stmtAcq: 400_000_000, stmtExp: 6_000_000 });
  });
  it("EX-2 환산 + 공매(주택, 경락가 2.5억): §164⑨ 근거 카드가 실린다 · 환산취득가 640,000,000", async () => {
    const r = await single(exemptHouse({ isAuctionTransfer: true, auctionPrice: 250_000_000 }));
    expect(r).toMatchObject({ isExempt: true, estimatedBase: 640_000_000 });
    expect(r.auctionValuationDetail).toBeTruthy();
    expect(shown(r, "housing")).toEqual({ formAcq: 640_000_000, formExp: 6_000_000, stmtAcq: 640_000_000, stmtExp: 6_000_000 });
  });
  it("EX-3 환산 + 일체 주택 수용(총액): 주택 수용 카드가 실린다", async () => {
    const r = await single(exemptHouse({ transferCause: "public_expropriation", housingCompensationTotal: 250_000_000, housingCompensationBasisTotal: 350_000_000 }));
    expect(r.isExempt).toBe(true);
    expect(r.housingExpropriationValuationDetail).toBeTruthy();
  });
});

describe("UN 불변", () => {
  it("UN-1 실가 비과세는 환산 echo를 싣지 않는다", async () => {
    const r = await single(exemptHouse({ useEstimatedAcquisition: false, acquisitionPrice: 500_000_000, expenses: 3_000_000, standardPriceAtAcquisition: undefined, standardPriceAtTransfer: undefined }));
    expect(r.isExempt).toBe(true);
    expect(r.estimatedStdPriceAtAcquisition).toBeUndefined();
    expect(r.auctionValuationDetail).toBeUndefined();
    expect(shown(r, "housing")).toEqual({ formAcq: 500_000_000, formExp: 3_000_000, stmtAcq: 500_000_000, stmtExp: 3_000_000 });
  });
  it("UN-2 세액 불변: 다필지 총납부 · 비과세 총납부 0", async () => {
    const a = await single(land([P_ACTUAL("p1", 200_000_000, 3_000_000), P_ACTUAL("p2", 200_000_000, 3_000_000)]));
    expect(a.totalTax).toBeGreaterThan(0);
    expect(await single(exemptHouse())).toMatchObject({ determinedTax: 0, totalTax: 0 });
  });
});
