/**
 * anchor — 부담부증여 × 재개발(§166) 자산: 명세 카드에 「신고서 필요경비」 줄(분기별) + 묶음 카드의 ③ 줄 재개발 문구.
 * 계획서 `docs/02-design/features/bg-redev-card-filing-expense.plan.md`(사용자 결정 Q-1 a · Q-2 b · Q-3 같이 수정).
 *
 * 종전: 카드에는 「신고서 취득가액」 줄만 있어 필요경비가 신고서 표에만 보였다(완공 아파트 ③ 개산공제 1,020,419 · ① 인가 전 실비 3,000,000 × 채무비율 =
 * 1,200,000 · 입주권 축 B 600,000씩). 묶음 카드의 ③ 줄은 재개발 자산인데도 「의제취득일 기준시가 0 / 양도시 기준시가」 · 「§176조의2④」로 그려졌다.
 * 표시 전용이다 — 세액은 바뀌지 않는다(아래 tax 값은 변경 전 측정값).
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
import { BgRedevFilingExpenseRows } from "@/components/calc/results/transfer/BgRedevFilingExpenseRows";
import { bgRedevFiling } from "@/lib/tax-engine/burdened-gift-totals";
import { redevBranchExpenseParts, redevBranchTotals } from "@/lib/tax-engine/redev-acquisition-inverse";
import { redevSec166DisplayOf } from "@/lib/calc/redev-pre-approval-acq-mode";
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

// 입주권 축 B (`transfer.route.bg-axis-b-card-acquisition-sum.anchor.test.ts` 시료)
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const first = (over: A) =>
  ({
    ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000", redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-06-01", standardPriceAtAcq: "", standardPriceAtTransfer: "", ...HALF, ...over,
  }) as AssetForm;
const share = (over: A) => ({ ...makeDefaultAsset(2), assetId: "s", ...HALF, acquisitionCause: "purchase", redevApprovalDate: "2018-06-01", ...over }) as AssetForm;
const ORIG: A = {
  isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay",
  redevSettlementAmount: "100,000,000", redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74",
};
const rights = (p: AssetForm, s: AssetForm) =>
  Object.assign(createDefaultTransferFormData(), BASE, { assetSplitMode: "fractional", contractTotalPrice: "1500000000", assets: [p, s] }) as TransferFormData;

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

/** 묶음 카드 — 부담부증여 평가 명세 카드 안의 텍스트·행. */
async function bundleView(f: TransferFormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await post(f);
  expect(d.mode).toBe("bundled");
  const c = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
  const rows = (id: string) => [...c.querySelectorAll(`[data-testid="${id}"]`)].map((e) => (e.textContent ?? "").replace(/\s+/g, " "));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const necessary = (d.aggregated.properties as any[]).filter((p) => p.redevelopmentDetail).map((p) => p.necessaryExpense as number);
  return {
    d,
    text: (c.textContent ?? "").replace(/\s+/g, " "),
    total: rows("bg-redev-filing-expense"),
    pre: rows("bg-redev-filing-expense-pre"),
    post: rows("bg-redev-filing-expense-post"),
    settlement: rows("bg-redev-filing-expense-settlement"),
    necessary,
    tax: d.aggregated.totalTax as number,
  };
}

async function singleView(f: TransferFormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = await post(f);
  expect(d.mode).toBe("single");
  const res = d.result;
  const filing = bgRedevFiling(res);
  const c = render(
    <BurdenedGiftDetailCard
      breakdown={res.transferBurdenedGiftBreakdown}
      propertyType={f.assets[0].assetKind}
      warnings={res.warnings}
      redevSec166={redevSec166DisplayOf(res)}
      redevFilingAcquisition={filing?.acquisition}
      redevFilingExpenses={filing?.expenses}
    />,
  ).container;
  const rows = (id: string) => [...c.querySelectorAll(`[data-testid="${id}"]`)].map((e) => (e.textContent ?? "").replace(/\s+/g, " "));
  return { res, text: (c.textContent ?? "").replace(/\s+/g, " "), total: rows("bg-redev-filing-expense"), pre: rows("bg-redev-filing-expense-pre"), post: rows("bg-redev-filing-expense-post"), settlement: rows("bg-redev-filing-expense-settlement") };
}

