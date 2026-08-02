/**
 * anchor: 파트가 있는 자산의 `refCalculatedTax`는 **파트 세액 합**이다 (P12 3단계)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md §4.12
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * `refCalculatedTax`는 **자산 단독 참고값**이다 — 타입 문서가 「다건 컨텍스트, 참고」·
 * 「비교과세 적용 시 합산값과 차이 가능」으로 계약을 명시한다
 * (`types/transfer-aggregate.types.ts:146-156`). 신고서 양식 표(`breakdownToFilingResult`)와
 * **예정신고 기납부세액 추정**(§111③ · `transfer-multi-load-entry.ts`)이 이 값을 쓴다.
 *
 * ❌ **재제안 금지 — 「호 그룹 세액의 역안분으로 `Σ 자산 = 그룹` 불변식을 세운다」.**
 *   예정신고는 **자산별**로 하고 §104⑤ 비교과세는 **확정신고에서 전체**에 적용된다.
 *   자산 단독 기준이 실무적으로 정확하고, §104⑤에는 자산별 배분 문언이 없다(§4.12).
 *
 * ── 고친 것 ────────────────────────────────────────────────────────────
 * 종전 산식은 `taxBaseShare × (appliedRate + surchargeRate) − progressiveDeduction`인데,
 * **파트가 있는 자산**(토지·건물 분리취득 · 한 필지 중 일부만 비사업용)의 `appliedRate`는
 * `resolveSplitAwareTax`가 낸 **파트 최고세율**이다. 그것을 자산 과세표준 **전체**에 곱하니
 * 과대해졌다 — 자산 단독 기준으로 봐도 틀린 값이다(비교과세와 무관).
 *
 * ⇒ 파트가 있는 자산만 **그 자산의 실제 단독 세액**(파트 세액 합 또는 §104⑤ 1호 승자값)으로
 *   바꾼다. 파트가 없는 자산은 **현행 산식 그대로** — `calcTax`와 floor 위치가 달라 ±1원이
 *   어긋날 수 있어 건드리지 않는다(Surgical).
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

function item(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D("2026-06-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}

/** 토지·건물 분리취득 — 토지 파트 §104①3호 70% / 건물 파트 §104①1호 누진 */
const splitAsset = (id: string) =>
  item(id, {
    propertyType: "housing",
    acquisitionDate: D("2010-01-01"),
    landAcquisitionDate: D("2025-08-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000,
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 100_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
  } as Partial<TransferTaxItemInput>);

const plain = (id: string, gross: number) =>
  item(id, {
    propertyType: "land",
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    transferPrice: gross,
    isNonBusinessLand: false,
  });

/** 한 필지 중 절반만 비사업용 — 파트가 §104①8호 / §104①1호로 갈린다 */
const partialNbl = (id: string, gross: number) =>
  item(id, {
    propertyType: "land",
    acquisitionDate: D("2015-01-01"),
    acquisitionPrice: 0,
    transferPrice: gross,
    isNonBusinessLand: true,
    nonBusinessLandDetails: {
      landType: "housing_site" as const,
      landArea: 600,
      zoneType: "general_residential" as const,
      acquisitionDate: D("2015-01-01"),
      transferDate: D("2026-06-01"),
      housingFootprint: 100,
      isMetropolitanArea: true,
      businessUsePeriods: [],
      gracePeriods: [],
    },
  } as Partial<TransferTaxItemInput>);

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000,
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}
const ref = (r: ReturnType<typeof agg>, id: string) =>
  r.properties!.find((p) => p.propertyId === id)!.refCalculatedTax;

describe("P12 3단계 — 파트 자산의 참고 산출세액", () => {
  it("A-1: split 자산 — 파트 최고세율 × 전체가 아니라 **파트 세액 합**", () => {
    const r = agg([splitAsset("S"), plain("P1", 300_000_000), plain("P2", 300_000_000)]);
    // 종전: 과세표준 510,000,000 × 파트 최고세율 0.7 = 357,000,000 (과대 +87,140,000)
    // 정정: 토지 300,000,000 × 70% = 210,000,000 + 건물 210,000,000 누진 59,860,000
    expect(ref(r, "S")).toBe(269_860_000);
  });

  it("A-2: 부분 비사토 자산도 파트 세액 합과 일치", () => {
    const r = agg([partialNbl("L1", 300_000_000), partialNbl("L2", 300_000_000)]);
    // 과세표준 234,000,000 · ratio 0.5 → 비사토 117,000,000 / 그 외 117,000,000
    // 자산 단독 §104⑤: MAX(2호 62,720,000, 1호 누진 68,980,000) = 68,980,000
    expect(ref(r, "L1")).toBe(68_980_000);
    expect(ref(r, "L2")).toBe(68_980_000);
  });

  it("A-4: **총 산출세액은 불변** — 표시만 바뀐다", () => {
    const r = agg([splitAsset("S"), plain("P1", 300_000_000), plain("P2", 300_000_000)]);
    expect(r.calculatedTax).toBe(458_820_000); // P12 2단계 값 그대로
  });
});

describe("P12 3단계 회귀 — 파트가 없는 자산은 건드리지 않는다", () => {
  it("A-3: 파트 없는 누진 자산의 ref는 종전 산식 그대로", () => {
    const r = agg([plain("P1", 300_000_000), plain("P2", 300_000_000)]);
    // 234,000,000 × 38% − 19,940,000 = 68,980,000
    expect(ref(r, "P1")).toBe(68_980_000);
    expect(ref(r, "P2")).toBe(68_980_000);
    // 그룹은 호별 합산이라 Σref(137,960,000)와 다르다 — **정상**(비교과세의 본질).
    expect(r.calculatedTax).toBe(161_260_000);
  });

  it("A-3b: 자산이 1건이면 ref와 총 산출세액이 일치한다 (타입 문서 계약)", () => {
    const r = agg([plain("P1", 300_000_000)]);
    expect(ref(r, "P1")).toBe(68_980_000);
    expect(r.calculatedTax).toBe(68_980_000);
  });
});
