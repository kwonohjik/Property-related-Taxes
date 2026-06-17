/**
 * 1세대1주택 비과세 §154① 단서 각호 — 보유·거주 요건 면제 (소득세법 시행령 §154 ① 단서)
 *
 * 1·2·3호 = 보유+거주 면제 / 5호 = 거주만 면제.
 * Pre-Do anchor: proviso 미처리 시 면제 기대 케이스가 RED → 헬퍼 구현 후 GREEN.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput as baseInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const T = new Date("2024-06-01"); // 양도일 공통

describe("§154① 단서 — 보유·거주 요건 면제", () => {
  // A1: 2호 가목 수용 + 보유 1.5년 (현행 RED — 보유 미달로 과세)
  it("A1: 수용(2호가) 보유<2년 → 비과세", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2022-12-01"), // 보유 ~1.5년
        residencePeriodMonths: 0,
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2024-01-01"), // 고시일 (취득일 이후 = 고시일 전 취득 ✓)
          expropriationDate: new Date("2024-05-01"),
        },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
    // ⑦ 결과 라벨: 비과세 사유에 단서 호 부가 (result detail·PDF 자동 노출)
    expect(result.exemptReason).toContain("§154① 단서 2호가 수용");
  });

  // A2: 2호 나목 해외이주 + 출국일+2년 내
  it("A2: 해외이주(2호나) 출국일+2년내 → 비과세", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-06-01"), // 보유 1년
        residencePeriodMonths: 0,
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: new Date("2024-01-01") },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
  });

  // A3: 해외이주 but 출국일+2년 초과 → 미적용(보유 미달 → 과세)
  it("A3: 해외이주 출국일+2년 초과 → 과세", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-06-01"),
        residencePeriodMonths: 0,
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: new Date("2022-01-01") },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(false);
  });

  // A4a: 3호 부득이 but 거주 1년 미달 → 미적용
  it("A4a: 부득이(3호) 거주1년 미달 → 과세", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-06-01"),
        residencePeriodMonths: 6, // 0년 < 1년
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "unavoidable" },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(false);
  });

  // A4b: 3호 부득이 + 거주 1년 충족
  it("A4b: 부득이(3호) 거주1년 충족 → 비과세", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-06-01"),
        residencePeriodMonths: 18, // 1.5년 ≥ 1년
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "unavoidable" },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
  });

  // A5: 5호 조정취득 거주0 + 보유충족 → 거주면제 비과세
  it("A5: 5호 조정공고전계약 거주0+보유충족 → 비과세(거주면제)", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2021-06-01"), // 보유 3년 ≥ 2년
        residencePeriodMonths: 0,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "pre_designation_contract" },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
  });

  // A6: 5호 but 보유 미달 → 미적용(5호는 거주만 면제)
  it("A6: 5호 보유미달 → 과세(보유는 면제 안 됨)", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-06-01"), // 보유 1년 < 2년
        residencePeriodMonths: 0,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "pre_designation_contract" },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(false);
  });

  // A7: 단서 없음 + 보유충족 → 비과세 (회귀)
  it("A7: 단서 없음 보유충족 → 비과세 (회귀)", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2019-06-01"),
        residencePeriodMonths: 60,
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
  });

  // A8: 수용 + 양도가 13억 → 요건 충족(면제)되나 고가주택 부분과세 (한도 불면제)
  it("A8: 수용 + 13억 → isPartialExempt(고가주택), isExempt=false", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 1_300_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2022-12-01"),
        residencePeriodMonths: 0,
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2024-01-01"),
          expropriationDate: new Date("2024-05-01"),
        },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(false);
    // 단서로 §154① 요건 충족 → 고가주택 부분과세(12억 초과분 안분). 한도 자체는 불면제.
    // 과세 양도차익 = (13억-3억) × (13억-12억)/13억 = 76,923,076 (원미만 절사)
    expect(result.taxableGain).toBe(76_923_076);
  });

  // A2′: 2호 다목 국외거주 + 출국일+2년 내
  it("A2′: 국외거주(2호다) 출국일+2년내 → 비과세", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-06-01"),
        residencePeriodMonths: 0,
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "overseas_residence", departureDate: new Date("2024-01-01") },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
  });

  // A2″: 1호 임대주택 + 세대전원 거주5년 + 보유<2년 → 보유면제 비과세
  it("A2″: 임대주택(1호) 거주5년+보유<2년 → 비과세(보유면제)", () => {
    const result = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2023-01-01"), // 보유 ~1.4년
        residencePeriodMonths: 60, // 임차일~양도일 거주 5년
        isRegulatedArea: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        oneHouseExemptionProviso: { reason: "rental_5yr_residence" },
      }),
      mockRates,
    );
    expect(result.isExempt).toBe(true);
  });
});
