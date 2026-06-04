/**
 * G-H4 — buildBurdenedGiftInfo 변환 테스트 가드
 *
 * 검증 대상: lib/calc/transfer-tax-api-burdened-gift.ts (lines 59-148)
 * 14개 동기화 지점 ⑬ — callTransferTaxAPI body spread 영역.
 * TypeScript가 감지하지 못하는 silent strip을 실행 경로로 탐지.
 *
 * 케이스:
 *   BG-A: priorGifts computedTax/giftTaxBase 전달 보존 — parseAmount||undefined 경계
 *   BG-B: assetKind 4분기별 landStdPrice/buildingStdPrice 매핑
 *         BG-B1 general_building (gbTransferLandPricePerSqm × gbLandArea, gbTransferBuildingValue)
 *         BG-B2 land (standardPriceAtTransfer 우선, 0-fallback sqm×area)
 *         BG-B3 housing/building (단일 공시가격 buildingStd 자리)
 *         BG-B4 commercial_building (단일 기준시가 fallback — F-3 주석 검증)
 *   BG-C: priorGifts.filter(giftDate && giftAmount>0) 경계
 *   BG-D: floor 안분 정수 (gbLandArea 소수 시 Math.floor 적용 확인)
 *   BG-E: common 필드 전달 보존 (valuationMode·lendingDeposit·mortgage·generationSkip)
 */

import { describe, it, expect } from "vitest";
import {
  buildBurdenedGiftInfo,
  type BurdenedGiftInfoPayload,
} from "@/lib/calc/transfer-tax-api-burdened-gift";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

// ─────────────────────────────────────────────────────────
// 헬퍼: AssetForm 최소 골격 (burdened_gift 공통)
// ─────────────────────────────────────────────────────────

function makeBase(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    // AssetForm 필수 필드 최소값 — 실제 타입에서 요구되는 것만
    id: "test-asset",
    assetKind: "housing",
    transferType: "burdened_gift",
    transferPrice: "0",
    acquisitionPrice: "0",
    transferDate: "2025-06-01",
    acquisitionDate: "2020-01-01",
    transferArea: "100",
    acquisitionArea: "100",
    // BurdenedGiftFormSlice 기본값
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "0",
    bgMortgageDebtAmount: "0",
    bgAnnualRentTotal: "0",
    bgMortgageSetAmount: "",
    bgMarketValueAtTransfer: "",
    bgMarketValueAtAcquisition: "",
    bgGiftBuildingStdPriceAtTransfer: "",
    bgDonorRelation: "lineal_descendant",
    bgIsMinorDonee: false,
    bgIsGenerationSkip: false,
    bgIsFiledOnTime: true,
    bgPriorGifts: [],
    // standardPrice 필드 (housing/commercial_building/land 공용)
    standardPriceAtTransfer: "0",
    standardPriceAtAcq: "0",
    standardPricePerSqmAtTransfer: "0",
    standardPricePerSqmAtAcq: "0",
    // general_building 전용 필드 기본값
    gbLandArea: "0",
    gbTransferLandPricePerSqm: "0",
    gbTransferBuildingValue: "0",
    gbAcqLandPricePerSqm: "0",
    gbAcqBuildingValue: "0",
    ...overrides,
  } as unknown as AssetForm;
}

// ─────────────────────────────────────────────────────────
// BG-A: priorGifts computedTax/giftTaxBase 전달 보존
// ─────────────────────────────────────────────────────────

