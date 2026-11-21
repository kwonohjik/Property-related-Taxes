/**
 * anchor — R-c10-02 · 자산 전체가 양도차손이어도 엔진이 따로 정한 **과세분**을 결과뷰가 그대로 보인다.
 *
 * [결함] 표시 leaf(`assetTaxableGain`)가 「차손이면 gross = 과세대상」(#3337 주석의 옛 전제)이라 gross를 그대로 돌려줬다.
 *   엔진(a1bd2c352)은 비과세·고가 판정이 난 차손 자산의 과세분을 따로 정한다(`transfer-tax.ts` 차손 분기 · 다건 자산 기록).
 *   또 `min(gross, …)` 상한 때문에 자산 전체 차익이 과세분보다 작은 경우(비과세 건물 차손 + 배율 초과 부수토지 이익)도 과세분이 잘렸다.
 *   단건·자산별 신고서의 「비과세 양도차익」은 0 바닥이라 「전체 = 비과세 + 과세대상」이 깨졌다.
 * [시료] 엔진 anchor `high-value-whole-asset-loss.anchor.test.ts`와 같은 입력을 실제 엔진으로 계산한다(픽스처 직접 작성 금지 — 엔진 값이 기대값이다).
 *  · LA-1 1세대1주택 15억 · 취득 16억 + 토지 — 과세분 −20,000,000 · 비과세 −80,000,000 (종전 −100,000,000 · 0)
 *  · LA-2 건물 차손 + 배율 초과 부수토지 이익 — gross −240,000,000 · 과세분 280,000,000 · 비과세 −520,000,000 (종전 −240,000,000 · 0)
 *  · LA-3 같은 구조로 gross +10,000,000 — 과세분 280,000,000 (종전 min 상한으로 10,000,000)
 *  · LA-4 짝 — 전액 비과세 차손(종결 경로 · memory project_loss_early_return_display_echo)과 일반 차손은 값이 그대로다
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput, PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { assetTaxableGain, assetExemptGain, effectiveGrossGain, sumAssetGains } from "@/components/calc/results/transfer/exempt-gross-gain";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const oneHouse = (S: number, A: number) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: A, acquisitionDate: D("2015-01-10"), transferDate: D("2024-06-01"),
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0,
  } as Partial<TransferTaxInput>);
const landOf = (S: number, A: number) =>
  baseTransferInput({
    propertyType: "land", transferPrice: S, acquisitionPrice: A, acquisitionDate: D("2019-01-10"), transferDate: D("2024-06-01"),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0,
  } as Partial<TransferTaxInput>);
/** 비과세 건물 차손 + 비사업용 배율 초과분 이익 — 토지 8억 − 2.4억 · 건물 2억 − `buildingAcq` · 1,200㎡(정착 60㎡ · 비도시 10배 → 초과 1/2) */
const splitHouse = (buildingAcq: number) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 1, landTransferPrice: 800_000_000, buildingTransferPrice: 200_000_000,
    landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 200_000_000, landAcquisitionPrice: 240_000_000, buildingAcquisitionPrice: buildingAcq,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2014-09-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", buildingFootprintArea: 60, acquisitionArea: 1_200, appurtenantLandZone: "non_urban",
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
  } as never) as TransferTaxInput;
const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (items: TransferTaxItemInput[]) => calculateTransferTaxAggregate({ taxYear: 2024, properties: items, annualBasicDeductionUsed: 0 }, rates);

type Rows = ReturnType<typeof buildRows>;
const cell = (rows: Rows, label: string, col: string) => (rows.find((r) => r.label === label)?.values as Record<string, unknown> | undefined)?.[col];
/** 열의 「전체 · 비과세 · 과세대상 · 장특 · 양도소득금액」 */
const colOf = (rows: Rows, col: string) =>
  ["전체 양도차익", "비과세 양도차익", "과세대상 양도차익", "장기보유특별공제", "양도소득금액"].map((l) => cell(rows, l, col));

function views(items: TransferTaxItemInput[]) {
  const a = aggOf(items);
  const meta = { properties: a.properties, aggregated: a } as never;
  const fr = aggregateToFilingResult(a) as never;
  const aggRows = buildRows(fr, "aggregate", undefined, undefined, undefined, undefined, undefined, meta);
  const stmt = buildStatementItems(fr, undefined, undefined, meta, undefined);
  /** 자산별 아코디언의 신고서 표(단건 빌더에 자산 어댑터를 넣는다) */
  const perAsset = (p: PerPropertyBreakdown) => {
    const r = breakdownToFilingResult(p);
    return buildRows(r, deriveColumns(r).mode, undefined, undefined, p.transferPrice);
  };
  return { a, aggRows, stmt, perAsset };
}
function singleViews(input: TransferTaxInput) {
  const s = calculateTransferTax(input, rates);
  const rows = buildRows(s, deriveColumns(s).mode, undefined, undefined, input.transferPrice);
  const stmt = buildStatementItems(s, undefined, undefined, undefined, input.transferPrice);
  return { s, rows, stmt };
}

