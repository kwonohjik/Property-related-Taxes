/**
 * 환산취득가액 부동소수 1원 과소 — split(토지·건물 별개) 파트·P6 이월과세 파트·A1 안분 anchor (2026-10-21)
 *
 * 계획: docs/00-pm/estimated-acquisition-float-precision.plan.md §2(원인 R 모양)·§3(#1)·§6.1(A1)
 *
 * 옛 식 `Math.floor(a * (b / c))`는 `b / c`가 이진 소수로 정확히 표현되지 않으면 곱이 참값보다 미세하게 작아져
 * 참값이 정수일 때 `floor`가 1을 깎는다(방향은 항상 과소). 정본 `safeMultiplyThenDivide`는 오차 0.
 * 기대값은 전부 BigInt 정수 나눗셈으로 손계산한 참값이다 — 옛 식은 괄호 안 값보다 1 작게 나온다.
 *
 *   · 토지 파트  114,000,000 × 4,900,000 ÷ 150,000,000 = 3,724,000   (옛 식 3,723,999)
 *   · 건물 파트   86,000,000 × 21,000,000 ÷ 120,000,000 = 15,050,000 (옛 식 15,049,999)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { composeSplitCarryover } from "@/lib/tax-engine/transfer-split-carryover-compose";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { calcPartAcquisitionPrice, splitPair } from "@/lib/tax-engine/transfer-tax-split-acq-price";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** BigInt 참값 — 테스트 기대값을 검산하는 용도(리터럴 기대값과 함께 단언해 손계산 오기를 막는다) */
const exact = (a: number, b: number, c: number) => Number((BigInt(a) * BigInt(b)) / BigInt(c));

describe("참값 검산 — 리터럴 기대값이 BigInt 정수 나눗셈과 같다", () => {
  it("S1 토지·건물 파트", () => {
    expect(exact(114_000_000, 4_900_000, 150_000_000)).toBe(3_724_000);
    expect(exact(86_000_000, 21_000_000, 120_000_000)).toBe(15_050_000);
    // 옛 식이 실제로 1원 작게 나오는 입력임을 고정한다(이 전제가 깨지면 anchor가 의미를 잃는다).
    expect(Math.floor(114_000_000 * (4_900_000 / 150_000_000))).toBe(3_723_999);
    expect(Math.floor(86_000_000 * (21_000_000 / 120_000_000))).toBe(15_049_999);
  });
});

// ── S1: 토지·건물 별개 취득, 두 파트 환산 ─────────────────────────────────────
function splitInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "building",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-03-01"),
    landAcquisitionDate: D("2012-01-01"),
    isSeparateAcquisition: true,
    transferPrice: 114_000_000 + 86_000_000,
    acquisitionPrice: 0,
    landTransferPrice: 114_000_000,
    buildingTransferPrice: 86_000_000,
    landStandardPriceAtTransfer: 150_000_000,
    buildingStandardPriceAtTransfer: 120_000_000,
    standardPricePerSqmAtAcquisition: 24_500, // × 200㎡ = 4,900,000
    acquisitionArea: 200,
    buildingStandardPriceAtAcquisition: 21_000_000,
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    isOneHousehold: false,
    householdHousingCount: 0,
    ...over,
  } as TransferTaxInput;
}