describe("묶음 카드 — 신고서 필요경비 줄 (Q-1 a · Q-2 b)", () => {
  it("B1 완공 APT 의제 ③ 채택 — 합 1,020,419 = 인가 전 분 개산공제 · 인가 후·청산금 분 줄 없음 · 신고서 표 필요경비와 같다", async () => {
    const v = await bundleView(mk([HOUSING, REDEV], "825000000"));
    expect(v.total).toHaveLength(1);
    expect(v.total[0]).toContain("1,020,419");
    expect(v.pre).toHaveLength(1);
    expect(v.pre[0]).toContain("개산공제");
    expect(v.pre[0]).toContain("제163조 제6항");
    expect(v.pre[0]).toContain("1,020,419");
    expect(v.post).toHaveLength(0);
    expect(v.settlement).toHaveLength(0);
    expect(v.necessary).toEqual([1_020_419]);
    expect(v.tax).toBe(34_707_970);
  });

  it("B2 같은 묶음 · ① 채택 + 인가 전 실비 3,000,000 × 채무비율 — 합 1,200,000 = 인가 전 분 실제 필요경비(개산공제 아님)", async () => {
    const v = await bundleView(mk([HOUSING, REDEV_ACTUAL], "825000000"));
    expect(v.total).toHaveLength(1);
    expect(v.total[0]).toContain("1,200,000");
    expect(v.pre).toHaveLength(1);
    expect(v.pre[0]).toContain("자본적지출·양도비");
    expect(v.pre[0]).not.toContain("개산공제");
    expect(v.pre[0]).toContain("1,200,000");
    expect(v.necessary).toEqual([1_200_000]);
    expect(v.tax).toBe(14_685_633);
  });

  it("B4 축 B 입주권 원+원 · 인가 전 실비 3,000,000씩 — 카드마다 600,000", async () => {
    const withExp = { redevPreApprovalExpenses: "3,000,000" };
    const v = await bundleView(rights(first({ ...ORIG, ...withExp, bgActualAcquisitionTotal: "300,000,000" }), share({ ...ORIG, ...withExp })));
    expect(v.total).toHaveLength(2);
    expect(v.pre).toHaveLength(2);
    for (const t of v.total) expect(t).toContain("600,000");
    expect(v.necessary).toEqual([600_000, 600_000]);
    expect(v.tax).toBe(129_026_480);
  });

  it("B3 필요경비 0 — 줄을 그리지 않는다 (세액 129,470,000 그대로)", async () => {
    const v = await bundleView(rights(first({ ...ORIG, bgActualAcquisitionTotal: "300,000,000" }), share(ORIG)));
    expect(v.total).toHaveLength(0);
    expect(v.pre).toHaveLength(0);
    expect(v.necessary).toEqual([0, 0]);
    expect(v.tax).toBe(129_470_000);
  });

  it("엔진 echo — 카드별 분기 구성의 합 = 자산별 필요경비 · 인가 전 분 종류(개산공제 / 실비)", async () => {
    const cases: Array<[TransferFormData, "estimated" | "actual"]> = [
      [mk([HOUSING, REDEV], "825000000"), "estimated"],
      [mk([HOUSING, REDEV_ACTUAL], "825000000"), "actual"],
    ];
    for (const [f, kind] of cases) {
      const v = await bundleView(f);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cards = v.d.transferBurdenedGiftBreakdown.cards as any[];
      const redev = cards.find((c) => c.redevFilingExpenses);
      expect(redev.redevFilingExpenses.preApproval + redev.redevFilingExpenses.postApproval + redev.redevFilingExpenses.settlement).toBe(v.necessary[0]);
      expect(redev.redevFilingExpenses.preApprovalKind).toBe(kind);
      expect(cards.find((c) => !c.redevFilingExpenses)).toBeDefined();
      cleanup();
    }
  });

  it("재개발이 아닌 카드(주택 실지)에는 줄이 없다 — 카드 둘 중 재개발 하나에만", async () => {
    const v = await bundleView(mk([HOUSING, REDEV], "825000000"));
    expect(v.total).toHaveLength(1);
  });
});

