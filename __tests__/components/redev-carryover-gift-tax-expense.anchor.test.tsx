/**
 * anchor — 재개발(§166) × 이월과세(**비부담부증여**): 증여세 상당액(§97의2①3호)·증여자 자본적지출(§97의2①2호)이 인가 전 분 필요경비에 산입되고,
 * 카드·묶음 취득가액 echo는 §166 신고서 역산이다. 계획서 `docs/02-design/features/redev-carryover-gift-tax-expense.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전: 증여세 0/30M/100M에서 A 양도차익·세액이 같았고(1,000,000,000 · 302,370,000), 증여자 자본적지출도 반영되지 않았다. 카드 A 100M · B 300M · 묶음 필요경비 200M 허상.
 * 부담부증여 짝은 `bg-redev-carryover-acquisition-echo.anchor.test.tsx`(#2703). 결정세액은 mock 세율.
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
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { CarryoverScenarioAFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioAFilingCard";
import { CarryoverScenarioBFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioBFilingCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { redevBranchExpenseParts, redevFilingTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
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


const L = ["양도가액", "취득가액", "필요경비", "전체 양도차익"] as const;
/** 묶음: 자산별 echo + 합산 신고서 합계열. */
async function bundle(f: TransferFormData) {
  const r = await post(f);
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const agg = r.data.aggregated;
  const props = agg.properties as { propertyId: string; transferPrice: number; acquisitionPrice: number; necessaryExpense: number; transferGain: number; carryoverTaxationDetail?: { adoptedScenario: string } }[];
  const rows = buildAggregateRows({} as unknown as TransferTaxResult, { properties: props, aggregated: agg } as never, f);
  const total = L.map((l) => rows.find((x) => x.label.trim() === l)?.values?.total);
  return { agg, props, echo: props.map((p) => [p.transferPrice, p.acquisitionPrice, p.necessaryExpense, p.transferGain]), total };
}


