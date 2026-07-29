/**
 * Pre-Do 앵커 — 동일세대 상속주택 자체 양도: §154⑧3호 거주기간 통산 (표2·비과세)
 *
 * 세법(소득세법 시행령 §154⑧3호): 상속개시 당시 동일세대이면 상속개시 전 동일세대 거주·보유기간을
 *   §154① 비과세 보유·거주기간에 통산. §95② 표2 대상 판정도 통산(사전법령해석재산 2021-202).
 *   단 표2 공제율(보유분·거주분)은 상속개시일부터 기산.
 * 갭: 현행은 보유만 통산·거주 미통산 → (Bug A) 조정지역+실거주0 시 거주요건 미충족으로 고가주택 부분과세조차 실패,
 *   (Bug B) 표2 게이트가 실거주 2년이라 표1(16%).
 * 설계: 신규 decedentCohabitationResidenceMonths(통산 거주 개월) — 대상 판정 통산 / 공제율은 실거주.
 *
 * 이미지2/4 사례: 상속개시 2017-09-15, 피상속인 취득 2010-02-02, 양도 2026-02-16(보유 8년),
 *   양도가 13억(>12억 고가), 취득가 4억, 통산 거주 24개월↑, 상속인 실거주 0.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const mockRates = makeMockRates();

function imageCase(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    acquisitionCause: "inheritance",
    acquisitionDate: new Date("2017-09-15"), // 상속개시일
    decedentAcquisitionDate: new Date("2010-02-02"),
    transferDate: new Date("2026-02-16"),
    transferPrice: 1_300_000_000, // 13억 (>12억 고가주택)
    acquisitionPrice: 400_000_000, // 상속세 신고가액
    expenses: 0,
    wasRegulatedAtAcquisition: true, // 조정대상지역 (상속개시일 기준)
    decedentSameHouseholdBeforeInheritance: true,
    decedentCohabitationHoldingStartDate: new Date("2010-02-02"),
    decedentCohabitationResidenceMonths: 24, // 상속개시 전 동일세대 통산 거주 2년
    residencePeriodMonths: 0, // 상속인 상속개시일 이후 실거주 없음
    ...over,
  });
}

describe("§154⑧3호 동일세대 상속 거주 통산 — 표2·비과세 (이미지2/4 앵커)", () => {
  it("★ 통산 거주2년 → 고가주택 부분과세 + 표2 32%(보유8×4·거주0) (RED→GREEN)", () => {
    const r = calculateTransferTax(imageCase(), mockRates);
    // 비과세: 12억 초과분만 과세 (고가주택 부분과세)
    expect(r.taxableGain).toBe(69_230_769);
    // 표2: 보유 8년×4% + 거주 0년×4% = 32% (실거주 0 → 거주분 0)
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 5);
    expect(r.longTermHoldingDeduction).toBe(22_153_846);
    // 산출세액: 과표 44,576,923 → floor(×15%) − 1,260,000
    expect(r.calculatedTax).toBe(5_426_538);
  });

  it("실거주 12개월(통산 24↑) → 표2 거주분 4% 반영 (보유32+거주4=36%)", () => {
    const r = calculateTransferTax(
      imageCase({ residencePeriodMonths: 12, decedentCohabitationResidenceMonths: 24 }),
      mockRates,
    );
    expect(r.taxableGain).toBe(69_230_769);
    // 보유 8×4=32% + 거주 1×4=4% = 36%
    expect(r.longTermHoldingRate).toBeCloseTo(0.36, 5);
  });

  it("통산 거주 12개월(<2년) → 거주요건 미충족 → 표1·전액과세 (경계)", () => {
    const r = calculateTransferTax(
      imageCase({ decedentCohabitationResidenceMonths: 12, residencePeriodMonths: 0 }),
      mockRates,
    );
    expect(r.taxableGain).toBe(900_000_000); // 비과세 실패 → 전액
    expect(r.longTermHoldingRate).toBeCloseTo(0.16, 5); // 표1
  });

  it("가드 회귀: 별도세대(토글 off) → 통산 없음 → 현행 불변(전액·표1)", () => {
    const r = calculateTransferTax(
      imageCase({ decedentSameHouseholdBeforeInheritance: false, decedentCohabitationResidenceMonths: 24 }),
      mockRates,
    );
    expect(r.taxableGain).toBe(900_000_000);
    expect(r.longTermHoldingRate).toBeCloseTo(0.16, 5);
  });

  it("단서 3호(부득이) — 동일세대 상속 통산으로 거주1년 충족 → 비과세 (favorable, 코드리뷰 High#1)", () => {
    // 상속개시 2024-06 · 양도 2025-06(보유1년<2) · 조정지역 · 실거주0 · 통산 거주18개월 · 부득이 사유 · 양도가<12억.
    // 통산 미반영 시: 3호 실거주0<1년 → null · 주경로 보유1년<2·거주통산18개월<2년 → 과세.
    // 통산 반영 시: 3호 거주 18개월≥1년 → "both"(보유+거주 면제) → 전액 비과세.
    const r = calculateTransferTax(
      imageCase({
        acquisitionDate: new Date("2024-06-01"),
        decedentCohabitationHoldingStartDate: new Date("2020-01-01"),
        transferDate: new Date("2025-06-01"),
        transferPrice: 900_000_000, // < 12억 → 전액 비과세 가능
        residencePeriodMonths: 0,
        decedentCohabitationResidenceMonths: 18,
        oneHouseExemptionProviso: { reason: "unavoidable" },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("가드 회귀: 매매 취득(비상속) 실거주24 → 표2 40% 불변 (신규 필드 무간섭)", () => {
    const r = calculateTransferTax(
      imageCase({
        acquisitionCause: "purchase",
        decedentSameHouseholdBeforeInheritance: false,
        decedentCohabitationResidenceMonths: 0,
        residencePeriodMonths: 24,
      }),
      mockRates,
    );
    // 매매 1세대1주택 고가·실거주2년 → 표2 보유8×4 + 거주2×4 = 40%
    expect(r.longTermHoldingRate).toBeCloseTo(0.40, 5);
  });
});
