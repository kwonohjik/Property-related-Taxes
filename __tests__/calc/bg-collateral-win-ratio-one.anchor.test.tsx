/**
 * anchor: 부담부증여 시가 모드 · 담보 승(「상속세 및 증여세법」 제66조) · 채무비율 1 — ⑧ 분모를 엔진 증여가액으로.
 * 계획서 `docs/00-pm/burdened-gift-residuals-o3-o5-o8.plan.md` O-5 (PR-2).
 *
 * §66은 담보 채권액 기준 평가액과 시가 중 **큰 금액**을 재산가액으로 한다. ⑧은 분모를 시가 입력값으로 둬, 담보평가액 = 인수 채무(채무비율
 * 정확히 1)인 정당한 경우까지 「채무액이 증여가액 초과」로 막았다. 같은 사실을 기준시가 모드로 넣으면 계산됐다(128,124,000).
 * 담보 승이면 §159①1호 괄호로 취득가액이 취득시 기준시가 × 채무비율이라 그 칸(②)을 열고, 쓰이지 않는 방식별 칸·④를 숨긴다.
 * 범위는 단독 소유 단건 — 지분(축 A·B)·묶음·겸용·이월과세·조합원입주권은 종전처럼 막는다.
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
import { allIssues, runCalc } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { AssetSectionTransfer } from "@/components/calc/transfer/asset-sections/AssetSectionTransfer";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { bgCollateralForcesStdAcq, bgWholeGiftValuation } from "@/lib/calc/burdened-gift-collateral-win";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { redevPreApprovalAcqMode, redevPreApprovalExpensesUnused } from "@/lib/calc/redev-pre-approval-acq-mode";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const form = (assets: AssetForm[], f: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), BASE, f, { assets }) as TransferFormData;

/** 주택 · 시가 5억 · 실지 2억 · 취득시 기준시가 1억 · 양도시 기준시가 4억 · 담보채무 6억 · 채권최고액 7.2억 → 담보평가 6억 = 채무 → 채무비율 1. */
const house = (o: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "200000000", standardPriceAtAcq: "100000000", standardPriceAtTransfer: "400000000",
    bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "720000000", ...o,
  }) as AssetForm;
/** 재개발 완공 아파트(원조합원) · 같은 담보 승. */
const apt = (o: Record<string, unknown> = {}) =>
  house({
    assetKind: "redevelopment_apt", acquisitionDate: "2009-03-01", bgActualAcquisitionTotal: "300,000,000", standardPriceAtTransfer: "1,500,000,000",
    redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "500,000,000",
    redevSettlementDirection: "pay", redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "10,000,000", redevPostApprovalExpenses: "5,000,000",
    redevCompletionDate: "2021-09-01", redevManagementDisposalHousingPrice: "400,000,000", redevAcquisitionHousingPrice: "300,000,000",
    redevActualAcquisitionPrice: "", ...o,
  });

async function calc(f: TransferFormData) {
  const r = await runCalc(f);
  return { issues: r.issues.map((i) => i.message), status: r.status, tax: r.result?.determinedTax as number | undefined, r };
}

describe("CW-1 ⑧ 통과 — 담보평가액 = 인수 채무(채무비율 1)는 계산한다", () => {
  it.each([
    ["채권최고액 7.2억 ≥ 채무 6억", house(), 128_124_000],
    ["채권최고액 미입력(채무로 본다)", house({ bgMortgageSetAmount: "" }), 128_124_000],
    ["임대보증금만 6억(근저당 없음)", house({ bgMortgageDebtAmount: "", bgMortgageSetAmount: "", bgLendingDepositTotal: "600000000" }), 128_124_000],
    ["보증금 1억 + 채무 4.5억 · 채권최고액 6억", house({ bgLendingDepositTotal: "100000000", bgMortgageDebtAmount: "450000000", bgMortgageSetAmount: "600000000" }), 112_524_000],
    ["산정방식 환산 — 괄호 강제라 같은 값", house({ bgAcquisitionMethod: "converted" }), 128_124_000],
    ["산정방식 감정가액 · 감정가액 미입력 — 쓰이지 않아 요구하지 않는다", house({ bgAcquisitionMethod: "appraisal" }), 128_124_000],
    ["실지취득가액 미입력 — 쓰이지 않아 요구하지 않는다", house({ bgActualAcquisitionTotal: "" }), 128_124_000],
  ] as const)("%s → %d", async (_l, a, tax) => {
    const c = await calc(form([a]));
    expect(c.issues).toEqual([]);
    expect(c.status).toBe(200);
    expect(c.tax).toBe(tax);
    expect(c.r.result.transferBurdenedGiftBreakdown.debtRatio).toBe(1);
    expect(c.r.result.transferBurdenedGiftBreakdown.acquisitionMethodUsed).toBe("standard_price");
  });

  it("같은 사실을 기준시가 모드로 넣은 값과 같다(종전에도 계산되던 경로)", async () => {
    const c = await calc(form([house({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "", bgMarketValueAtTransfer: "" })]));
    expect(c.issues).toEqual([]);
    expect(c.tax).toBe(128_124_000);
  });

  it("완공 아파트 K-4 · K-5 — 기준시가 강제 + 인가 전 개산공제(46,712,000)", async () => {
    for (const a of [apt(), apt({ bgAcquisitionMethod: "converted" })]) {
      const c = await calc(form([a]));
      expect(c.issues).toEqual([]);
      expect(c.tax).toBe(46_712_000);
    }
  });
});

