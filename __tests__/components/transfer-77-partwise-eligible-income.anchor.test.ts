/**
 * anchor — R-c11-01: 「조세특례제한법」 §77 파트별 감면(5B `partWise`)일 때 별지84호 부표1 ⑲ 세액감면대상금액
 *
 * [결함] `reductionEligibleIncome`이 `public_expropriation`이면 `partWise`를 보지 않고 자산 전체 양도소득금액을
 *   돌려줬다. 엔진은 한 파트만 「소급 2년 이전 취득」 요건을 채우면 §90①의 B를 그 파트 소득으로 줄이는데,
 *   신고서 ⑲·상세명세서·결과 PDF에는 감면 제외 파트 소득까지 합한 값(305,000,000)이 들어갔다. 근거 문구도
 *   「자산 전부가 감면 대상」이라고 적었다.
 *
 * [기대] ⑲ = 엔진 `publicExpropriationDetail.partWise.eligibleIncome`(105,000,000) — 단건(route 경유)·다건(엔진) 모두.
 *   시료: 5B anchor case 1(`__tests__/api/transfer.route.expropriation-77-part-wise-5b.anchor.test.ts`) ·
 *   다건은 F2-1(`__tests__/tax-engine/transfer/split-reduction-part-clause.anchor.test.ts`)과 같은 입력.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableColumns";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { sumReductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 5B case 1 — 건물 2010-03-02 취득(충족) · 토지 2024-01-10 취득(미충족) · 사업인정고시 2025-06-01 · 양도 2026-06-30 */
const house = (): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "제주특별자치도 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-02",
    landAcquisitionCause: "purchase",
    landCauseHost: "purchase",
    landAcquisitionDate: "2024-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "150,000,000",
    actualSalePrice: "800,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "500,000,000",
    buildingTransferPrice: "300,000,000",
    landStandardPriceAtTransfer: "500,000,000",
    buildingStandardPriceAtTransfer: "300,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100000",
  }) as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2026-06-30", filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), bundledSaleMode: "actual",
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
  }) as unknown as TransferFormData;

const PE = {
  reductions: [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2025-06-01" }],
  isOneHousehold: false, householdHousingCount: 2, transferCause: "public_expropriation",
};

async function run(f: TransferFormData): Promise<TransferTaxResult> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const body = {
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0, ...PE,
  };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const j = await res.json();
  expect(res.status, JSON.stringify(j).slice(0, 600)).toBe(200);
  return j.data.result as TransferTaxResult;
}

const textOf = (n: unknown): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  return textOf((n as { props?: { children?: unknown } }).props?.children);
};
const ROW19 = "세액감면대상금액";

describe("R-c11-01 단건 — §77 건물분만 감면대상(5B)이면 ⑲ = 건물분 양도소득금액", () => {
  it("신고서 표 ⑲ · 상세명세서 ⑲ · 결과 PDF ⑲ = 엔진 partWise.eligibleIncome 105,000,000 (종전 305,000,000)", async () => {
    const f = form(house());
    const r = await run(f);
    const pw = r.publicExpropriationDetail?.partWise;
    // 시료 성립 확인 — 엔진이 감면대상을 건물분으로 한정했다
    expect(pw).toMatchObject({ eligiblePart: "building", eligibleIncome: 105_000_000, excludedIncome: 200_000_000 });
    expect(r.reductionAmount).toBe(4_949_404);

    const { mode } = deriveColumns(r);
    const row19 = buildRows(r, mode, f, f.assets[0]).find((x) => x.label === ROW19);
    expect(row19?.values.total).toBe(pw!.eligibleIncome);

    const item = buildStatementItems(r, f, f.assets[0], undefined, undefined).get("reductionTargetIncome");
    expect(item?.value).toBe(pw!.eligibleIncome);
    // 근거 문구 — 자산 전부가 아니라 건물분만 감면대상임을 밝힌다
    expect(item?.formula).toContain("감면대상 건물분 양도소득금액 105,000,000");
    expect(item?.formula).not.toContain("자산 전부가 감면 대상");

    expect(textOf(TransferSection({ r: r as never }))).toContain(`${ROW19} 105,000,000`);
  }, 60_000);
});

describe("R-c11-01 다건 — 같은 split 자산(건물만 충족) + 비사업용 토지 짝", () => {
  const rates = makeMockRates();
  const D = (s: string) => new Date(s);
  const E77 = (cash: number) => ({ type: "public_expropriation", cashCompensation: cash, bondCompensation: 0, businessApprovalDate: D("2013-01-01") });
  const split = () =>
    baseTransferInput({
      propertyType: "building", transferPrice: 1_550_000_000, transferDate: D("2023-03-20"),
      acquisitionPrice: 500_000_000, acquisitionDate: D("2008-03-20"), landAcquisitionDate: D("2021-09-20"),
      isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
      landTransferPrice: 250_000_000, buildingTransferPrice: 1_300_000_000, landStandardPriceAtTransfer: 250_000_000, buildingStandardPriceAtTransfer: 1_300_000_000,
      landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
      reductions: [E77(1_550_000_000)],
    } as Partial<TransferTaxInput>);
  const nbl = () =>
    baseTransferInput({
      propertyType: "land", transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), transferDate: D("2023-03-20"),
      isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: true, expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
  const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;

  it("자산 열 ⑲ · 합계 열 ⑲ · 함께 양도 PDF echo = 엔진 partWise.eligibleIncome", () => {
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2023, properties: [asItem(split(), "A0"), asItem(nbl(), "A1")], annualBasicDeductionUsed: 0 },
      rates,
    );
    const p0 = agg.properties[0];
    const pw = p0.publicExpropriationDetail?.partWise;
    expect(pw?.eligiblePart).toBe("building");
    // 차손 통산이 없어 영 §167의2② echo가 없다 — 이 경로가 partWise를 읽어야 한다
    expect(p0.eligibleIncomeAfterLoss).toBeUndefined();
    expect(pw!.eligibleIncome).toBeLessThan(p0.income);

    expect(sumReductionEligibleIncome(agg.properties)).toBe(pw!.eligibleIncome);
    const adapter = aggregateToFilingResult(agg);
    expect(adapter.aggregateReductionEligibleIncome).toBe(pw!.eligibleIncome);

    const f = { transferDate: "2023-03-20", assets: [], houses: [], presaleRights: [] } as unknown as TransferFormData;
    const row19 = buildRows(adapter, "aggregate", f, undefined, undefined, undefined, undefined, {
      properties: agg.properties,
      aggregated: agg,
    } as never).find((x) => x.label === ROW19);
    expect(row19?.values.total).toBe(pw!.eligibleIncome);
    expect(row19?.values[p0.propertyId as never]).toBe(pw!.eligibleIncome);

    // 자산별 신고서(단일 열) — 어댑터가 partWise를 실어야 ⑲가 합계 열과 같다
    const fr = breakdownToFilingResult(p0);
    const assetRow19 = buildRows(fr, deriveColumns(fr).mode, f).find((x) => x.label === ROW19);
    expect(assetRow19?.values.total).toBe(pw!.eligibleIncome);
  });
});
