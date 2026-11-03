/**
 * anchor — 원조합원 재개발 × 이월과세 × ② 「환산취득가 사용」 ON의 「인가전 분 필요경비」
 * (계획서 `docs/02-design/features/redev-carryover-est-pre-approval-expense.plan.md` Q-1 a · Q-2 a).
 *
 * 종전: ③이 칸을 숨기고 「쓰이지 않습니다」라고 안내했지만, 엔진이 B(이월과세 미적용 · 수증자 기준)를 고르면 숨은 값이 공제됐다
 * (7백만 → 결정세액 60,621,000 → 57,695,000). 수증자가 인가 전 실비를 넣을 칸도 없었다.
 * 지금: 칸을 보이고 「B 채택이면 공제 · A(증여자 기준 환산) 채택이면 개산공제라 쓰이지 않음」을 ③·④가 같은 문장으로 안내한다.
 * 계산 전 사이드바는 A·B 채택 전이라 「계산 후 표시」를 유지한다. 엔진·④는 바꾸지 않았다(세액 단언은 그 고정).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render } from "@testing-library/react";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { redevPreApprovalExpensesScenarioDependent } from "@/lib/calc/redev-pre-approval-acq-mode";
import { REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE } from "@/lib/calc/redev-pre-approval-acq-mode";
import { redevPreApprovalExpensesUnused } from "@/lib/calc/redev-pre-approval-acq-mode";
import { redevLegacyExpenseUnusedMessage } from "@/lib/calc/redev-legacy-expense-unused";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Over = Record<string, unknown>;
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", householdHousingCount: "2", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, bundledSaleMode: "actual",
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
};
const form = (assets: Over[], contract: string) =>
  Object.assign(createDefaultTransferFormData(), BASE, { contractTotalPrice: contract, totalTransferExpense: "", assets }) as TransferFormData;
const CAR = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2012-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000",
  useEstimatedAcquisition: false, estimationMode: "", giftTaxAmount: "4000000", donorCapitalExpenditure: "0", giftDateValuation: "300000000",
  exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2012-01-01",
};
const right = (i: number, o: Over) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}`, assetKind: "right_to_move_in", redevSubject: "right", redevOriginalAssetType: "housing",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2024-01-10", redevRightsValue: "900000000", redevSettlementDirection: "pay",
  redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0", actualSalePrice: "700,000,000", transferType: "regular",
  acquisitionCause: "carryover_gift", acquisitionDate: "2023-06-01", acquisitionPrice: "100000000", carryover: CAR,
  redevManagementDisposalHousingPrice: "600000000", redevAcquisitionHousingPrice: "250000000", ...o,
});
const apt = (i: number, o: Over) => right(i, { assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2025-09-01", ...o });
/** 이월과세 ② 「환산취득가 사용」 ON */
const EST = { carryover: { ...CAR, useEstimatedAcquisition: true, donorAcquisitionPrice: "" }, redevAcquisitionStdPrice: "200000000", redevManagementDisposalStdPrice: "400000000" };
const land = (i: number) => ({
  ...makeDefaultAsset(i), addressJibun: `서울 강남구 테스트동 ${i}-2`, assetKind: "land", landNature: "general", acquisitionCause: "purchase",
  acquisitionDate: "2015-02-10", actualSalePrice: "300000000", fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: "300000000",
});

/** [이름, 폼, 채택 시나리오, 결정세액 0 → 인가전 분 7백만] — 계획서 §1 V-1 */
const DEPENDENT: [string, (o: Over) => TransferFormData, "A" | "B", number, number][] = [
  ["완공 APT · B 채택", (o) => form([apt(1, { ...EST, ...o })], "700000000"), "B", 60_621_000, 57_695_000],
  ["원조합원 입주권 · B 채택", (o) => form([right(1, { ...EST, ...o })], "700000000"), "B", 60_621_000, 57_695_000],
  ["함께 양도 둘째 자산 · B 채택", (o) => form([land(1), apt(2, { ...EST, ...o })], "1000000000"), "B", 127_006_000, 123_926_000],
  [
    "완공 APT · A 채택(개산공제 — 실비 불변)",
    (o) => form([apt(1, { ...EST, carryover: { ...EST.carryover, giftDateValuation: "1600000000" }, actualSalePrice: "2,000,000,000", ...o })], "2000000000"),
    "A", 452_679_899, 452_679_899,
  ],
];

const last = (f: TransferFormData) => f.assets[f.assets.length - 1] as AssetForm;
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f));
const ui = (a: AssetForm) => {
  render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate={BASE.transferDate} />);
  const field = document.querySelector('[data-field="redevPreApprovalExpenses"]');
  const out = { field: field !== null, fieldText: field?.textContent ?? "", lump: document.querySelector('[data-testid="redev-pre-expense-lump-notice"]') !== null };
  cleanup();
  render(<AssetSectionExpense asset={a} onChange={() => {}} totalTransferExpense="" isSingleAsset isNonPrimaryAsset={false} transferDate={BASE.transferDate} />);
  const violet = document.querySelector('[data-testid="redev-expense-post-approval-notice"]')?.textContent ?? "";
  cleanup();
  return { ...out, violet };
};
const sidebar = (f: TransferFormData) => {
  const row = computeTransferPerAssetSummary(f, null).rows.at(-1)!;
  return { expense: row.expense, pending: row.expensePending };
};

