/**
 * anchor — **§166 재개발·재건축 자산의 감면 상세(11종)를 정상 경로와 같은 leaf로 확정해 결과에 싣는다** (2026-10-21).
 *
 * 계획서: `docs/00-pm/redev-income-deduction-detail-echo.plan.md` (Q-1 a — STEP 7.5·8.7 둘 다).
 *
 * ## 결함
 * §166 경로(`transfer-tax-redevelopment.ts`)는 차감형 감면(§99의3·§98의3 5년 안분 등)을 단건 세액에는 반영했지만
 * 상세(`new993Detail`·`unsold983Detail` 등)를 결과에 싣지 않았다.
 * - 함께 양도 합산은 상세에서 차감액을 읽어(`incomeDeductionReducibleOf`) §166 자산의 차감형 감면을 0으로 봤다 —
 *   단계 화면엔 감면이 보이는데 세액은 감면 없음과 같았다(220,703,333 → 수정 후 179,698,889).
 * - 단건 신고서·상세명세서의 감면대상 소득금액(`incomeDeductionReducible`)이 0이었다.
 * - 5년 이내 §98의3 세액감면에 비과세 판정 없이 농특세 20%를 붙였다(30,880,000 — 농특세령 §4⑦1호 비과세, 정상 경로 0).
 *
 * ## 고정하는 것
 * 두 경로가 `transfer-tax-income-deduction-details.ts` leaf로 상세를 확정한다. 단건 세액은 5년 이내 §98의3·§98의5 농특세 말고는 불변이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { incomeDeductionReducible } from "@/components/calc/results/transfer/reduction-eligible-income";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  selectActiveIncomeDeduction,
  mergeHybridTaxDetail,
  type IncomeDeductionDetails,
} from "@/lib/tax-engine/transfer-tax-income-deduction-details";
import type { UnsoldHybridResult } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 원조합원 입주권 — 종전주택 2009-07-01 · 인가 2018-06-01 · 권리가액 900,000,000 · 납부 청산금 200,000,000 · 실가 300,000,000. */
const right = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(2),
    assetId: "o",
    addressJibun: "서울 강남구 테스트동 9-9",
    assetKind: "right_to_move_in",
    isSuccessorRightToMoveIn: false,
    redevSubject: "right",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-07-01",
    transferType: "regular",
    actualSalePrice: "1000000000",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing",
    redevRightsValue: "900000000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "200000000",
    redevPreApprovalExpenses: "0",
    useEstimatedAcquisition: false,
    redevActualAcquisitionPrice: "300000000",
    standardPriceAtTransfer: "500000000",
    ...over,
  }) as AssetForm;
/** 원조합원 완공APT — 위 값 + 준공 2021-09-01. */
const apt = (over: Record<string, unknown> = {}) =>
  right({ assetKind: "redevelopment_apt", redevSubject: "apt", redevCompletionDate: "2021-09-01", redevIsSuccessorMember: "no", ...over });
const house = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetId: "h",
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "400000000",
    useEstimatedAcquisition: false,
    ...over,
  }) as AssetForm;
const BASE = {
  transferDate: "2026-02-16",
  filingDate: "2026-04-30",
  totalTransferExpense: "0",
  isOneHousehold: false,
  householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
};
const single = (a: AssetForm, over: Partial<TransferFormData> = {}) =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets: [{ ...a, assetId: "s1" }], contractTotalPrice: a.actualSalePrice }, over) as TransferFormData;
const comp = (assets: AssetForm[], bundledSaleMode: "actual" | "apportioned") =>
  Object.assign(createDefaultTransferFormData(), BASE, {
    assets,
    contractTotalPrice: "1600000000",
    assetSplitMode: "companion",
    bundledSaleMode,
  }) as TransferFormData;

