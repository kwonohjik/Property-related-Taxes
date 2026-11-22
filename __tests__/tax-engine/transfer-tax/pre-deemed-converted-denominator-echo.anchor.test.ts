/**
 * 의제취득일 전 상속·증여 ③ 환산취득가액의 분모 echo (NIT R-c03-11 · 세액 불변).
 *
 * `PreDeemedBreakdown.convertedDenominator` = 엔진이 ③에 실제로 쓴 양도시 기준시가다. 수용·공매·경락이면 `withConversionDenominator`가
 * 차액을 뺀 값이라 입력 `standardPriceAtTransfer`와 다르다 — 화면이 입력값이나 합계로 재구성하면 어긋난다.
 * 세액은 `pre-deemed-3way-max-expropriation.anchor.test.ts`의 값과 같은 숫자를 고정한다(전·후 totalTax 동일).
 * 시료는 그 파일과 같다: 토지 · 1983 상속 · 양도 920,000,000 · 의제취득일 기준시가 202,620,000 · 양도시 1,243,350,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

function land(reported: number | undefined, expr: boolean) {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1985-01-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtTransfer: 1_243_350_000,
    standardPriceAtAcquisition: 202_620_000,
    standardPricePerSqmAtTransfer: 6_750_000,
    transferArea: 184.2,
    ...(expr ? { transferCause: "public_expropriation" as const, compensationPerSqm: 4_000_000, compensationBasisStdPrice: 5_000_000 } : {}),
    inheritedAcquisition: {
      inheritanceDate: new Date("1983-07-26"),
      assetKind: "land",
      standardPriceAtDeemedDate: 202_620_000,
      standardPriceAtTransfer: 1_243_350_000,
      transferDate: new Date("2023-02-16"),
      transferPrice: 920_000_000,
      ...(reported ? { reportedValue: reported } : {}),
    },
  });
}

describe("③ 분모 echo = 엔진이 ③에 쓴 양도시 기준시가", () => {
  it("수용: 분모 736,800,000(= 보상액 4,000,000 × 184.2㎡) — 입력 1,243,350,000이 아니다 · 세액 173,929,791 불변", () => {
    const r = calculateTransferTax(land(undefined, true), rates);
    const b = r.inheritedAcquisitionDetail!.preDeemedBreakdown!;
    expect(b.convertedDenominator).toBe(736_800_000);
    expect(b.convertedAmount).toBe(253_000_000);
    // 적힌 산식대로 곱한 값이 엔진 ③과 같다: 920,000,000 × 202,620,000 ÷ 736,800,000
    expect(Math.floor((920_000_000 * 202_620_000) / b.convertedDenominator!)).toBe(b.convertedAmount);
    expect(r.totalTax).toBe(173_929_791);
  });

  it("수용이 아니면 입력 분모 그대로 1,243,350,000 · ① 채택이어도 ③의 분모는 실린다 · 세액 192,159,000 불변", () => {
    const r = calculateTransferTax(land(200_000_000, false), rates);
    const b = r.inheritedAcquisitionDetail!.preDeemedBreakdown!;
    expect(b.selectedMethod).toBe("reported");
    expect(b.convertedDenominator).toBe(1_243_350_000);
    expect(Math.floor((920_000_000 * 202_620_000) / b.convertedDenominator!)).toBe(149_925_925);
    expect(r.totalTax).toBe(192_159_000);
  });

  it("③을 계산하지 못한 경우(양도시 기준시가 없음)·재개발 §166③에는 분모 echo가 없다", () => {
    const base = {
      inheritanceDate: new Date("1983-07-26"),
      assetKind: "land" as const,
      standardPriceAtDeemedDate: 202_620_000,
      transferPrice: 920_000_000,
      reportedValue: 300_000_000,
    };
    const none = calculateInheritanceAcquisitionPrice(base as never);
    expect(none.preDeemedBreakdown!.convertedAmount).toBe(0);
    expect(none.preDeemedBreakdown!.convertedDenominator).toBeUndefined();
    const redev = calculateInheritanceAcquisitionPrice({ ...base, standardPriceAtTransfer: 1_243_350_000 } as never, 100_000_000);
    expect(redev.preDeemedBreakdown!.convertedBasis).toBe("redevelopment_166_3");
    expect(redev.preDeemedBreakdown!.convertedDenominator).toBeUndefined();
  });
});
