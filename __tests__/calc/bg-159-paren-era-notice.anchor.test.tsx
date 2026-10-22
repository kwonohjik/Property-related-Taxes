/**
 * anchor: 「소득세법 시행령」 §159①1호 괄호 열거의 시기 — 「확인 필요」 고지만(세액 변경 없음).
 * 계획서 `docs/00-pm/burdened-gift-residuals-o9-o11.plan.md` §4 (PR-1).
 *
 * 괄호에 상증법 §61⑤는 2020.2.11.(대통령령 제30395호), §66은 2023.2.28.(대통령령 제33267호) 개정으로 들어왔다. 엔진은 현행 문언을
 * 전 시기에 적용해 그 전 양도의 담보·임대 승도 취득가액을 기준시가로 강제한다. 사용자 결정(2026-10-22)으로 계산은 그대로 두고 알린다.
 * 세액 값은 수정 전 실측(조사 probe)과 같다 — 고지가 계산을 바꾸지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import {
  BG_PAREN_ENUMERATED_FROM,
  BG_PAREN_MORTGAGE_66_FROM,
  BG_PAREN_RENTAL_61_5_FROM,
  MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE,
  bgParenthesisEraNotice,
} from "@/lib/tax-engine/burdened-gift-valuation";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const form = (assets: AssetForm[], transferDate: string) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate, filingDate: transferDate, totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  }, { assets }) as TransferFormData;

/** 주택 · 시가 5억 · 실지 2억 · 취득시 기준시가 1억 · 양도시 기준시가 4억 · 담보채무 6억 · 채권최고액 7.2억 → 담보평가 6억 승(시가 모드). */
const house = (o: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "400000000",
    bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "720000000", ...o,
  }) as AssetForm;
