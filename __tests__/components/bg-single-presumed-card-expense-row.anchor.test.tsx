/**
 * anchor — 감정가액·매매사례가액 단건 카드: 개산공제 줄은 산식 값, 이월과세 증여세 산입분은 별도 줄.
 * 계획서 `docs/02-design/features/bg-single-presumed-card-expense-row.plan.md`(사용자 결정 Q-1 a · Q-2 a).
 *
 * 종전: 파트 슬롯(개산공제 + 파트별 산입분)을 「토지 개산공제 = 150,000,000 × 채무비율 20.0000% × 개산공제율 3%」 줄에 그대로 적어
 * 산식 값 900,000인데 1,300,000·1,700,000을 적었고 산입 줄이 없었다. 표시 전용 — 세액은 바뀌지 않는다(결정세액은 변경 전 측정값 · mock 세율).
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
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { bgPartExpenseNet } from "@/lib/tax-engine/burdened-gift-totals";
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
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;

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




const gt = (n: string): A => ({ carryover: { ...CARRYOVER, giftTaxAmount: n } });
const HOUSEA: A = {
  assetKind: "housing", bgActualAcquisitionLand: "", bgActualAcquisitionTotal: "300000000", bgCoDonorPresumedAcquisitionLand: "", bgCoDonorPresumedAcquisitionTotal: "250000000",
  standardPriceAtTransfer: "300000000",
};
const HOUSE_CARRY = (g: string, extra: A = {}): A => ({ ...HOUSEA, carryover: { ...CARRYOVER, giftTaxAmount: g, donorHouseholdHoldingStartDate: "2012-01-01" }, ...extra });

async function card(a: A, ex: A = {}) {
  const r = await post(mk([land(1, a)], ex));
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result;
  const bg = res.transferBurdenedGiftBreakdown;
  const el = render(<BurdenedGiftDetailCard breakdown={bg} propertyType="land" />).container;
  const text = norm(el);
  // 개산공제 줄(토지·건물) 금액 — 산식 문구 뒤 마지막 숫자
  const est = (part: "토지" | "건물") => {
    const m = text.match(new RegExp(`${part} 개산공제 = 취득시 기준시가 ([0-9,]+) × 채무비율 [0-9.]+% × 개산공제율 [0-9.]+%\\s*([0-9,]+)`));
    return m ? { base: m[1], amount: m[2] } : undefined;
  };
  const gift = el.querySelector('[data-testid="bg-carryover-gift-tax"]');
  const giftAmount = gift ? norm(gift.querySelector("td:last-child")) : undefined;
  const slot = bg.perAsset.land.estimatedDeduction + bg.perAsset.building.estimatedDeduction;
  const n = (s?: string) => (s ? Number(s.replace(/,/g, "")) : 0);
  const rowsSum = n(est("토지")?.amount) + n(est("건물")?.amount) + n(giftAmount);
  return { res, bg, text, est, giftAmount, slot, rowsSum };
}

describe("감정가액·매매사례가액 단건 × 이월과세 — 개산공제 줄은 산식 값 · 산입 줄은 별도 (계획서 §1.1)", () => {
  it.each([
    ["감정가액", "appraisal", "0", undefined, 1_507_800],
    ["감정가액", "appraisal", "2000000", "400,000", 1_464_600],
    ["감정가액", "appraisal", "4000000", "800,000", 1_421_400],
    ["감정가액", "appraisal", "5000000", "1,000,000", 1_399_800],
    ["매매사례가액", "salesCase", "2000000", "400,000", 1_464_600],
    ["매매사례가액", "salesCase", "4000000", "800,000", 1_421_400],
  ] as const)("%s · 증여세 상당액 %s", async (_n, method, g, gift, tax) => {
    const c = await card({ bgAcquisitionMethod: method, ...gt(g) });
    expect(c.res.determinedTax).toBe(tax);
    expect(c.est("토지")).toEqual({ base: "150,000,000", amount: "900,000" }); // 150,000,000 × 20% × 3%
    expect(c.giftAmount).toBe(gift);
    expect(c.rowsSum).toBe(c.slot); // 줄 합 = 슬롯 (돈이 늘거나 줄지 않는다)
    expect(c.est("건물")).toBeUndefined(); // 토지 자산은 건물 줄이 없다
  });

  it("안내 문장 — 산입이 있을 때만 「산입은 별도」를 덧붙인다 · 없으면 종전 문장 그대로", async () => {
    const withGift = await card({ bgAcquisitionMethod: "appraisal", ...gt("4000000") });
    const none = await card({ bgAcquisitionMethod: "appraisal", ...gt("0") });
    const base = "필요경비는 개산공제(소령 §163⑥)만 인정하며 자본적지출·양도비는 공제하지 않습니다";
    expect(withGift.text).toContain(`${base} (이월과세 증여세 상당액 산입은 별도 — 소득세법 제97조의2 제1항 제3호)`);
    expect(none.text).toContain(base);
    expect(none.text).not.toContain("산입은 별도");
  });
});

describe("주택(토지·건물 두 파트) — 파트별 순액", () => {
  it("건물 기준시가 입력 · 증여세 4,000,000: 토지 600,000 · 건물 300,000(= 50,000,000 × 20% × 3%) · 산입 800,000", async () => {
    const c = await card(HOUSE_CARRY("4000000", { bgAcquisitionMethod: "appraisal", bgCoDonorLandStdPriceAtAcq: "100000000", bgCoDonorBuildingStdPriceAtAcq: "50000000" }), { householdHousingCount: "2" });
    expect(c.est("토지")).toEqual({ base: "100,000,000", amount: "600,000" });
    expect(c.est("건물")).toEqual({ base: "50,000,000", amount: "300,000" });
    expect(c.giftAmount).toBe("800,000");
    expect(c.rowsSum).toBe(c.slot);
  });

  it("🔴 산입분이 건물에 몰려 순액이 0이면 건물 줄을 그리지 않는다(종전: 「기준시가 0 × … = 800,000」)", async () => {
    const c = await card(HOUSE_CARRY("4000000", { bgAcquisitionMethod: "appraisal", bgCoDonorLandStdPriceAtAcq: "150000000", bgCoDonorBuildingStdPriceAtAcq: "0" }), { householdHousingCount: "2" });
    expect(c.est("토지")).toEqual({ base: "150,000,000", amount: "900,000" });
    expect(c.est("건물")).toBeUndefined();
    expect(c.giftAmount).toBe("800,000");
    expect(c.rowsSum).toBe(c.slot);
  });
});

describe("회귀 방어 — 다른 방식 · 이월과세가 아닌 감정가액", () => {
  it("환산(A 채택) 단건은 종전대로 개산공제 600,000 + 산입 800,000", async () => {
    const c = await card({ bgAcquisitionMethod: "converted", bgCoDonorLandStdPriceAtAcq: "100000000", ...gt("4000000") });
    expect(c.text).toContain("개산공제 = 취득시 기준시가 100,000,000 × 채무비율 20.0000% × 개산공제율 3%");
    expect(c.giftAmount).toBe("800,000");
  });

  it("이월과세가 아닌 감정가액 단건: 산입 줄·안내 덧붙임이 없고 산식 값 그대로", async () => {
    const c = await card({ ...PURCHASE, acquisitionCause: "purchase", transferType: "burdened_gift", bgPresumedAcquisitionLand: "250000000" });
    expect(c.bg.carryoverGiftTax).toBeUndefined();
    expect(c.est("토지")).toEqual({ base: "180,000,000", amount: "1,080,000" });
    expect(c.giftAmount).toBeUndefined();
    expect(c.text).not.toContain("산입은 별도");
  });
});

describe("leaf bgPartExpenseNet", () => {
  const mkBg = (cgt?: { applied: number; landApplied?: number; buildingApplied?: number }) =>
    ({
      perAsset: { land: { estimatedDeduction: 1_700_000 }, building: { estimatedDeduction: 800_000 } },
      carryoverGiftTax: cgt,
    }) as never;
  it("산입이 없으면 슬롯 그대로", () => {
    expect(bgPartExpenseNet(mkBg())).toEqual({ land: 1_700_000, building: 800_000, carryoverGiftTax: 0 });
  });
  it("파트별 산입분을 각 파트에서 뗀다", () => {
    expect(bgPartExpenseNet(mkBg({ applied: 1_000_000, landApplied: 800_000, buildingApplied: 200_000 }))).toEqual({ land: 900_000, building: 600_000, carryoverGiftTax: 1_000_000 });
  });
});
