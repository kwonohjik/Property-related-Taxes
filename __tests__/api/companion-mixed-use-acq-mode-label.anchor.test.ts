/**
 * #10 함께 양도(컴패니언) 겸용 — 계산명세서 취득가액·필요경비 산정방식 라벨 (2026-10-11).
 *
 * 종전: 파트 카드는 겸용 엔진이 낸 환산·감정 값을 환산 플래그를 끈 실가 item으로 되먹여 결과에 산정방식이 남지 않았다
 * → 명세서가 「자산별 실제 거래가액 합계」·「자산별 양도비 합계 (§97① 나목)」로 적었다(실제 값은 환산·감정·개산공제).
 * 지금: 파트 카드 echo `displayAcquisitionMode` → `aggregateAcqModes` · 자산별 행 문구. 세액은 그대로(단건 겸용과 과세표준 동일).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildMixedUsePartCards } from "@/app/api/calc/transfer/mixed-use-part-cards";
import { makeMockRatesWithHouseEngine } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { aggregateAcqModes } from "@/components/calc/results/transfer/split-acq-text";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRatesWithHouseEngine();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const PRICE = 3_000_000_000;
const asset = (over: Record<string, unknown>): MixedUseAssetInput => ({
  isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
  landAcquisitionDate: D("2005-06-10"), buildingAcquisitionDate: D("2010-03-15"),
  transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
  acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000 },
  residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "general_residential", isOneHouseExempt: false, ...over,
} as unknown as MixedUseAssetInput);
const companion = (over: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput => ({
  propertyId: "c1", propertyLabel: "자산 2", propertyType: "housing", transferPrice: PRICE, acquisitionPrice: 0, expenses: 0,
  transferDate: TD, acquisitionDate: D("2005-06-10"), isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, useEstimatedAcquisition: false, isNonBusinessLand: false, reductions: [],
  ...over,
} as TransferTaxItemInput);

function run(a: MixedUseAssetInput, c = companion()) {
  const single = calcMixedUseTransferTax(PRICE, TD, a, rates);
  const cards = buildMixedUsePartCards(c, a, PRICE, TD, rates, "c1", "자산 2");
  const agg = calculateTransferTaxAggregate({ taxYear: 2024, properties: cards, annualBasicDeductionUsed: 0 }, rates);
  const items = buildStatementItems(
    aggregateToFilingResult(agg),
    { transferDate: "2024-08-20", contractTotalPrice: String(PRICE), assets: [{}] } as unknown as TransferFormData,
    undefined, { properties: agg.properties, aggregated: agg }, PRICE,
  );
  return { single, agg, acq: items.get("acquisitionPrice")!, exp: items.get("expenses")! };
}

describe("#10 컴패니언 겸용 산정방식 라벨", () => {
  it("파트 모델 토지 환산 + 건물 감정 — 소제목·자산별 행이 산정방식을 밝힌다 · 과세표준은 단건 겸용과 같다", () => {
    const { single, agg, acq, exp } = run(asset({ separateAcquisition: { landMode: "estimated", buildingMode: "appraisal", buildingAcquisitionPrice: 400_000_000 } }));
    expect(agg.taxBase).toBe(single.total.taxBase);
    expect([...aggregateAcqModes(agg.properties, undefined)].sort()).toEqual(["appraisal", "estimated"]);
    expect(acq.formula).toContain("산정방식: 환산취득가·감정가액");
    expect(acq.formula).not.toContain("실제 거래가액");
    expect(exp.formula).toContain("개산공제");
    expect(exp.formula).not.toContain("양도비 합계");
    const perAcq = acq.perAsset!.map((r) => r.formula);
    expect(perAcq).toContain("자산별 취득가액(환산취득가) = 99,310,344");
    expect(perAcq).toContain("자산별 취득가액(감정가액) = 320,000,000");
    for (const r of exp.perAsset!) expect(r.formula).toMatch(/^개산공제 등 필요경비 = .*시행령 §163⑥/);
  });

  it("총액 모델 환산 — 전 카드 환산취득가 (「자산별 환산취득가 합계」)", () => {
    const { agg, acq } = run(asset({}));
    expect([...aggregateAcqModes(agg.properties, undefined)]).toEqual(["estimated"]);
    expect(acq.formula).toContain("환산취득가 합계");
  });

  it("부정형 짝 — 파트 모델 실가 파트는 실가 표시 그대로(필요경비 행 「양도비 합계」)", () => {
    const { exp } = run(asset({ separateAcquisition: { landMode: "actual", buildingMode: "appraisal", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: 400_000_000 } }));
    const land = exp.perAsset!.find((r) => r.label === "자산 2 주택 부수토지")!;
    expect(land.formula).toBe("자산별 양도비 합계 = 0 (§97① 나목)");
  });

  it("부정형 짝 — 상속(§163⑨ 평가액 = 실지거래가액 의제)은 echo 없음(종전 표시 그대로)", () => {
    const { agg } = run(asset({ acquisitionByInheritance: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000 }));
    for (const p of agg.properties) expect(p.displayAcquisitionMode).toBeUndefined();
  });

  it("부정형 짝 — 총액 모델 환산이어도 §97②2호 단서로 실비를 채택하면(취득가액 0 + 실비) echo 없음 → 실가 표시", () => {
    const { single, agg } = run(asset({ capitalExpenditure: 2_500_000_000 }));
    expect(single.necessaryExpenseProviso?.chosen).toBe("direct");
    for (const p of agg.properties) expect(p.displayAcquisitionMode).toBeUndefined();
  });
});
