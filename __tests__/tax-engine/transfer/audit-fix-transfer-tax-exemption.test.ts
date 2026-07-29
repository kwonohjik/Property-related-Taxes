/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/transfer-tax-exemption.ts
 *
 * ref transfer-tax-exemption.ts:215  일시적 2주택(E-3) 거주요건 미검증 (§155①→§154①)
 *   종전주택이 취득 당시 조정대상지역이면 거주 2년 요건도 검증해야 하나 보유요건만 검사.
 * ref transfer-tax-exemption.ts:76   expropriation(2호 가목) 수용일 미입력 시 fail-open
 *   expropriationDate 미입력 시 transferDate로 fallback → 5년 이내 항상 참 → 무조건 "both".
 *
 * 기대값은 소득세법 시행령 §154①·§155①에서 독립 도출(엔진 출력 복사 아님):
 *  - §154① 본문: 취득 당시 조정대상지역 주택은 보유 2년 + 거주 2년(2017.8.3 이후 취득).
 *  - 경과규정: 2017.8.3 이전 취득 + 취득 당시 조정지역이라도 거주요건 면제.
 *  - §154①2호가목: 사업인정고시일 전 취득 + 수용일부터 5년 이내 양도 시 보유·거주 면제.
 *    수용일 미입력이면 5년 이내 판정 불가 → 특례 미적용(요건 미검증).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput as baseInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// ============================================================
// 결함 A (E-3): 일시적 2주택 종전주택 거주요건 검증
//   mock: minHoldingYears=2, regulatedAreaMinResidenceYears=2, prePolicyDate=2017-08-03,
//         temporary_two_house.disposalDeadlineYears=3
// ============================================================
describe("audit E-3: 일시적 2주택 종전주택 거주요건 (§155①→§154①)", () => {
  it("A: 종전주택 조정지역 취득 + 거주 0 + 처분기한 내 → 거주 2년 미충족 → 비과세 불가", () => {
    const input = baseInput({
      transferPrice: 900_000_000, // 12억 이하 (고가 아님)
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2020-01-01"), // = 종전주택 취득 (2017.8.3 이후)
      transferDate: new Date("2023-01-01"), // 종전주택 보유 3년 ≥ 2년, 처분기한(2025-01-01) 내
      residencePeriodMonths: 0, // 거주 안 함
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false, // 양도일 기준 비조정 → 처분기한 3년 유지
      wasRegulatedAtAcquisition: true, // 취득 당시 조정지역 → 거주 2년 요건 발동
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2020-01-01"),
        newAcquisitionDate: new Date("2022-06-01"), // deadline = 2025-06-01
      },
    });
    const result = calculateTransferTax(input, mockRates);
    // §154① 거주 2년 미충족 → 비과세 불가 (수정 전 버그: isExempt=true)
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("B: 동일 조건 + 거주 24개월 → 거주 2년 충족 → 비과세 (정상 케이스 미파손)", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2023-01-01"),
      residencePeriodMonths: 24, // 거주 2년 충족
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: true,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2020-01-01"),
        newAcquisitionDate: new Date("2022-06-01"),
      },
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  it("C: 경과규정 — 종전주택 2017.8.3 이전 조정지역 취득 + 거주 0 → 거주요건 면제 → 비과세 (과잉차단 방지)", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2017-01-01"), // prePolicyDate(2017-08-03) 이전
      transferDate: new Date("2023-06-01"),
      residencePeriodMonths: 0,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: true, // 취득 당시 조정지역이나 경과규정으로 거주면제
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2017-01-01"),
        newAcquisitionDate: new Date("2021-01-01"), // deadline = 2024-01-01, 양도(2023-06-01) 내
      },
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
    expect(result.totalTax).toBe(0);
  });

  it("D: 취득 당시 비조정 → 거주요건 없음 + 거주 0 → 비과세 (회귀)", () => {
    const input = baseInput({
      transferPrice: 900_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2023-01-01"),
      residencePeriodMonths: 0,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, // 취득 당시 비조정 → 거주요건 없음
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2020-01-01"),
        newAcquisitionDate: new Date("2022-06-01"),
      },
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
  });
});

// ============================================================
// 결함 B (line 76): expropriation(2호 가목) 수용일 미입력 fail-closed
// ============================================================
describe("audit §154①2호가: 수용일 미입력 시 fail-closed", () => {
  it("E: reason=expropriation, expropriationDate 미입력, 보유 1.5년 → 특례 미적용 → 비과세 불가", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2022-12-01"), // 보유 ~1.5년 < 2년
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      oneHouseExemptionProviso: {
        reason: "expropriation",
        businessApprovalDate: new Date("2024-01-01"), // 취득일 이후 = 고시일 전 취득 ✓
        // expropriationDate 미입력 — 수정 전엔 항상 "both"(비과세)
      },
    });
    const result = calculateTransferTax(input, mockRates);
    // 수용일 미검증 → 특례 미적용 → 보유 1.5년만으로는 비과세 불가 (수정 전 버그: isExempt=true)
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });

  it("F: 수용일 입력 + 양도일이 수용일 5년 이내 → 특례 적용 → 비과세 (정상 케이스 미파손)", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2022-12-01"), // 보유 1.5년 (단서로 보유면제)
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      oneHouseExemptionProviso: {
        reason: "expropriation",
        businessApprovalDate: new Date("2024-01-01"),
        expropriationDate: new Date("2024-05-01"), // 양도일 5년 이내
      },
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(true);
    expect(result.exemptReason).toContain("§154① 단서 2호가 수용");
  });

  it("G: 수용일 입력 but 양도일이 수용일 5년 초과 → 특례 미적용 → 비과세 불가", () => {
    const input = baseInput({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2023-06-01"), // 보유 ~1년 < 2년
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      oneHouseExemptionProviso: {
        reason: "expropriation",
        expropriationDate: new Date("2018-01-01"), // 양도일(2024-06-01) - 수용일 > 5년
      },
    });
    const result = calculateTransferTax(input, mockRates);
    expect(result.isExempt).toBe(false);
    expect(result.totalTax).toBeGreaterThan(0);
  });
});
