/**
 * anchor: 부담부증여 × 재개발 완공 아파트(원조합원) × 기준시가 모드 — 인가 전 분 필요경비는 개산공제.
 * 계획서 `docs/00-pm/bg-redev-apt-pre-approval-lump-deduction.plan.md`.
 *
 * 「소득세법 시행령」 제166조 제1항 제1호의 인가 전 분 필요경비는 「법 제97조제1항제2호 및 제3호 **또는** 제163조제6항」이다.
 * 기준시가 모드는 §159①1호 괄호로 취득가액이 취득시 기준시가(× 채무비율)라 실지거래가액이 아니므로 「소득세법」 §97②2호 —
 * 개산공제(시행령 §163⑥)다. 종전에는 §166 경로가 「실가 모드」로 보고 재개발 블록의 인가 전 실비를 썼다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

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
import { runCalc } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import {
  buildRedevAcquisitionFormula,
  buildRedevExpenseFormula,
} from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: AssetForm, form: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), BASE, form, { assets: [a] }) as TransferFormData;

/** 완공 아파트 — 시가 15억 · 채무 6억(40%) · 평가액 5억 · 납부 청산금 2억 · 인가전 실비 1천만 · 인가후 실비 5백만. */
const apt = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,500,000,000",
    bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted", bgActualAcquisitionTotal: "300,000,000",
    standardPriceAtTransfer: "1,500,000,000", standardPriceAtAcq: "", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000", redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000",
    redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000", redevCompletionDate: "2021-09-01",
    redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000", redevActualAcquisitionPrice: "",
    useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
/** 기준시가 모드 — 취득시 기준시가 1억(실지 3억과 갈라 둔다) → 인가 전 취득가 1억 × 40% = 40,000,000 · 개산공제 × 3% = 1,200,000. */
const std = (over: Record<string, unknown> = {}) =>
  apt({ bgValuationMode: "sangjeungbeop_standard", standardPriceAtAcq: "100,000,000", ...over });

async function run(a: AssetForm, form: Record<string, unknown> = {}) {
  const r = await runCalc(single(a, form));
  expect(r.status).toBe(200);
  const res = r.json.data.result;
  return { res, redev: res.redevelopmentDetail as RedevelopmentResult, tax: res.determinedTax as number };
}

describe("BRL-1 기준시가 모드 — 인가 전 분 필요경비 = 개산공제 (실비와 무관)", () => {
  it("실비 1천만: 개산공제 1,200,000 · 인가 전 양도차익 158,800,000 (종전 실비 4,000,000 · 156,000,000 · 112,191,428)", async () => {
    const { redev, tax } = await run(std());
    expect(redev.preApproval.apportionedAcquisition).toBe(40_000_000);
    expect(redev.estimatedLumpDeduction).toBe(1_200_000);
    expect(redev.preApproval.expenses).toBe(1_200_000);
    expect(redev.preApproval.gain).toBe(158_800_000);
    expect(tax).not.toBe(112_191_428);
  });

  it("실비 0이어도 같은 개산공제·같은 세액 (종전 필요경비 0 · 113,311,428)", async () => {
    const [withExp, without] = await Promise.all([run(std()), run(std({ redevPreApprovalExpenses: "0" }))]);
    expect(without.redev.preApproval.expenses).toBe(1_200_000);
    expect(without.tax).toBe(withExp.tax);
  });

  it("청산금 수령: 인가 전 + 청산금 분 필요경비 합 = 개산공제 1,200,000 (§166①2호 나목 비율 안분) · 실비와 무관", async () => {
    const recv = { redevSettlementDirection: "receive", redevSettlementSaleDate: "2021-09-02" };
    const [a, b] = await Promise.all([run(std(recv)), run(std({ ...recv, redevPreApprovalExpenses: "0" }))]);
    expect((a.redev.preApproval.expenses ?? 0) + (a.redev.settlement.expenses ?? 0)).toBe(1_200_000);
    expect(b.tax).toBe(a.tax);
  });

  it("미등기: 개산공제율 0.3% → 120,000 (시행령 §163⑥1호 단서)", async () => {
    const { redev } = await run(std(), { isUnregistered: true });
    expect(redev.preApproval.expenses).toBe(120_000);
  });
});

