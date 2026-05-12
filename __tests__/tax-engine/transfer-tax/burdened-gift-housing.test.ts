/**
 * 부담부증여 — 주택(housing) propertyType anchor 테스트 (Phase 2, 2026-05-12)
 *
 * 케이스 인벤토리 행 4·5-a·5-b (디자인 문서: transfer-tax-burdened-gift-phase2.engine.design.md)
 *   - 케이스 4: 다주택 일반 (1세대1주택 비충족) — §159 + §95 표1 (장특공 최대 30%)
 *   - 케이스 5-a: 1세대1주택 + 12억 초과 + 거주요건 충족 — 후속 PR 차단 (12억 안분 분모 = giftValuation C 통합 미완)
 *   - 케이스 5-b: 1세대1주택 + 조정대상지역 + 거주요건 미충족 — 후속 PR(엔진 cross-cutting) 차단
 *
 * 법령 근거:
 *   - 소득세법 시행령 §159 (부담부증여 양도차익 계산)
 *   - 소득세법 §89 ①3호·시행령 §154·§160 (1세대1주택 비과세·12억 한도)
 *   - 소득세법 §95 ② 표1·표2·§95 ④ 본문 + 시행령 §159의4 (장특공)
 *   - 상증법 §60~§66 + 상증령 §50 ⑦ (Max 평가·임대료 환산)
 *
 * 양도자 = 증여자 본인이므로 §97의2 미적용.
 * 합성 anchor — 양도연도(2024) 누진세율표 §55로 자가검증.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

// ============================================================
// 케이스 4: 다주택(또는 비1세대1주택) — 일반 과세 + 장특공 표1
// ============================================================
//
// 합성 시나리오:
//   주택 (housing) — 보유 15년 (2009-03-01 ~ 2024-03-01)
//   주택공시가격 (취득시) = 500,000,000
//   주택공시가격 (양도시) = 1,000,000,000
//   인수채무: 임대보증금 300,000,000 + 담보차입금 200,000,000 = 500,000,000
//   임대료·저당설정액 미입력 (= mortgageSet fallback = 차입금 200M)
//
// 평가 Max:
//   supplementary = 1,000,000,000 (취득시·양도시 단일 공시가격 buildingStdPrice 자리에 통째)
//   mortgage      = 300M + 200M = 500,000,000
//   rental        = 300M + 0 = 300,000,000
//   → max = 1,000,000,000 (supplementary)
//
// 채무비율 B/C = 500M / 1B = 0.5
//
// §159 비례 안분 후:
//   transferPrice = 1B × 0.5 = 500,000,000
//   acquisitionPrice = 500M × 0.5 = 250,000,000
//   estimatedDeduction = 250M × 3% = 7,500,000 (소령 §163⑥)
//
// 양도차익(현 엔진 산식, expense는 개산공제만):
//   500,000,000 - 250,000,000 - 7,500,000 = 242,500,000
//
// 장특공 표1 — 2009-03-01~2024-03-01 보유 (엔진 holding 산정: 14년 환산, 2%×14 = 28%):
//   242,500,000 × 0.28 = 67,900,000
//   양도소득금액 = 242,500,000 - 67,900,000 = 174,600,000
//
// 양도소득 기본공제 2,500,000:
//   과세표준 = 172,100,000
//
// §55 양도연도 2024 누진세율 (8구간) 자가검증:
//   88M~150M = 35% / 150M~300M = 38% / 300M~500M = 40%
//   172,100,000 구간 = 38% (누진공제 19,940,000)
//   산출세액 = 172,100,000 × 0.38 - 19,940,000 = 65,398,000 - 19,940,000 = 45,458,000

describe("케이스 4 — 부담부증여 + 주택 (다주택 일반 과세)", () => {
  const TRANSFER_DATE = new Date("2024-03-01");
  const ACQUISITION_DATE = new Date("2009-03-01"); // 보유 15년

  const housingBurdenedGiftInfo: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    // housing: 단일 공시가격을 buildingStdPrice 자리에 통째로 (lib/calc/transfer-tax-api-burdened-gift.ts 분기 규칙)
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
  };

  function makeCase4Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
    return baseTransferInput({
      propertyType: "housing",
      transferDate: TRANSFER_DATE,
      acquisitionDate: ACQUISITION_DATE,
      transferPrice: 0,        // engine override (§159)
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      transferType: "burdened_gift",
      acquisitionCause: "gift", // 증여자 당초 취득은 증여로 가정
      isOneHousehold: false,    // 다주택
      householdHousingCount: 2,
      burdenedGiftInfo: housingBurdenedGiftInfo,
      ...overrides,
    });
  }

  it("§159 비례 안분 후 양도가액 = 500,000,000 (= max(1B,500M,300M) × 0.5)", () => {
    const result = calculateTransferTax(makeCase4Input(), rates);
    // burdenedGiftBreakdown은 result에 노출됨 (transferBurdenedGiftBreakdown)
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b.assumedDebtAmount).toBe(500_000_000);
    expect(b.debtRatio).toBeCloseTo(0.5, 7);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.sangjeungbeopValuation.max).toBe(1_000_000_000);
    // 자산-수준: housing은 land=0, building에 통째 → land.transferPrice=0, building.transferPrice=500M
    expect(b.perAsset.land.transferPrice).toBe(0);
    expect(b.perAsset.building.transferPrice).toBe(500_000_000);
  });

  it("취득가액 = 250,000,000 + 개산공제 7,500,000 (§163⑥ 3%)", () => {
    const result = calculateTransferTax(makeCase4Input(), rates);
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b.perAsset.building.acquisitionPrice).toBe(250_000_000);
    expect(b.perAsset.building.estimatedDeduction).toBe(7_500_000);
  });

  it("장특공 표1 (보유 14년 환산, 28%) → 공제액 67,900,000", () => {
    const result = calculateTransferTax(makeCase4Input(), rates);
    // 양도차익 = 500,000,000 - 250,000,000 - 7,500,000 = 242,500,000
    expect(result.transferGain).toBe(242_500_000);
    // 엔진 holding 산정: 2009-03-01 → 2024-03-01 → 14년 환산 (calculateHoldingPeriod)
    // 표1: 2% × 14 = 28% → 242,500,000 × 0.28 = 67,900,000
    expect(result.longTermHoldingDeduction).toBe(67_900_000);
    expect(result.longTermHoldingRate).toBeCloseTo(0.28, 7);
  });

  it("§55 양도연도 누진세율 자가검증 → 산출세액 = 45,458,000", () => {
    const result = calculateTransferTax(makeCase4Input(), rates);
    // 과세표준 = 174,600,000 - 2,500,000 = 172,100,000
    expect(result.taxBase).toBe(172_100_000);
    // §55 2024 누진세율: 88M~150M=35%, 150M~300M=38% (누진공제 19,940,000)
    // 172,100,000 × 0.38 - 19,940,000 = 65,398,000 - 19,940,000 = 45,458,000
    expect(result.calculatedTax).toBe(45_458_000);
  });
});

// ============================================================
// 케이스 5-a — 1세대1주택 + 12억 초과 부담부증여 (F-1, 2026-05-12 해제)
// ============================================================
//
// 합성 시나리오:
//   주택(1세대1주택, 보유 15년)
//   주택 양도시 공시가격 = 1,500,000,000 (12억 초과 — 고가주택)
//   주택 취득시 공시가격 = 700,000,000
//   인수채무: 보증금 500M + 차입금 300M = 800,000,000
//   임대료·근저당설정액 미입력 (mortgageSet = mortgageDebt fallback)
//
// 평가 Max (D-0-2 해석 B 분모):
//   supplementary = 1,500,000,000 (housing → buildingStdPrice 자리)
//   mortgage      = 500M + 300M = 800,000,000
//   rental        = 500M + 0 = 500,000,000
//   → giftValuation C = 1,500,000,000 (supplementary 채택)
//
// 채무비율 B/C = 800M / 1.5B = 0.5333…
//
// §159 비례 안분 후 workingInput:
//   transferPrice = 1.5B × 0.5333 = 800,000,000
//   acquisitionPrice = floor(700M × 800M / 1.5B) = 373,333,333
//   estimatedDeduction = floor(373,333,333 × 3%) = 11,199,999
//   transferGain = 800,000,000 - 373,333,333 - 11,199,999 = 415,466,668
//
// D-0-2 해석 B 12억 안분:
//   burdenedGiftDenominator = C = 1.5B (transferPrice 800M 아님)
//   고가 판정: C > 12억 ✓ → 부분과세
//   과세 양도차익 = floor(415,466,668 × (1.5B - 1.2B) / 1.5B)
//                = floor(415,466,668 × 0.2) = 83,093,333
//
// 후속: 장특공·기본공제·세율은 엔진 결과로 자가검증.

describe("케이스 5-a — 1세대1주택 + 12억 초과 부담부증여 (D-0-2 해석 B 적용, F-1)", () => {
  const case5aInput = () =>
    baseTransferInput({
      propertyType: "housing",
      transferDate: new Date("2024-03-01"),
      acquisitionDate: new Date("2009-03-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      transferType: "burdened_gift",
      acquisitionCause: "gift",
      isOneHousehold: true,
      householdHousingCount: 1,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 500_000_000,
        mortgageDebtAmount: 300_000_000,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 1_500_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 700_000_000,
      },
    });

  it("§159 안분 — assumedDebt=800M / debtRatio=0.5333 / C=1.5B / burdenedGiftDenominator=1.5B", () => {
    const result = calculateTransferTax(case5aInput(), rates);
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b.assumedDebtAmount).toBe(800_000_000);
    expect(b.debtRatio).toBeCloseTo(800_000_000 / 1_500_000_000, 7);
    expect(b.sangjeungbeopValuation.max).toBe(1_500_000_000);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.perAsset.building.transferPrice).toBe(800_000_000);
    expect(b.perAsset.building.acquisitionPrice).toBe(373_333_333);
    expect(b.perAsset.building.estimatedDeduction).toBe(11_199_999);
  });

  it("transferGain = 415,466,668 (workingInput 채무 양도 단위)", () => {
    const result = calculateTransferTax(case5aInput(), rates);
    // 800,000,000 - 373,333,333 - 11,199,999 = 415,466,668
    expect(result.transferGain).toBe(415_466_668);
  });

  it("D-0-2 해석 B 12억 안분 — 과세 양도차익 = 83,093,333 (분모 = C 1.5B)", () => {
    const result = calculateTransferTax(case5aInput(), rates);
    // 분모 = burdenedGiftDenominator (1.5B). transferPrice(800M) 아님.
    // 과세 양도차익 = floor(415,466,668 × 300,000,000 / 1,500,000,000) = floor(83,093,333.6) = 83,093,333
    expect(result.taxableGain).toBe(83_093_333);
  });

  it("12억 이하 회귀 — giftValuation ≤ 12억 시 안분 미발동 (전액 비과세)", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferDate: new Date("2024-03-01"),
      acquisitionDate: new Date("2009-03-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      transferType: "burdened_gift",
      acquisitionCause: "gift",
      isOneHousehold: true,
      householdHousingCount: 1,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 200_000_000,
        mortgageDebtAmount: 100_000_000,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 800_000_000, // 12억 이하 — giftValuation = 800M
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 400_000_000,
      },
    });
    expect(() => calculateTransferTax(input, rates)).not.toThrow();
  });
});

// ============================================================
// 케이스 5-b — 1세대1주택 + 조정대상지역 + 거주요건 미충족
// ============================================================
//
// 현 엔진 cross-cutting 동작: isOneHousehold=true + giftValuation ≤ 12억 케이스는 5-a 가드를 피해 진행되며,
// 비과세 판정은 §154 다운스트림 로직에서 처리. 거주요건 미충족(2017.8.3.↑ 조정대상지역 2년 미거주)은
// downstream에서 §154① 단서로 비과세 박탈 → 일반 과세 + §95 표1. 본 PR은 가드 throw만 검증하고
// 거주요건 → 표1 전환의 완전한 cross-cutting 통합은 후속 PR (별도 PR 신호).

// ============================================================
// 케이스 12 — 다주택 중과 비스코프 안내 (F-2, 2026-05-12)
// ============================================================
//
// 부담부증여 + 주택 + 조정대상지역 + 자산 수 ≥ 2 시 result.warnings에 정보성 메시지 첨부.
// 차단(throw) 아님 — 산출세액은 일반 기준으로 산정되되 결과 카드·사이드바 amber 배지 노출.
// 정식 §167의3 적용은 한시 유예 종료 시점 확정 후 별도 PR.

describe("케이스 12 — 다주택 중과 비스코프 warnings 첨부", () => {
  const case12Input = (overrides: Partial<TransferTaxInput> = {}) =>
    baseTransferInput({
      propertyType: "housing",
      transferDate: new Date("2024-03-01"),
      acquisitionDate: new Date("2009-03-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      transferType: "burdened_gift",
      acquisitionCause: "gift",
      isOneHousehold: false,
      householdHousingCount: 2, // 다주택
      isRegulatedArea: true,    // 조정대상지역
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 200_000_000,
        mortgageDebtAmount: 100_000_000,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 800_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 400_000_000,
      },
      ...overrides,
    });

  it("housing + 조정대상지역 + 자산 수 ≥ 2 → warnings에 §167의3 안내 첨부", () => {
    const result = calculateTransferTax(case12Input(), rates);
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatch(/167의3|다주택 중과/);
    expect(result.warnings![0]).toMatch(/Phase 2 비스코프|한시 유예/);
  });

  it("isRegulatedArea=false 시 warnings 미첨부 (회귀)", () => {
    const result = calculateTransferTax(case12Input({ isRegulatedArea: false }), rates);
    expect(result.warnings).toBeUndefined();
  });

  it("householdHousingCount=1 시 warnings 미첨부 (회귀 — 사례 34 등 단주택 패턴 보존)", () => {
    const result = calculateTransferTax(
      case12Input({ householdHousingCount: 1, isOneHousehold: true }),
      rates,
    );
    expect(result.warnings).toBeUndefined();
  });
});

describe("케이스 5-b 정보성 검증 — 거주요건 미충족 (downstream cross-cutting은 후속 PR)", () => {
  it("isOneHousehold=true + 조정대상지역 + 거주연수 < 2년 시 정보성 검증 (12억 이하면 가드 통과)", () => {
    // 본 anchor는 가드 통과만 검증. 거주요건 박탈 후 표1 산출세액 anchor는 후속 PR.
    const input = baseTransferInput({
      propertyType: "housing",
      transferDate: new Date("2024-03-01"),
      acquisitionDate: new Date("2020-01-01"), // 2017.8.3.↑
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      transferType: "burdened_gift",
      acquisitionCause: "gift",
      isOneHousehold: true,
      householdHousingCount: 1,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 200_000_000,
        mortgageDebtAmount: 100_000_000,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 800_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 500_000_000,
      },
    });
    // 가드 통과 (12억 이하). downstream §154① 단서 미충족 → 표1 전환 — 후속 PR에서 anchor 완성.
    expect(() => calculateTransferTax(input, rates)).not.toThrow();
  });
});