async function calc(f: TransferFormData) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  expect(res.status).toBe(200);
  const j = await res.json();
  const r = j.data.result ?? j.data.aggregated;
  const props = (r.properties ?? []) as { carryoverTaxationDetail?: { adoptedScenario: string } }[];
  const detail = (props.length ? props.at(-1) : r).carryoverTaxationDetail as { adoptedScenario: string };
  const redev = (body.redevelopment ?? (body.companionAssets as { redevelopment: Over }[] | undefined)?.at(-1)?.redevelopment) as Over;
  return { tax: r.totalTax as number, adopted: detail.adoptedScenario, sentPre: redev.preApprovalExpenses };
}

describe("RC-1 화면 — ② 환산 ON은 칸을 보이고 ③·④가 같은 문장으로 A·B 쓰임을 안내한다", () => {
  it.each(DEPENDENT)("%s", (_n, mk) => {
    const a = last(mk({}));
    expect(redevPreApprovalExpensesScenarioDependent(a)).toBe(true);
    expect(redevPreApprovalExpensesUnused(a)).toBe(false);
    const v = ui(a);
    expect(v.field).toBe(true);
    expect(v.fieldText).toContain(REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE);
    expect(v.lump).toBe(false);
    expect(v.violet).toContain("「인가전 분 필요경비」에 넣으세요");
    expect(v.violet).toContain(REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE);
    expect(v.violet).not.toContain("넣지 마세요");
    // 옛 칸 안내는 보이는 칸을 지목하는 문장이다(#2865 첫 갈래)
    expect(redevLegacyExpenseUnusedMessage(a)).toContain("(원조합원이 관리처분계획 인가 전에 쓴 비용은 「인가전 분 필요경비」)");
  });

  it.each(DEPENDENT)("%s — 계산 전 사이드바 필요경비는 「계산 후 표시」(Q-2 a)", (_n, mk) => {
    expect(sidebar(mk({ redevPreApprovalExpenses: "7000000" }))).toEqual({ expense: 0, pending: true });
  });

  it.each(DEPENDENT)("%s — ⑧은 막지 않는다", (_n, mk) => {
    expect(issues(mk({ redevPreApprovalExpenses: "7000000" }))).toEqual([]);
  });
});

describe("RC-2 세액 — 칸 값은 B 채택일 때만 공제된다(엔진·④ 불변)", () => {
  it.each(DEPENDENT)("%s", async (_n, mk, adopted, base, pre7) => {
    const b = await calc(mk({}));
    const p = await calc(mk({ redevPreApprovalExpenses: "7000000" }));
    expect([b.adopted, p.adopted]).toEqual([adopted, adopted]);
    expect(p.sentPre).toBe(7_000_000);
    expect([b.tax, p.tax]).toEqual([base, pre7]);
  });
});

describe("RC-3 대조군 — 다른 경로의 칸·안내는 그대로다", () => {
  it("② 환산 OFF(증여자 실가) — 칸은 있고 시나리오 안내는 없다, 사이드바는 입력값", () => {
    const f = form([apt(1, { redevPreApprovalExpenses: "7000000" })], "700000000");
    const a = last(f);
    expect(redevPreApprovalExpensesScenarioDependent(a)).toBe(false);
    const v = ui(a);
    expect(v.field).toBe(true);
    expect(v.fieldText).not.toContain(REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE);
    expect(v.violet).not.toContain(REDEV_PRE_APPROVAL_SCENARIO_DEPENDENT_NOTE);
    expect(sidebar(f)).toEqual({ expense: 7_000_000, pending: false });
  });

  it("이월과세 아닌 원조합원 환산 — 칸은 숨고 개산공제 안내", () => {
    const a = last(form([apt(1, {
      acquisitionCause: "purchase", acquisitionDate: "2010-01-01", carryover: undefined, useEstimatedAcquisition: true, redevAcquisitionMethod: "estimated",
      redevAcquisitionStdPrice: "200000000", redevManagementDisposalStdPrice: "400000000",
    })], "700000000"));
    expect(redevPreApprovalExpensesScenarioDependent(a)).toBe(false);
    expect(redevPreApprovalExpensesUnused(a)).toBe(true);
    const v = ui(a);
    expect([v.field, v.lump]).toEqual([false, true]);
    expect(v.violet).toContain("넣지 마세요");
  });

  it("부담부증여 이월과세는 범위 밖(이월과세 ② 토글을 읽지 않는다)", () => {
    const a = last(form([apt(1, { ...EST, transferType: "burdened_gift" })], "700000000"));
    expect(redevPreApprovalExpensesScenarioDependent(a)).toBe(false);
  });
});