describe("BRL-2 대조 — 무변경", () => {
  it("시가 · 실지(K-4): 실비 4,000,000 · 세액 90,004,857", async () => {
    const { redev, tax } = await run(apt({ bgAcquisitionMethod: "actual" }));
    expect(redev.preApproval.expenses).toBe(4_000_000);
    expect(redev.estimatedLumpDeduction ?? 0).toBe(0);
    expect(tax).toBe(90_004_857);
  });
  it("원조합원 입주권 · 기준시가 모드: K-4 고정(§61③은 §159①1호 괄호 열거 밖) — 실비 그대로", async () => {
    const right = {
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false,
      redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift",
      bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
      bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
      bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
      redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay",
      redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "10,000,000", useEstimatedAcquisition: false,
    } as AssetForm;
    const { res, redev } = await run(right);
    expect(res.transferBurdenedGiftBreakdown.acquisitionMethodUsed).toBe("actual");
    expect(redev.preApproval.expenses).toBe(4_000_000);
    expect(redev.estimatedLumpDeduction ?? 0).toBe(0);
  });
  it("시가 · 환산(K-5): §166③ 개산공제 3,600,000 · 세액 82,131,257", async () => {
    const { redev, tax } = await run(apt());
    expect(redev.preApproval.expenses).toBe(3_600_000);
    expect(tax).toBe(82_131_257);
  });
});

describe("BRL-3 결과 표시 — 산정 근거가 「실가 모드」가 아니다", () => {
  it("취득가액·필요경비 산식", async () => {
    const { redev } = await run(std());
    const acq = buildRedevAcquisitionFormula("preApproval", redev);
    expect(acq).toContain("40,000,000");
    expect(acq).toContain("제159조");
    expect(acq).not.toContain("실가 모드");
    const exp = buildRedevExpenseFormula("preApproval", redev);
    expect(exp).toContain("40,000,000");
    expect(exp).toContain("1,200,000");
    expect(exp).not.toContain("실가 모드");
    expect(exp).toContain("취득시 기준시가 × 채무비율 40,000,000 × 3%");
  });
  it("미등기 — 적힌 율이 적힌 값을 만든다 (0.3% · 120,000)", async () => {
    const { redev } = await run(std(), { isUnregistered: true });
    expect(buildRedevExpenseFormula("preApproval", redev)).toContain("40,000,000 × 0.3% = 120,000");
  });
  it("대조 — K-4는 「실가 모드」 그대로", async () => {
    const { redev } = await run(apt({ bgAcquisitionMethod: "actual" }));
    expect(buildRedevAcquisitionFormula("preApproval", redev)).toContain("실가 모드");
  });
});

describe("BRL-4 화면 — 「인가전 분 필요경비」 칸", () => {
  const view = (a: AssetForm) => render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />).container;

  it.each([
    ["기준시가 모드", std()],
    ["시가 · 환산(K-5) — 이미 개산공제와 택일이라 쓰이지 않는다", apt()],
  ] as const)("%s: 칸이 없고 안내 한 줄", (_l, a) => {
    const c = view(a);
    expect(c.querySelector('[data-field="redevPreApprovalExpenses"]')).toBeNull();
    expect(c.querySelector('[data-testid="redev-pre-expense-lump-notice"]')?.textContent).toContain("개산공제");
  });

  it.each([
    ["시가 · 실지(K-4)", apt({ bgAcquisitionMethod: "actual" })],
    ["일반 양도 완공 아파트", apt({ transferType: "general" })],
  ] as const)("%s: 칸이 있고 안내 없음", (_l, a) => {
    const c = view(a);
    expect(c.querySelector('[data-field="redevPreApprovalExpenses"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="redev-pre-expense-lump-notice"]')).toBeNull();
  });
});
