/**
 * Pre-Do 앵커 — 일시적 2주택 §155① + 고가주택(양도가 12억 초과) 안분
 *
 * 계획서: docs/02-design/features/transfer-temp-two-house-high-value-proration.plan.md
 * 버그: 현행 checkExemption E-3(transfer-tax-exemption.ts:344~349)는 timing.overall이면
 *       가격 체크 없이 무조건 전액 비과세 → 양도가 14억 사례가 세액 0으로 산출.
 * 세법: §155①은 "1세대1주택으로 보아 §154①을 적용" — 고가주택 배제(소법 §89①3괄호)·
 *       12억 초과분 안분(소법 §95③·소령 §160)도 동일 적용. E-1/E-3.5/E-5와 같은 패턴.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// 사용자 보고 사례: 취득 2017-05-02(5억) · 신규 2023-03-05 · 양도 2026-02-16(14억) · 거주 0
function highValueTempTwoHouse(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    transferPrice: 1_400_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2017-05-02"),
    transferDate: new Date("2026-02-16"),
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2017-05-02"), // = acquisitionDate (§5 불변식)
      newAcquisitionDate: new Date("2023-03-05"),
    },
    ...over,
  });
}

describe("일시적 2주택 고가주택 12억 초과분 안분 (앵커)", () => {
  // A1 (M2) — 사용자 사례: 14억 양도 → 부분과세. 과세 양도차익 = floor(9억 × 2/14) = 128,571,428
  it("★ A1 양도 14억: 전액 비과세 아님 — 12억 초과분 안분 과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(highValueTempTwoHouse(), mockRates);
    expect(r.isExempt).toBe(false);
    expect(r.exemptReason).toBe("일시적 2주택 고가주택");
    expect(r.transferGain).toBe(900_000_000);
    expect(r.taxableGain).toBe(128_571_428); // floor(900,000,000 × 200,000,000 / 1,400,000,000)
    expect(r.totalTax).toBeGreaterThan(0);
  });

  // A2 (M1 회귀) — 11억 양도(12억 이하): 전액 비과세 현행 유지
  it("A2 양도 11억: 전액 비과세 유지 (회귀 0)", () => {
    const r = calculateTransferTax(
      highValueTempTwoHouse({ transferPrice: 1_100_000_000 }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("일시적 2주택 비과세");
    expect(r.totalTax).toBe(0);
  });

  // A3 (M4) — 14억 + §154① 단서 2호가(수용, 보유면제 whitelist): 부분과세 + 단서 라벨 병기
  it("★ A3 양도 14억 + 수용 단서: 부분과세 + reason 단서 라벨 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      highValueTempTwoHouse({
        // 보유 2년 미달 세팅으로 proviso 보유면제 실효 확인 (기존 proviso anchor #1 픽스처 차용)
        acquisitionPrice: 300_000_000,
        acquisitionDate: new Date("2024-01-01"),
        transferDate: new Date("2025-12-01"),
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2024-01-01"),
          newAcquisitionDate: new Date("2024-03-01"),
        },
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2024-06-01"),
          expropriationDate: new Date("2025-11-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.exemptReason).toContain("일시적 2주택 고가주택");
    expect(r.exemptReason).toContain("§154① 단서");
    // 안분: floor(11억 × 2/14) = 157,142,857
    expect(r.taxableGain).toBe(157_142_857);
  });
});