describe("CW-2 ⑧ 차단 유지 — 정당하지 않은 경우와 범위 밖", () => {
  it("채권최고액 5.5억 < 채무 6억 → 증여가액 5.5억(담보평가)로 막는다 · 문구 숫자가 엔진 C와 같다", () => {
    const m = allIssues(form([house({ bgMortgageSetAmount: "550000000" })])).map((i) => i.message);
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("증여가액(550,000,000원)");
    expect(m[0]).toContain("시가 500,000,000원보다 큰 담보평가액");
  });

  it("취득시 기준시가 비움 → ⑧이 요구한다(엔진 400을 앞당김)", () => {
    const i = allIssues(form([house({ standardPriceAtAcq: "" })]));
    expect(i).toHaveLength(1);
    expect(i[0].field).toBe("standardPriceAtAcq");
    expect(i[0].message).toContain("담보평가액이 시가보다 커서");
  });

  it.each(["appraisal", "salesCase"] as const)("완공 아파트 × %s(자산 종류 변경으로 남은 값) → 담보 승이어도 ⑧이 막는다(엔진이 먼저 막는 조합)", (m) => {
    const i = allIssues(form([apt({ bgAcquisitionMethod: m })]));
    expect(i[0]?.field).toBe("bgAcquisitionMethod");
    expect(i[0]?.message).toContain("매매사례가액·감정가액은 취득가액이 아니라");
  });

  it("산정방식 미선택 → 선택은 요구한다(⑫가 요구)", () => {
    const i = allIssues(form([house({ bgAcquisitionMethod: "" })]));
    expect(i[0]?.field).toBe("bgAcquisitionMethod");
  });

  it.each([
    ["조합원입주권", { assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: false }],
    ["이월과세", { acquisitionCause: "carryover_gift", bgCoDonorActualAcquisitionTotal: "150000000" }],
  ] as const)("%s → 담보 승을 계산하지 않는다고 막는다 · 화면 leaf도 거짓(칸·안내를 바꾸지 않는다)", (_l, o) => {
    const m = allIssues(form([house(o)])).map((x) => x.message).join("\n");
    expect(m).toContain("취득가액 산정 기준을 확인하지 못해 계산하지 않습니다");
    expect(bgCollateralForcesStdAcq(house(o))).toBe(false);
    expect(render(<BurdenedGiftBlock asset={house(o)} onChange={() => {}} />).container.querySelector('[data-testid="bg-collateral-forced-notice"]')).toBeNull();
  });

  it("겸용주택 — 종전처럼 MB-7(담보평가를 주택·상가로 나눌 기준 없음)이 막는다 · ⑫와 같은 이유", () => {
    const mixed = house({
      acquisitionDate: "2010-03-15", isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200",
      buildingFootprintArea: "100", mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
      mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000",
      mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true, fixedAcquisitionPrice: "700000000", bgActualAcquisitionTotal: "700000000",
      standardPriceAtTransfer: "1500000000", standardPriceAtAcq: "700000000", bgHousingAppraisalDeclared: "none", bgMortgageAttribution: "unallocated",
    });
    const m = allIssues(form([mixed], { transferDate: "2024-03-01", contractTotalPrice: "1500000000" })).map((x) => x.message).join("\n");
    expect(m).toContain("나눌 법정 기준이 없어");
    expect(bgCollateralForcesStdAcq(mixed)).toBe(false);
  });

  it("함께 부담부증여 묶음 — 승자가 섞이면(담보 + 보충) 합산 증여가액 불일치로 막는다", () => {
    const b = house({ assetId: "b", addressJibun: "서울 강남구 테스트동 3-3", bgMortgageDebtAmount: "", bgMortgageSetAmount: "" });
    const m = allIssues(form([house({ assetId: "a" }), b], { assetSplitMode: "companion", bundledSaleMode: "apportioned", contractTotalPrice: "" }))
      .map((x) => x.message).join("\n");
    expect(m).toContain("자산 1 담보평가(상증법 §66) · 자산 2 보충적평가: 증여재산 평가 방식이 달라 함께 양도와 같이 계산할 수 없습니다");
  });

  it("지분 1/2 — 종전 처리(시가 분모)를 유지한다", () => {
    const m = allIssues(form([house({ ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes", bgMarketValueAtTransfer: "1000000000" })])).map((x) => x.message).join("\n");
    expect(m).toContain("증여가액(500,000,000원) (지분 50% 해당분");
    expect(bgCollateralForcesStdAcq(house({ ownershipNumerator: "1", ownershipDenominator: "2", bgMarketValueAtTransfer: "1000000000" }))).toBe(false);
  });
});

describe("CW-3 leaf — 엔진과 같은 증여가액 C와 승자", () => {
  it.each([
    ["채권최고액 7.2억", house(), 600_000_000, "mortgage"],
    ["채권최고액 5.5억", house({ bgMortgageSetAmount: "550000000" }), 550_000_000, "mortgage"],
    ["채무 4.8억 · 시가 승", house({ bgMortgageDebtAmount: "480000000", bgMortgageSetAmount: "600000000" }), 500_000_000, "supplementary"],
  ] as const)("%s → C=%d (%s)", (_l, a, c, sel) => {
    expect(bgWholeGiftValuation(a)).toEqual({ value: c, selectedMode: sel });
  });

  it("담보 승이면 취득시 기준시가 칸 · 완공 아파트 K-5 → 「부담부증여」 · 인가 전 개산공제", () => {
    expect(needsBgAcqStdPriceInput(house())).toBe(true);
    expect(needsBgAcqStdPriceInput(house({ bgMortgageDebtAmount: "480000000" }))).toBe(false); // 시가 승 · 실지 — 종전대로
    expect(redevPreApprovalAcqMode(apt({ bgAcquisitionMethod: "converted" }))).toBe("burdened_gift");
    expect(needsBgAcqStdPriceInput(apt({ bgAcquisitionMethod: "converted" }))).toBe(true);
    expect(redevPreApprovalExpensesUnused(apt())).toBe(true);
    expect(redevPreApprovalExpensesUnused(apt({ bgMortgageDebtAmount: "480000000" }))).toBe(false);
  });
});

describe("CW-4 화면 — 담보 승 안내 · 방식별 칸 숨김 · 미리보기", () => {
  const block = (a: AssetForm) => render(<BurdenedGiftBlock asset={a} onChange={() => {}} transferDate="2026-02-16" />).container;

  it("담보 승: 안내 한 줄, K-4 박스 없음, 미리보기 담보평가 600,000,000(종전 720,000,000)", () => {
    const c = block(house());
    const n = c.querySelector('[data-testid="bg-collateral-forced-notice"]')?.textContent ?? "";
    expect(n).toContain("담보평가액 600,000,000원이 시가 500,000,000원보다 커서");
    expect(n).toContain("취득시 기준시가 × 채무비율");
    expect(c.textContent).not.toContain("실지취득가액 입력");
    expect(c.textContent).toContain("600,000,000원");
    expect(c.textContent).not.toContain("720,000,000원");
  });

  it("담보 승 · 감정가액 선택: 감정가액 입력 블록도 숨긴다", () => {
    const c = block(house({ bgAcquisitionMethod: "appraisal" }));
    expect(c.querySelector('[data-testid="bg-collateral-forced-notice"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="bg-presumed-expense-notice"]')).toBeNull();
  });

  it("④ 자본적지출·양도비 숨김(기준시가)", () => {
    const e = render(<AssetSectionExpense asset={house()} onChange={() => {}} />).container;
    expect(e.querySelector('[data-testid="bg-expense-unused-notice"]')?.textContent).toContain("기준시가로 산정하므로");
    expect(e.querySelector('[data-testid="capital-expenditure"]')).toBeNull();
  });

  it("② 취득시 기준시가 칸 안내 — 환산 분자가 아니라 「취득시 기준시가 × 채무비율」", () => {
    const t = render(<AssetSectionTransfer asset={house()} onChange={() => {}} bundledSaleMode="apportioned" singleMode transferDate="2026-02-16" />).container.textContent ?? "";
    expect(t).toContain("담보평가액이 시가보다 커서 증여가액이 담보평가액");
    expect(t).not.toContain("환산취득가액의 분자");
  });

  it("일반건물 — 담보 승 취득가액 안내(실지취득가액 문구가 아니다)", () => {
    const gb = house({
      assetKind: "general_building", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", landAcqMode: "actual", buildingAcqMode: "actual",
      gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
      gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000",
      bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "100000000",
    });
    expect(bgCollateralForcesStdAcq(gb)).toBe(true);
    const c = render(<GeneralBuildingBlock asset={gb} onChange={() => {}} transferDate="2026-02-16" />).container;
    expect(c.querySelector('[data-testid="gb-bg-collateral-acq-notice"]')?.textContent).toContain("취득시 기준시가 × 채무비율");
    expect(c.textContent).not.toContain("취득가액은 실지취득가액 × 채무비율입니다");
  });

  it("대조 — 시가 승(채무 4.8억)은 종전 화면 그대로", () => {
    const a = house({ bgMortgageDebtAmount: "480000000", bgMortgageSetAmount: "600000000" });
    const c = block(a);
    expect(c.querySelector('[data-testid="bg-collateral-forced-notice"]')).toBeNull();
    expect(c.textContent).toContain("실지취득가액 입력");
    const e = render(<AssetSectionExpense asset={a} onChange={() => {}} />).container;
    expect(e.querySelector('[data-testid="capital-expenditure"]')).not.toBeNull();
  });

  it("대조 — 시가 승 세액 무변경(64,473,200)", async () => {
    const c = await calc(form([house({ bgMortgageDebtAmount: "480000000", bgMortgageSetAmount: "600000000" })]));
    expect(c.issues).toEqual([]);
    expect(c.tax).toBe(64_473_200);
  });
});
