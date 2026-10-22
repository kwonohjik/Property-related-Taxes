/**
 * anchor: 필요경비 칸 두 벌(O-3) · 재개발 ④ 자본적지출 귀속 안내(O-8) · 일반 양도 환산 「인가전 분 필요경비」(D3).
 * 계획서 `docs/00-pm/burdened-gift-residuals-o3-o5-o8.plan.md` PR-1 — 칸 배치·안내 전용, 세액 무변경.
 *
 * O-3: 부담부증여 실지취득가액(K-4) 박스와 ④가 같은 `capitalExpenditure`·`transferExpense`를 두 칸으로 받았다. ④는 「총 양도비」가
 *      있으면 양도비 칸을 끄는데 박스 칸은 켜져 있어, 박스 값이 총 양도비보다 우선해 ④ 안내와 계산이 갈렸다 → 박스 칸을 없애고 ④로 안내.
 * O-8: 원조합원 재개발 자산의 ④ 두 칸은 인가 후 분 필요경비로만 합산된다. 인가 전 지출을 넣으면 개산공제 모드에서 공제되지 않을
 *      실비가 공제된다(부담부증여 기준시가 −2,386,285 · 일반 환산 −6,264,000) → ④에 모드별 한 줄 안내.
 * D3: 일반 양도 환산 모드의 「인가전 분 필요경비」는 개산공제와 택일이라 쓰이지 않는데 보였다 → 숨기고 안내.
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
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { redevPreApprovalExpensesUnused } from "@/lib/calc/redev-pre-approval-acq-mode";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: AssetForm, f: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), BASE, f, { assets: [a] }) as TransferFormData;

/** 주택 · 시가 5억 · 실지(K-4) 2억 · 채무 2억 → 채무비율 40%. */
const k4 = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "", actualSalePrice: "", useEstimatedAcquisition: false,
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "400000000",
    bgMortgageDebtAmount: "200000000", ...over,
  }) as AssetForm;
/** 재개발 완공 아파트(원조합원) — `bg-redevelopment-sec166-conversion.anchor.test.tsx`의 사실관계. 기본은 부담부증여 · 시가 · 실지. */
const apt = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,500,000,000",
    bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300,000,000",
    standardPriceAtTransfer: "1,500,000,000", standardPriceAtAcq: "100,000,000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000", redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000",
    redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000", redevCompletionDate: "2021-09-01",
    redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000", redevActualAcquisitionPrice: "",
    useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
/** 일반 양도 완공 아파트(원조합원) · 실지. */
const genApt = (over: Record<string, unknown> = {}) =>
  apt({
    transferType: "regular", bgValuationMode: "", bgAcquisitionMethod: "", bgMortgageDebtAmount: "", bgMarketValueAtTransfer: "",
    actualSalePrice: "1,500,000,000", redevActualAcquisitionPrice: "300,000,000", ...over,
  });
const genAptEst = (over: Record<string, unknown> = {}) => genApt({ redevActualAcquisitionPrice: "", useEstimatedAcquisition: true, ...over });
/** 원조합원 입주권 — 기본은 부담부증여 · 기준시가 모드(K-4 고정). */
const right = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(2), assetId: "o", addressJibun: "서울 강남구 테스트동 9-9",
    assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
    acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay",
    redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false,
    standardPriceAtAcq: "", standardPriceAtTransfer: "", ...over,
  }) as AssetForm;
const genRightEst = (over: Record<string, unknown> = {}) =>
  right({
    transferType: "regular", bgValuationMode: "", bgMortgageDebtAmount: "", actualSalePrice: "1,500,000,000", useEstimatedAcquisition: true,
    redevPreApprovalExpenses: "10,000,000", redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000", ...over,
  });

async function taxOf(f: TransferFormData): Promise<number> {
  const r = await runCalc(f);
  expect(r.issues).toEqual([]);
  expect(r.status).toBe(200);
  return r.result.determinedTax;
}

// ─────────────────────────────────────────────────────────────────────────────
// O-3 — K-4 박스의 칸 두 벌
// ─────────────────────────────────────────────────────────────────────────────