/** §98의3 — 감면 카드 기준시가 세 칸을 모두 채운다(폴백 무관). */
const r983 = (tr = "600000000") => ({
  type: "unsold_98_3",
  residencyType983: "resident",
  houseType983: "purchased",
  contractDate983: "2009-06-01",
  constructionStartDate983: "",
  usageApprovalDate983: "",
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: false,
  landAreaSqm983: "",
  floorAreaSqm983: "",
  isUnsoldConfirmed983: true,
  isFirstContract983: true,
  isNotOccupiedAtContract983: true,
  isNotRecontract983: true,
  isNotExcludedSelfBuilt983: true,
  standardPriceAtAcquisition983: "300000000",
  standardPriceAt5Years983: "400000000",
  standardPriceAtTransfer983: tr,
});
const r993 = () => ({
  type: "new_99_3",
  contractDate993: "2002-01-01",
  usageApprovalDate993: "",
  standardPriceAt5Years: "400000000",
  standardPriceAtAcquisition993: "300000000",
  standardPriceAtTransfer993: "600000000",
  isRecontractExcluded993: false,
  recontractUnavoidableCause993: false,
  isRedevelopedNewHouse993: false,
  previousHouseStdPrice993: "",
  exclusiveAreaSqm993: "84",
  region993: "outside_speculation",
  acquisitionType993: "from_builder",
  hasOccupancyAtContract: false,
  isResident993: true,
  isHousingConstructionBusiness993: false,
});
const r987 = () => ({
  type: "unsold_98_7",
  contractDate987: "2012-10-15",
  acquisitionPrice987: "550,000,000",
  isUnsoldAtCutoff987: true,
  isFirstContract987: true,
  isNotOccupiedAtContract987: true,
  isNotRecontract987: true,
  isDomestic987: true,
  standardPriceAtAcquisition987: "",
  standardPriceAt5Years987: "",
  standardPriceAtTransfer987: "",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agg = (json: any) => json.data.aggregated as { determinedTax: number; ruralSurtax: number; properties: { incomeDeductionReducible?: number }[] };

describe("RD-1 함께 양도 — §166 자산의 차감형 감면이 합산 세액에 들어간다", () => {
  it.each([
    // [자산, 모드, 감면, 결정세액, 농특세, 자산 차감액]  — 수정 전 결정세액은 감면 없음과 같았다(RD-2)
    ["입주권", "apportioned", "§98의3", 179_698_889, 0, 97_629_629],
    ["입주권", "apportioned", "§99의3", 179_698_889, 8_200_888, 97_629_629],
    ["입주권", "actual", "§98의3", 174_410_000, 0, 134_666_666],
    ["입주권", "actual", "§99의3", 174_410_000, 11_312_000, 134_666_666],
    ["완공APT", "apportioned", "§98의3", 157_030_370, 0, 69_629_629],
    ["완공APT", "apportioned", "§99의3", 157_030_370, 5_678_592, 69_629_629],
    ["완공APT", "actual", "§98의3", 151_993_333, 0, 106_666_666],
    ["완공APT", "actual", "§99의3", 151_993_333, 8_739_333, 106_666_666],
  ] as const)("%s · %s · %s → 결정세액 %i · 농특세 %i", async (kind, mode, red, det, rural, reducible) => {
    const mk = kind === "입주권" ? right : apt;
    const reductions = [red === "§98의3" ? r983() : r993()];
    // 함께 양도 자산으로 둘 때와 주 자산으로 둘 때가 같다
    for (const assets of [
      [house(), mk({ reductions })],
      [mk({ assetId: "o0", reductions }), house({ assetId: "h2" })],
    ]) {
      const r = await runCalc(comp(assets, mode));
      expect(r.status).toBe(200);
      expect(agg(r.json).determinedTax).toBe(det);
      expect(agg(r.json).ruralSurtax).toBe(rural);
      expect(agg(r.json).properties.map((p) => p.incomeDeductionReducible ?? 0).sort((a, b) => a - b)).toEqual([0, reducible]);
    }
  });

  it("실가 거래 모드의 자산 차감액 = 같은 자산 단건 차감액 (양도가액이 같을 때)", async () => {
    const s1 = await runCalc(single(right({ reductions: [r983()] })));
    expect(incomeDeductionReducible(s1.result)).toBe(134_666_666);
    const s2 = await runCalc(single(apt({ reductions: [r993()] })));
    expect(incomeDeductionReducible(s2.result)).toBe(106_666_666);
  });
});

describe("RD-2 감면 없는 함께 양도 §166 자산 — 세액 불변", () => {
  it.each([
    ["입주권", "apportioned", 220_703_333],
    ["입주권", "actual", 230_970_000],
    ["완공APT", "apportioned", 185_423_333],
    ["완공APT", "actual", 195_690_000],
  ] as const)("%s · %s → %i", async (kind, mode, det) => {
    const mk = kind === "입주권" ? right : apt;
    for (const assets of [
      [house(), mk({ reductions: [] })],
      [mk({ assetId: "o0", reductions: [] }), house({ assetId: "h2" })],
    ]) {
      const r = await runCalc(comp(assets, mode));
      expect(agg(r.json).determinedTax).toBe(det);
      expect(agg(r.json).ruralSurtax).toBe(0);
    }
  });
});

describe("RD-3 단건 §166 — 세액 불변 · 감면대상 소득금액과 확정된 상세가 실린다", () => {
  it.each([
    ["입주권", "§98의3", 89_602_332, 0, 134_666_666],
    ["입주권", "§99의3", 100_242_998, 10_640_666, 134_666_666],
    ["완공APT", "§98의3", 66_194_332, 0, 106_666_666],
    ["완공APT", "§99의3", 74_370_998, 8_176_666, 106_666_666],
  ] as const)("%s · %s → 총세액 %i · 농특세 %i · 감면대상 소득금액 %i (수정 전 0)", async (kind, red, total, rural, reducible) => {
    const mk = kind === "입주권" ? right : apt;
    const r = await runCalc(single(mk({ reductions: [red === "§98의3" ? r983() : r993()] })));
    expect(r.result.totalTax).toBe(total);
    expect(r.result.ruralSurtax).toBe(rural);
    expect(incomeDeductionReducible(r.result)).toBe(reducible);
    const d = red === "§98의3" ? r.result.unsold983Detail : r.result.new993Detail;
    expect(d.isEligible).toBe(true);
    expect(d.reducibleTransferIncome).toBe(reducible);
    // 농특세 2-pass 값이 상세에 채워진다(preliminary는 0)
    expect(d.ruralSurtax).toBe(rural);
  });

  it("두 감면(§99의3 부적격 + §98의3 적격)이면 §98의3만 확정된다", async () => {
    const r = await runCalc(
      single(apt({ reductions: [{ ...r993(), exclusiveAreaSqm993: "200", contractDate993: "2005-01-01" }, r983()] })),
    );
    expect(r.result.totalTax).toBe(66_194_332);
    expect(r.result.unsold983Detail.reducibleTransferIncome).toBe(106_666_666);
    expect(r.result.ruralSurtax).toBe(0);
  });
});

describe("RD-4 5년 이내 하이브리드 세액감면 농특세 — 정상 경로와 같다", () => {
  const W5 = { transferDate: "2014-06-01", filingDate: "2014-08-31" } as Partial<TransferFormData>;
  const W5b = { transferDate: "2016-06-01", filingDate: "2016-08-31" } as Partial<TransferFormData>;

  it("§98의3(농특세령 §4⑦1호 비과세): 완공APT 농특세 0 (수정 전 30,880,000) · 감면액과 상세가 합쳐진다", async () => {
    const r = await runCalc(
      single(apt({ acquisitionDate: "2010-03-01", redevApprovalDate: "2011-01-01", redevCompletionDate: "2013-01-01", reductions: [r983("")] }), W5),
    );
    expect(r.result.reductionAmount).toBe(154_400_000);
    expect(r.result.ruralSurtax).toBe(0);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.unsold983Detail).toMatchObject({ effectCategory: "tax_amount", reductionAmount: 154_400_000, ruralSurtax: 0 });
    const house5 = await runCalc(single(house({ acquisitionDate: "2010-03-01", actualSalePrice: "1000000000", reductions: [r983("")] }), W5));
    expect(house5.result.ruralSurtax).toBe(0);
  });

  it("§98의7(비과세 열거 없음): 완공APT 농특세 31,840,000 그대로 · 상세가 실린다", async () => {
    const r = await runCalc(
      single(apt({ acquisitionDate: "2013-01-01", redevApprovalDate: "2014-01-01", redevCompletionDate: "2015-06-01", reductions: [r987()] }), W5b),
    );
    expect(r.result.reductionAmount).toBe(159_200_000);
    expect(r.result.ruralSurtax).toBe(31_840_000);
    expect(r.result.unsold987Detail).toMatchObject({ reductionAmount: 159_200_000, ruralSurtax: 31_840_000 });
  });
});

describe("RD-5 leaf", () => {
  const hybrid = (over: Partial<UnsoldHybridResult>) => ({ isEligible: true, effectCategory: "income_deduction", ...over }) as UnsoldHybridResult;

  it("selectActiveIncomeDeduction — 적격만 · 하이브리드는 income_deduction만 · §98의3·§98의5 비과세 표시", () => {
    expect(selectActiveIncomeDeduction({})).toBeUndefined();
    expect(selectActiveIncomeDeduction({ unsold983Detail: hybrid({ isEligible: false }) })).toBeUndefined();
    expect(selectActiveIncomeDeduction({ unsold987Detail: hybrid({ effectCategory: "tax_amount" }) })).toBeUndefined();
    expect(selectActiveIncomeDeduction({ unsold985Detail: hybrid({ ruralSurtaxExempt: true }) })).toEqual({
      key: "unsold985Detail",
      articleLabel: "§98의5",
      isExempt: true,
    });
    expect(selectActiveIncomeDeduction({ unsold987Detail: hybrid({}) })).toMatchObject({ articleLabel: "§98의7", isExempt: false });
    // 차감 3조문도 부적격이면 건너뛴다 — 부적격 상세의 비과세 여부로 농특세를 정하면 안 된다
    const ineligible993 = { isEligible: false } as IncomeDeductionDetails["new993Detail"];
    expect(selectActiveIncomeDeduction({ new993Detail: ineligible993 })).toBeUndefined();
    expect(
      selectActiveIncomeDeduction({ new993Detail: ineligible993, unsold983Detail: hybrid({ ruralSurtaxExempt: true }) }),
    ).toEqual({ key: "unsold983Detail", articleLabel: "§98의3", isExempt: true });
  });

  it("mergeHybridTaxDetail — 하이브리드 아님 · 비과세 · 과세", () => {
    const d: IncomeDeductionDetails = {};
    expect(mergeHybridTaxDetail(d, { reductionTypeApplied: "self_farming", cappedReductionAmount: 100 }).applies).toBe(false);
    expect(mergeHybridTaxDetail(d, { reductionTypeApplied: "unsold_98_5", cappedReductionAmount: 0 }).applies).toBe(false);
    const exempt = mergeHybridTaxDetail(d, {
      reductionTypeApplied: "unsold_98_5",
      cappedReductionAmount: 1_000_000,
      hybridTaxDetail: hybrid({ id: "unsold_98_5", ruralSurtaxExempt: true } as Partial<UnsoldHybridResult>),
    });
    expect(exempt).toMatchObject({ applies: true, ruralSurtax: 0, isExempt: true });
    expect(exempt.details.unsold985Detail).toMatchObject({ reductionAmount: 1_000_000, ruralSurtax: 0, taxReductionForRuralSurtax: 0 });
    const taxable = mergeHybridTaxDetail(d, {
      reductionTypeApplied: "unsold_99_2",
      cappedReductionAmount: 1_000_000,
      hybridTaxDetail: hybrid({ id: "unsold_99_2" } as Partial<UnsoldHybridResult>),
    });
    expect(taxable).toMatchObject({ applies: true, ruralSurtax: 200_000, isExempt: false, articleLabel: "§99의2" });
    expect(taxable.details.unsold992Detail).toMatchObject({ reductionAmount: 1_000_000, ruralSurtax: 200_000 });
  });
});