describe("[BG-A] priorGifts computedTax/giftTaxBase 전달 보존 (§58 Phase A)", () => {
  it("[BG-A1] computedTax·giftTaxBase 명시 입력 → 원 단위 number로 보존", () => {
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "2022-01-01",
          giftAmount: "50000000",
          giftTaxPaid: "1000000",
          computedTax: "2000000",
          giftTaxBase: "45000000",
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.priorGiftsWithin10Years).toBeDefined();
    expect(result.priorGiftsWithin10Years!.length).toBe(1);

    const pg = result.priorGiftsWithin10Years![0];
    expect(pg.giftAmount).toBe(50_000_000);
    expect(pg.giftTaxPaid).toBe(1_000_000);
    // §58 Phase A 핵심: computedTax·giftTaxBase 소실 없이 보존
    expect(pg.computedTax).toBe(2_000_000);
    expect(pg.giftTaxBase).toBe(45_000_000);
  });

  it("[BG-A2] computedTax 미입력('') → undefined (parseAmount||undefined 경계)", () => {
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "2022-01-01",
          giftAmount: "50000000",
          giftTaxPaid: "1000000",
          // computedTax/giftTaxBase 미입력
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    const pg = result.priorGiftsWithin10Years![0];
    expect(pg.computedTax).toBeUndefined();
    expect(pg.giftTaxBase).toBeUndefined();
  });

  it("[BG-A3] computedTax='0' → undefined (parseAmount('0')=0, 0||undefined = undefined)", () => {
    /**
     * parseAmount('0') = 0 이고, 코드 라인 94-96:
     *   computedTax: parseAmount(p.computedTax) || undefined
     * 0 || undefined = undefined → 엔진에서 §58 미적용. 경계값 확인.
     */
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "2022-01-01",
          giftAmount: "50000000",
          giftTaxPaid: "0",
          computedTax: "0",
          giftTaxBase: "0",
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    const pg = result.priorGiftsWithin10Years![0];
    // 0원 산출세액 → undefined (엔진 §58 미적용 — 의도된 동작)
    expect(pg.computedTax).toBeUndefined();
    expect(pg.giftTaxBase).toBeUndefined();
  });

  it("[BG-A4] 복수 사전증여 → 각 항목 개별 보존", () => {
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "2020-01-01",
          giftAmount: "30000000",
          giftTaxPaid: "500000",
          computedTax: "1000000",
          giftTaxBase: "25000000",
        },
        {
          giftDate: "2022-06-01",
          giftAmount: "20000000",
          giftTaxPaid: "200000",
          computedTax: "500000",
          giftTaxBase: "15000000",
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.priorGiftsWithin10Years!.length).toBe(2);
    expect(result.priorGiftsWithin10Years![0].computedTax).toBe(1_000_000);
    expect(result.priorGiftsWithin10Years![1].computedTax).toBe(500_000);
  });
});

// ─────────────────────────────────────────────────────────
// BG-B: assetKind 4분기별 landStdPrice/buildingStdPrice 매핑
// ─────────────────────────────────────────────────────────

describe("[BG-B1] general_building — gb* 필드에서 토지·건물 분리", () => {
  it("[BG-B1a] 토지 기준시가 = gbTransferLandPricePerSqm × gbLandArea (floor)", () => {
    const asset = makeBase({
      assetKind: "general_building",
      gbLandArea: "120",
      gbTransferLandPricePerSqm: "1000000",  // 100만원/㎡
      gbTransferBuildingValue: "80000000",
      gbAcqLandPricePerSqm: "600000",
      gbAcqBuildingValue: "50000000",
    });
    const result = buildBurdenedGiftInfo(asset);
    // 양도시 토지: Math.floor(1,000,000 × 120) = 120,000,000
    expect(result.landStdPriceAtTransfer).toBe(120_000_000);
    expect(result.buildingStdPriceAtTransfer).toBe(80_000_000);
    // 취득시 토지: Math.floor(600,000 × 120) = 72,000,000
    expect(result.landStdPriceAtAcquisition).toBe(72_000_000);
    expect(result.buildingStdPriceAtAcquisition).toBe(50_000_000);
  });

  it("[BG-B1b] gbLandArea 소수 → floor 적용으로 정수 보장", () => {
    const asset = makeBase({
      assetKind: "general_building",
      gbLandArea: "33.33",
      gbTransferLandPricePerSqm: "1000000",
      gbTransferBuildingValue: "0",
      gbAcqLandPricePerSqm: "1000000",
      gbAcqBuildingValue: "0",
    });
    const result = buildBurdenedGiftInfo(asset);
    // Math.floor(1,000,000 × 33.33) = Math.floor(33_330_000) = 33_330_000
    expect(result.landStdPriceAtTransfer).toBe(Math.floor(1_000_000 * 33.33));
    // 결과가 정수임을 확인
    expect(Number.isInteger(result.landStdPriceAtTransfer)).toBe(true);
    expect(Number.isInteger(result.landStdPriceAtAcquisition)).toBe(true);
  });
});

