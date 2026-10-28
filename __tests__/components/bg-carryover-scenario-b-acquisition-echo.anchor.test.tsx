/**
 * anchor — 부담부증여 × 이월과세 미적용(B) 취득가액 echo: 미채택 요약·비교 카드와 묶음 B 채택 합산 신고서가 §159 슬롯 값을 쓴다.
 * 계획서 `docs/02-design/features/bg-carryover-scenario-b-acquisition-echo.plan.md`(사용자 결정 Q-1 a · Q-2 a · Q-3 a).
 *
 * 종전: `scenarioB.acquisitionPrice = giftDateValuation`(300,000,000)이라 카드는 「증여 당시 평가액 300,000,000」(실제 B 슬롯 60,000,000)이었고
 * 묶음 B 채택은 자산별 취득가액 300,000,000 · 필요경비 −240,000,000 · 합산 신고서 합계열 [160M, 600M, 0, 40M]였다.
 * 표시 전용 — 결정세액·양도차익은 바뀌지 않는다(결정세액은 변경 전 측정값 · mock 세율).
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
const norm = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");
const gt = (n: string, over: A = {}): A => ({ carryover: { ...CARRYOVER, giftTaxAmount: n }, ...over });

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


const L = ["양도가액", "취득가액", "필요경비", "전체 양도차익"] as const;

/** 단건: route 결과 + 미채택 요약 카드(결과뷰와 같은 transferPrice) + 비교 카드. */
async function single(a: A, ex: A = {}) {
  const r = await post(mk([land(1, a)], ex));
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result as TransferTaxResult;
  const co = res.carryoverTaxationDetail!;
  const tp = resolveBgCarryoverSingleDisplay(res)?.transferPrice;
  const unadopted = render(
    co.adoptedScenario === "A"
      ? <CarryoverScenarioBFilingCard scenarioB={co.scenarioB} adopted={false} transferPrice={tp} transferDate="2026-02-16" giftRegistryDate="2023-06-01" />
      : <CarryoverScenarioAFilingCard scenarioA={co.scenarioA} adopted={false} transferPrice={tp} transferDate="2026-02-16" donorAcquisitionDate="2012-01-01" />,
  ).container;
  const unadoptedText = norm(unadopted);
  cleanup();
  const compare = norm(render(<CarryoverComparisonCard detail={co} />).container);
  return { res, co, unadoptedText, compare };
}