/** 기준시가 모드(보충적 4억 vs 담보 6억 → 담보 승). */
const std = (o: Record<string, unknown> = {}) => house({ bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", ...o });
/** 기준시가 모드 · 임대 승 — 보증금 3억 + 연 임대료 6천만 ÷ 12% = 8억 > 보충적 4억. */
const rental = (o: Record<string, unknown> = {}) =>
  std({ bgMortgageDebtAmount: "", bgMortgageSetAmount: "", bgLendingDepositTotal: "300000000", bgAnnualRentTotal: "60000000", ...o });

/** 재개발 완공 아파트(원조합원) · 같은 담보 승 — §166 분기(조기 반환)도 고지를 결과까지 싣는다. */
const apt = (o: Record<string, unknown> = {}) =>
  house({
    assetKind: "redevelopment_apt", acquisitionDate: "2009-03-01", bgActualAcquisitionTotal: "300,000,000", standardPriceAtTransfer: "1,500,000,000",
    redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000",
    redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000",
    redevCompletionDate: "2021-09-01", redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000",
    redevActualAcquisitionPrice: "", ...o,
  });

async function calc(a: AssetForm, date: string) {
  const r = await runCalc(form([a], date));
  const warnings = (r.result?.warnings ?? []) as string[];
  return {
    status: r.status,
    tax: r.result?.determinedTax as number | undefined,
    era: warnings.filter((w) => w.includes("제159조 제1항 제2호")),
    market: warnings.includes(MARKET_COLLATERAL_STANDARD_ACQUISITION_NOTICE),
    method: r.result?.transferBurdenedGiftBreakdown?.acquisitionMethodUsed as string | undefined,
  };
}

describe("ERA-1 괄호에 그 평가가 없던 시기 — 고지 · 세액 불변", () => {
  it.each([
    ["시가 모드 · 담보 승 · 2022-06-01", house(), "2022-06-01", 144_568_000, "제66조"],
    ["기준시가 모드 · 담보 승 · 2022-06-01", std(), "2022-06-01", 144_568_000, "제66조"],
    ["기준시가 모드 · 임대 승 · 2019-06-01", rental(), "2019-06-01", 71_026_700, "제61조 제5항"],
  ] as const)("%s → 시기 고지 1건 · 세액 %d(수정 전과 같다)", async (_l, a, date, tax, article) => {
    const c = await calc(a, date);
    expect(c.status).toBe(200);
    expect(c.method).toBe("standard_price");
    expect(c.tax).toBe(tax);
    expect(c.era).toHaveLength(1);
    expect(c.era[0]).toContain(article);
    expect(c.era[0]).toContain("확인이 필요합니다");
    // 시기 고지가 시가 모드 담보 승 고지(「괄호에 따라」)를 대신한다 — 그 시기엔 맞지 않는 문장이다.
    expect(c.market).toBe(false);
  });

  it("실지취득가액을 바꿔도 세액이 같다 — 고지가 말하는 「현행 문언대로 기준시가」 그대로", async () => {
    const a = await calc(house(), "2022-06-01");
    const b = await calc(house({ bgActualAcquisitionTotal: "300000000" }), "2022-06-01");
    expect(b.tax).toBe(a.tax);
    expect(b.era).toHaveLength(1);
  });
});

describe("ERA-1b 재개발 완공 아파트 분기", () => {
  it("담보 승 · 2022 → 시기 고지 · 2026 → 시가 모드 담보 승 고지", async () => {
    const a = await calc(apt(), "2022-06-01");
    expect(a.status).toBe(200);
    expect(a.method).toBe("standard_price");
    expect(a.era).toHaveLength(1);
    expect(a.market).toBe(false);
    const b = await calc(apt(), "2026-02-16");
    expect(b.era).toEqual([]);
    expect(b.market).toBe(true);
  });
});

describe("ERA-2 괄호에 그 평가가 있는 시기 · 다른 승자 — 고지 없음", () => {
  it.each([
    ["시가 모드 · 담보 승 · 2026-02-16(현행)", house(), "2026-02-16", 128_124_000, true],
    ["기준시가 모드 · 담보 승 · 2026-02-16", std(), "2026-02-16", 128_124_000, false],
    ["기준시가 모드 · 임대 승 · 2021-06-01", rental(), "2021-06-01", 67_053_800, false],
  ] as const)("%s → 시기 고지 없음 · 세액 %d", async (_l, a, date, tax, market) => {
    const c = await calc(a, date);
    expect(c.tax).toBe(tax);
    expect(c.era).toEqual([]);
    expect(c.market).toBe(market);
  });

  it("기준시가 모드 · 보충적 승 · 2019 → 고지 없음(§61①은 2015.2.3.부터 괄호에 있다)", async () => {
    const c = await calc(std({ bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "240000000" }), "2019-06-01");
    expect(c.method).toBe("standard_price");
    expect(c.era).toEqual([]);
  });

  it("시가 모드 · 시가 승 · 2022 → 실지로 계산되므로 고지 없음", async () => {
    const c = await calc(house({ bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "240000000" }), "2022-06-01");
    expect(c.method).toBe("actual");
    expect(c.era).toEqual([]);
    expect(c.market).toBe(false);
  });
});

describe("ERA-3 경계 — 시행일 당일부터 괄호에 있다", () => {
  it.each([
    ["담보 승 2023-02-27", house(), "2023-02-27", 1],
    ["담보 승 2023-02-28", house(), "2023-02-28", 0],
    ["임대 승 2020-02-10", rental(), "2020-02-10", 1],
    ["임대 승 2020-02-11", rental(), "2020-02-11", 0],
  ] as const)("%s → 시기 고지 %d건", async (_l, a, date, n) => {
    const c = await calc(a, date);
    expect(c.status).toBe(200);
    expect(c.era).toHaveLength(n);
  });
});

describe("ERA-5 2015.2.3. 전 — 괄호가 조문을 열거하지 않던 시기는 단정하지 않는다", () => {
  it.each([
    ["임대 승 2014-06-01", rental({ acquisitionDate: "2010-01-01" }), "2014-06-01"],
    ["담보 승 2014-06-01", std({ acquisitionDate: "2010-01-01" }), "2014-06-01"],
    ["임대 승 2015-02-02", rental({ acquisitionDate: "2010-01-01" }), "2015-02-02"],
  ] as const)("%s → 「문언만으로는 정해지지 않습니다」 · 실지거래가액 단정 없음", async (_l, a, date) => {
    const c = await calc(a, date);
    expect(c.status).toBe(200);
    expect(c.era).toHaveLength(1);
    expect(c.era[0]).toContain("「양도가액을 기준시가에 따라 산정한 경우」라고만 규정");
    expect(c.era[0]).not.toContain("그 당시 문언대로라면");
  });

  it("임대 승 2015-02-03 → 열거 시기 문구(2020.2.11. 추가)", async () => {
    const c = await calc(rental({ acquisitionDate: "2010-01-01" }), "2015-02-03");
    expect(c.era[0]).toContain("2020.2.11. 개정으로 추가");
    expect(c.era[0]).toContain("그 당시 문언대로라면");
  });
});

describe("ERA-6 양도세 축과 증여세 축의 승자가 갈려도 고지는 양도가액 축으로 말한다(리뷰 F1)", () => {
  it("상가 · 양도시 기준시가 2억 · 증여세 건물 기준시가 3억 · 담보채무 2.5억 → 양도가액은 담보, 증여가액은 보충적", async () => {
    const a = {
      ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "commercial_building", transferType: "burdened_gift",
      bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "250000000", bgMortgageSetAmount: "300000000", bgDonorRelation: "lineal_descendant",
      bgGiftBuildingStdPriceAtTransfer: "300000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000",
      acquisitionCause: "purchase", acquisitionDate: "2012-01-01",
    } as unknown as AssetForm;
    const r = await runCalc(form([a], "2022-06-01"));
    const b = r.result?.transferBurdenedGiftBreakdown;
    expect(b?.sangjeungbeopValuation.selectedMode).toBe("mortgage");
    expect(b?.giftValuation.selectedMode).toBe("supplementary");
    const w = ((r.result?.warnings ?? []) as string[]).filter((x) => x.includes("제159조 제1항 제2호"));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^양도가액\(/);
    expect(w[0]).not.toContain("증여가액이");
  });
});

describe("ERA-4 leaf", () => {
  const d = (s: string) => new Date(s);
  it("시행일 상수", () => {
    expect(BG_PAREN_MORTGAGE_66_FROM.toISOString().slice(0, 10)).toBe("2023-02-28");
    expect(BG_PAREN_RENTAL_61_5_FROM.toISOString().slice(0, 10)).toBe("2020-02-11");
    expect(BG_PAREN_ENUMERATED_FROM.toISOString().slice(0, 10)).toBe("2015-02-03");
  });
  it("기준시가로 강제하지 않았으면 시기와 무관하게 없다", () => {
    for (const m of ["actual", "estimated", "appraisal", "salesCase"]) {
      expect(bgParenthesisEraNotice(m, "mortgage", d("2019-01-01"))).toBeUndefined();
    }
  });
  it("승자별 시행일이 따로다 — 담보는 2020~2023 사이에도 고지, 임대는 아니다", () => {
    expect(bgParenthesisEraNotice("standard_price", "mortgage", d("2021-06-01"))).toContain("2023.2.28.");
    expect(bgParenthesisEraNotice("standard_price", "rental", d("2021-06-01"))).toBeUndefined();
    expect(bgParenthesisEraNotice("standard_price", "rental", d("2019-06-01"))).toContain("2020.2.11.");
    expect(bgParenthesisEraNotice("standard_price", "supplementary", d("2016-01-01"))).toBeUndefined();
  });
});
