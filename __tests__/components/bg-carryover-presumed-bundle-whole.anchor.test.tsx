/**
 * anchor — 이월과세 × 감정가액·매매사례가액 × 묶음(함께 양도·지분 분할)의 서버 400.
 * 계획서 `docs/02-design/features/bg-carryover-presumed-bundle-whole-400.plan.md`(사용자 결정 Q-1 a · Q-2 a).
 *
 * 종전: 묶음 결과의 증여세용 물건 전체 재계산(M-0.5)이 이월과세 치환을 거치지 않아 `info.presumed*`가 비어
 * 400 「감정가액을 입력해야 합니다」였다(⑧은 통과). 세액은 카드별 계산 결과의 합이라 이 수정으로 바뀌지 않는다 —
 * 세액은 물건 전체 재계산을 건너뛴 측정값(mock 세율).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
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
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
const norm = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");

/** 시료 — 토지 · 채무 80,000,000 · 시가 400,000,000(채무비율 0.2) · 당초 증여자 감정가액 250,000,000 · 취득시 기준시가 150,000,000 · 양도인 증여일 평가액 300,000,000 · 증여세 상당액 4,000,000. */
const CARRYOVER: A = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000", exclusionDeclared: {},
};
const land = (id: number, over: A = {}): A => ({
  addressJibun: `서울 강남구 테스트동 ${id}-1`, assetKind: "land", transferType: "burdened_gift", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01",
  carryover: CARRYOVER, bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: "appraisal", standardPriceAtTransfer: "320000000", standardPriceAtAcq: "180000000",
  bgActualAcquisitionLand: "300000000", bgCoDonorPresumedAcquisitionLand: "250000000", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0", ...over,
});
/** 이월과세가 아닌 감정가액 자산 — 양도인 칸의 감정가액이 정본이다. */
const PURCHASE: A = {
  acquisitionCause: "purchase", acquisitionDate: "2015-03-01", carryover: undefined, bgActualAcquisitionLand: "", bgCoDonorPresumedAcquisitionLand: "",
  bgCoDonorLandStdPriceAtAcq: "", bgCoDonorBuildingStdPriceAtAcq: "", bgPresumedAcquisitionLand: "250000000",
};
const HOUSE: A = {
  assetKind: "housing", carryover: { ...CARRYOVER, donorHouseholdHoldingStartDate: "2012-01-01" }, bgActualAcquisitionLand: "", bgActualAcquisitionTotal: "300000000",
  bgCoDonorPresumedAcquisitionLand: "", bgCoDonorPresumedAcquisitionTotal: "250000000", standardPriceAtAcq: "180000000",
};
const HALF: A = { ownershipNumerator: "50", ownershipDenominator: "100", addressJibun: "서울 강남구 테스트동 1-1" };
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;
const together = (a: A, b: A) => mk([land(1, a), land(2, b)]);
const halves = (over: A = {}, extra: A = {}) =>
  mk([land(1, { ...HALF, ...over }), land(2, { ...HALF, ...over })], { assetSplitMode: "fractional", contractTotalPrice: "800000000", ...extra });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(f: TransferFormData): Promise<{ status: number; data: any; error?: { message?: string } }> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: unknown; error?: { message?: string } };
  return { status: res.status, data: json.data, error: json.error };
}

