/**
 * anchor: 부담부증여 — 쓰이지 않는 필요경비 칸 숨김 · §166 자산 결과 카드 취득가액 안내.
 * 계획서 `docs/00-pm/burdened-gift-expense-notice-and-redev-card.plan.md`.
 *
 * A. 취득가액을 기준시가(감정가액·매매사례가액)로 산정하는 부담부증여는 필요경비가 개산공제뿐이다(「소득세법」 §97②2호 ·
 *    시행령 §163⑥ · §159①1호 괄호). ④의 자본적지출·양도비 칸은 세액에 쓰이지 않는데 화면에 있었다 → 숨기고 한 줄 안내.
 * B. 원조합원 입주권·완공 아파트 부담부증여의 명세 카드는 인가 전 분(종전 부동산) 취득가만 「건물 취득가」로 보였다.
 *    신고서 합계(인가 전 + 청산금 납부분 — 시행령 §166①1호)와 잇는 라벨·한 줄을 둔다.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bgExpenseInputsUnused } from "@/lib/calc/burdened-gift-expense-scope";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { summarizeAssetSections } from "@/components/calc/transfer/asset-section-summary";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a] }) as TransferFormData;
const bundle = (assets: AssetForm[]) =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "apportioned" }) as TransferFormData;

const house = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "h", addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "400000000",
    useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
/** 부담부증여 주택 · 기준시가 모드(K-1) — 채무 4억 / 양도시 기준시가 10억 = 40%. */
const bgHouse = (over: Record<string, unknown> = {}) =>
  house({
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", standardPriceAtTransfer: "1000000000",
    standardPriceAtAcq: "500000000", actualSalePrice: "", ...over,
  });
const market = (over: Record<string, unknown>) =>
  house({ transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "800000000", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000", actualSalePrice: "", standardPriceAtAcq: "300000000", standardPriceAtTransfer: "500000000", ...over });
/** 원조합원 입주권 부담부증여 — 종전 부동산 실지취득가 3억 · 청산금 납부 2억 · 채무비율 40%. */
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
/** 재개발 완공 아파트 부담부증여(시가) — `bg-redevelopment-sec166-conversion.anchor.test.tsx`와 같은 사실관계. */
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
const mixed = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
    isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
    mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
    fixedAcquisitionPrice: "700000000", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000",
    bgMortgageDebtAmount: "600000000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "700000000",
    standardPriceAtTransfer: "1500000000", standardPriceAtAcq: "700000000", bgHousingAppraisalDeclared: "none", bgMortgageAttribution: "unallocated", ...over,
  }) as AssetForm;
const gbBg = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetId: "gb", addressJibun: "서울 강남구 테스트동 8-8", assetKind: "general_building", acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000", ...over,
  }) as AssetForm;

/** 겸용은 폼 양도일·계약 총액이 다르다(겸용 부담부증여 anchor 사실관계). */
const formOf = (a: AssetForm) =>
  a.isMixedUseHouse ? ({ ...single(a), transferDate: "2024-03-01", contractTotalPrice: "1500000000" } as TransferFormData) : single(a);
const EXP = { capitalExpenditure: "900000000", transferExpense: "100000000" };

