/**
 * 일반건물(GB) 신고서 양식 — **토지 열 취득일자·보유기간** anchor.
 *
 * 대상: `components/calc/results/transfer/FilingFormTableHelpers.ts` (`getAcqDateForCard`)
 *       → 소비: `FilingFormTableAggregateHelpers.buildAggregateRows` · `DetailedStatementHelpers`
 *
 * ## 🔴 결함 (2026-08-11 사용자 제보 — 신축 자가건축 사례)
 *
 * M-1a 이후 GB의 `asset.acquisitionDate`는 **건물** 취득일이고 토지 취득일은
 * `landAcquisitionDate`다(`lib/tax-engine/types/general-building.types.ts:124`).
 * 엔진은 토지 카드의 기산일로 `input.landAcquisitionDate ?? input.acquisitionDate`를 쓴다
 * (`general-building-valuation.ts:412`) — 그래서 **장기보유특별공제는 정상**이었다.
 *
 * 그런데 표시 계층의 `getAcqDateForCard`는 토지 카드(`land`·`land_business`·`land_nbl`)를
 * default 분기로 흘려 `asset.acquisitionDate`(= **건물** 취득일)를 돌려줬다. 결과:
 *
 *   · 신고서 양식 토지(1001) 열의 **취득일자가 건물 취득일**로 표시
 *   · 그 셀에서 파생되는 **보유기간도 함께 틀림** (토지 17년 11월 → 3년 11월)
 *
 * ## 판정 방식
 *
 * 표시 기산일은 **엔진과 같은 식**(`partAcquisitionDates(asset).land`)이어야 한다 —
 * 단일 소스. 그래서 헬퍼 단위(L1)와 실제 표 행(L2) 양쪽에서 단언한다.
 * (헬퍼만 보면 「어느 단계를 보는가」가 어긋나 표가 여전히 틀려도 통과할 수 있다.)
 */
import { describe, it, expect } from "vitest";
import { getAcqDateForCard } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

// ── 사용자 제보 사례 (신축 자가건축) ────────────────────────────────
const LAND_ACQ = "2008-03-17";
const BUILDING_ACQ = "2022-03-31";
const TRANSFER = "2026-02-19";

/** 토지·건물 취득일 분리 ON (신축 자가건축 — 「토지·건물 취득일 다름」 자동 ON) */
const separateAsset = {
  assetKind: "general_building",
  acquisitionDate: BUILDING_ACQ,
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: LAND_ACQ,
} as unknown as AssetForm;

/** 대조군 — 분리 OFF (토지 취득일 미입력) */
const sameDateAsset = {
  assetKind: "general_building",
  acquisitionDate: BUILDING_ACQ,
  gbExtensionDate: "2024-05-01",
} as unknown as AssetForm;

describe("getAcqDateForCard — GB 토지 카드는 토지 취득일 (L1)", () => {
  it("🔴 토지 카드 3종 모두 토지 취득일 (종전: 건물 취득일)", () => {
    expect(getAcqDateForCard(separateAsset, "land")).toBe(LAND_ACQ);
    expect(getAcqDateForCard(separateAsset, "land_business")).toBe(LAND_ACQ);
    expect(getAcqDateForCard(separateAsset, "land_nbl")).toBe(LAND_ACQ);
  });

  it("🔴 지분(%) 분할 카드도 같다 — 접미사가 분기를 삼키지 않는다", () => {
    expect(getAcqDateForCard(separateAsset, "land#0")).toBe(LAND_ACQ);
    expect(getAcqDateForCard(separateAsset, "land_nbl#2")).toBe(LAND_ACQ);
  });

  it("건물 카드는 건물 취득일 그대로 (무회귀)", () => {
    expect(getAcqDateForCard(separateAsset, "building")).toBe(BUILDING_ACQ);
    expect(getAcqDateForCard(separateAsset, "building1")).toBe(BUILDING_ACQ);
  });

  it("대조군 — 분리 OFF면 토지도 자산 취득일 (무회귀)", () => {
    expect(getAcqDateForCard(sameDateAsset, "land")).toBe(BUILDING_ACQ);
    expect(getAcqDateForCard(sameDateAsset, "building")).toBe(BUILDING_ACQ);
    // 증축분 카드는 증축일 유지
    expect(getAcqDateForCard(sameDateAsset, "building2")).toBe("2024-05-01");
  });
});

// ── L2: 실제 신고서 표 행 ───────────────────────────────────────────

const breakdown = (propertyId: string): PerPropertyBreakdown =>
  ({
    propertyId,
    propertyLabel: propertyId,
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    necessaryExpense: 0,
    capitalExpenditureForDisplay: 0,
    transferGain: 500_000_000,
    isExempt: false,
    income: 400_000_000,
    incomeAfterOffset: 400_000_000,
    longTermHoldingDeduction: 100_000_000,
    refCalculatedTax: 100_000_000,
    refDeterminedTax: 100_000_000,
  }) as unknown as PerPropertyBreakdown;

const aggregate: AggregateMeta = {
  properties: [breakdown("land"), breakdown("building")],
  aggregated: {
    totalIncomeAfterOffset: 800_000_000,
    basicDeduction: 2_500_000,
    taxBase: 797_500_000,
    calculatedTax: 200_000_000,
    reductionAmount: 0,
    determinedTax: 200_000_000,
    penaltyTax: 0,
    localIncomeTax: 20_000_000,
    priorPaidTax: 0,
    settlementAdditionalPayable: 0,
    priorPaidLocalTax: 0,
    settlementLocalPayable: 0,
  } as unknown as AggregateMeta["aggregated"],
};

function makeFormData() {
  const form = createDefaultTransferFormData();
  form.transferDate = TRANSFER;
  form.assets[0] = { ...form.assets[0], ...separateAsset };
  return form;
}

function cell(rows: ReturnType<typeof buildAggregateRows>, label: string, col: string) {
  const r = rows.find((x) => x.label === label);
  return r?.values[col as keyof typeof r.values] ?? null;
}

describe("신고서 양식 aggregate — 토지(1001) 열 취득일자·보유기간 (L2)", () => {
  const rows = buildAggregateRows(
    {} as unknown as TransferTaxResult,
    aggregate,
    makeFormData(),
  );

  it("🔴 토지 열 취득일자 = 토지 취득일", () => {
    expect(cell(rows, "취득일자", "land")).toBe(LAND_ACQ);
  });

  it("🔴 토지 열 보유기간도 그 취득일 기산 (연·월 차이 규약)", () => {
    // 2008-03 → 2026-02 = 215개월 = 17년 11월
    expect(cell(rows, "보유기간", "land")).toBe("17년 11월");
  });

  it("건물 열은 건물 취득일 기산 (무회귀)", () => {
    expect(cell(rows, "취득일자", "building")).toBe(BUILDING_ACQ);
    expect(cell(rows, "보유기간", "building")).toBe("3년 11월");
  });
});
