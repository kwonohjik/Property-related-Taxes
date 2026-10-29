/**
 * anchor — 재개발(§166) × 이월과세(비부담부증여) × **증여자 환산**: 증여세 상당액(「소득세법」 §97의2①3호)이 A의 인가 전 분 필요경비에 산입되고,
 * 종전 부동산 취득가액은 증여세와 무관하게 §166③ 환산이다. 계획서 `docs/02-design/features/redev-carryover-estimated-donor-gift-tax.plan.md`(사용자 결정 Q-1 c).
 *
 * 종전: `transfer-tax-carryover.ts` 환산 갈래가 증여세 > 0이면 입력을 실가로 바꿔 `expenses`에 얹었는데 재개발 경로는 `expenses`를 읽지 않아
 * 증여세 30M·100M이 같은 결과였고(① A 1,048,000,000 · 317,691,600), 종전 취득가액도 일반 환산(양도가액 전체 기준 52,000,000)으로 바뀌었다.
 * 토지 출자 입주권·주택 출자(개별주택가격) 청산금 수령 서브엔진은 증여세를 읽지 않았다. 결정세액은 mock 세율.
 *
 * 시료: 입주권(종전 주택 · 인가일 2024-01-10 · 권리가액 900,000,000 · 청산금 납부 200,000,000) · 양도가액 1,300,000,000 · 증여 등기 2023-06-01 ·
 * 증여자 취득 2012-01-01 · 증여자 환산(기준시가 20,000,000 / 500,000,000) · §166③ 인가일 500,000,000 · 취득당시 20,000,000 · 증여 당시 평가액 300,000,000.
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
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { applyLandContribOverrides } from "@/components/calc/results/transfer/DetailedStatementRedevOverrides";
import { buildRedevExpenseFormula, buildRedevGainFormula } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementConfig";
import { redevelopmentConsumesCarryoverGiftTax } from "@/lib/tax-engine/redevelopment-branch-gate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
const norm = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ");

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



const fmt = (n: number) => n.toLocaleString("ko-KR");
const est = (over: A, giftTax: number): A => ({
  addressJibun: "서울 강남구 테스트동 3-1", assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0",
  actualSalePrice: "1,300,000,000", fixedSalePrice: "1,300,000,000", transferType: "regular", acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", acquisitionPrice: "",
  useEstimatedAcquisition: true, redevManagementDisposalHousingPrice: "500000000", redevAcquisitionHousingPrice: "20000000",
  carryover: {
    ...CARRYOVER, useEstimatedAcquisition: true, estimationMode: "general", donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "20000000", donorStandardPriceAtTransfer: "500000000",
    giftTaxAmount: String(giftTax), donorRelation: "lineal", donorHouseholdHoldingStartDate: "2012-01-01",
  },
  ...over,
});
const PHD: A = { redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevHousingStdPriceAtAcq: "20000000", redevHousingStdPriceAtApproval: "500000000" };
const LAND: A = { redevOriginalAssetType: "land", redevLandStdPriceAtAcq: "20000000", redevLandStdPriceAtApproval: "500000000", redevManagementDisposalHousingPrice: "", redevAcquisitionHousingPrice: "" };
const APT: A = { assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01", redevManagementDisposalHousingPrice: "600000000" };
const APT_RECV: A = { ...APT, redevSettlementDirection: "receive", redevSettlementAmount: "100000000", redevSettlementSaleDate: "2026-02-17" };

async function run(over: A, giftTax: number) {
  const r = await post(mk([est(over, giftTax)], { contractTotalPrice: "1300000000" }));
  expect(r.status, JSON.stringify(r.error)).toBe(200);
  const res = r.data.result;
  const co = res.carryoverTaxationDetail;
  return { res, co, A: co.scenarioA, B: co.scenarioB, rd: res.redevelopmentDetail };
}

describe("① 입주권 납부(§166③ 주택) — 증여세가 A 양도차익에서 빠지고 취득가액은 §166③ 환산 그대로", () => {
  it("증여세 0 — 종전과 같다(A 채택 322,607,280 · 취득 236,000,000)", async () => {
    const { co, A } = await run({}, 0);
    expect([co.adoptedScenario, A.acquisitionPrice, A.transferGain, A.determinedTax]).toEqual(["A", 236_000_000, 1_063_400_000, 322_607_280]);
  });
  it("증여세 30,000,000 — A 양도차익 1,033,400,000 · 결정세액 313,031,280 · 인가 전 분 환산 유지", async () => {
    const { res, co, A, rd } = await run({}, 30_000_000);
    expect([co.adoptedScenario, res.determinedTax, A.acquisitionPrice, A.transferGain]).toEqual(["A", 313_031_280, 236_000_000, 1_033_400_000]);
    expect(rd.valuationMeta.method).toBe("estimated_post_disclosure_decree_166_3");
    expect([rd.preApproval.gain, rd.preApproval.expenses, rd.preApproval.carryoverGiftTaxExpense]).toEqual([833_400_000, 30_600_000, 30_000_000]);
    expect([A.giftTaxAddedToExpense, A.giftTaxLimitCap, A.giftTaxLimitApplied]).toEqual([30_000_000, 863_400_000, false]);
  });
  it("증여세 100,000,000 — A 963,400,000(290,687,280) < B 299,010,000 → B 채택", async () => {
    const { res, co, A } = await run({}, 100_000_000);
    expect([co.adoptedScenario, res.determinedTax, A.transferGain, A.determinedTax]).toEqual(["B", 299_010_000, 963_400_000, 290_687_280]);
  });
  it("한도 — 증여세 2,000,000,000은 인가 전 분 양도차익 863,400,000까지만", async () => {
    const { A } = await run({}, 2_000_000_000);
    expect([A.transferGain, A.giftTaxAddedToExpense, A.giftTaxLimitCap, A.giftTaxLimitApplied]).toEqual([200_000_000, 863_400_000, 863_400_000, true]);
  });
});

describe("③ 토지 출자 입주권 — 서브엔진(`runLandContribEstimated`)이 증여세를 산입한다", () => {
  it("증여세 0 — 종전과 같다(322,607,280)", async () => {
    const { res, rd } = await run(LAND, 0);
    expect(res.determinedTax).toBe(322_607_280);
    expect(rd.landContribDetail).toBeDefined();
    expect(rd.preApproval.carryoverGiftTaxExpense).toBeUndefined();
  });
  it("증여세 30,000,000 — A 1,033,400,000 · 313,031,280 · 인가 전 필요경비 = 개산공제 600,000 + 증여세", async () => {
    const { res, A, rd } = await run(LAND, 30_000_000);
    expect([res.determinedTax, A.transferGain, A.acquisitionPrice]).toEqual([313_031_280, 1_033_400_000, 36_000_000]);
    expect(rd.landContribDetail.convertedAcquisition).toBe(36_000_000);
    expect([rd.preApproval.gain, rd.preApproval.expenses, rd.preApproval.carryoverGiftTaxExpense]).toEqual([833_400_000, 30_600_000, 30_000_000]);
    expect([rd.carryoverGiftTaxApplied, rd.carryoverGiftTaxCap]).toEqual([30_000_000, 863_400_000]);
    // 인가 전 분 장기보유특별공제는 증여세를 뺀 양도차익에 곱한다
    expect(rd.preApproval.lthd).toBe(Math.floor(833_400_000 * rd.preApproval.lthdRate));
  });
  it("한도 — 2,000,000,000은 863,400,000까지(A 양도차익 200,000,000)", async () => {
    const { A } = await run(LAND, 2_000_000_000);
    expect([A.transferGain, A.giftTaxAddedToExpense, A.giftTaxLimitApplied]).toEqual([200_000_000, 863_400_000, true]);
  });
  it("명세서 산식 — 인가 전 분 필요경비·양도차익에 증여세 항이 있고 산술이 맞는다", async () => {
    const { rd } = await run(LAND, 30_000_000);
    const keys = ["transferPrice", "acquisitionPrice", "expenses", "transferGain", "taxableGain", "ltDeduction", "ltHoldingPart", "ltResidencePart", "incomeAmount"];
    const items = new Map(keys.map((k) => [k, { label: k, value: 0 } as StatementItem]));
    applyLandContribOverrides(items, rd, 1_300_000_000);
    const exp = items.get("expenses")!.perAsset![0];
    expect([exp.value, exp.formula]).toEqual([30_600_000, `20,000,000 × 3% = 600,000 (1원 미만 절사) + 이월과세 증여세 상당액 30,000,000 (소득세법 §97의2①3호) = 30,600,000`]);
    expect(items.get("transferGain")!.perAsset![0].formula).toBe(
      `권리가액 ${fmt(900_000_000)} − 환산취득가 ${fmt(36_000_000)} − 개산공제 ${fmt(600_000)} − 이월과세 증여세 상당액 ${fmt(30_000_000)} = ${fmt(833_400_000)}`,
    );
  });
});

describe("② 주택 출자 입주권 청산금 수령(개별주택가격) — 서브엔진(`runHousingContribReceiveEstimated`)이 증여세를 나목 비율로 안분해 산입한다", () => {
  it("증여세 0 — 종전과 같다(420,408,600)", async () => {
    const { res, rd } = await run(PHD, 0);
    expect(res.determinedTax).toBe(420_408_600);
    expect(rd.housingContribDetail).toBeDefined();
  });
  it("증여세 30,000,000 — 안분 26,666,666(= 30,000,000 × 800/900) · A 1,240,800,000 · 411,288,600", async () => {
    const { res, A, rd } = await run(PHD, 30_000_000);
    expect([res.determinedTax, A.transferGain]).toEqual([411_288_600, 1_240_800_000]);
    expect([rd.preApproval.gain, rd.preApproval.carryoverGiftTaxExpense, rd.carryoverGiftTaxApplied, rd.carryoverGiftTaxCap]).toEqual([740_800_000, 26_666_666, 26_666_666, 863_400_000]);
    // 신고서 인가 전 분 열 항등식(양도가액 − 취득가액 − 필요경비 = 양도차익)
    expect(rd.preApproval.apportionedTransfer - rd.preApproval.apportionedAcquisition - rd.preApproval.expenses).toBe(rd.preApproval.gain);
    expect(A.giftTaxAddedToExpense).toBe(26_666_666);
  });
  it("한도 — 2,000,000,000은 안분 전 863,400,000 → 안분 767,466,666(A 양도차익 500,000,000)", async () => {
    const { A } = await run(PHD, 2_000_000_000);
    expect([A.transferGain, A.giftTaxAddedToExpense, A.giftTaxLimitApplied]).toEqual([500_000_000, 767_466_666, true]);
  });
  it("상세 카드 — 개산공제 줄은 증여세를 뺀 값, 증여세 줄은 따로", async () => {
    const { rd } = await run(PHD, 30_000_000);
    const t = norm(render(<RedevelopmentDetailCard detail={rd} subject="right" settlementDirection="receive" />).container);
    cleanup();
    expect(t).toContain(`− 이월과세 증여세 상당액(안분 후) — 소득세법 §97의2①3호${fmt(26_666_666)}`);
    expect(t).toContain(`× 3%${fmt(rd.preApproval.expenses - 26_666_666)}`);
  });
});

describe("④⑤ 완공 아파트 — 증여세가 A 양도차익에서 빠진다(B 채택이라 결정세액 불변)", () => {
  it("납부 · 증여세 30,000,000 — A 1,039,400,000 · 취득 230,000,000 유지", async () => {
    const { res, A } = await run({ ...APT, redevAcquisitionHousingPrice: "20000000" }, 30_000_000);
    expect([res.determinedTax, A.acquisitionPrice, A.transferGain, A.determinedTax]).toEqual([299_010_000, 230_000_000, 1_039_400_000, 281_600_923]);
  });
  it("수령 · 증여세 30,000,000 — A 1,339,400,000(나머지는 청산금 분할양도 분에서 차감해 전액)", async () => {
    const { res, A } = await run({ ...APT_RECV, redevAcquisitionHousingPrice: "20000000" }, 30_000_000);
    expect([res.determinedTax, A.acquisitionPrice, A.transferGain]).toEqual([427_935_000, 30_000_000, 1_339_400_000]);
  });
});

describe("결과 산식 문구", () => {
  it("일반 빌더 — 인가 전 분 양도차익·필요경비 산식에 증여세 항", async () => {
    const { rd } = await run({}, 30_000_000);
    expect(buildRedevGainFormula("preApproval", rd, true)).toBe(
      `${fmt(900_000_000)} − ${fmt(36_000_000)} − 개산공제 ${fmt(600_000)} − 이월과세 증여세 상당액 ${fmt(30_000_000)} = ${fmt(833_400_000)}`,
    );
    expect(buildRedevExpenseFormula("preApproval", rd)).toContain(`인가전 분 필요경비 합계 ${fmt(30_600_000)}`);
    expect(buildRedevExpenseFormula("preApproval", rd)).toContain(`(이월과세 증여세 상당액 ${fmt(30_000_000)} 포함 — 소득세법 §97의2①3호)`);
  });
  it("상세 카드(납부) — 증여세 줄", async () => {
    const { rd } = await run({}, 30_000_000);
    const t = norm(render(<RedevelopmentDetailCard detail={rd} subject="right" settlementDirection="pay" />).container);
    cleanup();
    expect(t).toContain(`이월과세 증여세 상당액 — 소득세법 §97의2①3호${fmt(30_000_000)}`);
  });
  it("증여세 0이면 증여세 문구가 없다", async () => {
    const { rd } = await run(LAND, 0);
    expect(buildRedevGainFormula("preApproval", rd, true)).not.toContain("증여세");
    const t = norm(render(<RedevelopmentDetailCard detail={rd} subject="right" settlementDirection="pay" />).container);
    cleanup();
    expect(t).not.toContain("이월과세 증여세 상당액");
  });
});

describe("leaf — 증여세를 소비하는 재개발 분기", () => {
  it("승계조합원(§166 밖)만 제외 · 재개발이 아니면 false", () => {
    expect(redevelopmentConsumesCarryoverGiftTax(undefined)).toBe(false);
    expect(redevelopmentConsumesCarryoverGiftTax({})).toBe(true);
    expect(redevelopmentConsumesCarryoverGiftTax({ isSuccessorMember: false })).toBe(true);
    expect(redevelopmentConsumesCarryoverGiftTax({ isSuccessorMember: true })).toBe(false);
  });
});