describe("S1 split 파트 환산 — calcPartAcquisitionPrice", () => {
  it("토지 파트 환산취득가액 3,724,000 (옛 3,723,999)", () => {
    const r = calculateTransferTax(splitInput(), rates);
    expect(r.splitDetail!.land.acquisitionPrice).toBe(3_724_000);
  });

  it("건물 파트 환산취득가액 15,050,000 (옛 15,049,999)", () => {
    const r = calculateTransferTax(splitInput(), rates);
    expect(r.splitDetail!.building.acquisitionPrice).toBe(15_050_000);
  });

  it("양도차익·합계가 참값 취득가액에서 항등으로 따라온다 (양도가 − 취득가 − 개산공제)", () => {
    const r = calculateTransferTax(splitInput(), rates);
    const s = r.splitDetail!;
    expect(s.land.gain).toBe(114_000_000 - 3_724_000 - s.land.appraisalDeduction - (s.land.directExpenses ?? 0));
    expect(s.building.gain).toBe(86_000_000 - 15_050_000 - s.building.appraisalDeduction - (s.building.directExpenses ?? 0));
  });

  it("함수 직접 호출 — 일반건물 전용 경로(general-building-part-acq)가 부르는 시그니처", () => {
    const ctx = { isSeparate: true, landRatio: null, landApportion: null };
    expect(calcPartAcquisitionPrice("estimated", true, 114_000_000, 4_900_000, 150_000_000, ctx as never)).toBe(3_724_000);
    expect(calcPartAcquisitionPrice("estimated", false, 86_000_000, 21_000_000, 120_000_000, ctx as never)).toBe(15_050_000);
    expect(calcPartAcquisitionPrice("estimated", true, 114_000_000, 4_900_000, 0, ctx as never)).toBe(0); // 분모 0 방어 유지
  });
});

// ── 결정세액이 실제로 바뀌는 사례 ────────────────────────────────────────────────────
// 취득가액 1원 과소는 양도차익·과세표준을 1원 키워 결정세액까지 번질 수 있다(mock 세율표 기준 — 정본 세액 아님).
// 참값이 정수인 표본 288건 중 69건에서 결정세액이 1원 달랐다(8,000건 무작위 탐색 · 옛/새 엔진 쌍대 실행).
describe("결정세액 변화 사례 — 토지·건물 모두 환산, 토지 8,043,008 · 건물 9,671,500", () => {
  const taxInput = () =>
    splitInput({
      transferPrice: 243_199_424 + 165_217_000,
      landTransferPrice: 243_199_424,
      buildingTransferPrice: 165_217_000,
      landStandardPriceAtTransfer: 453_355_448,
      buildingStandardPriceAtTransfer: 404_451_216,
      standardPricePerSqmAtAcquisition: 14_993_216, // × 1㎡
      acquisitionArea: 1,
      buildingStandardPriceAtAcquisition: 23_675_832,
    });

  it("참값 검산 — 옛 식은 토지 …007", () => {
    expect(exact(243_199_424, 14_993_216, 453_355_448)).toBe(8_043_008);
    expect(exact(165_217_000, 23_675_832, 404_451_216)).toBe(9_671_500);
    expect(Math.floor(243_199_424 * (14_993_216 / 453_355_448))).toBe(8_043_007);
  });

  it("환산취득가액이 참값이고 양도차익 389,541,846 · 과세표준 287,260,244 · 결정세액 89,218,892 (옛 89,218,893)", () => {
    const r = calculateTransferTax(taxInput(), rates);
    expect(r.splitDetail!.land.acquisitionPrice).toBe(8_043_008);
    expect(r.splitDetail!.building.acquisitionPrice).toBe(9_671_500);
    expect(r.transferGain).toBe(389_541_846);
    expect(r.taxBase).toBe(287_260_244);
    expect(r.determinedTax).toBe(89_218_892);
  });
});

