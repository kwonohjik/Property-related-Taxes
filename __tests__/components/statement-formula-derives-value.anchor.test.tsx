/**
 * anchor: **표시된 산식이 표시된 값을 만들어낸다** (결과탭 코드리뷰 Lane 5 · S1 — #053 #072 #103).
 *
 * ## 세 갈래가 같은 구조로 깨져 있었다
 *
 * | # | 항목 | 좌변(산식) | 우변(표시값) |
 * |---|---|---|---|
 * | #053 | PHD 개산공제 | 지분 100% base × **고정 「3%」** | 지분 반영 base × 실제 율 |
 * | #072 | 다건 양도소득금액 | §102② 통산 **前** | 통산 **後** |
 * | #103 | 파트 분할 산출세액 | 「기여분 × 세율 − 누진공제」 근사식 | §104⑤ 파트별 실제 세액 |
 *
 * 셋 다 세액은 옳고 **설명만 틀렸다**. 사용자가 산식을 그대로 계산하면 화면의 숫자가 나오지
 * 않는다 — #053은 공유지분에서 2배·미등기에서 10배, #103은 실측 +185,940,000.
 *
 * ## 안전망이 0이었다
 *
 * 착수 전 프로브: 세 산식을 통째로 `MUTATED` 리터럴로 바꿔도 `__tests__/components/` ·
 * `__tests__/calc/` **3,972건 중 0건**이 실패했다.
 *
 * 법령: 소득세법 시행령 §163⑥(개산공제율·미등기 단서) · 소득세법 §102②(결손금 통산) · §104⑤
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { ESTIMATED_DEDUCTION_RATE } from "@/lib/tax-engine/legal-codes";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_HOUSING_AT_ACQ,
} from "../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

// ════════════════════════════════════════════════════════════════════
// A. PHD 개산공제 — 산식의 base·율이 자기 값을 만든다 (#053)
// ════════════════════════════════════════════════════════════════════

function phd(ownershipRatio: number, isUnregistered: boolean) {
  const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, {
    ...PHD_INPUT,
    ownershipRatio,
    isUnregistered,
  } as never);
  expect(r, "PHD 엔진이 결과를 내지 않았다 — 이 anchor는 아무것도 재지 못한다").toBeTruthy();
  return r!;
}

/** 렌더된 「토지 개산공제」 행에서 산식의 base·율과 표시값을 뽑는다. */
function landRow(detail: ReturnType<typeof phd>) {
  const { container } = render(
    <PreHousingDisclosureDetailSection result={{ preHousingDisclosureDetail: detail } as never} />,
  );
  const text = (container.textContent ?? "").replace(/\s+/g, " ");
  // 지분 반영 케이스는 라벨에 「(지분 반영)」 괄호가 하나 더 붙는다 — × 직전 괄호를 읽는다.
  const m = text.match(/취득시 토지 성분[^×]*\(([\d,]+)\) × ([\d.]+)%/);
  expect(m, `산식을 찾지 못했다: ${text.slice(0, 400)}`).not.toBeNull();
  return {
    base: Number(m![1].replace(/,/g, "")),
    ratePct: Number(m![2]),
    text,
  };
}

describe("A-0 격자 — 지분·미등기 축이 실제로 값을 가른다", () => {
  it("세 격자의 개산공제가 서로 다르다 (같으면 구별력이 0이다)", () => {
    const base = phd(1, false).landLumpDeduction;
    const half = phd(0.5, false).landLumpDeduction;
    const unreg = phd(1, true).landLumpDeduction;
    expect(base).toBeGreaterThan(0);
    expect(half).toBeLessThan(base);
    expect(unreg).toBeLessThan(base);
    expect(half).not.toBe(unreg);
    // 엔진 echo가 실제로 축을 반영한다.
    expect(phd(0.5, false).landLumpDeductionBase).toBe(Math.floor(PHD_LAND_HOUSING_AT_ACQ * 0.5));
    expect(phd(1, true).estimatedDeductionRate).toBe(ESTIMATED_DEDUCTION_RATE.UNREGISTERED);
  });
});