describe("BDX-1 K-4 박스 — 자본적지출·양도비 칸이 없고 ④를 가리킨다", () => {
  it.each([
    ["주택 · 시가 · 실지", k4()],
    ["원조합원 입주권(K-4 고정)", right()],
    ["완공 아파트 · 시가 · 실지", apt()],
  ] as const)("%s", (_l, a) => {
    const c = render(<BurdenedGiftBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />).container;
    expect(c.textContent).toContain("실지취득가액 입력");
    expect(c.textContent).not.toContain("자본적지출 (선택)");
    expect(c.textContent).not.toContain("양도비 (선택)");
    expect(c.querySelector('[data-testid="bg-k4-expense-pointer"]')?.textContent).toContain("「④ 자본적 지출, 필요경비」에 입력하세요");
    // ④는 그대로 두 칸을 받는다.
    const e = render(<AssetSectionExpense asset={a} onChange={() => {}} />).container;
    expect(e.querySelector('[data-testid="capital-expenditure"]')).not.toBeNull();
    expect(e.textContent).toContain("양도비 (원)");
  });
});

describe("BDX-2 세액 — 칸을 옮겨도 같은 상태값이라 세액이 같다(실측 §1.2)", () => {
  it.each([
    ["양도비 없음", k4(), {}, 16_445_000],
    ["자산 양도비 3천만", k4({ transferExpense: "30000000" }), {}, 13_857_600],
    ["총 양도비 1천만", k4(), { totalTransferExpense: "10000000" }, 15_355_200],
  ] as const)("%s → %d", async (_l, a, f, tax) => {
    expect(await taxOf(single(a, f))).toBe(tax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O-8 — ④ 자본적지출 귀속 안내
// ─────────────────────────────────────────────────────────────────────────────

const notice = (a: AssetForm) =>
  render(<AssetSectionExpense asset={a} onChange={() => {}} />).container.querySelector('[data-testid="redev-expense-post-approval-notice"]')?.textContent ?? null;
const ACTUAL = "「인가전 분 필요경비」에 넣으세요";
const LUMP = "공제되지 않습니다 — 이 칸에 넣지 마세요";

describe("BDX-3 ④ 안내 — 인가 전 필요경비가 실비인 모드: 재개발 블록 칸으로", () => {
  it.each([
    ["일반 양도 완공 아파트 · 실지", genApt()],
    ["부담부증여 완공 아파트 · K-4", apt()],
    ["부담부증여 원조합원 입주권 · 기준시가(K-4 고정)", right()],
    ["일반 양도 원조합원 입주권 · 실지", genRightEst({ useEstimatedAcquisition: false, redevActualAcquisitionPrice: "300,000,000" })],
  ] as const)("%s", (_l, a) => {
    const t = notice(a);
    expect(t).toContain("관리처분계획인가 후 분 필요경비로 계산합니다");
    expect(t).toContain(ACTUAL);
    expect(t).not.toContain(LUMP);
  });
});

describe("BDX-4 ④ 안내 — 인가 전 필요경비가 개산공제인 모드: 공제되지 않음", () => {
  it.each([
    ["부담부증여 완공 아파트 · 기준시가", apt({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" })],
    ["부담부증여 완공 아파트 · K-5", apt({ bgAcquisitionMethod: "converted" })],
    ["일반 양도 완공 아파트 · 환산", genAptEst()],
    ["일반 양도 원조합원 입주권 · 환산", genRightEst()],
  ] as const)("%s", (_l, a) => {
    const t = notice(a);
    expect(t).toContain("관리처분계획인가 후 분 필요경비로 계산합니다");
    expect(t).toContain(LUMP);
    expect(t).not.toContain(ACTUAL);
  });
});

describe("BDX-5 ④ 안내 없음 — §166 밖", () => {
  it.each([
    ["일반 주택", k4({ assetKind: "housing", transferType: "regular" })],
    ["승계조합원 완공 아파트", genApt({ redevIsSuccessorMember: "yes" })],
    ["승계조합원 입주권", genRightEst({ isSuccessorRightToMoveIn: true })],
  ] as const)("%s", (_l, a) => {
    expect(notice(a)).toBeNull();
  });
});

describe("BDX-6 세액 — 안내의 근거(④ 2천만 vs 인가 전 +2천만, 실측 §1.3)", () => {
  it.each([
    ["일반 양도 · 실지 · ④", genApt({ capitalExpenditure: "20,000,000" }), 263_166_000],
    ["일반 양도 · 실지 · 인가 전", genApt({ redevPreApprovalExpenses: "30,000,000" }), 263_550_000],
    ["일반 양도 · 환산 · ④", genAptEst({ capitalExpenditure: "20,000,000" }), 241_410_000],
    ["일반 양도 · 환산 · 인가 전(쓰이지 않음)", genAptEst({ redevPreApprovalExpenses: "30,000,000" }), 247_674_000],
    ["부담부증여 · 기준시가 · ④", apt({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", capitalExpenditure: "20,000,000" }), 110_589_143],
    ["부담부증여 · 기준시가 · 인가 전(쓰이지 않음)", apt({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", redevPreApprovalExpenses: "30,000,000" }), 112_975_428],
  ] as const)("%s → %d", async (_l, a, tax) => {
    expect(await taxOf(single(a, { contractTotalPrice: a.transferType === "regular" ? "1500000000" : "" }))).toBe(tax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D3 — 일반 양도 환산 「인가전 분 필요경비」
// ─────────────────────────────────────────────────────────────────────────────

describe("BDX-7 재개발 블록 — 일반 양도 환산은 칸이 없고 안내 한 줄", () => {
  const view = (a: AssetForm) => render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />).container;

  it.each([
    ["완공 아파트 · 환산", genAptEst()],
    ["원조합원 입주권 · 환산", genRightEst()],
  ] as const)("%s", (_l, a) => {
    const c = view(a);
    expect(c.querySelector('[data-field="redevPreApprovalExpenses"]')).toBeNull();
    const t = c.querySelector('[data-testid="redev-pre-expense-lump-notice"]')?.textContent ?? "";
    expect(t).toContain("개산공제(취득일 기준시가 × 율");
    expect(t).toContain("환산(같은 영 제166조 제3항)");
    expect(t).not.toContain("부담부증여");
  });

  it.each([
    ["완공 아파트 · 실지", genApt()],
    ["원조합원 입주권 · 실지", genRightEst({ useEstimatedAcquisition: false, redevActualAcquisitionPrice: "300,000,000" })],
    ["승계조합원 입주권 · 환산 라디오 stale", genRightEst({ isSuccessorRightToMoveIn: true })],
  ] as const)("%s: 칸이 있고 안내 없음", (_l, a) => {
    const c = view(a);
    expect(c.querySelector('[data-field="redevPreApprovalExpenses"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="redev-pre-expense-lump-notice"]')).toBeNull();
  });

  it("leaf 단독 — 재개발 자산이 아니면 환산 플래그가 있어도 거짓(호출부 게이트에 기대지 않는다)", () => {
    expect(redevPreApprovalExpensesUnused({ transferType: "regular", assetKind: "housing", useEstimatedAcquisition: true })).toBe(false);
    expect(redevPreApprovalExpensesUnused({ transferType: "regular", assetKind: "redevelopment_apt", useEstimatedAcquisition: true })).toBe(true);
  });

  it("부담부증여 기준시가 모드는 종전 문구 그대로", () => {
    const t = view(apt({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" }))
      .querySelector('[data-testid="redev-pre-expense-lump-notice"]')?.textContent ?? "";
    expect(t).toContain("취득시 기준시가 × 채무비율 × 율");
  });
});

describe("BDX-8 사이드바 계산 전 필요경비 — 숨긴 인가 전 실비를 더하지 않는다", () => {
  const row = (a: AssetForm) => computeTransferPerAssetSummary(single(a, { contractTotalPrice: "1500000000" }), null).rows[0];

  it.each([
    ["일반 양도 완공 아파트 · 환산", genAptEst()],
    ["일반 양도 원조합원 입주권 · 환산", genRightEst()],
  ] as const)("%s: 「계산 후 표시」(종전 10,000,000 — 엔진 개산공제 9,000,000)", (_l, a) => {
    const r = row(a);
    expect(r.expense).toBe(0);
    expect(r.expensePending).toBe(true);
  });

  it("대조 — 일반 양도 완공 아파트 · 실지는 인가 전 실비 + ④를 그대로 더한다", () => {
    const r = row(genApt({ capitalExpenditure: "20,000,000" }));
    expect(r.expense).toBe(30_000_000);
    expect(r.expensePending).toBe(false);
  });
});