async function taxOf(f: TransferFormData): Promise<number> {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = r.json.data;
  return d.result?.determinedTax ?? d.result?.total?.determinedTax ?? d.aggregated?.determinedTax;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. 쓰이지 않는 필요경비 칸
// ─────────────────────────────────────────────────────────────────────────────

describe("BXN-1 leaf — 자본적지출·양도비가 세액에 쓰이지 않는가 (엔진 세액과 짝)", () => {
  it.each([
    ["주택 · 기준시가 모드", true, (o: Record<string, unknown>) => bgHouse(o)],
    ["주택 · 평가 모드 미선택(기준시가로 보낸다)", true, (o: Record<string, unknown>) => bgHouse({ bgValuationMode: "", ...o })],
    ["토지 · 기준시가 모드", true, (o: Record<string, unknown>) => bgHouse({ assetKind: "land", ...o })],
    ["일반건물 · 기준시가 모드", true, (o: Record<string, unknown>) => gbBg(o)],
    ["주택 · 시가 · 감정가액", true, (o: Record<string, unknown>) => market({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionTotal: "300000000", ...o })],
    ["주택 · 시가 · 매매사례가액", true, (o: Record<string, unknown>) => market({ bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "300000000", ...o })],
    ["겸용 · 기준시가 모드", true, (o: Record<string, unknown>) => mixed({ bgValuationMode: "sangjeungbeop_standard", ...o })],
    ["겸용 · 시가 · 감정가액", true, (o: Record<string, unknown>) => mixed({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionTotal: "700000000", ...o })],
    ["주택 · 시가 · 실지", false, (o: Record<string, unknown>) => market({ bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000", ...o })],
    ["주택 · 시가 · 환산(단서 비교)", false, (o: Record<string, unknown>) => market({ bgAcquisitionMethod: "converted", ...o })],
    ["겸용 · 시가 · 실지", false, (o: Record<string, unknown>) => mixed(o)],
    ["겸용 · 시가 · 환산", false, (o: Record<string, unknown>) => mixed({ bgAcquisitionMethod: "converted", ...o })],
    ["원조합원 입주권 · 기준시가 모드", false, (o: Record<string, unknown>) => right(o)],
    ["완공 아파트 · 기준시가 모드", false, (o: Record<string, unknown>) => apt({ bgValuationMode: "sangjeungbeop_standard", standardPriceAtAcq: "300,000,000", ...o })],
  ] as const)("%s → 쓰이지 않음 %s", async (_l, unused, mk) => {
    expect(bgExpenseInputsUnused(mk({}))).toBe(unused);
    const [without, withExp] = await Promise.all([taxOf(formOf(mk({}))), taxOf(formOf(mk(EXP)))]);
    // 쓰이지 않는다 ⇔ 넣어도 세액이 같다. 칸을 숨긴 쪽에서 세액이 바뀌면 숨은 값으로 계산되는 것이다.
    if (unused) expect(withExp).toBe(without);
    else expect(withExp).not.toBe(without);
  });

  it.each([
    ["일반 양도", house(), false],
    ["토지·건물 분리(취득일 다름) — ⑧이 파트 칸으로 보내므로 칸을 남긴다", bgHouse({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-01" }), false],
    ["토지·건물 소유자 분리", bgHouse({ selfOwns: "building_only" }), false],
    ["이월과세 부담부증여 — 양도인 평가액 박스가 자본적지출을 받는다", bgHouse({ acquisitionCause: "carryover_gift" }), false],
  ] as const)("%s → %s", (_l, a, unused) => {
    expect(bgExpenseInputsUnused(a)).toBe(unused);
  });
});

describe("BXN-2 ④ 화면 — 숨김 + 한 줄 안내", () => {
  const view = (a: AssetForm) => render(<AssetSectionExpense asset={a} onChange={() => {}} isSingleAsset />).container;

  it("기준시가 모드: 자본적지출·양도비 칸과 단서 각주가 없고 안내 한 줄이 있다 (값이 남아 있어도)", () => {
    const c = view(bgHouse({ capitalExpenditure: "50000000", transferExpense: "30000000" }));
    expect(c.querySelector('[data-field="capitalExpenditure"]')).toBeNull();
    expect(c.textContent).not.toContain("양도비 (원)");
    expect(c.textContent).not.toContain("§97②2호 단서에 따라");
    const notice = c.querySelector('[data-testid="bg-expense-unused-notice"]');
    expect(notice?.textContent).toContain("개산공제");
    expect(notice?.textContent).toContain("기준시가");
  });

  it("감정가액: 안내가 감정가액으로 말한다", () => {
    const c = view(market({ bgAcquisitionMethod: "appraisal" }));
    expect(c.querySelector('[data-testid="bg-expense-unused-notice"]')?.textContent).toContain("감정가액");
  });

  it.each([
    ["시가 · 실지", market({ bgAcquisitionMethod: "actual" })],
    ["시가 · 환산", market({ bgAcquisitionMethod: "converted" })],
    ["입주권", right()],
    ["일반 양도", house()],
  ] as const)("%s: 칸이 있고 안내가 없다", (_l, a) => {
    const c = view(a);
    expect(c.querySelector('[data-field="capitalExpenditure"]')).not.toBeNull();
    expect(c.textContent).toContain("양도비 (원)");
    expect(c.querySelector('[data-testid="bg-expense-unused-notice"]')).toBeNull();
  });
});

describe("BXN-3 ④ 섹션 요약 — 숨긴 값을 「입력됨」으로 세지 않는다", () => {
  it("기준시가 모드 + 숨은 자본적지출 → 「개산공제만」", () => {
    const s = summarizeAssetSections(bgHouse({ capitalExpenditure: "50000000" }), {});
    expect(s.expense.label).toBe("개산공제만");
    expect(s.expense.filled).toBe(false); // 입력할 것이 없다 — ✓로 표시하지 않는다
  });
  it("대조 — 시가 · 실지 + 자본적지출 → 「입력됨」", () => {
    expect(summarizeAssetSections(market({ bgAcquisitionMethod: "actual", capitalExpenditure: "50000000" }), {}).expense.label).toBe("입력됨");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. §166 자산 결과 카드
// ─────────────────────────────────────────────────────────────────────────────

const NOTE = "인가 후 분·청산금 납부분의 취득가액은";

async function singleView(a: AssetForm) {
  const f = single(a);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const res = r.json.data.result;
  const c = render(<TransferTaxResultView result={res} formData={f} asset={f.assets[0]} onReset={() => {}} onBack={() => {}} />).container;
  return c;
}

describe("BXN-4 단건 결과 — 부담부증여 명세 카드", () => {
  it("원조합원 입주권: 「종전 부동산 취득가(인가 전 분)」 120,000,000 + 신고서 합계 200,000,000", async () => {
    const c = await singleView(right());
    const text = (c.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("종전 부동산 취득가(인가 전 분)");
    expect(text).not.toContain("건물 취득가 = 실지취득가");
    const line = c.querySelector('[data-testid="bg-redev-filing-acquisition"]');
    expect(line?.textContent).toContain(NOTE);
    expect(line?.textContent).toContain("200,000,000");
    // 같은 화면 신고서 표의 합계와 같다
    expect(text).toContain("취득가액200,000,000120,000,00080,000,000");
  });

  it("완공 아파트 · 시가 · 실지: 라벨 + 한 줄 + 신고서 합계", async () => {
    const c = await singleView(apt({ bgAcquisitionMethod: "actual" }));
    const text = (c.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("종전 부동산 취득가(인가 전 분)");
    const line = c.querySelector('[data-testid="bg-redev-filing-acquisition"]')?.textContent ?? "";
    expect(line).toContain(NOTE);
    // 신고서 표 취득가액 행 = 합계 200,000,000 · ① 인가전 120,000,000 · … (합계는 §166 역산이라 열의 합과 다르다)
    expect(text.slice(text.indexOf("항목별 자산-분할 계산 내역"))).toContain("취득가액200,000,000120,000,000");
    expect(line).toContain("200,000,000");
  });

  it("완공 아파트 · 시가 · 환산: §166③ 행은 그대로 두고 한 줄만 더한다", async () => {
    const c = await singleView(apt());
    expect(c.querySelector('[data-testid="bg-redev-sec166-acquisition"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="bg-redev-filing-acquisition"]')?.textContent).toContain(NOTE);
  });

  it("대조 — 부담부증여 주택: 라벨 「건물 취득가」 그대로, 한 줄 없음", async () => {
    const c = await singleView(bgHouse());
    const text = (c.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("건물 취득가 = 취득기준시가");
    expect(c.querySelector('[data-testid="bg-redev-filing-acquisition"]')).toBeNull();
  });
});

describe("BXN-5 묶음 결과 — 주 자산이 입주권이면 합산 신고서 값(엔진 표시 echo)", () => {
  async function bundleView(f: TransferFormData) {
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    const d = r.json.data;
    return render(
      <BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />,
    ).container;
  }

  it("입주권 + 주택: 카드에 한 줄 + 200,000,000", async () => {
    const c = await bundleView(bundle([right({ assetId: "r1" }), bgHouse({ assetId: "h1" })]));
    const line = c.querySelector('[data-testid="bg-redev-filing-acquisition"]')?.textContent ?? "";
    expect(line).toContain(NOTE);
    expect(line).toContain("200,000,000");
    expect(c.textContent).toContain("종전 부동산 취득가(인가 전 분)");
  });

  it("대조 — 주택 + 입주권(주 자산이 주택): 한 줄 없음", async () => {
    const c = await bundleView(bundle([bgHouse(), right()]));
    expect(c.querySelector('[data-testid="bg-redev-filing-acquisition"]')).toBeNull();
  });
});