const NB = (over: A = {}, car: A = {}): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  actualSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", acquisitionPrice: "100000000",
  carryover: { ...CARRYOVER, giftTaxAmount: "0", donorAcquisitionPrice: "100000000", donorHouseholdHoldingStartDate: "2012-01-01", ...car }, ...over,
});
const APTX = (over: A = {}, car: A = {}): A => NB({ assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000", redevAcquisitionHousingPrice: "250000000", ...over }, car);
const RECV: A = { redevSettlementDirection: "receive", redevSettlementAmount: "100000000" };
const G = (n: number): A => ({ giftTaxAmount: String(n) });
const REDEV_BASIS = "신고서 취득가액 · 인가 전·후 분 합 · 소령 §166①1호";

async function one(a: A) {
  const r = await post(mk([a], { contractTotalPrice: "1300000000" }));
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result as TransferTaxResult;
  const co = res.carryoverTaxationDetail!;
  const un = norm(render(co.adoptedScenario === "A"
    ? <CarryoverScenarioBFilingCard scenarioB={co.scenarioB} adopted={false} transferPrice={1_300_000_000} transferDate="2026-02-16" giftRegistryDate="2023-06-01" />
    : <CarryoverScenarioAFilingCard scenarioA={co.scenarioA} adopted={false} transferPrice={1_300_000_000} transferDate="2026-02-16" donorAcquisitionDate="2012-01-01" />).container);
  cleanup();
  const compare = norm(render(<CarryoverComparisonCard detail={co} />).container);
  cleanup();
  return { res, co, rd: res.redevelopmentDetail!, unadopted: un, compare };
}
const A_ = (c: Awaited<ReturnType<typeof one>>) => c.co.scenarioA;

describe("증여세 상당액(§97의2①3호) — 비부담부증여 재개발 A 양도차익에 산입 (계획서 §1.1 · D-2)", () => {
  it.each([
    ["입주권 납부", {}, [[0, 1_000_000_000, 302_370_000, "A"], [30_000_000, 970_000_000, 292_794_000, "B"], [100_000_000, 900_000_000, 270_450_000, "B"]]],
  ] as const)("%s — 증여세 0/30M/100M: A 양도차익 1,000,000,000 → 970,000,000 → 900,000,000 (종전 셋 다 1,000,000,000)", async (_n, over, rows) => {
    for (const [g, gain, taxA, adopted] of rows) {
      const c = await one(NB(over as A, G(g)));
      expect(A_(c).transferGain, `g=${g}`).toBe(gain);
      expect(A_(c).determinedTax, `g=${g}`).toBe(taxA);
      expect(A_(c).giftTaxAddedToExpense).toBe(g);
      expect(c.co.adoptedScenario).toBe(adopted);
      expect(c.res.determinedTax).toBe(adopted === "A" ? taxA : 299_010_000); // 증여세가 크면 A 세액이 줄어 B가 채택된다
    }
  });

  it("A 채택 유지(증여자 취득가액 20M) — 증여세 30M은 인가 전 분 필요경비 30,000,000 · 신고서 필요경비 · 항등식", async () => {
    const base = await one(NB({}, { donorAcquisitionPrice: "20000000" }));
    const c = await one(NB({}, { donorAcquisitionPrice: "20000000", ...G(30_000_000) }));
    expect(c.co.adoptedScenario).toBe("A");
    expect(base.co.scenarioA.transferGain - c.co.scenarioA.transferGain).toBe(30_000_000);
    expect(c.rd.preApproval.expenses).toBe(30_000_000);
    expect(c.rd.preApproval.carryoverGiftTaxExpense).toBe(30_000_000);
    expect(c.rd.carryoverGiftTaxApplied).toBe(30_000_000);
    expect(redevBranchExpenseParts(c.rd)).toMatchObject({ preApproval: 30_000_000, preApprovalGiftTax: 30_000_000 });
    const t = redevFilingTotals(c.rd, 1_300_000_000);
    expect(t.expenses).toBe(30_000_000);
    expect(1_300_000_000 - t.acquisition - t.expenses).toBe(t.gain);
    expect(c.res.steps.find((st) => st.label === "인가전 분 양도차익")?.formula).toContain("이월과세 증여세 상당액 30,000,000");
    expect(base.rd.preApproval.carryoverGiftTaxExpense).toBeUndefined();
  });

  it("한도 — 증여세 2,000M은 인가 전 분 양도차익 800,000,000까지만 산입(echo 정산: 종전 echo는 전체 양도차익 한도 1,000,000,000)", async () => {
    const c = await one(NB({}, G(2_000_000_000)));
    expect(A_(c).giftTaxAddedToExpense).toBe(800_000_000);
    expect(A_(c).giftTaxLimitCap).toBe(800_000_000);
    expect(A_(c).giftTaxLimitApplied).toBe(true);
    expect(A_(c).transferGain).toBe(200_000_000); // 인가 후 분만 남는다 — 음수 분기 없음
    expect(A_(c).determinedTax).toBe(55_110_000);
  });

  it("한도 플래그 — 전체 양도차익 한도(1,000M) 안이지만 인가 전 분 한도(800M)를 넘는 증여세 900M은 800M만 산입하고 한도 적용으로 표시한다", async () => {
    const c = await one(NB({}, G(900_000_000)));
    expect(A_(c).giftTaxAddedToExpense).toBe(800_000_000);
    expect(A_(c).giftTaxLimitApplied).toBe(true);
    expect(A_(c).giftTaxLimitCap).toBe(800_000_000);
  });

  it("청산금 수령(입주권) — 나목이 인가 전 분만 안분해 차감한다: 30,000,000 × 800/900 = 26,666,666 · 세액", async () => {
    const base = await one(NB(RECV));
    const c = await one(NB(RECV, G(30_000_000)));
    expect(base.co.scenarioA.transferGain).toBe(1_211_111_111);
    expect(A_(c).transferGain).toBe(1_184_444_444);
    expect(A_(c).giftTaxAddedToExpense).toBe(26_666_666);
    expect(A_(c).giftTaxLimitApplied).toBe(false);
    expect(A_(c).determinedTax).toBe(392_015_000);
    expect(c.co.adoptedScenario).toBe("B");
  });

  it("완공 아파트 — 납부 · 수령 모두 반영", async () => {
    const pay = await one(APTX({}, G(30_000_000)));
    expect(A_(pay).transferGain).toBe(970_000_000);
    expect(A_(pay).determinedTax).toBe(260_614_363);
    const rcv = await one(APTX({ ...RECV, redevSettlementSaleDate: "2025-12-02" }, G(30_000_000)));
    const rcv0 = await one(APTX({ ...RECV, redevSettlementSaleDate: "2025-12-02" }));
    expect(A_(rcv0).transferGain).toBe(1_300_000_000);
    expect(A_(rcv0).transferGain - A_(rcv).transferGain).toBeGreaterThanOrEqual(30_000_000); // 나목 안분분 + 청산금 분할양도 분 — floor 1원 차이
    expect(A_(rcv0).transferGain - A_(rcv).transferGain).toBeLessThanOrEqual(30_000_001);
  });

  it("엔진 내부 필드는 요청 body로 보낼 수 없다 — 이월과세가 아닌 재개발 입주권에 `carryoverGiftTaxExpense`를 실어도 세액이 같다", async () => {
    const plain: A = NB({ acquisitionCause: "purchase", acquisitionDate: "2015-03-01", carryover: undefined, standardPriceAtTransfer: "500000000" });
    const f = mk([plain], { contractTotalPrice: "1300000000" });
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => { cap.body = JSON.parse(String(init?.body)); return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response; }));
    try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
    const send = async (extra: A) => (await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0, ...extra }) }))).json() as Promise<{ data?: { result?: { determinedTax: number; transferGain: number } } }>;
    const a = await send({});
    const b = await send({ carryoverGiftTaxExpense: 500_000_000 });
    expect(a.data?.result?.transferGain).toBeGreaterThan(0);
    expect(b.data?.result?.transferGain).toBe(a.data?.result?.transferGain);
    expect(b.data?.result?.determinedTax).toBe(a.data?.result?.determinedTax);
  });
});