describe("[BG-B2] land — standardPriceAtTransfer 우선, fallback sqm×area", () => {
  it("[BG-B2a] standardPriceAtTransfer 입력 → 그 값 사용 (sqm×area 무시)", () => {
    const asset = makeBase({
      assetKind: "land",
      transferArea: "200",
      acquisitionArea: "200",
      standardPriceAtTransfer: "150000000",
      standardPriceAtAcq: "100000000",
      standardPricePerSqmAtTransfer: "900000",  // 입력돼도 무시
      standardPricePerSqmAtAcq: "600000",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.landStdPriceAtTransfer).toBe(150_000_000);
    expect(result.landStdPriceAtAcquisition).toBe(100_000_000);
    expect(result.buildingStdPriceAtTransfer).toBe(0);   // 토지만 → building=0
    expect(result.buildingStdPriceAtAcquisition).toBe(0);
  });

  it("[BG-B2b] standardPriceAtTransfer 미입력 → sqm × 면적 fallback", () => {
    const asset = makeBase({
      assetKind: "land",
      transferArea: "200",
      acquisitionArea: "200",
      standardPriceAtTransfer: "",  // 미입력
      standardPriceAtAcq: "",
      standardPricePerSqmAtTransfer: "800000",
      standardPricePerSqmAtAcq: "500000",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.landStdPriceAtTransfer).toBe(Math.floor(800_000 * 200));  // 160,000,000
    expect(result.landStdPriceAtAcquisition).toBe(Math.floor(500_000 * 200));  // 100,000,000
  });

  it("[BG-B2c] 둘 다 미입력 → 0", () => {
    const asset = makeBase({
      assetKind: "land",
      transferArea: "200",
      standardPriceAtTransfer: "",
      standardPriceAtAcq: "",
      standardPricePerSqmAtTransfer: "",
      standardPricePerSqmAtAcq: "",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.landStdPriceAtTransfer).toBe(0);
    expect(result.buildingStdPriceAtTransfer).toBe(0);
  });
});

describe("[BG-B3] housing — 단일 공시가격을 buildingStd 자리에 할당 (land=0)", () => {
  it("[BG-B3a] housing: standardPriceAtTransfer → buildingStd 자리", () => {
    const asset = makeBase({
      assetKind: "housing",
      standardPriceAtTransfer: "450000000",
      standardPriceAtAcq: "300000000",
    });
    const result = buildBurdenedGiftInfo(asset);
    // housing은 토지/건물 미분리 — building 자리에 단일 공시가격
    expect(result.landStdPriceAtTransfer).toBe(0);
    expect(result.buildingStdPriceAtTransfer).toBe(450_000_000);
    expect(result.landStdPriceAtAcquisition).toBe(0);
    expect(result.buildingStdPriceAtAcquisition).toBe(300_000_000);
  });

  it("[BG-B3b] building (일반건물 — assetKind='building'): 동일 패턴", () => {
    const asset = makeBase({
      assetKind: "building",
      standardPriceAtTransfer: "200000000",
      standardPriceAtAcq: "120000000",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.landStdPriceAtTransfer).toBe(0);
    expect(result.buildingStdPriceAtTransfer).toBe(200_000_000);
    expect(result.buildingStdPriceAtAcquisition).toBe(120_000_000);
  });
});

describe("[BG-B4] commercial_building — 단일 기준시가 fallback (F-3 검증)", () => {
  /**
   * F-3 (2026-05-12): commercial_building도 단일 기준시가 fallback 패턴 적용.
   * cb*·호별고시가는 환산취득가(useEstimatedAcquisition) 전용.
   * 부담부증여 모드에서는 standardPriceAtTransfer/standardPriceAtAcq 직접 입력.
   */
  it("[BG-B4a] commercial_building: standardPriceAtTransfer → buildingStd 단일 사용", () => {
    const asset = makeBase({
      assetKind: "commercial_building",
      standardPriceAtTransfer: "600000000",
      standardPriceAtAcq: "400000000",
    });
    const result = buildBurdenedGiftInfo(asset);
    // commercial_building도 housing/building 패턴과 동일 — fallback 단일 기준시가
    expect(result.landStdPriceAtTransfer).toBe(0);
    expect(result.buildingStdPriceAtTransfer).toBe(600_000_000);
    expect(result.landStdPriceAtAcquisition).toBe(0);
    expect(result.buildingStdPriceAtAcquisition).toBe(400_000_000);
  });

  it("[BG-B4b] commercial_building: standardPriceAtTransfer 미입력 → 0 (자동 계산 없음)", () => {
    const asset = makeBase({
      assetKind: "commercial_building",
      standardPriceAtTransfer: "",
      standardPriceAtAcq: "",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.buildingStdPriceAtTransfer).toBe(0);
    expect(result.buildingStdPriceAtAcquisition).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// BG-C: priorGifts.filter(giftDate && giftAmount>0) 경계
// ─────────────────────────────────────────────────────────

describe("[BG-C] priorGifts filter 경계 (giftDate && giftAmount>0)", () => {
  it("[BG-C1] giftAmount='0' → filter 제거됨, 빈 배열 [] 반환 (발견된 동작 anchor)", () => {
    /**
     * [발견 버그 보고용 anchor — 프로덕션 코드 수정 금지]
     * 코드 라인 87: `primary.bgPriorGifts.length > 0` 조건 진입 후
     * filter 결과가 빈 배열이어도 `[]`가 반환됨 (`undefined`가 아님).
     * 엔진 gift-prior-aggregation.ts는 빈 배열을 받으면 합산 0으로 처리하므로
     * 실제 계산 결과에는 영향 없음. 단, 의도는 undefined였을 수 있음.
     *
     * 이 anchor는 현재 동작을 고정하여 향후 수정 시 RED가 되도록 설계.
     */
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "2022-01-01",
          giftAmount: "0",
          giftTaxPaid: "0",
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    // 실제 동작: filter 후 빈 배열 [] (undefined 아님)
    // [버그 보고] bgPriorGifts.length>0 진입 후 filter 빈 결과 → [] 반환.
    //   엔진 calc-neutral이나 undefined 의도였다면 수정 필요.
    expect(result.priorGiftsWithin10Years).toEqual([]);
  });

  it("[BG-C2] giftDate 빈 문자열 → filter 제거됨, 빈 배열 [] 반환 (발견된 동작 anchor)", () => {
    /**
     * [발견 버그 보고용 anchor — 프로덕션 코드 수정 금지]
     * BG-C1과 동일 패턴: giftDate="" → falsy → filter 제거,
     * 빈 배열 `[]`가 반환됨.
     */
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "",  // 미입력
          giftAmount: "50000000",
          giftTaxPaid: "1000000",
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    // 실제 동작: [] (undefined 아님)
    expect(result.priorGiftsWithin10Years).toEqual([]);
  });

  it("[BG-C3] 혼합(유효 1건 + 무효 1건) → 유효 건만 남음", () => {
    const asset = makeBase({
      bgPriorGifts: [
        {
          giftDate: "2021-01-01",
          giftAmount: "30000000",  // 유효
          giftTaxPaid: "0",
          computedTax: "800000",
        },
        {
          giftDate: "",           // giftDate 빈 → 무효
          giftAmount: "50000000",
          giftTaxPaid: "0",
        },
      ],
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.priorGiftsWithin10Years).toBeDefined();
    expect(result.priorGiftsWithin10Years!.length).toBe(1);
    expect(result.priorGiftsWithin10Years![0].giftAmount).toBe(30_000_000);
  });

  it("[BG-C4] bgPriorGifts 빈 배열 → priorGiftsWithin10Years undefined", () => {
    const asset = makeBase({ bgPriorGifts: [] });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.priorGiftsWithin10Years).toBeUndefined();
  });

  it("[BG-C5] bgPriorGifts undefined → priorGiftsWithin10Years undefined", () => {
    const asset = makeBase();
    // bgPriorGifts가 undefined인 경우 — 레거시 데이터 호환
    (asset as unknown as Record<string, unknown>).bgPriorGifts = undefined;
    const result = buildBurdenedGiftInfo(asset);
    expect(result.priorGiftsWithin10Years).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// BG-D: floor 안분 정수 — 정수 연산 원칙 준수
// ─────────────────────────────────────────────────────────

describe("[BG-D] floor 안분 정수 확인 (정수 연산 원칙)", () => {
  it("[BG-D1] general_building: 면적 소수 × 단가 → Math.floor 적용 후 정수", () => {
    const asset = makeBase({
      assetKind: "general_building",
      gbLandArea: "99.99",
      gbTransferLandPricePerSqm: "1000001",  // 비정수 단가
      gbTransferBuildingValue: "70000000",
      gbAcqLandPricePerSqm: "700000",
      gbAcqBuildingValue: "40000000",
    });
    const result = buildBurdenedGiftInfo(asset);
    // Math.floor 적용으로 반드시 정수
    expect(Number.isInteger(result.landStdPriceAtTransfer)).toBe(true);
    expect(Number.isInteger(result.landStdPriceAtAcquisition)).toBe(true);
    // 값 검증: Math.floor(1_000_001 × 99.99)
    expect(result.landStdPriceAtTransfer).toBe(Math.floor(1_000_001 * 99.99));
  });

  it("[BG-D2] land: sqm×area fallback → Math.floor 적용", () => {
    const asset = makeBase({
      assetKind: "land",
      transferArea: "57.77",
      acquisitionArea: "57.77",
      standardPriceAtTransfer: "",
      standardPriceAtAcq: "",
      standardPricePerSqmAtTransfer: "1230000",
      standardPricePerSqmAtAcq: "900000",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(Number.isInteger(result.landStdPriceAtTransfer)).toBe(true);
    expect(result.landStdPriceAtTransfer).toBe(Math.floor(1_230_000 * 57.77));
  });
});

// ─────────────────────────────────────────────────────────
// BG-E: common 필드 전달 보존
// ─────────────────────────────────────────────────────────

describe("[BG-E] common 필드 전달 보존", () => {
  it("[BG-E1] valuationMode·lendingDeposit·mortgage 보존", () => {
    const asset = makeBase({
      bgValuationMode: "sangjeungbeop_market",
      bgLendingDepositTotal: "100000000",
      bgMortgageDebtAmount: "50000000",
      bgAnnualRentTotal: "12000000",
      bgMortgageSetAmount: "70000000",
      bgMarketValueAtTransfer: "600000000",
      bgMarketValueAtAcquisition: "400000000",
    });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.valuationMode).toBe("sangjeungbeop_market");
    expect(result.lendingDepositTotal).toBe(100_000_000);
    expect(result.mortgageDebtAmount).toBe(50_000_000);
    expect(result.annualRentTotal).toBe(12_000_000);
    expect(result.mortgageSetAmount).toBe(70_000_000);
    expect(result.marketValueAtTransfer).toBe(600_000_000);
    expect(result.marketValueAtAcquisition).toBe(400_000_000);
  });

  it("[BG-E2] donorRelation·isGenerationSkip·isMinorDonee·isFiledOnTime 보존", () => {
    const asset = makeBase({
      bgDonorRelation: "lineal_ascendant_adult",
      bgIsGenerationSkip: true,
      bgIsMinorDonee: false,
      bgIsFiledOnTime: false,
    });
    const result: BurdenedGiftInfoPayload = buildBurdenedGiftInfo(asset);
    expect(result.donorRelation).toBe("lineal_ascendant_adult");
    expect(result.isGenerationSkip).toBe(true);
    expect(result.isMinorDonee).toBeUndefined(); // false || undefined = undefined
    expect(result.isFiledOnTime).toBe(false);
  });

  it("[BG-E3] bgIsFiledOnTime=true → isFiledOnTime undefined (코드 라인 84: === false ? false : undefined)", () => {
    /**
     * 라인 84: isFiledOnTime: primary.bgIsFiledOnTime === false ? false : undefined
     * bgIsFiledOnTime=true → undefined (엔진 default=신고 처리).
     * bgIsFiledOnTime=false → false (명시적 미신고).
     */
    const assetTrue = makeBase({ bgIsFiledOnTime: true });
    const assetFalse = makeBase({ bgIsFiledOnTime: false });
    expect(buildBurdenedGiftInfo(assetTrue).isFiledOnTime).toBeUndefined();
    expect(buildBurdenedGiftInfo(assetFalse).isFiledOnTime).toBe(false);
  });

  it("[BG-E4] bgMortgageSetAmount 빈 문자열 → mortgageSetAmount undefined", () => {
    const asset = makeBase({ bgMortgageSetAmount: "" });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.mortgageSetAmount).toBeUndefined();
  });

  it("[BG-E5] bgMarketValueAtTransfer 빈 문자열 → marketValueAtTransfer undefined", () => {
    const asset = makeBase({ bgMarketValueAtTransfer: "" });
    const result = buildBurdenedGiftInfo(asset);
    expect(result.marketValueAtTransfer).toBeUndefined();
  });
});