describe("A-1 PHD 개산공제 산식이 자기 값을 유도한다 (#053)", () => {
  it.each([
    ["대조군 (전부 소유·등기)", 1, false],
    ["🔴 공유지분 1/2", 0.5, false],
    ["🔴 미등기 양도자산", 1, true],
  ] as [string, number, boolean][])("%s", (_label, ratio, unreg) => {
    const detail = phd(ratio, unreg);
    const { base, ratePct } = landRow(detail);
    expect(
      Math.floor(base * (ratePct / 100)),
      "산식에 적힌 base × 율이 표시된 개산공제를 만들지 못한다",
    ).toBe(detail.landLumpDeduction);
  });

  it("🔴 지분이 줄면 산식의 base도 줄어든다 (100% 스케일을 적으면 2배가 된다)", () => {
    expect(landRow(phd(0.5, false)).base).toBe(Math.floor(PHD_LAND_HOUSING_AT_ACQ * 0.5));
    expect(landRow(phd(1, false)).base).toBe(PHD_LAND_HOUSING_AT_ACQ);
  });

  it("🔴 미등기면 산식의 율이 0.3%다 (「3%」로 적으면 10배가 된다)", () => {
    expect(landRow(phd(1, true)).ratePct).toBeCloseTo(0.3, 5);
    expect(landRow(phd(1, false)).ratePct).toBeCloseTo(3, 5);
  });
});

// ════════════════════════════════════════════════════════════════════
// B. 다건 결손금 통산 — 산식이 통산 단계를 드러낸다 (#072)
// ════════════════════════════════════════════════════════════════════

function lossGrid() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...baseTransferInput({
            propertyType: "housing",
            acquisitionDate: D("2015-03-01"),
            transferDate: D("2026-02-01"),
            transferPrice: 1_000_000_000,
            acquisitionPrice: 500_000_000,
            expenses: 10_000_000,
            isOneHousehold: false,
            householdHousingCount: 1,
            annualBasicDeductionUsed: 0,
            isNonBusinessLand: false,
          } as Partial<TransferTaxInput>),
          propertyId: "p1",
          propertyLabel: "아파트A",
        } as never,
        {
          ...baseTransferInput({
            propertyType: "land",
            acquisitionDate: D("2018-06-01"),
            transferDate: D("2026-09-01"),
            transferPrice: 300_000_000,
            acquisitionPrice: 350_000_000,
            expenses: 0,
            isOneHousehold: false,
            householdHousingCount: 0,
            annualBasicDeductionUsed: 0,
            isNonBusinessLand: false,
          } as Partial<TransferTaxInput>),
          propertyId: "p2",
          propertyLabel: "토지B",
        } as never,
      ],
    } as never,
    rates,
  );
}

function statementPerAsset(a: ReturnType<typeof lossGrid>, key: string) {
  const fd = createDefaultTransferFormData();
  const meta = { properties: a.properties, aggregated: a } as never;
  const item = buildStatementItems(aggregateToFilingResult(a), fd, undefined, meta, undefined).get(key);
  expect(item, `명세서에 「${key}」 항목이 없다`).toBeDefined();
  return (item!.perAsset ?? []) as { label: string; value: number; formula?: string }[];
}

/** 「… = N」 꼴 산식의 **마지막** 등호 우변을 읽는다. */
function rhs(formula: string): number {
  const parts = formula.split("=");
  const last = parts[parts.length - 1];
  const m = last.match(/-?[\d,]+/);
  expect(m, `산식에서 우변을 읽지 못했다: ${formula}`).not.toBeNull();
  return Number(m![0].replace(/,/g, ""));
}

describe("B-0 격자 — 차손이 실제로 통산된다", () => {
  it("한 자산이 차손을 내고 다른 자산이 그것을 받는다", () => {
    const [gain, loss] = lossGrid().properties;
    expect(gain.lossOffsetFromSameGroup + gain.lossOffsetFromOtherGroup).toBeGreaterThan(0);
    expect(gain.income).not.toBe(gain.incomeAfterOffset);
    expect(loss.income).toBeLessThan(0);
    expect(loss.incomeAfterOffset).toBe(0);
  });
});