describe("묶음 카드 — ③ 줄 재개발 문구 (Q-3)", () => {
  it("B1 ③ 채택 — 「평가액 × 취득일 기준시가 / 관리처분계획 인가일 기준시가 (§166③)」 · 인가전 분 개산공제 금액 · 비재개발 문구(§176조의2④)·「기준시가 0」 없음", async () => {
    const v = await bundleView(mk([HOUSING, REDEV], "825000000"));
    expect(v.text).toContain("관리처분계획 인가일 기준시가");
    expect(v.text).toContain("§166③");
    expect(v.text).toContain("인가전 분 개산공제 1,020,419");
    expect(v.text).not.toContain("176조의2④");
    expect(v.text).not.toContain("의제취득일 기준시가 0");
    expect(v.text).not.toContain("추계라 개산공제(의제취득일 기준시가 × 채무비율 × 율");
  });

  it("B2 ① 채택 — ③ 후보 줄도 재개발 문구(미적용)", async () => {
    const v = await bundleView(mk([HOUSING, REDEV_ACTUAL], "825000000"));
    expect(v.text).toContain("관리처분계획 인가일 기준시가");
    expect(v.text).toContain("미적용");
    expect(v.text).not.toContain("176조의2④");
  });

  it("재개발이 아닌 의제 카드의 ③ 줄은 종전 그대로 (주택 의제취득일 전 상속 · 함께 양도 · §176조의2④)", async () => {
    const LAND: A = {
      assetKind: "land", acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01",
      transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "460000000", standardPriceAtTransfer: "1243350000",
      standardPriceAtAcq: "202620000", acquisitionArea: "184.2", transferArea: "184.2", landNature: "standalone", bgValuationMode: "sangjeungbeop_market",
      bgMarketValueAtTransfer: "920000000", publishedValueAtInheritance: "300000000", actualSalePrice: "920000000",
    };
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, assetSplitMode: "companion", contractTotalPrice: "1840000000",
      assets: [{ ...makeDefaultAsset(1), ...LAND, addressJibun: "서울 A 1" }, { ...makeDefaultAsset(2), ...LAND, addressJibun: "서울 B 2" }] as AssetForm[],
    }) as TransferFormData;
    const v = await bundleView(f);
    expect(v.text).toContain("176조의2④");
    expect(v.text).not.toContain("관리처분계획 인가일 기준시가");
    expect(v.total).toHaveLength(0);
  });
});

describe("단건 카드 — 신고서 필요경비 줄 (Q-1 a · Q-2 b)", () => {
  it("S1 완공 APT 의제 ③ — 합 1,020,419 · 인가 전 분 개산공제", async () => {
    const v = await singleView(mk([REDEV], "", { householdHousingCount: "0" }));
    expect(v.total).toHaveLength(1);
    expect(v.total[0]).toContain("1,020,419");
    expect(v.pre[0]).toContain("개산공제");
    expect(v.post).toHaveLength(0);
    expect(v.settlement).toHaveLength(0);
    expect(redevBranchTotals(v.res.redevelopmentDetail).expenses).toBe(1_020_419);
  });

  it("S2 완공 APT 의제 ① + 인가 전 실비 — 합 1,200,000 · 실제 필요경비", async () => {
    const v = await singleView(mk([REDEV_ACTUAL], "", { householdHousingCount: "0" }));
    expect(v.total[0]).toContain("1,200,000");
    expect(v.pre[0]).toContain("자본적지출·양도비");
    expect(v.pre[0]).not.toContain("개산공제");
  });
});

/**
 * 입력 경로 — 원조합원의 인가 후 분 경비는 일반 자본적지출·양도비 칸으로 들어간다(`transfer-tax-api-redev.ts` `postApprovalExpenses` =
 * 승계조합원 전용 `redevPostApprovalExpenses` + 자본적지출 + 양도비, 채무비율 안분). 종전 계획서 §6 V-1은 승계조합원 전용 칸으로 잘못 재현했다.
 * 기존 부담부증여 묶음 응답 계측 247건에는 자본적지출 입력 시료가 0건이라, 「카드별 필요경비 합 = 자산별 필요경비 합」을 이 시료들로 다시 고정한다.
 * 값은 route 실측(자본적지출 5,000,000 + 양도비 1,000,000 → 채무비율 40% = 2,400,000).
 */