describe("단건 — 미채택 요약·비교 카드 B 열은 §159 슬롯 취득가액 (계획서 §1.1)", () => {
  it.each([
    ["감정가액 · 증여세 2M · 실지취득 300M (A 채택)", { bgAcquisitionMethod: "appraisal", ...gt("2000000") }, "A", 60_000_000, 20_000_000],
    ["감정가액 · 증여세 2M · 실지취득 280M (B 채택)", { bgAcquisitionMethod: "appraisal", bgActualAcquisitionLand: "280000000", ...gt("2000000") }, "B", 56_000_000, 24_000_000],
    ["환산 · 증여세 0 · 실지취득 280M (B 채택)", { bgAcquisitionMethod: "converted", bgActualAcquisitionLand: "280000000", ...gt("0") }, "B", 45_000_000, 33_920_000],
    ["실지 · 증여세 2M · 실지취득 280M (B 채택)", { bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "280000000", bgCoDonorActualAcquisitionLand: "250000000", ...gt("2000000") }, "B", 56_000_000, 24_000_000],
  ] as const)("%s", async (_n, a, adopted, acq, gain) => {
    const c = await single(a as A);
    expect(c.co.adoptedScenario).toBe(adopted);
    // 엔진 echo: B 취득가액 = 슬롯 합(증여 당시 평가액 300,000,000이 아니다) · 플래그
    expect(c.co.scenarioB.acquisitionPrice).toBe(acq);
    expect(c.co.scenarioB.acquisitionIsBurdenedGiftShare).toBe(true);
    expect(c.co.scenarioB.transferGain).toBe(gain);
    // 비교 카드 B 열: 라벨 + 슬롯 값 (종전 「증여 당시 평가액 300,000,000」)
    expect(c.compare).toContain("취득가액 [수증자 취득가 × 채무비율 · 소령 §159①1호]" + acq.toLocaleString());
    expect(c.compare).not.toContain("증여 당시 평가액");
    expect(c.compare).not.toContain("300,000,000");
    // 미채택 요약 카드: 양도가액 행(80,000,000)이 그려진다(종전 행 없음)
    expect(c.unadoptedText).toContain("양도가액80,000,000");
    if (adopted === "A") {
      expect(c.unadoptedText).toContain("취득가액 (수증자 취득가 × 채무비율 · 소령 §159①1호)" + acq.toLocaleString());
      expect(c.unadoptedText).not.toContain("증여 당시 평가액");
    }
  });

  it("주택(토지 100M · 건물 50M) — B 취득가액 60,000,000 · 라벨", async () => {
    const c = await single(({ ...HOUSE, carryover: { ...CARRYOVER, giftTaxAmount: "2000000", donorHouseholdHoldingStartDate: "2012-01-01" }, standardPriceAtTransfer: "300000000",  bgAcquisitionMethod: "appraisal", bgCoDonorLandStdPriceAtAcq: "100000000", bgCoDonorBuildingStdPriceAtAcq: "50000000" }), { householdHousingCount: "2" });
    expect(c.co.adoptedScenario).toBe("A");
    expect(c.co.scenarioB.acquisitionPrice).toBe(60_000_000);
    expect(c.co.scenarioB.transferGain).toBe(20_000_000);
    expect(c.unadoptedText).toContain("양도가액80,000,000");
  });

  it("일반(비부담부증여) 이월과세 B 카드는 종전 라벨 「증여 당시 평가액」 그대로 — 플래그가 없으면", () => {
    const scenarioB = { acquisitionPrice: 300_000_000, holdingPeriodYears: 2, transferGain: 100_000_000, determinedTax: 1 };
    const card = norm(render(<CarryoverScenarioBFilingCard scenarioB={scenarioB} adopted={false} transferPrice={400_000_000} />).container);
    expect(card).toContain("취득가액 (증여 당시 평가액)300,000,000");
    expect(card).not.toContain("§159");
    cleanup();
    const detail = { isEligible: true, applicablePeriodYears: 10, adoptedScenario: "A", comparisonExclusion: false, scenarioB,
      scenarioA: { acquisitionPrice: 100_000_000, holdingPeriodYears: 14, giftTaxAddedToExpense: 0, giftTaxLimitApplied: false, giftTaxLimitCap: 0, donorCapexAddedToExpense: 0, donorCapexGuardApplied: false, effectiveCapex: 0, transferGain: 300_000_000, determinedTax: 2 } };
    const cmp = norm(render(<CarryoverComparisonCard detail={detail as never} />).container);
    expect(cmp).toContain("취득가액 [증여 당시 평가액]300,000,000");
  });
});

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