describe("B-1 명세서 「양도소득금액」 산식의 우변 = 표시값 (#072)", () => {
  it("🔴 차손을 받은 자산 — 산식이 통산 단계에서 끝난다", () => {
    const rows = statementPerAsset(lossGrid(), "incomeAmount");
    const a = rows.find((r) => r.label === "아파트A")!;
    expect(a.formula).toContain("결손금 통산");
    expect(rhs(a.formula!), "산식 우변이 표시값과 다르다").toBe(a.value);
  });

  it("🔴 차손을 낸 자산 — 통산되어 0이 된 사실을 산식이 말한다", () => {
    const rows = statementPerAsset(lossGrid(), "incomeAmount");
    const b = rows.find((r) => r.label === "토지B")!;
    expect(b.value).toBe(0);
    expect(b.formula).toContain("통산되어 0");
  });
});

describe("B-2 신고서 「감면후 소득금액」이 감면 0인 감소를 설명한다 (#072)", () => {
  it("🔴 감면이 전부 0인데 줄어든 열에 §102② 근거가 붙는다", () => {
    const a = lossGrid();
    const fd = createDefaultTransferFormData();
    const rows = buildAggregateRows(aggregateToFilingResult(a), {
      properties: a.properties,
      aggregated: a,
    } as never, fd) as never as {
      label: string;
      values: Record<string, number | null>;
      notes?: Record<string, string>;
    }[];
    const by = (label: string) => rows.find((r) => r.label === label)!;

    // 격자 가드 — 감면이 0이어야 「감면 때문에 줄었다」는 설명이 배제된다.
    expect(by("세액감면대상금액").values["p1"]).toBe(0);
    expect(by("소득금액 감면대상").values["p1"]).toBe(0);

    const income = by("양도소득금액").values["p1"]!;
    const after = by("감면후 소득금액").values["p1"]!;
    expect(after).toBeLessThan(income);
    expect(by("감면후 소득금액").notes?.["p1"], "사라진 금액의 근거가 없다").toContain("§102②");
  });
});

// ════════════════════════════════════════════════════════════════════
// C. §104⑤ 파트 분할 — 근사식 대신 엔진 note (#103)
// ════════════════════════════════════════════════════════════════════

function splitGrid() {
  const asset = {
    ...baseTransferInput(),
    propertyType: "housing",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-01-01"),
    landAcquisitionDate: D("2025-01-01"),
    transferPrice: 1_500_000_000,
    acquisitionPrice: 1_000_000_000,
    landTransferPrice: 800_000_000,
    buildingTransferPrice: 700_000_000,
    landStandardPriceAtTransfer: 800_000_000,
    buildingStandardPriceAtTransfer: 700_000_000,
    landAcquisitionPrice: 600_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    expenses: 0,
  } as unknown as TransferTaxItemInput;
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000,
    properties: [{ ...asset, propertyId: "s1", propertyLabel: "분할주택" }],
  };
  return calculateTransferTaxAggregate(input, rates);
}

describe("C-0 격자 — 파트 분할 자산이 실제로 근사식을 깬다", () => {
  it("엔진 note가 있고, 근사식 값이 실제 세액과 다르다", () => {
    const p = splitGrid().properties[0];
    expect(p.refCalculatedTaxNote, "note가 없으면 이 anchor는 아무것도 구별하지 못한다").toBeTruthy();
    const approx =
      Math.floor(p.taxBaseShare * (p.appliedRate + (p.surchargeRate ?? 0))) - p.progressiveDeduction;
    expect(approx).not.toBe(p.refCalculatedTax);
  });
});

describe("C-1 명세서 「산출세액」이 파트 내역을 그대로 싣는다 (#103)", () => {
  it("🔴 근사식이 아니라 엔진 note를 출력한다", () => {
    const a = splitGrid();
    const rows = statementPerAsset(a, "calculatedTax");
    const row = rows.find((r) => r.label === "분할주택")!;
    expect(row.formula).toBe(a.properties[0].refCalculatedTaxNote);
    expect(row.formula).toContain("§104⑤");
  });

  it("대조군 — 파트가 없으면 종전 근사식 그대로다", () => {
    const rows = statementPerAsset(lossGrid(), "calculatedTax");
    const row = rows.find((r) => r.label === "아파트A")!;
    expect(row.formula).toMatch(/^[\d,]+ × [\d.]+% - [\d,]+ = [\d,]+$/);
    expect(rhs(row.formula!)).toBe(row.value);
  });
});