describe("LA-1 1세대1주택 고가주택 15억 · 취득 16억 + 토지 — 과세분 −20,000,000", () => {
  const { a, aggRows, stmt, perAsset } = views([asItem(oneHouse(1_500_000_000, 1_600_000_000), "h"), asItem(landOf(500_000_000, 300_000_000), "o")]);
  const h = a.properties[0];

  it("엔진 값이 기대값 — income −20,000,000 · 장특 0", () => {
    expect([h.transferGain, h.isExempt, h.income, h.longTermHoldingDeduction]).toEqual([-100_000_000, false, -20_000_000, 0]);
  });
  it("leaf — 과세대상 −20,000,000 · 비과세 −80,000,000 (종전 −100,000,000 · 0)", () => {
    expect([effectiveGrossGain(h), assetExemptGain(h), assetTaxableGain(h)]).toEqual([-100_000_000, -80_000_000, -20_000_000]);
    expect(sumAssetGains(a.properties)).toEqual({ gross: 100_000_000, exempt: -80_000_000, taxable: 180_000_000 });
  });
  it("합산 신고서 자산 열·합계 열 — 전체 = 비과세 + 과세대상 · 과세대상 − 장특 = 양도소득금액", () => {
    expect(colOf(aggRows, "h")).toEqual([-100_000_000, -80_000_000, -20_000_000, 0, -20_000_000]);
    expect(colOf(aggRows, "total")).toEqual([100_000_000, -80_000_000, 180_000_000, 20_000_000, 160_000_000]);
  });
  it("자산별 아코디언 신고서 — 과세대상 −20,000,000 · 비과세 −80,000,000 · 양도소득금액 −20,000,000 (종전 −100,000,000)", () => {
    expect(colOf(perAsset(h), "total")).toEqual([-100_000_000, -80_000_000, -20_000_000, 0, -20_000_000]);
  });
  it("집계 상세명세서 — 과세대상 합 180,000,000 · 자산 행 −20,000,000 · 비과세 합 −80,000,000", () => {
    expect(stmt.get("taxableGain")?.value).toBe(180_000_000);
    expect(stmt.get("taxableGain")?.perAsset?.map((x) => x.value)).toEqual([-20_000_000, 200_000_000]);
    expect(stmt.get("exemptGain")?.value).toBe(-80_000_000);
    expect(stmt.get("taxableGain")?.perAsset?.[0].formula).not.toContain("차손 자산 — 양도차익 -100,000,000 (음수)");
  });
  it("단건 신고서·명세서 — 비과세 −80,000,000 (종전 0 바닥) · 과세대상 −20,000,000", () => {
    const { s, rows, stmt: st } = singleViews(oneHouse(1_500_000_000, 1_600_000_000));
    expect(s.taxableGain).toBe(-20_000_000);
    expect(colOf(rows, "total").slice(0, 3)).toEqual([-100_000_000, -80_000_000, -20_000_000]);
    expect([st.get("transferGain")?.value, st.get("exemptGain")?.value, st.get("taxableGain")?.value]).toEqual([-100_000_000, -80_000_000, -20_000_000]);
  });
});

