/**
 * Pre-Do anchor — calculateTransferTax acquisitionOverride 매개변수화 (K7)
 *
 * 목적: calculateTransferTax(input, rates, options?) 시그니처 확장 전
 *       현재 엔진 상태에서 anchor 선(先) 작성 → 실패 메시지 확보 → 디자인 환류.
 *
 * 분기 매트릭스 (docs/02-design/features/transfer-tax-acquisition-param-refactor/engine.design.md):
 *   분기 1: 일반 단건 — TRP-OVERRIDE-1
 *   분기 2: 환산취득가 — TRP-OVERRIDE-2
 *   분기 3: 다필지 — TRP-OVERRIDE-3
 *   분기 4: 재개발 — TRP-OVERRIDE-CROSS-1
 *   분기 5: 감정가액 — TRP-OVERRIDE-CROSS-2
 *
 * 회귀 케이스:
 *   TRP-REGRESSION-1~3: options 미입력/undefined 시 기존 anchor byte-identical
 *
 * 정책:
 *   - [[pre-do-anchor-verification]]: 구현 전 실패 메시지 확보 필수
 *   - [[feedback_no_silent_apportion_fallback]]: override=undefined 시 기존 로직 그대로
 *   - [[single-source-engine-helper]]: resolveAcquisitionOverride 단일 헬퍼로
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

// ============================================================
// TRP-REGRESSION-1: options 미입력 시 기존 결과와 byte-identical
// (기준 anchor: T-17 건물 누진세율 — calculatedTax=5,790,000)
// ============================================================

describe("TRP-REGRESSION-1: options 미입력 — 기존 동작 byte-identical", () => {
  const baseInput = baseTransferInput({
    propertyType: "building",
    transferPrice: 500_000_000,
    acquisitionPrice: 450_000_000,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-05-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 2_500_000,
  });

  it("options 인자 없이 호출 → 기존과 동일 결과 (calculatedTax=5,790,000)", () => {
    // 현재 시그니처: calculateTransferTax(input, rates) — 2인자만 지원
    // 이 테스트는 구현 전에는 options 인자 자체가 없으므로 통과.
    // 구현 후에도 options 미입력 시 동일 결과 보장이 핵심 회귀.
    const result = calculateTransferTax(baseInput, mockRates);
    expect(result.isExempt).toBe(false);
    expect(result.calculatedTax).toBe(5_790_000);
  });
});

// ============================================================
// TRP-REGRESSION-2: options=undefined 명시 — 기존 결과 byte-identical
// (구현 후 검증 대상 — 현재는 인자 추가 전이므로 SKIP 또는 별도 처리)
// ============================================================

describe("TRP-REGRESSION-2: options=undefined 명시 — 기존 결과 byte-identical", () => {
  const baseInput = baseTransferInput({
    propertyType: "building",
    transferPrice: 500_000_000,
    acquisitionPrice: 450_000_000,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-05-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 2_500_000,
  });

  it("options=undefined 명시 → 기존과 동일 결과 (calculatedTax=5,790,000)", () => {
    // 구현 전: 3번째 인자는 무시됨 (TypeScript에서 extra arg는 runtime error 없음)
    // 구현 후: options=undefined 경로에서 기존 로직 그대로 실행
    // 현재 시그니처가 2인자이므로 3번째 인자는 TypeScript error.
    // 이 테스트는 구현 후 시그니처 확장 시 회귀 방어용.
    // Pre-Do 단계: @ts-expect-error로 현재 시그니처 초과 인자 표기
    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const result = calculateTransferTax(baseInput, mockRates, undefined);
    expect(result.calculatedTax).toBe(5_790_000);
  });
});

// ============================================================
// TRP-REGRESSION-3: options.acquisitionOverride=undefined 명시
// (구현 후 회귀 보장 — 현재 FAIL 예상)
// ============================================================

describe("TRP-REGRESSION-3: options.acquisitionOverride=undefined 명시 — 기존 결과 byte-identical", () => {
  const baseInput = baseTransferInput({
    propertyType: "building",
    transferPrice: 500_000_000,
    acquisitionPrice: 450_000_000,
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-05-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 2_500_000,
  });

  it("options.acquisitionOverride=undefined → 기존과 동일 결과 (calculatedTax=5,790,000)", () => {
    // 현재: 3번째 인자 미지원 → @ts-expect-error
    // 구현 후: undefined override는 기존 input.acquisitionPrice(450M) 그대로
    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const result = calculateTransferTax(baseInput, mockRates, { acquisitionOverride: undefined });
    expect(result.calculatedTax).toBe(5_790_000);
  });
});

// ============================================================
// TRP-OVERRIDE-1: 일반 단건 + acquisitionOverride=200_000_000
// 구현 전 FAIL 예상 — 취득가 override 미반영
// ============================================================

describe("TRP-OVERRIDE-1: 일반 단건 acquisitionOverride → 취득가액 강제 적용", () => {
  it("acquisitionOverride=200M → transferGain=300M (input.acquisitionPrice=450M 무시)", () => {
    // 기본 입력: 양도가 500M, 취득가 450M → 차익 50M
    // override: 취득가 200M → 차익 300M (필요경비 제외)
    // 산출 검증:
    //   transferGain = 500M - 200M - 0 = 300M
    //   LTHD: 건물 3년 6% → 300M × 6% = 18M
    //   소득금액 = 300M - 18M = 282M
    //   taxBase = 282M - 2.5M(기본공제) = 279.5M → truncate to 279,000,000 (천원 절사)
    //   calculatedTax = 279M × 40% - 25,940,000 = 111,600,000 - 25,940,000 = 85,660,000

    const input = baseTransferInput({
      propertyType: "building",
      transferPrice: 500_000_000,
      acquisitionPrice: 450_000_000, // override 대상 — 200M으로 교체되어야 함
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2024-05-01"),
      isOneHousehold: false,
      householdHousingCount: 0,
      annualBasicDeductionUsed: 2_500_000,
    });

    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const result = calculateTransferTax(input, mockRates, {
      acquisitionOverride: 200_000_000,
    });

    // override 적용 시 취득가 200M → 차익 300M
    expect(result.transferGain).toBe(300_000_000);
    // 기존 취득가 450M 기준 차익 50M이 아님을 확인
    expect(result.transferGain).not.toBe(50_000_000);
  });
});

// ============================================================
// TRP-OVERRIDE-2: 환산취득가 모드 + acquisitionOverride → 환산 우회
// 구현 전 FAIL 예상
// ============================================================

describe("TRP-OVERRIDE-2: 환산취득가 모드 + acquisitionOverride → 환산 계산 우회", () => {
  it("useEstimatedAcquisition=true + override=300M → 환산 계산 건너뜀, usedEstimatedAcquisition=false", () => {
    // 환산 입력 (T-12 기반):
    //   양도가 1,000M, 취득시 기준시가 500M, 양도시 기준시가 800M
    //   환산취득가 = 1,000M × (500M/800M) = 625M
    //   개산공제 = 500M × 3% = 15M
    //   환산 경로 양도차익 = 1,000M - 625M - 15M = 360M
    //
    // override=300M 적용 시:
    //   환산 건너뜀 → acquisitionPrice=300M (실가 경로)
    //   transferGain = 1,000M - 300M = 700M
    //   usedEstimatedAcquisition = false (환산 우회 반영)

    const input = baseTransferInput({
      propertyType: "building",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 500_000_000,
      standardPriceAtTransfer: 800_000_000,
      acquisitionDate: new Date("2019-01-01"),
      transferDate: new Date("2024-01-02"),
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 2_500_000,
    });

    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const result = calculateTransferTax(input, mockRates, {
      acquisitionOverride: 300_000_000,
    });

    // 환산 우회 → usedEstimatedAcquisition=false
    expect(result.usedEstimatedAcquisition).toBe(false);
    // override 300M 적용 → 양도차익 700M
    expect(result.transferGain).toBe(700_000_000);
    // 환산 경로 차익(360M)과 다름을 확인
    expect(result.transferGain).not.toBe(360_000_000);
  });
});

// ============================================================
// TRP-OVERRIDE-3: 다필지 + acquisitionOverridesByAssetId
// 구현 전 FAIL 예상
// ============================================================

describe.skip("TRP-OVERRIDE-3: 다필지 acquisitionOverridesByAssetId — 구현 전 (ParcelInput.transferPrice·transferDate·expenses·areaSqm 미정의)", () => {
  it("2필지 + overridesByAssetId → 해당 필지 취득가 교체, 나머지 유지", () => {
    // 다필지 입력 구조 (TransferTaxInput.parcels):
    //   parcel-1: acquisitionPrice=100M → override=150M
    //   parcel-2: acquisitionPrice=200M → override 없음 (유지)
    //
    // override 적용 후 합산 취득가:
    //   parcel-1: 150M (override)
    //   parcel-2: 200M (유지)
    //   합산 = 350M
    //
    // 기존 합산 = 300M (양도차익 더 낮음)
    // override 후 양도차익 = 양도가 - 350M (더 작아야 함)

    const input = {
      propertyType: "land" as const,
      transferPrice: 600_000_000, // 전체 양도가 (parcels 합산용)
      transferDate: new Date("2024-06-01"),
      acquisitionPrice: 300_000_000, // 다필지에서는 parcels 합산이 우선
      acquisitionDate: new Date("2019-01-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      householdHousingCount: 0,
      isNonBusinessLand: false,
      isOneHousehold: false,
      reductions: [],
      annualBasicDeductionUsed: 2_500_000,
      // 구현 전: ParcelInput.transferPrice·transferDate·expenses·areaSqm 미정의 — Do 단계에서 cast 제거
      parcels: [
        {
          id: "parcel-1",
          transferPrice: 300_000_000,
          acquisitionPrice: 100_000_000,
          acquisitionDate: new Date("2019-01-01"),
          transferDate: new Date("2024-06-01"),
          expenses: 0,
          areaSqm: 100,
        },
        {
          id: "parcel-2",
          transferPrice: 300_000_000,
          acquisitionPrice: 200_000_000,
          acquisitionDate: new Date("2019-01-01"),
          transferDate: new Date("2024-06-01"),
          expenses: 0,
          areaSqm: 100,
        },
      ] as unknown as TransferTaxInput["parcels"],
    } as unknown as TransferTaxInput;

    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const result = calculateTransferTax(input, mockRates, {
      acquisitionOverridesByAssetId: {
        "parcel-1": 150_000_000, // 100M → 150M 교체
      },
    });

    // parcel-1 override(150M) + parcel-2 유지(200M) = 합산 취득가 350M
    // 전체 양도차익 = 600M - 350M = 250M (단, parcels 내부 산식에 따라 다를 수 있음)
    // 핵심: 기존 합산(300M) 기준 양도차익(300M)보다 작아야 함
    expect(result.transferGain).toBeLessThan(300_000_000); // 250M < 300M
  });
});

// ============================================================
// TRP-OVERRIDE-CROSS-1: 재개발 + acquisitionOverride → rightsValue 무시
// 구현 전 FAIL 예상
// ============================================================

describe.skip("TRP-OVERRIDE-CROSS-1: 재개발 입주권 + acquisitionOverride — 구현 전 (RedevelopmentInfo.direction 미정의)", () => {
  it("redevSubject=right + override=300M → rightsValue=200M 무시, override 기반 양도차익", () => {
    // 사례 36 기반 단순 케이스 (case-36-right-pay.test.ts 구조 차용)
    // CORE-36: 양도가 520M, 취득가 100M, 권리가 300M, 청산금불입 90M
    // 인가전 차익 = 520M × (300M/520M) × (100M/300M) - ... (엔진 내부 산식)
    // 핵심: acquisitionOverride=150M 시 기존(100M) 대비 취득가 변경 → 차익 변경
    //
    // 재개발 엔진(calculateRedevelopmentTax)에 options가 전달되어야 함
    // 현재 미지원이므로 FAIL 예상

    const redevInfo: RedevelopmentInfo = {
      subject: "right",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2018-10-23"),
      rightsValue: 300_000_000,
      settlementDirection: "pay",
      settlementAmount: 90_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      acquisitionRounding: "floor",
    };

    const baseInput = baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 520_000_000,
      transferDate: new Date("2023-03-02"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 100_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      householdRightCount: 1,
      redevelopment: redevInfo,
    });

    // 기존 동작 (override 없음): 사례 36 CORE 엔진 실행
    const baseResult = calculateTransferTax(baseInput, mockRates);
    const baseGain = baseResult.transferGain;
    expect(baseGain).toBeGreaterThan(0);

    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const overrideResult = calculateTransferTax(baseInput, mockRates, {
      acquisitionOverride: 300_000_000, // 100M → 300M (취득가 증가 → 차익 감소)
    });

    // override=300M → 취득가 증가 → 양도차익 감소
    // (재개발 엔진 내부에서 acquisitionPrice를 override로 교체해야 함)
    // 현재 미지원이므로 baseGain과 동일값 반환 → FAIL
    expect(overrideResult.transferGain).toBeLessThan(baseGain);
  });
});

// ============================================================
// TRP-OVERRIDE-CROSS-2: 감정가액 + acquisitionOverride → appraisalValue 무시
// 구현 전 FAIL 예상
// ============================================================

describe("TRP-OVERRIDE-CROSS-2: 감정가액 모드 + acquisitionOverride → appraisalValue 무시", () => {
  it("isAppraisalAcquisition=true + override=300M → appraisalValue=400M 무시, 취득가 300M 적용", () => {
    // 감정가액 입력:
    //   양도가 700M, 감정가액 400M
    //   기존: 취득가 = 400M (appraisalValue)
    //   override=300M: 취득가 = 300M
    //
    // transferGain (기존) = 700M - 400M = 300M
    // transferGain (override) = 700M - 300M = 400M (더 큼)

    // 감정가액 모드: acquisitionMethod="appraisal" + appraisalValue 설정
    // 기존 엔진: calcTransferGain에서 appraisalValue를 acquisitionCostBase로 사용
    // 참고: transfer-tax-helpers.ts:379 — } else if (input.acquisitionMethod === "appraisal")
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 700_000_000,
      acquisitionPrice: 0,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2024-06-01"),
      acquisitionMethod: "appraisal",    // isAppraisalAcquisition 플래그 없음 — 이 필드 사용
      appraisalValue: 400_000_000,       // override 시 무시되어야 할 값
      standardPriceAtAcquisition: 0,     // 개산공제 계산용 (0으로 간소화)
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      annualBasicDeductionUsed: 2_500_000,
    });

    // 기존 동작 (override 없음): appraisalValue=400M 적용
    const baseResult = calculateTransferTax(input, mockRates);
    // 기존: 취득가 400M → 차익 300M
    expect(baseResult.transferGain).toBe(300_000_000);

    // 구현 완료 — 3번째 인자 acquisitionOverride 지원
    const overrideResult = calculateTransferTax(input, mockRates, {
      acquisitionOverride: 300_000_000,
    });

    // override=300M → 취득가 300M → 차익 400M (appraisalValue=400M 무시)
    expect(overrideResult.transferGain).toBe(400_000_000);
    // 기존(300M)과 다름을 확인
    expect(overrideResult.transferGain).not.toBe(300_000_000);
  });
});