describe("증여자 자본적지출(§97의2①2호) — 인가 전 분 실비에 산입 (계획서 §1.2 · D-3 · Q-2 a)", () => {
  it("입주권 증여자 자본적지출 50M — A 양도차익 1,000,000,000 → 950,000,000(종전 불변) · 증여세와 합산", async () => {
    const c = await one(NB({}, { donorCapitalExpenditure: "50000000" }));
    expect(A_(c).transferGain).toBe(950_000_000);
    expect(A_(c).determinedTax).toBe(286_410_000);
    expect(A_(c).donorCapexAddedToExpense).toBe(50_000_000);
    expect(c.co.adoptedScenario).toBe("B");
    const both = await one(NB({}, { donorCapitalExpenditure: "50000000", ...G(30_000_000) }));
    expect(A_(both).transferGain).toBe(920_000_000);
    expect(A_(both).determinedTax).toBe(276_834_000);
  });

  it("A 채택 유지(증여자 취득가액 20M) — 증여자 자본적지출은 인가 전 분 필요경비(실비)로 신고서에 나타난다", async () => {
    const base = await one(NB({}, { donorAcquisitionPrice: "20000000" }));
    const c = await one(NB({}, { donorAcquisitionPrice: "20000000", donorCapitalExpenditure: "50000000" }));
    expect(c.co.adoptedScenario).toBe("A");
    expect(base.co.scenarioA.transferGain - c.co.scenarioA.transferGain).toBe(50_000_000);
    expect(c.rd.preApproval.expenses).toBe(50_000_000);
    expect(redevBranchExpenseParts(c.rd)).toMatchObject({ preApproval: 50_000_000, preApprovalKind: "actual" });
    expect(redevBranchExpenseParts(c.rd)).not.toHaveProperty("preApprovalGiftTax");
  });

  it("자산 본인 인가 전 실비(3M)와 합산된다", async () => {
    const base = await one(NB({ redevPreApprovalExpenses: "3,000,000" }, { donorAcquisitionPrice: "20000000" }));
    const c = await one(NB({ redevPreApprovalExpenses: "3,000,000" }, { donorAcquisitionPrice: "20000000", donorCapitalExpenditure: "50000000" }));
    expect(c.rd.preApproval.expenses).toBe(53_000_000);
    expect(base.rd.preApproval.expenses).toBe(3_000_000);
  });
});