describe("LA-2 비과세 건물 차손 + 배율 초과 부수토지 이익 — gross −240,000,000 · 과세분 280,000,000", () => {
  const { a, aggRows, stmt, perAsset } = views([asItem(splitHouse(1_000_000_000), "h")]);
  const h = a.properties[0];

  it("엔진 값이 기대값 — income 229,600,000 · 장특 50,400,000", () => {
    expect([h.transferGain, h.isExempt, h.income, h.longTermHoldingDeduction]).toEqual([-240_000_000, false, 229_600_000, 50_400_000]);
  });
  it("leaf — 과세대상 280,000,000 · 비과세 −520,000,000 (종전 −240,000,000 · 0)", () => {
    expect([effectiveGrossGain(h), assetExemptGain(h), assetTaxableGain(h)]).toEqual([-240_000_000, -520_000_000, 280_000_000]);
    expect(sumAssetGains(a.properties)).toEqual({ gross: -240_000_000, exempt: -520_000_000, taxable: 280_000_000 });
  });
  it("합산 신고서 자산 열 — 과세대상 280,000,000 − 장특 50,400,000 = 양도소득금액 229,600,000", () => {
    expect(colOf(aggRows, "h")).toEqual([-240_000_000, -520_000_000, 280_000_000, 50_400_000, 229_600_000]);
  });
  it("자산별 아코디언 신고서 — 양도소득금액 229,600,000 (종전 −290,400,000)", () => {
    expect(colOf(perAsset(h), "total")).toEqual([-240_000_000, -520_000_000, 280_000_000, 50_400_000, 229_600_000]);
  });
  it("집계 상세명세서 — 과세대상 280,000,000 · 장특 산식 분모도 과세분", () => {
    expect(stmt.get("taxableGain")?.value).toBe(280_000_000);
    expect(stmt.get("taxableGain")?.perAsset?.[0].value).toBe(280_000_000);
    expect(stmt.get("taxableGain")?.perAsset?.[0].formula).not.toContain("차손 자산");
    expect(stmt.get("ltDeduction")?.perAsset?.[0].formula).toBe("과세대상양도차익 280,000,000 × 18% = 50,400,000");
  });
  it("단건 토지·건물 분리 신고서 — 합계 열 비과세 −520,000,000 = 토지 280,000,000 + 건물 −800,000,000 (종전 0 바닥)", () => {
    const { s, rows, stmt: st } = singleViews(splitHouse(1_000_000_000));
    expect(s.taxableGain).toBe(280_000_000);
    expect(colOf(rows, "total")).toEqual([-240_000_000, -520_000_000, 280_000_000, 50_400_000, 229_600_000]);
    expect(cell(rows, "비과세 양도차익", "land")! as number + (cell(rows, "비과세 양도차익", "building") as number)).toBe(-520_000_000);
    expect([st.get("exemptGain")?.value, st.get("taxableGain")?.value]).toEqual([-520_000_000, 280_000_000]);
  });
});

describe("LA-3 같은 구조로 자산 전체 차익 +10,000,000 — 과세분 280,000,000이 gross에 잘리지 않는다", () => {
  const { a, aggRows } = views([asItem(splitHouse(750_000_000), "h")]);
  const h = a.properties[0];
  it("엔진 income 229,600,000 · 장특 50,400,000 → 과세대상 280,000,000 · 비과세 −270,000,000 (종전 10,000,000 · 0)", () => {
    expect([h.transferGain, h.income, h.longTermHoldingDeduction]).toEqual([10_000_000, 229_600_000, 50_400_000]);
    expect([assetExemptGain(h), assetTaxableGain(h)]).toEqual([-270_000_000, 280_000_000]);
    expect(colOf(aggRows, "h")).toEqual([10_000_000, -270_000_000, 280_000_000, 50_400_000, 229_600_000]);
  });
});

describe("LA-4 짝 — 값이 그대로인 경로", () => {
  it("전액 비과세 차손(10억 · 취득 11억) — 과세대상 0 · 비과세 −100,000,000 · 명세서 산식 그대로(종결 경로)", () => {
    const { a, aggRows, stmt } = views([asItem(oneHouse(1_000_000_000, 1_100_000_000), "h"), asItem(landOf(500_000_000, 300_000_000), "o")]);
    const h = a.properties[0];
    expect([h.isExempt, h.exemptGrossGain, h.income]).toEqual([true, -100_000_000, 0]);
    expect([assetExemptGain(h), assetTaxableGain(h)]).toEqual([-100_000_000, 0]);
    expect(colOf(aggRows, "h")).toEqual([-100_000_000, -100_000_000, 0, 0, 0]);
    expect(stmt.get("taxableGain")?.perAsset?.[0]).toMatchObject({ value: 0, formula: "차손 자산 — 양도차익 -100,000,000 (음수)" });
    const { rows } = singleViews(oneHouse(1_000_000_000, 1_100_000_000));
    expect(colOf(rows, "total").slice(0, 3)).toEqual([-100_000_000, -100_000_000, 0]);
  });
  it("일반 차손(토지 3억 · 취득 5억) — 과세대상 = gross −200,000,000 · 비과세 0", () => {
    const { a, aggRows, stmt } = views([asItem(landOf(300_000_000, 500_000_000), "l"), asItem(landOf(500_000_000, 300_000_000), "o")]);
    const l = a.properties[0];
    expect([assetExemptGain(l), assetTaxableGain(l)]).toEqual([0, -200_000_000]);
    expect(colOf(aggRows, "l")).toEqual([-200_000_000, 0, -200_000_000, 0, -200_000_000]);
    expect(stmt.get("taxableGain")?.perAsset?.[0]).toMatchObject({ value: -200_000_000, formula: "차손 자산 — 양도차익 -200,000,000 (음수)" });
    const { rows } = singleViews(landOf(300_000_000, 500_000_000));
    expect(colOf(rows, "total").slice(0, 3)).toEqual([-200_000_000, 0, -200_000_000]);
  });
});