const CAP: A = { capitalExpenditure: "5,000,000", transferExpense: "1,000,000" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardExpenseSum = (d: any) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (d.transferBurdenedGiftBreakdown.cards as any[]).reduce(
    (s, c) => s + (c.redevFilingExpenses ? c.redevFilingExpenses.preApproval + c.redevFilingExpenses.postApproval + c.redevFilingExpenses.settlement : c.breakdown.perAsset.land.estimatedDeduction + c.breakdown.perAsset.building.estimatedDeduction),
    0,
  );
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const propertyExpenseSum = (d: any) => (d.aggregated.properties as any[]).reduce((s, p) => s + p.necessaryExpense, 0);

describe("입력 경로 — 자본적지출·양도비(인가 후 분 · 청산금 분)", () => {
  it("묶음 · 완공 APT ③ + 자본적지출·양도비 — 인가 전 개산공제 1,020,419 + 인가 후 1,686,296 + 청산금 713,704 = 3,420,419 = 자산별 필요경비", async () => {
    const v = await bundleView(mk([HOUSING, { ...REDEV, ...CAP }], "825000000"));
    expect(v.total[0]).toContain("3,420,419");
    expect(v.pre[0]).toContain("1,020,419");
    expect(v.post[0]).toContain("1,686,296");
    expect(v.settlement[0]).toContain("713,704");
    expect(v.necessary).toEqual([3_420_419]);
    expect(cardExpenseSum(v.d)).toBe(propertyExpenseSum(v.d));
    expect(v.tax).toBe(34_061_170);
  });

  it("묶음 · 완공 APT ① 실비 + 자본적지출·양도비 — 합 3,600,000 = 인가 전 실비 1,200,000 + 인가 후 + 청산금", async () => {
    const v = await bundleView(mk([HOUSING, { ...REDEV_ACTUAL, ...CAP }], "825000000"));
    expect(v.total[0]).toContain("3,600,000");
    expect(v.pre[0]).toContain("1,200,000");
    expect(v.post[0]).toContain("1,686,296");
    expect(v.settlement[0]).toContain("713,704");
    expect(cardExpenseSum(v.d)).toBe(propertyExpenseSum(v.d));
    expect(v.tax).toBe(14_242_113);
  });

  it("묶음 · 비재개발 주택(실지)에 자본적지출·양도비 + 재개발 카드 — 카드별 합(주택 §159 칸 2,400,000 + 재개발 1,020,419) = 자산별 필요경비 합", async () => {
    const v = await bundleView(mk([{ ...HOUSING, ...CAP }, REDEV], "825000000"));
    expect(v.total).toHaveLength(1);
    expect(v.post).toHaveLength(0);
    expect(cardExpenseSum(v.d)).toBe(3_420_419);
    expect(cardExpenseSum(v.d)).toBe(propertyExpenseSum(v.d));
  });

  it("묶음 · 입주권 축 B 원+원 실비 + 자본적지출·양도비(첫 카드) — 카드마다 분기 구성 · 합 = 자산별 필요경비", async () => {
    const withExp = { redevPreApprovalExpenses: "3,000,000" };
    const v = await bundleView(rights(first({ ...ORIG, ...withExp, bgActualAcquisitionTotal: "300,000,000", ...CAP }), share({ ...ORIG, ...withExp })));
    expect(v.total).toHaveLength(2);
    expect(v.settlement).toHaveLength(1);
    expect(v.necessary).toEqual([1_800_000, 600_000]);
    expect(cardExpenseSum(v.d)).toBe(propertyExpenseSum(v.d));
    expect(v.tax).toBe(128_498_480);
  });

  it("단건 · 완공 APT ③ + 자본적지출·양도비 — 합 3,420,419 · 인가 후·청산금 분 줄", async () => {
    const v = await singleView(mk([{ ...REDEV, ...CAP }], "", { householdHousingCount: "0" }));
    expect(v.total[0]).toContain("3,420,419");
    expect(v.post[0]).toContain("1,686,296");
    expect(v.settlement[0]).toContain("713,704");
    expect(redevBranchTotals(v.res.redevelopmentDetail).expenses).toBe(3_420_419);
  });

  it("단건 · 입주권(원조합원) — 인가 전 실비 3,000,000 × 채무비율 = 1,200,000 · 자본적지출·양도비까지 3,600,000 (인가 후 분이 없는 입주권은 청산금 분에 들어간다)", async () => {
    const RT = first({ ...ORIG, ownershipNumerator: "", ownershipDenominator: "", redevPreApprovalExpenses: "3,000,000", bgActualAcquisitionTotal: "300,000,000" });
    const single = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { householdHousingCount: "0", contractTotalPrice: "1500000000", assets: [a] }) as TransferFormData;
    const base = await singleView(single(RT));
    expect(base.total[0]).toContain("1,200,000");
    expect(base.pre[0]).toContain("자본적지출·양도비");
    expect(base.post).toHaveLength(0);
    expect(base.settlement).toHaveLength(0);
    cleanup();
    const withCap = await singleView(single({ ...RT, ...CAP } as AssetForm));
    expect(withCap.total[0]).toContain("3,600,000");
    expect(withCap.pre[0]).toContain("1,200,000");
    expect(withCap.settlement[0]).toContain("2,400,000");
    expect(redevBranchTotals(withCap.res.redevelopmentDetail).expenses).toBe(3_600_000);
  });
});