describe("묶음 × B 채택 — 자산별 취득가액·필요경비·합산 신고서가 §159 슬롯 (계획서 §1.2)", () => {
  it.each([
    ["함께 양도 · 증여세 30M × 2", () => together(gt("30000000"), gt("30000000")), [[80_000_000, 60_000_000, 0, 20_000_000], [80_000_000, 60_000_000, 0, 20_000_000]], [160_000_000, 120_000_000, 0, 40_000_000], 4_365_000],
    ["지분 50/50 · 증여세 30M", () => halves(gt("30000000", HALF)), [[40_000_000, 30_000_000, 0, 10_000_000], [40_000_000, 30_000_000, 0, 10_000_000]], [80_000_000, 60_000_000, 0, 20_000_000], 1_365_000],
    ["혼합: 1번 이월과세 B + 2번 매입(감정가액)", () => together(gt("30000000"), PURCHASE), [[80_000_000, 60_000_000, 0, 20_000_000], [80_000_000, 50_000_000, 1_080_000, 28_920_000]], [160_000_000, 110_000_000, 1_080_000, 48_920_000], 4_835_400],
    ["함께 양도 · 증여세 30M × 2 · 실지취득 280M", () => together(gt("30000000", { bgActualAcquisitionLand: "280000000" }), gt("30000000", { bgActualAcquisitionLand: "280000000" })), [[80_000_000, 56_000_000, 0, 24_000_000], [80_000_000, 56_000_000, 0, 24_000_000]], [160_000_000, 112_000_000, 0, 48_000_000], 5_565_000],
  ] as const)("%s", async (_n, f, echo, total, tax) => {
    const c = await bundle(f());
    expect(c.props[0].carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(c.echo).toEqual(echo);
    expect(c.total).toEqual(total);
    expect(total[0] - total[1] - total[2]).toBe(total[3]); // 합산 신고서 항등식 (종전 160 − 600 − 0 ≠ 40)
    for (const e of echo) expect(e[0] - e[1] - e[2]).toBe(e[3]); // 자산별 필요경비가 음수로 역산되지 않는다
    expect(c.agg.determinedTax).toBe(tax);
  });

  it("적용배제 조기반환(증여 후 5년 초과)으로 B가 채택돼도 묶음 표시가 슬롯 값 — B 미계산이라 echo는 평가액이지만 표시는 §159 명세 (계획서 V-2)", async () => {
    const old = (n: string): A => ({ acquisitionDate: "2018-06-01", carryover: { ...CARRYOVER, giftRegistryDate: "2018-06-01", giftTaxAmount: n } });
    const c = await bundle(together(old("2000000"), old("2000000")));
    const co = c.props[0].carryoverTaxationDetail as { adoptedScenario: string; exclusionReason?: string; scenarioB: { acquisitionPrice: number } };
    expect(co.adoptedScenario).toBe("B");
    expect(co.exclusionReason).toBeDefined();
    expect(co.exclusionReason).not.toBe("tax_comparison"); // 비교과세 역전이 아니라 적용배제 — B 미계산 echo
    expect(co.scenarioB.acquisitionPrice).toBe(300_000_000); // `makeEmptyScenarioB` — 표시는 위계(②)가 슬롯으로 읽는다
    expect(c.echo).toEqual([[80_000_000, 60_000_000, 0, 20_000_000], [80_000_000, 60_000_000, 0, 20_000_000]]);
    for (const e of c.echo) expect(e[0] - e[1] - e[2]).toBe(e[3]);
    const t = c.total.map(Number);
    expect(t[0] - t[1] - t[2]).toBe(t[3]);
  });

  it("[회귀] 함께 양도 · 증여세 2M × 2 (A 채택) — 값 불변", async () => {
    const c = await bundle(together(gt("2000000"), gt("2000000")));
    expect(c.props[0].carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(c.echo).toEqual([[80_000_000, 50_000_000, 1_300_000, 28_700_000], [80_000_000, 50_000_000, 1_300_000, 28_700_000]]);
    expect(c.total).toEqual([160_000_000, 100_000_000, 2_600_000, 57_400_000]);
    expect(c.agg.determinedTax).toBe(4_564_200);
  });
});

/**
 * 재개발(§166) 원조합원 입주권 부담부증여 × 이월과세는 이 PR의 범위 밖이다 — §159 명세가 인가 전 분만 담아 B 취득가액 합으로 쓰지 않는다(계획서 V-1).
 * 엔진 echo(300,000,000 · 플래그 없음)와 묶음 표시(변경 전과 같은 값)가 **바뀌지 않음**을 잠근다. ⚠️ 묶음 값(취득 300,000,000 · 필요경비 −273,333,334)은
 * 변경 전에도 그랬던 **별건 결함**이다(입주권 B 채택 합산 표시) — 고치면 이 단언을 정정한다.
 */
const RIGHT = (g: string): A => ({
  assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false, redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000", bgValuationMode: "sangjeungbeop_standard",
  bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", carryover: { ...CARRYOVER, giftTaxAmount: g },
});
describe("재개발(§166) 입주권 — 이 PR이 바꾸지 않는다 (계획서 V-1 · 별건)", () => {
  it("단건: B 채택 · echo 300,000,000 그대로 · 플래그 없음 · 결정세액 6,440,000", async () => {
    const r = await post(mk([land(1, RIGHT("2000000"))]));
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    const co = r.data.result.carryoverTaxationDetail;
    expect(r.data.result.redevelopmentDetail).toBeDefined();
    expect(co.adoptedScenario).toBe("B");
    expect(co.scenarioB.acquisitionPrice).toBe(300_000_000);
    expect(co.scenarioB.acquisitionIsBurdenedGiftShare).toBeUndefined();
    expect(r.data.result.determinedTax).toBe(6_440_000);
  });

  it("묶음 2건: 자산별 표시가 변경 전과 같다(§159 명세 합으로 바꾸지 않는다) · 결정세액 21,018,333", async () => {
    const c = await bundle(together(RIGHT("2000000"), RIGHT("2000000")));
    expect(c.echo).toEqual([[80_000_000, 300_000_000, -273_333_334, 53_333_334], [80_000_000, 300_000_000, -273_333_334, 53_333_334]]);
    expect(c.agg.determinedTax).toBe(21_018_333);
  });
});