describe("이월과세 × 감정가액·매매사례가액 × 묶음 — route 200 (계획서 §1.1)", () => {
  it.each([
    ["함께 양도 × 감정가액", () => together({}, {}), 4_925_580],
    ["함께 양도 × 매매사례가액", () => together({ bgAcquisitionMethod: "salesCase" }, { bgAcquisitionMethod: "salesCase" }), 4_925_580],
    ["지분 50/50 × 감정가액", () => halves(), 1_501_500],
    ["지분 50/50 × 매매사례가액", () => halves({ bgAcquisitionMethod: "salesCase" }), 1_501_500],
    ["혼합: 1번 이월과세 + 2번 매입(감정가액)", () => together({}, PURCHASE), 5_380_980],
    ["혼합: 1번 매입(감정가액) + 2번 이월과세 (종전에도 200)", () => together(PURCHASE, {}), 5_380_980],
    ["주택 총액 지분 50/50 × 감정가액", () => halves(HOUSE, { householdHousingCount: "2" }), 1_501_500],
  ] as const)("%s", async (_n, f, tax) => {
    const form = f();
    expect(allIssues(form)).toEqual([]);
    const r = await post(form);
    expect(r.error?.message).toBeUndefined();
    expect(r.status).toBe(200);
    expect(r.data.aggregated.totalTax).toBe(tax);
  });

  it("대조 — 이월과세 환산 함께 양도는 종전에도 200 · 세액 같음", async () => {
    const r = await post(together({ bgAcquisitionMethod: "converted" }, { bgAcquisitionMethod: "converted" }));
    expect(r.status).toBe(200);
    expect(r.data.aggregated.totalTax).toBe(10_913_760);
  });
});

describe("물건 전체 echo — 양도인 기준(Q-1 a)과 이월과세가 아닌 묶음의 구별", () => {
  it("이월과세 감정가액 묶음: 전체 취득방식은 양도인 기준 실지(F-3이면 appraisal) · 취득가액·필요경비는 카드 합", async () => {
    const r = await post(together({}, {}));
    const bg = r.data.transferBurdenedGiftBreakdown;
    expect(bg.acquisitionMethodUsed).toBe("actual");
    expect(bg.perAsset.land.acquisitionPrice).toBe(100_000_000);
    expect(bg.perAsset.land.estimatedDeduction).toBe(3_400_000);
    expect(bg.giftTax.finalTax).toBe(113_490_000);
  });

  it("🔴 구별력 — 이월과세가 아닌 감정가액 묶음은 전체도 감정가액 그대로(게이트가 없으면 실지로 바뀌고 presumed가 지워진다)", async () => {
    const r = await post(together(PURCHASE, PURCHASE));
    expect(r.status).toBe(200);
    const bg = r.data.transferBurdenedGiftBreakdown;
    expect(bg.acquisitionMethodUsed).toBe("appraisal");
    expect(bg.perAsset.land.presumedAcquisition).toBe(250_000_000);
  });
});

describe("수정 후 묶음 카드 (계획서 §1.4)", () => {
  const rows = (el: Element, id: string) => Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map(norm);

  it("함께 양도(A 채택): 카드마다 취득가액 50,000,000 · 개산공제 900,000(산식 값) · 증여세 산입 800,000", async () => {
    const f = together({}, {});
    const r = await post(f);
    const el = render(<BundledAllocationCard apportionment={r.data.apportionment} aggregated={r.data.aggregated} transferBurdenedGiftBreakdown={r.data.transferBurdenedGiftBreakdown} formData={f} />).container;
    const acq = rows(el, "bg-bundle-card-acquisition");
    const est = rows(el, "bg-bundle-card-estimated-deduction");
    const gift = rows(el, "bg-bundle-card-carryover-gift-tax");
    expect(acq).toHaveLength(2);
    for (const t of acq) expect(t).toContain("감정가액 250,000,000");
    for (const t of acq) expect(t).toContain("50,000,000");
    expect(est).toHaveLength(2);
    for (const t of est) {
      expect(t).toContain("취득시 기준시가 150,000,000");
      expect(t).toContain("900,000");
      expect(t).not.toContain("1,700,000");
    }
    expect(gift).toHaveLength(2);
    for (const t of gift) expect(t).toContain("800,000");
  });

  it("지분 50/50(B 채택 — 증여세 상당액이 커서 이월과세 미적용): 카드는 실지 30,000,000 × 2", async () => {
    const f = halves();
    const r = await post(f);
    const el = render(<BundledAllocationCard apportionment={r.data.apportionment} aggregated={r.data.aggregated} transferBurdenedGiftBreakdown={r.data.transferBurdenedGiftBreakdown} formData={f} />).container;
    const acq = rows(el, "bg-bundle-card-acquisition");
    expect(acq).toHaveLength(2);
    for (const t of acq) expect(t).toContain("30,000,000");
  });
});