describe("분기별 구성 leaf · 렌더", () => {
  const branch = (expenses: number, gain = 0) => ({ expenses, gain, apportionedTransfer: 0, apportionedAcquisition: 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = (over: any) => ({ preApproval: branch(1_000_000), postApprovalExistingHouse: branch(2_000_000), settlement: branch(300_000), estimatedLumpDeduction: 0, ...over }) as never;

  it("세 분기 합 = redevBranchTotals().expenses · 개산공제와 같고 0보다 크면 estimated", () => {
    const d = detail({});
    expect(redevBranchExpenseParts(d)).toEqual({ preApproval: 1_000_000, preApprovalKind: "actual", postApproval: 2_000_000, settlement: 300_000 });
    expect(redevBranchTotals(d).expenses).toBe(3_300_000);
    expect(redevBranchExpenseParts(detail({ estimatedLumpDeduction: 1_000_000 })).preApprovalKind).toBe("estimated");
    expect(redevBranchExpenseParts(detail({ estimatedLumpDeduction: 900_000 })).preApprovalKind).toBe("actual");
  });

  it("승계조합원은 인가 후 분만 — 인가 전·청산금 분은 합에 넣지 않는다", () => {
    const d = detail({ successorMemberApplied: true });
    expect(redevBranchExpenseParts(d)).toEqual({ preApproval: 0, preApprovalKind: "actual", postApproval: 2_000_000, settlement: 0 });
    expect(redevBranchTotals(d).expenses).toBe(2_000_000);
  });

  it("세 분기가 모두 있으면 합 줄 + 세 줄, 0인 분기는 줄이 없다", () => {
    const all = render(
      <table><tbody><BgRedevFilingExpenseRows parts={{ preApproval: 1_000_000, preApprovalKind: "actual", postApproval: 2_000_000, settlement: 300_000 }} /></tbody></table>,
    ).container;
    const t = (id: string) => all.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
    expect(t("bg-redev-filing-expense")).toContain(fmt(3_300_000));
    expect(t("bg-redev-filing-expense-pre")).toContain(fmt(1_000_000));
    expect(t("bg-redev-filing-expense-post")).toContain(fmt(2_000_000));
    expect(t("bg-redev-filing-expense-settlement")).toContain(fmt(300_000));
    cleanup();
    const onlyPost = render(
      <table><tbody><BgRedevFilingExpenseRows parts={{ preApproval: 0, preApprovalKind: "actual", postApproval: 500_000, settlement: 0 }} /></tbody></table>,
    ).container;
    expect(onlyPost.querySelector('[data-testid="bg-redev-filing-expense-pre"]')).toBeNull();
    expect(onlyPost.querySelector('[data-testid="bg-redev-filing-expense-post"]')?.textContent).toContain("500,000");
    cleanup();
    const none = render(
      <table><tbody><BgRedevFilingExpenseRows parts={{ preApproval: 0, preApprovalKind: "actual", postApproval: 0, settlement: 0 }} /></tbody></table>,
    ).container;
    expect(none.querySelector('[data-testid="bg-redev-filing-expense"]')).toBeNull();
  });
});