describe("카드·묶음 취득가액 echo는 §166 신고서 역산 (계획서 §1.5 · D-1)", () => {
  it.each([
    ["A 채택(증여자 100M)", {}, "A", 300_000_000, 500_000_000],
    ["B 채택(증여자 400M)", { donorAcquisitionPrice: "400000000" }, "B", 600_000_000, 500_000_000],
  ] as const)("단건 %s — A·B 카드 값과 라벨 (종전 A 100M · B 300M 「증여 당시 평가액」)", async (_n, car, adopted, aAcq, bAcq) => {
    const c = await one(NB({}, car as A));
    expect(c.co.adoptedScenario).toBe(adopted);
    expect(A_(c).acquisitionPrice).toBe(aAcq);
    expect(c.co.scenarioB.acquisitionPrice).toBe(bAcq);
    expect(A_(c).acquisitionIsRedevelopmentFiling).toBe(true);
    expect(c.co.scenarioB.acquisitionIsRedevelopmentFiling).toBe(true);
    const adoptedAcq = adopted === "A" ? aAcq : bAcq;
    expect(redevFilingTotals(c.rd, 1_300_000_000).acquisition).toBe(adoptedAcq); // 채택 echo = 단건 신고서 값
    expect(c.compare).toContain(`취득가액 [${REDEV_BASIS}]${aAcq.toLocaleString()}`);
    expect(c.compare).toContain(`취득가액 [${REDEV_BASIS}]${bAcq.toLocaleString()}`);
    expect(c.compare).not.toContain("증여 당시 평가액");
    expect(c.unadopted).toContain(`취득가액 (${REDEV_BASIS})${(adopted === "A" ? bAcq : aAcq).toLocaleString()}`);
  });

  it.each([
    ["A 채택", {}, "A", [650_000_000, 300_000_000, 0, 350_000_000], [1_300_000_000, 600_000_000, 0, 700_000_000], 99_460_000],
    ["B 채택(증여자 400M)", { donorAcquisitionPrice: "400000000" }, "B", [650_000_000, 500_000_000, 0, 150_000_000], [1_300_000_000, 1_000_000_000, 0, 300_000_000], 93_110_000],
  ] as const)("묶음 %s — 자산별 필요경비 0 · 합산 신고서 항등식 (종전 필요경비 200M 허상)", async (_n, car, adopted, one_, total, tax) => {
    const mkAsset = (id: number): A => NB({ addressJibun: `서울 강남구 테스트동 ${id}-1`, standardPriceAtTransfer: "500000000", actualSalePrice: "650,000,000" }, car as A);
    const f = mk([mkAsset(3), mkAsset(4)], { contractTotalPrice: "1300000000" });
    const c = await bundle(f);
    expect(c.props[0].carryoverTaxationDetail?.adoptedScenario).toBe(adopted);
    expect(c.echo).toEqual([one_, one_]);
    expect(c.total).toEqual(total);
    expect(total[0] - total[1] - total[2]).toBe(total[3]);
    expect(c.agg.determinedTax).toBe(tax);
  });
});
