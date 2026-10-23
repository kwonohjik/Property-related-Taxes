/**
 * @vitest-environment jsdom
 *
 * PR-5b · Q-13 — 일반건물 결과의 §114조의2 가산세 라벨은 **산정방식별**(환산취득가액 / 감정가액)이다.
 * 종전 결과 카드는 「환산취득가액 가산세 … 건물 환산취득가」로 고정이라 감정가액 건물 파트(비부담부증여 환산 경로 · 부담부증여 K-7)도 그렇게 적혔고,
 * 상세명세서는 어댑터 result 에 step 이 없어 항상 「환산취득가액」이었다. 계획서 gb-card-built-penalty-114-2.plan.md §17.
 * 또한 부담부증여 K-5/K-7 본인 신축 가산세가 붙으면 결과 경고에 «정면 해석례 확인 필요» 고지가 실린다(Q-14).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calculateGeneralBuildingTransfer, calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { AggregatedTaxSummary } from "@/components/calc/results/BundledAllocationSubCards";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { penaltyMethodSums } from "@/lib/tax-engine/penalty-method-of-properties";
import { gbPenaltyBadgeMethod } from "@/components/calc/transfer/GeneralBuildingAcquisitionCardsParts";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);
const rates = makeMockRates();
const D = (s: string) => new Date(s);

const GB = {
  totalTransferPrice: 1_000_000_000, transferDate: D("2026-03-01"), acquisitionDate: D("2022-01-10"),
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "newConstruction", buildingAcquisitionDate: D("2022-01-10"), landAcquisitionDate: D("2015-01-01"),
};
const estimated = () => calculateGeneralBuildingTransfer(GB as never, 2026, 0, [], rates).aggregated;
const appraisal = () =>
  calculateGeneralBuildingTransfer(
    { ...GB, landAcqMode: "estimated", buildingAcqMode: "appraisal", buildingAcquisitionPrice: 300_000_000 } as never, 2026, 0, [], rates,
  ).aggregated;
const bgInfo = (method: "converted" | "appraisal") => ({
  valuationMode: "sangjeungbeop_market", acquisitionMethod: method, marketValueAtTransfer: 1_000_000_000, lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000,
  annualRentTotal: 0, mortgageSetAmount: 500_000_000, landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000, donorRelation: "lineal_descendant",
  ...(method === "appraisal" ? { presumedLandAcquisitionPrice: 200_000_000, presumedBuildingAcquisitionPrice: 300_000_000 } : {}),
});
const bg = (method: "converted" | "appraisal", over: object = {}) =>
  calculateGeneralBuildingActualTransfer(
    { ...GB, actualAcquisitionPrice: 0, actualExpenses: 0, burdenedGiftInfo: bgInfo(method), ...over } as never, 2026, 0, [], rates,
  ).aggregated;

const summary = (a: ReturnType<typeof estimated>) => render(<AggregatedTaxSummary aggregated={a} />).container.textContent ?? "";
const statement = (a: ReturnType<typeof estimated>) =>
  buildStatementItems(aggregateToFilingResult(a), createDefaultTransferFormData(), undefined, undefined, undefined).get("penaltyTax")!.formula as string;

describe("Q-13 결과 카드 §114조의2 행 라벨", () => {
  it("환산취득가액: 종전 라벨 그대로", () => {
    const t = summary(estimated());
    expect(t).toContain("환산취득가액 가산세 (소득세법 §114조의2 ①) = 건물 환산취득가 250,000,000 × 5%");
    expect(t).not.toContain("감정가액 가산세");
  });

  it("감정가액(비부담부증여 환산 경로의 건물 감정 — 종전 오표기): 「감정가액 가산세 … 건물 감정가액 300,000,000 × 5%」", () => {
    const t = summary(appraisal());
    expect(t).toContain("감정가액 가산세 (소득세법 §114조의2 ①) = 건물 감정가액 300,000,000 × 5%");
    expect(t).not.toContain("환산취득가액 가산세");
  });

  it("부담부증여 K-5 → 환산 라벨 · K-7 → 감정 라벨", () => {
    expect(summary(bg("converted"))).toContain("환산취득가액 가산세 (소득세법 §114조의2 ①) = 건물 환산취득가 125,000,000 × 5%");
    expect(summary(bg("appraisal"))).toContain("감정가액 가산세 (소득세법 §114조의2 ①) = 건물 감정가액 150,000,000 × 5%");
  });

  it("산정방식별 합계 leaf — 감정/환산이 섞이면 둘 다 나뉜다", () => {
    const m = penaltyMethodSums([
      { penaltyTax: 5, penaltyBase: 100, steps: [{ label: "환산가액적용가산세 (§114조의2)", formula: "100 × 5% (신축 5년 이내 양도 + 감정가액 적용)", amount: 5 } as never] },
      { penaltyTax: 7, penaltyBase: 140, steps: [{ label: "환산가액적용가산세 (§114조의2)", formula: "140 × 5% (신축 5년 이내 양도 + 환산취득가액 적용)", amount: 7 } as never] },
      { penaltyTax: 0, penaltyBase: 999 },
    ]);
    expect(m).toEqual({ estimated: { tax: 7, basis: 140 }, appraisal: { tax: 5, basis: 100 } });
  });
});

describe("Q-13 상세명세서(어댑터) 가산세 항목", () => {
  it("감정가액만 있으면 「감정가액 가산세」 · 환산이면 「환산취득가액 가산세」", () => {
    expect(statement(appraisal())).toContain("§114조의2 감정가액 가산세");
    expect(statement(estimated())).toContain("§114조의2 환산취득가액 가산세");
    expect(statement(bg("appraisal"))).toContain("§114조의2 감정가액 가산세");
    expect(statement(bg("converted"))).toContain("§114조의2 환산취득가액 가산세");
  });
});

describe("Q-13 어댑터 산정방식 echo", () => {
  it("감정가액과 환산취득가액 가산세가 섞이면 종전 표기(환산취득가액)를 유지한다 — 한쪽 라벨로 합치지 않는다", () => {
    const a = appraisal();
    const b = a.properties.find((p) => p.propertyId === "building")!;
    const est = estimated().properties.find((p) => p.propertyId === "building")!;
    const mixed = { ...a, properties: [b, { ...est, propertyId: "building#1" }] };
    expect(penaltyMethodSums(mixed.properties).estimated.tax).toBeGreaterThan(0);
    expect(penaltyMethodSums(mixed.properties).appraisal.tax).toBeGreaterThan(0);
    expect(aggregateToFilingResult(mixed as never).penaltyMethod).toBeUndefined();
    expect(aggregateToFilingResult(appraisal()).penaltyMethod).toBe("appraisal");
    expect(aggregateToFilingResult(estimated()).penaltyMethod).toBeUndefined();
  });
});

describe("Q-14 부담부증여 본인 신축 적용 고지", () => {
  it("가산세가 붙으면 «정면 해석례 확인 필요» 경고가 실린다 · 신축이 아니면 없다", () => {
    for (const m of ["converted", "appraisal"] as const) {
      expect(bg(m).warnings.some((w) => w.includes("정면 해석례는 확인하지 못했습니다 — 확인 필요"))).toBe(true);
      expect(bg(m, { buildingAcquisitionCause: "purchase" }).warnings.some((w) => w.includes("일반건물 부담부증여에서 양도인 본인이 신축한 건물"))).toBe(false);
      // 5년 경과 — 가산세 0 이므로 고지 없음
      expect(bg(m, { buildingAcquisitionDate: D("2019-01-01"), acquisitionDate: D("2019-01-01") }).warnings.some((w) => w.includes("일반건물 부담부증여에서 양도인 본인이 신축한 건물"))).toBe(false);
    }
  });
});

describe("안내 배지 gbPenaltyBadgeMethod — 부담부증여 확장", () => {
  const base = (over: Partial<AssetForm>): AssetForm =>
    ({
      ...makeDefaultAsset(1), assetKind: "general_building", gbBuildingAcquisitionCause: "newConstruction", acquisitionDate: "2022-01-10",
      hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", ...over,
    }) as AssetForm;
  it("K-5 → estimated · K-7 → appraisal · 그 밖(실지·기준시가·매매사례) → null", () => {
    const bgm = (method: string, mode = "sangjeungbeop_market") =>
      gbPenaltyBadgeMethod(base({ acquisitionCause: "purchase", transferType: "burdened_gift", bgValuationMode: mode, bgAcquisitionMethod: method } as never), "2026-03-01");
    expect(bgm("converted")).toBe("estimated");
    expect(bgm("appraisal")).toBe("appraisal");
    expect(bgm("actual")).toBeNull();
    expect(bgm("salesCase")).toBeNull();
    expect(bgm("converted", "sangjeungbeop_standard")).toBeNull();
  });
  it("[회귀 0] 비부담부증여는 종전대로 파트 모드", () => {
    expect(gbPenaltyBadgeMethod(base({ acquisitionCause: "purchase", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated" } as never), "2026-03-01")).toBe("estimated");
  });
});