describe("P6 이월과세 파트 환산 — 증여자 취득 당시 그 파트 기준시가(분자) × 양도가 ÷ 양도시 기준시가", () => {
  // 시드는 P6 anchor(split-part-carryover.p6.estimation.anchor.test.ts)의 A1·B2 셀과 같은 구조 — 금액만 1원 과소 입력으로 바꿨다.
  function p6Input(which: "land" | "building"): TransferTaxInput {
    const isLand = which === "land";
    const wire = composeSplitCarryover({
      carryoverGiftEvent: { giftRegistryDate: "2024-06-15", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" },
      ...(isLand
        ? { landCarryoverPart: { donorAcquisitionDate: "2005-01-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 4_900_000 } }
        : { buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", useEstimatedAcquisition: true, donorStandardPriceAtAcquisition: 21_000_000 } }),
      landAcquisitionPrice: 100_000_000,
      buildingAcquisitionPrice: 100_000_000,
    });
    return baseTransferInput({
      transferPrice: 114_000_000 + 86_000_000,
      transferDate: D("2025-06-30"),
      acquisitionPrice: 0,
      acquisitionDate: D(isLand ? "2022-06-01" : "2024-06-15"),
      acquisitionCause: isLand ? "purchase" : "carryover_gift",
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 120,
      wasRegulatedAtAcquisition: false,
      landAcquisitionDate: D(isLand ? "2024-06-15" : "2008-01-01"),
      landAcquisitionCause: isLand ? "carryover_gift" : "purchase",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      saleSplitMode: "actual",
      landTransferPrice: 114_000_000,
      buildingTransferPrice: 86_000_000,
      landStandardPriceAtTransfer: 150_000_000,
      buildingStandardPriceAtTransfer: 120_000_000,
      landAcquisitionPrice: 100_000_000,
      buildingAcquisitionPrice: 100_000_000,
      isSeparateAcquisition: true,
      ...wire,
    });
  }

  it("토지 파트 환산(분자 4,900,000) → 3,724,000 (옛 3,723,999)", () => {
    const r = calculateTransferTax(p6Input("land"), rates);
    expect(r.splitDetail!.land.carryover!.judgment).toBe("applied");
    expect(r.splitDetail!.land.acqMode).toBe("estimated");
    expect(r.splitDetail!.land.acquisitionPrice).toBe(3_724_000);
  });

  it("건물 파트 환산(분자 21,000,000) → 15,050,000 (옛 15,049,999)", () => {
    const r = calculateTransferTax(p6Input("building"), rates);
    expect(r.splitDetail!.building.carryover!.judgment).toBe("applied");
    expect(r.splitDetail!.building.acqMode).toBe("estimated");
    expect(r.splitDetail!.building.acquisitionPrice).toBe(15_050_000);
  });
});

// ── A1: splitPair — 총액을 취득시 기준시가 비율로 토지·건물 안분 ───────────────
//   취득가액 375,447,078 · 토지 기준시가 10,500원/㎡ × 100㎡ = 1,050,000 · 건물 30,000,000 (합계 31,050,000)
//   토지분 = 375,447,078 × 1,050,000 ÷ 31,050,000 = 12,696,278  (옛 식 12,696,277) · 건물분은 잔액 362,750,800
describe("A1 splitPair 기준시가 비율 안분 (둘 다 미입력)", () => {
  it("참값 검산", () => {
    expect(exact(375_447_078, 1_050_000, 31_050_000)).toBe(12_696_278);
    expect(Math.floor(375_447_078 * (1_050_000 / 31_050_000))).toBe(12_696_277);
  });

  it("splitPair 직접 호출 — 토지분 12,696,278 · 건물분 잔액 362,750,800", () => {
    const pair = splitPair(375_447_078, undefined, undefined, { landStd: 1_050_000, totalStd: 31_050_000 });
    expect(pair.land).toBe(12_696_278);
    expect(pair.building).toBe(362_750_800);
    expect(pair.land + pair.building).toBe(375_447_078);
  });

  it("비율이 없으면 조용히 0으로 메우지 않고 던진다 (기존 방어선 유지)", () => {
    expect(() => splitPair(100_000_000, undefined, undefined, null)).toThrow(/나눌 수 없습니다/);
  });

  it("엔진 경유 — 같은 날 취득(비-별개) 실가 총액 안분: 토지 12,696,278 · 건물 362,750,800", () => {
    const r = calcSplitGain(
      splitInput({
        isSeparateAcquisition: false,
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        useEstimatedAcquisition: false,
        acquisitionPrice: 375_447_078,
        standardPricePerSqmAtAcquisition: 10_500,
        acquisitionArea: 100,
        standardPriceAtAcquisition: 31_050_000, // 일반건물 비-별개: 결합 총액 − 토지분 = 건물분 30,000,000
        buildingStandardPriceAtAcquisition: undefined,
      }),
    );
    expect(r!.land.acquisitionPrice).toBe(12_696_278);
    expect(r!.building.acquisitionPrice).toBe(362_750_800);
  });
});
