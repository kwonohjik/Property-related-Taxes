/**
 * anchor — 부담부증여 명세 카드의 필요경비 줄 (비재개발 자산 · 단건 + 묶음).
 * 계획서 `docs/02-design/features/bg-card-necessary-expense-row.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a · Q-4 b).
 *
 * 종전: 카드의 필요경비 슬롯(`perAsset.*.estimatedDeduction` — 개산공제만이 아니라 실비·환산 단서 나목 채택분도 담는다)이 취득가액 방식에 따라 줄로 보였다 안 보였다 했고,
 * 환산 단서 나목 채택 묶음 카드는 「개산공제 = 1억 × 40% × 3%」 문구에 124,000,000을 적었다(산식 값은 1,200,000). 표시 전용 — 세액은 바뀌지 않는다(tax는 변경 전 측정값).
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
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
const fmt = (n: number) => n.toLocaleString("ko-KR");

// ── 시료 (계획서 §1.1) ──
const REDEV: A = {
  addressJibun: "서울 B 2", assetKind: "redevelopment_apt", actualSalePrice: "525,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2009-10-23", redevRightsValue: "219,218,500", redevSettlementDirection: "pay", redevSettlementAmount: "92,781,500", redevCompletionDate: "2012-09-01",
  redevManagementDisposalHousingPrice: "132,000,000", redevAcquisitionHousingPrice: "85,034,988", acquisitionCause: "inheritance", acquisitionDate: "1980-01-01",
  inheritanceStartDate: "1980-01-01", decedentAcquisitionDate: "1970-01-01", inheritanceAssetKind: "house_individual", transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "400,000,000", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "525,000,000",
  bgMortgageDebtAmount: "210,000,000", publishedValueAtInheritance: "100,000,000",
};
/** ① 채택 — 신고가액 3억이 ③ 환산 1.4억보다 크다 + 인가 전 실비 3,000,000. */
const REDEV_ACTUAL: A = { ...REDEV, publishedValueAtInheritance: "300,000,000", redevPreApprovalExpenses: "3,000,000" };
const HOUSING: A = {
  addressJibun: "서울 A 1", assetKind: "housing", actualSalePrice: "300,000,000", acquisitionCause: "purchase", acquisitionDate: "2000-01-01", transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "300,000,000", bgMortgageDebtAmount: "120,000,000",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000", standardPriceAtTransfer: "200,000,000",
};
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const mk = (assets: A[], contract: string, extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), { ...BASE, contractTotalPrice: contract, ...extra, assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm) }) as TransferFormData;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(f: TransferFormData): Promise<any> {
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
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: unknown }).data;
}

import { bgNecessaryExpenseOf } from "@/lib/tax-engine/burdened-gift-totals";
import { BgNecessaryExpenseRow } from "@/components/calc/results/transfer/BgNecessaryExpenseRow";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const CAP2: A = { capitalExpenditure: "5,000,000", transferExpense: "1,000,000" };
const STD: A = { standardPriceAtAcq: "100,000,000" };
const LAND: A = {
  assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01",
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "460000000", standardPriceAtTransfer: "1243350000",
  standardPriceAtAcq: "202620000", acquisitionArea: "184.2", transferArea: "184.2", landNature: "standalone", actualSalePrice: "920000000", addressJibun: "서울 A 1",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000",
};
const GRADE: A = { pre1990Enabled: true, pre1990Grade_current: "218", pre1990Grade_prev: "218", pre1990Grade_atAcq: "200", pre1990PricePerSqm_1990: "1100000", pre1990PricePerSqm_atTransfer: "6750000", pre1990GradeMode: "number" };

const norm = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");

