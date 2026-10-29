/**
 * anchor — 부담부증여 × 재개발(§166) × 이월과세: A·B 취득가액 echo는 §166 신고서 역산이고, 증여세 상당액(§97의2①3호)은 인가 전 분 필요경비에 산입된다.
 * 계획서 `docs/02-design/features/bg-redev-carryover-acquisition-echo.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 b).
 *
 * 종전: 비교·요약 카드 A 5,333,333(인가 전 분 슬롯) · B 300,000,000(증여 당시 평가액), 묶음은 자산별 취득 300M · 필요경비 −273M(B)·10.67M(A),
 * 증여세 상당액은 A 명세에는 실리는데 §166 양도차익·결정세액에는 반영되지 않았다(세액 변경). 결정세액은 mock 세율.
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
import { resolveBgCarryoverSingleDisplay } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { bgRedevFilingTransferPrice } from "@/lib/tax-engine/burdened-gift-totals";
import { redevBranchExpenseParts, redevBranchTotals, redevFilingTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
import { BgRedevFilingExpenseRows } from "@/components/calc/results/transfer/BgRedevFilingExpenseRows";
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
const mk = (assets: A[], extra: A = {}) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;
const together = (a: A, b: A) => mk([land(1, a), land(2, b)]);

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

const RIGHT = (g: string, over: A = {}): A => ({
  assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false, redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgValuationMode: "sangjeungbeop_standard",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", carryover: { ...CARRYOVER, giftTaxAmount: g }, ...over,
});
const DONOR100: A = { bgCoDonorActualAcquisitionLand: "100000000" };
const DONOR20: A = { bgCoDonorActualAcquisitionLand: "20000000" };
const REDEV_BASIS = "신고서 취득가액 · 인가 전·후 분 합 · 소령 §166①1호";

async function singleRight(a: A) {
  const r = await post(mk([land(1, a)]));
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result as TransferTaxResult;
  const co = res.carryoverTaxationDetail!;
  const rd = res.redevelopmentDetail!;
  const tp = resolveBgCarryoverSingleDisplay(res)?.transferPrice ?? bgRedevFilingTransferPrice(res);
  const un = norm(render(co.adoptedScenario === "A"
    ? <CarryoverScenarioBFilingCard scenarioB={co.scenarioB} adopted={false} transferPrice={tp} transferDate="2026-02-16" giftRegistryDate="2023-06-01" />
    : <CarryoverScenarioAFilingCard scenarioA={co.scenarioA} adopted={false} transferPrice={tp} transferDate="2026-02-16" donorAcquisitionDate="2012-01-01" />).container);
  cleanup();
  const compare = norm(render(<CarryoverComparisonCard detail={co} />).container);
  cleanup();
  return { res, co, rd, tp, unadopted: un, compare };
}

describe("단건 입주권 × 이월과세 — A·B 취득가액 echo는 §166 신고서 역산 (계획서 §1.2 · Q-1 a · Q-2 a)", () => {
  it.each([
    ["증여자 실지 100M · 증여세 0 (A 채택)", DONOR100, "0", "A", 15_999_999, 64_000_001, 26_666_666, 53_333_334, 6_542_400],
    ["증여자 칸 비움 · 증여세 0 (B 채택)", {}, "0", "B", 26_666_666, 53_333_334, 26_666_666, 53_333_334, 6_440_000],
  ] as const)("%s", async (_n, donor, g, adopted, aAcq, aGain, bAcq, bGain, tax) => {
    const c = await singleRight(RIGHT(g, donor as A));
    expect(c.co.adoptedScenario).toBe(adopted);
    expect(c.co.scenarioA.acquisitionPrice).toBe(aAcq);
    expect(c.co.scenarioB.acquisitionPrice).toBe(bAcq);
    expect(c.co.scenarioA.acquisitionIsRedevelopmentFiling).toBe(true);
    expect(c.co.scenarioB.acquisitionIsRedevelopmentFiling).toBe(true);
    expect(c.co.scenarioB.acquisitionIsBurdenedGiftShare).toBeUndefined(); // 두 플래그는 배타
    // 양도가액 − 취득가액 = 양도차익 (필요경비 0)
    expect(80_000_000 - aAcq).toBe(aGain);
    expect(80_000_000 - bAcq).toBe(bGain);
    expect(c.co.scenarioA.transferGain).toBe(aGain);
    expect(c.co.scenarioB.transferGain).toBe(bGain);
    expect(c.res.determinedTax).toBe(tax);
    // 채택 시나리오 echo = 단건 신고서 값(`redevFilingTotals`)
    const adoptedAcq = adopted === "A" ? aAcq : bAcq;
    expect(redevFilingTotals(c.rd, 80_000_000).acquisition).toBe(adoptedAcq);
    // 비교 카드 · 미채택 요약 카드
    expect(c.compare).toContain(`취득가액 [${REDEV_BASIS}]${aAcq.toLocaleString()}`);
    expect(c.compare).toContain(`취득가액 [${REDEV_BASIS}]${bAcq.toLocaleString()}`);
    expect(c.compare).not.toContain("증여 당시 평가액");
    expect(c.compare).not.toContain("300,000,000");
    expect(c.unadopted).toContain(`취득가액 (${REDEV_BASIS})${(adopted === "A" ? bAcq : aAcq).toLocaleString()}`);
    expect(c.unadopted).toContain("양도가액80,000,000");
    expect(c.unadopted).not.toContain("증여 당시 평가액");
  });
});

describe("묶음 입주권 × 이월과세 — 자산별 echo · 합산 신고서 합계열이 §166 신고서 값 (계획서 §1.3)", () => {
  it.each([
    ["A 채택 · 증여자 실지 100M · 증여세 0", () => together(RIGHT("0", DONOR100), RIGHT("0", DONOR100)), "A", [80_000_000, 15_999_999, 0, 64_000_001], [160_000_000, 31_999_998, 0, 128_000_002], 21_317_000],
    ["B 채택 · 증여자 칸 비움 · 증여세 0", () => together(RIGHT("0"), RIGHT("0")), "B", [80_000_000, 26_666_666, 0, 53_333_334], [160_000_000, 53_333_332, 0, 106_666_668], 21_018_333],
  ] as const)("%s", async (_n, f, adopted, one, total, tax) => {
    const c = await bundle(f());
    expect(c.props[0].carryoverTaxationDetail?.adoptedScenario).toBe(adopted);
    expect(c.echo).toEqual([one, one]); // 종전: A [80M, 5,333,333, 10,666,666, …] · B [80M, 300M, −273,333,334, …]
    expect(c.total).toEqual(total);
    expect(total[0] - total[1] - total[2]).toBe(total[3]);
    expect(c.agg.determinedTax).toBe(tax);
  });
});

const GIFT_LABEL = "인가 전 분 — 이월과세 증여세 상당액 (「소득세법」 제97조의2 제1항 제3호)";

describe("증여세 상당액(§97의2①3호)은 §166 인가 전 분 필요경비에 산입된다 (계획서 §1.5 · Q-3 b)", () => {
  it("A 채택 — 증여세 30M(안분 1,600,000)은 양도차익을 그만큼 줄이고 신고서 필요경비·명세서 산식·분기 echo에 나타난다 (종전: 증여세 0일 때와 같았다)", async () => {
    const base = await singleRight(RIGHT("0", DONOR20));
    const c = await singleRight(RIGHT("30000000", DONOR20));
    expect(base.co.adoptedScenario).toBe("A");
    expect(c.co.adoptedScenario).toBe("A");
    expect(base.res.transferGain).toBe(68_266_668);
    expect(c.res.transferGain).toBe(66_666_668); // 68,266,668 − 1,600,000
    expect(base.res.determinedTax).toBe(7_320_640);
    expect(c.res.determinedTax).toBe(7_028_800);
    // 명세 echo = 실제 산입액
    expect(c.co.scenarioA.giftTaxAddedToExpense).toBe(1_600_000);
    expect(c.co.scenarioA.giftTaxLimitApplied).toBe(false);
    expect(c.rd.carryoverGiftTaxApplied).toBe(1_600_000);
    expect(c.rd.preApproval.expenses).toBe(1_600_000);
    expect(c.rd.preApproval.carryoverGiftTaxExpense).toBe(1_600_000);
    expect(c.rd.preApproval.gain).toBe(base.rd.preApproval.gain - 1_600_000);
    // 신고서 필요경비 구성 · 취득가액 역산 = 양도가액 − 필요경비 − 양도차익
    expect(redevBranchExpenseParts(c.rd)).toMatchObject({ preApproval: 1_600_000, preApprovalGiftTax: 1_600_000, preApprovalKind: "actual" });
    expect(redevBranchTotals(c.rd).expenses).toBe(1_600_000);
    expect(redevFilingTotals(c.rd, 80_000_000)).toMatchObject({ expenses: 1_600_000, gain: 66_666_668, acquisition: 11_733_332 });
    // 계산명세서 산식(steps)
    const step = c.res.steps.find((st) => st.label === "인가전 분 양도차익");
    expect(step?.formula).toContain("이월과세 증여세 상당액 1,600,000");
    // 증여세 0이면 산식·분기 echo에 그 항이 없다
    expect(base.res.steps.find((st) => st.label === "인가전 분 양도차익")?.formula).not.toContain("증여세");
    expect(base.rd.preApproval.carryoverGiftTaxExpense).toBeUndefined();
    expect(redevBranchExpenseParts(base.rd)).not.toHaveProperty("preApprovalGiftTax");
  });

  it("A 세액이 줄어 B가 채택되는 경우 — 증여자 실지 100M · 증여세 30M: A 6,250,560 < B 6,440,000 (종전 A 채택 6,542,400)", async () => {
    const c = await singleRight(RIGHT("30000000", DONOR100));
    expect(c.co.scenarioA.transferGain).toBe(62_400_001); // 종전 64,000,001
    expect(c.co.scenarioA.determinedTax).toBe(6_250_560);
    expect(c.co.scenarioB.determinedTax).toBe(6_440_000);
    expect(c.co.adoptedScenario).toBe("B");
    expect(c.res.determinedTax).toBe(6_440_000);
  });

  it("한도 — 증여세가 인가 전 분 양도차익을 넘으면 그 양도차익까지만 산입하고 넘친 몫은 인가 후 분으로 옮기지 않는다", async () => {
    const c = await singleRight(RIGHT("2000000000", DONOR100));
    expect(c.co.scenarioA.giftTaxAddedToExpense).toBe(42_666_667);
    expect(c.co.scenarioA.giftTaxLimitCap).toBe(42_666_667); // 인가 전 분 양도차익(증여세 산입 전)
    expect(c.co.scenarioA.giftTaxLimitApplied).toBe(true);
    expect(c.co.scenarioA.transferGain).toBe(21_333_334); // 인가 후 분만 남는다 — 음수 분기 없음
    expect(c.co.scenarioA.determinedTax).toBe(1_565_000);
  });

  it("청산금 수령(§166①2호) — 나목이 인가 전 분만 안분해 차감한다: 산입 echo는 안분액 1,422,222(한도가 아니므로 limitApplied=false)", async () => {
    const recv: A = { ...DONOR20, redevSettlementDirection: "receive", redevSettlementAmount: "100000000" };
    const base = await singleRight(RIGHT("0", recv));
    const c = await singleRight(RIGHT("30000000", recv));
    expect(base.co.scenarioA.transferGain - c.co.scenarioA.transferGain).toBe(1_422_222);
    expect(base.res.determinedTax).toBe(10_209_457);
    expect(c.co.adoptedScenario).toBe("A");
    expect(c.rd.preApproval.expenses).toBe(1_422_222);
    expect(c.co.scenarioA.giftTaxAddedToExpense).toBe(1_422_222);
    expect(c.co.scenarioA.giftTaxLimitApplied).toBe(false);
    expect(c.res.determinedTax).toBe(9_950_044);
  });

  it("묶음 A 채택 — 증여자 실지 20M · 증여세 30M × 2: 자산별 필요경비 1,600,000 · 합산 신고서 [160M, 23,466,664, 3,200,000, 133,333,336]", async () => {
    const c = await bundle(together(RIGHT("30000000", DONOR20), RIGHT("30000000", DONOR20)));
    expect(c.props[0].carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(c.echo).toEqual([[80_000_000, 11_733_332, 1_600_000, 66_666_668], [80_000_000, 11_733_332, 1_600_000, 66_666_668]]);
    expect(c.total).toEqual([160_000_000, 23_466_664, 3_200_000, 133_333_336]);
    expect(c.agg.determinedTax).toBe(22_735_667);
  });

  it("신고서 필요경비 줄 — 인가 전 분 택일 몫과 증여세 몫이 따로 나온다 (택일 몫이 0이면 그 줄은 없다)", () => {
    const { container } = render(<BgRedevFilingExpenseRows parts={{ preApproval: 1_600_000, preApprovalGiftTax: 1_600_000, preApprovalKind: "actual", postApproval: 0, settlement: 0 }} />);
    const t = norm(container);
    expect(t).toContain(`${GIFT_LABEL}1,600,000`);
    expect(container.querySelector('[data-testid="bg-redev-filing-expense-pre"]')).toBeNull();
    cleanup();
    const both = norm(render(<BgRedevFilingExpenseRows parts={{ preApproval: 4_600_000, preApprovalGiftTax: 1_600_000, preApprovalKind: "actual", postApproval: 0, settlement: 0 }} />).container);
    expect(both).toContain("인가 전 분 — 자본적지출·양도비 — 「소득세법」 제97조 제1항 제2호·제3호3,000,000");
    expect(both).toContain(`${GIFT_LABEL}1,600,000`);
  });

  it("개산공제 택일(preApprovalKind) 판정은 증여세 몫을 뺀 값으로 한다", () => {
    const d = { estimatedLumpDeduction: 3_000_000, preApproval: { expenses: 4_600_000, carryoverGiftTaxExpense: 1_600_000 }, postApprovalExistingHouse: { expenses: 0 }, settlement: { expenses: 0 } } as unknown as Parameters<typeof redevBranchExpenseParts>[0];
    expect(redevBranchExpenseParts(d)).toMatchObject({ preApprovalKind: "estimated", preApprovalGiftTax: 1_600_000 });
  });

  /** 완공 아파트(§166②) 청산금 수령 — 나목 안분분은 인가 전 분에, 나머지는 청산금 분할양도 분에서 차감해 증여세 산입액 전액이 양도차익에서 빠진다. */
  it("완공 아파트 청산금 수령 — 증여세 30M(안분 6,000,000) 전액이 양도차익에서 빠진다 (나목 안분분 + 청산금 분할양도 분)", async () => {
    const apt = (g: string): A => ({
      addressJibun: "서울 B 2", assetKind: "redevelopment_apt", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
      redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevSettlementSaleDate: "2025-12-02",
      redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000", redevAcquisitionHousingPrice: "250000000",
      acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", carryover: { ...CARRYOVER, giftTaxAmount: g, donorHouseholdHoldingStartDate: "2012-01-01" },
      transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", standardPriceAtTransfer: "320000000", bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "400000000", bgMortgageDebtAmount: "80000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", bgCoDonorActualAcquisitionTotal: "100000000",
    });
    const base = await singleRight(apt("0"));
    const c = await singleRight(apt("30000000"));
    expect(c.co.scenarioA.giftTaxAddedToExpense).toBe(6_000_000);
    // 나목 몫을 floor로 안분해 1원 차이가 날 수 있다(인가 전 필요경비 다른 항목과 같은 규약) — 전액(6,000,000)이 빠지는지가 요점이다.
    const delta = base.co.scenarioA.transferGain - c.co.scenarioA.transferGain;
    expect(delta).toBeGreaterThanOrEqual(6_000_000);
    expect(delta).toBeLessThanOrEqual(6_000_001);
    expect(base.co.scenarioA.transferGain).toBe(80_000_000);
    expect(c.co.scenarioA.transferGain).toBe(73_999_999);
  });
});