interface Case { name: string; base: A; over: A; kind: "actual" | "swap" | "estimated"; amount: number; text: string[]; notText?: string[]; single: number; bundle: number; bundleAmount?: number; bundleText?: string[] }
const CASES: Case[] = [
  { name: "실지 + 자본적지출 5,000,000 · 양도비 1,000,000", base: HOUSING, over: { bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000", ...CAP2 },
    kind: "actual", amount: 2_400_000, text: ["(자본적지출 5,000,000 + 양도비 1,000,000)", "채무비율 40.0000%", "제97조 제1항 제2호·제3호"], single: 6_676_800, bundle: 24_526_700 },
  { name: "환산(K-5)", base: HOUSING, over: { bgAcquisitionMethod: "converted", ...STD },
    kind: "estimated", amount: 1_200_000, text: ["개산공제 = 취득시 기준시가 100,000,000 × 채무비율 40.0000% × 개산공제율 3%"], single: 4_539_000, bundle: 19_460_100 },
  { name: "환산 + 단서 나목 채택(자본적지출 3억 · 양도비 1천만)", base: HOUSING, over: { bgAcquisitionMethod: "converted", ...STD, capitalExpenditure: "300,000,000", transferExpense: "10,000,000" },
    kind: "swap", amount: 124_000_000, text: ["(자본적지출 300,000,000 + 양도비 10,000,000)", "제97조 제2항 제2호 단서"], notText: ["개산공제 = 취득시 기준시가"], single: 0, bundle: 6_781_500 },
  { name: "기준시가 평가", base: HOUSING, over: { bgValuationMode: "sangjeungbeop_standard", ...STD },
    kind: "estimated", amount: 1_800_000, text: ["개산공제 = 취득시 기준시가 100,000,000 × 채무비율 60.0000% × 개산공제율 3%"], single: 4_476_000, bundle: 20_473_420,
    bundleAmount: 1_440_000, bundleText: ["개산공제 = 취득시 기준시가 100,000,000 × 채무비율 48.0000% × 개산공제율 3%"] },
  { name: "의제취득일 전 ① 채택 + 자본적지출·양도비", base: LAND, over: { publishedValueAtInheritance: "300,000,000", ...CAP2 },
    kind: "actual", amount: 3_000_000, text: ["(자본적지출 5,000,000 + 양도비 1,000,000)"], single: 60_772_000, bundle: 0 },
  { name: "의제취득일 전 ③ 채택", base: LAND, over: { publishedValueAtInheritance: "100,000,000" },
    kind: "estimated", amount: 3_039_300, text: ["개산공제 = 의제취득일 기준시가 202,620,000 × 채무비율 50.0000% × 개산공제율 3%"], notText: ["개산공제 = 취득시 기준시가"], single: 80_721_398, bundle: 0 },
  { name: "의제취득일 전 기준시가 평가(deemed_std)", base: LAND, over: { bgValuationMode: "sangjeungbeop_standard", ...GRADE },
    kind: "estimated", amount: 937_238, text: ["개산공제 = 의제취득일 기준시가 84,443,174 × 채무비율 36.9968% × 개산공제율 3%"], single: 92_910_511, bundle: 0 },
];

describe("단건 카드 — 방식별 필요경비 줄", () => {
  it.each(CASES)("$name", async (c) => {
    const f = mk([{ ...c.base, ...c.over }], "", { householdHousingCount: "0" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await post(f);
    const res = d.result;
    expect(res.determinedTax).toBe(c.single);
    const bg = res.transferBurdenedGiftBreakdown as TransferBurdenedGiftBreakdown;
    const slot = bg.perAsset.land.estimatedDeduction + bg.perAsset.building.estimatedDeduction;
    expect(slot).toBe(c.amount);
    const cont = render(<BurdenedGiftDetailCard breakdown={bg} propertyType={String(c.base.assetKind)} warnings={res.warnings} />).container;
    const row = cont.querySelector(`[data-kind="${c.kind}"]`);
    expect(row).not.toBeNull();
    const t = norm(row);
    expect(t).toContain(fmt(c.amount));
    for (const x of c.text) expect(t).toContain(x);
    for (const x of c.notText ?? []) expect(t).not.toContain(x);
    expect(cont.querySelectorAll("[data-kind]")).toHaveLength(1);
  });

  it("감정가액·매매사례가액은 종전 줄만 — 새 줄이 겹쳐 나오지 않는다", async () => {
    for (const m of ["appraisal", "salesCase"]) {
      const f = mk([{ ...HOUSING, bgAcquisitionMethod: m, bgPresumedAcquisitionTotal: "150,000,000", ...STD }], "", { householdHousingCount: "0" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await post(f);
      const cont = render(<BurdenedGiftDetailCard breakdown={d.result.transferBurdenedGiftBreakdown} propertyType="housing" warnings={d.result.warnings} />).container;
      expect(cont.querySelectorAll("[data-kind]")).toHaveLength(0);
      expect(norm(cont)).toContain("건물 개산공제 = 취득시 기준시가 100,000,000");
      cleanup();
    }
  });
});

describe("묶음 카드 — 방식별 필요경비 줄 (첫 카드)", () => {
  it.each(CASES.filter((c) => c.bundle > 0))("$name", async (c) => {
    const f = mk([{ ...c.base, ...c.over }, { ...c.base, addressJibun: "서울 C 3" }], "600000000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await post(f);
    expect(d.aggregated.totalTax).toBe(c.bundle);
    const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    const id = c.kind === "estimated" ? "bg-bundle-card-estimated-deduction" : "bg-bundle-card-necessary-expense";
    const rows = [...el.querySelectorAll(`[data-testid="${id}"]`)];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const first = norm(rows[0]);
    const want = c.bundleAmount ?? c.amount;
    expect(first).toContain(fmt(want));
    for (const x of c.bundleText ?? c.text) expect(first).toContain(x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const necessary = (d.aggregated.properties as any[])[0].necessaryExpense;
    expect(necessary).toBe(want);
  });

  it("환산 단서 나목 채택 — 종전 틀린 줄(「개산공제 = 1억 × 40% × 3%」에 124,000,000)이 사라진다", async () => {
    const c = CASES[2];
    const f = mk([{ ...c.base, ...c.over }, { ...c.base, addressJibun: "서울 C 3" }], "600000000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await post(f);
    const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    expect(el.querySelectorAll('[data-testid="bg-bundle-card-estimated-deduction"]')).toHaveLength(0);
    expect(norm(el.querySelector('[data-testid="bg-bundle-card-necessary-expense"]'))).toContain("124,000,000");
  });

  it("재개발 카드에는 이 줄이 없다 — 신고서 필요경비 줄이 맡는다(중복 없음)", async () => {
    const f = mk([HOUSING, REDEV], "825000000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await post(f);
    const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    expect(el.querySelectorAll('[data-testid="bg-bundle-card-necessary-expense"]')).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="bg-redev-filing-expense"]')).toHaveLength(1);
  });

  it("재개발 카드의 §159 슬롯이 0보다 커도(① 채택 + 자본적지출 → 2,400,000) 이 줄은 없다 — 신고서 필요경비 줄 3,600,000만", async () => {
    const f = mk([HOUSING, { ...REDEV_ACTUAL, ...CAP2 }], "825000000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await post(f);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redevCard = (d.transferBurdenedGiftBreakdown.cards as any[]).find((c) => c.redevFilingExpenses);
    expect(redevCard.breakdown.perAsset.land.estimatedDeduction + redevCard.breakdown.perAsset.building.estimatedDeduction).toBe(2_400_000);
    const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    expect(el.querySelectorAll('[data-testid="bg-bundle-card-necessary-expense"], [data-testid="bg-bundle-card-estimated-deduction"]')).toHaveLength(0);
    expect(norm(el.querySelector('[data-testid="bg-redev-filing-expense"]'))).toContain("3,600,000");
  });

  it("묶음 · 실지 + 자본적지출 — 카드별 필요경비 합 = 자산별 필요경비 합 (자본적지출 시료)", async () => {
    const f = mk([{ ...HOUSING, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100,000,000", ...CAP2 }, { ...HOUSING, addressJibun: "서울 C 3" }], "600000000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await post(f);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cards = d.transferBurdenedGiftBreakdown.cards as any[];
    const cardSum = cards.reduce((s, c) => s + (bgNecessaryExpenseOf(c.breakdown)?.amount ?? 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propSum = (d.aggregated.properties as any[]).reduce((s, p) => s + p.necessaryExpense, 0);
    expect(cardSum).toBe(propSum);
    expect(cardSum).toBe(2_400_000);
  });
});

describe("leaf · 렌더 — 판별 우선순위 · 이월과세 증여세 산입 줄", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bg = (over: any = {}): TransferBurdenedGiftBreakdown =>
    ({
      debtRatio: 0.4,
      perAsset: {
        land: { estimatedDeduction: 0, stdPriceAtAcquisition: 0, estimatedDeductionRate: undefined },
        building: { estimatedDeduction: 1_000_000, stdPriceAtAcquisition: 80_000_000, estimatedDeductionRate: 0.03 },
      },
      ...over,
    }) as never;

  it("우선순위: 단서 나목 채택 > 율 없음(실비) > 개산공제", () => {
    expect(bgNecessaryExpenseOf(bg())?.kind).toBe("estimated");
    expect(bgNecessaryExpenseOf(bg({ perAsset: { land: { estimatedDeduction: 0 }, building: { estimatedDeduction: 1_000_000, stdPriceAtAcquisition: 0 } } }))?.kind).toBe("actual");
    expect(bgNecessaryExpenseOf(bg({ necessaryExpenseSwap: { estimatedSide: 1, directSide: 2, chosen: "direct" } }))?.kind).toBe("swap");
    expect(bgNecessaryExpenseOf(bg({ necessaryExpenseSwap: { estimatedSide: 2, directSide: 1, chosen: "estimated" } }))?.kind).toBe("estimated");
  });

  it("슬롯 0원이면 줄이 없다", () => {
    expect(bgNecessaryExpenseOf(bg({ perAsset: { land: { estimatedDeduction: 0 }, building: { estimatedDeduction: 0 } } }))).toBeUndefined();
  });

  it("이월과세 증여세 상당액은 슬롯에서 떼어 별도 줄 — 개산공제 줄 금액 = 슬롯 − 산입분", () => {
    const b = bg({ carryoverGiftTax: { raw: 0, apportioned: 0, cap: 0, applied: 400_000, limitApplied: false } });
    const v = bgNecessaryExpenseOf(b);
    expect(v).toMatchObject({ kind: "estimated", amount: 600_000, carryoverGiftTax: 400_000 });
    const el = render(<table><tbody><BgNecessaryExpenseRow bg={b} /></tbody></table>).container;
    expect(norm(el.querySelector('[data-testid="bg-estimated-deduction"]'))).toContain("600,000");
    expect(norm(el.querySelector('[data-testid="bg-carryover-gift-tax"]'))).toContain("400,000");
    expect(norm(el.querySelector('[data-testid="bg-carryover-gift-tax"]'))).toContain("제97조의2 제1항 제3호");
  });

  it("지분이면 「(지분분)」 · 실비 입력 echo가 없으면 입력값 없이 「자본적지출·양도비 × 채무비율」", () => {
    const b = bg({ ownershipRatio: 0.5, perAsset: { land: { estimatedDeduction: 0 }, building: { estimatedDeduction: 1_000_000, stdPriceAtAcquisition: 0 } } });
    const el = render(<table><tbody><BgNecessaryExpenseRow bg={b} /></tbody></table>).container;
    const t = norm(el.querySelector("[data-kind]"));
    expect(t).toContain("필요경비 = 자본적지출·양도비(지분분) × 채무비율 40.0000%");
  });
});
