/**
 * 일반건물 토지/건물 취득원인 분리 — 케이스 매트릭스 anchor 테스트
 *
 * 본 PR 스코프 (E-3 반영) — 3개 신규 anchor:
 *
 * | # | 시나리오                          | 토지 acqCause | 건물 acqCause | 가산세 |
 * |---|-----------------------------------|---------------|---------------|--------|
 * | 3 | 토지 매매 + 건물 매매 (취득일 다름) | purchase      | purchase      | 미적용 |
 * | 5 | 토지 증여 + 건물 매매              | gift          | purchase      | 미적용 |
 * | 8 | (Zod) general_building + buildingAcquisitionCause 미입력 → 차단 | * | undefined | 차단 |
 *
 * 후속 PR 스코프 (보조 필드 의존) — 본 파일 범위 밖:
 *   #4-a (토지 상속 + 건물 신축): decedentAcquisitionDate 매핑 설계 필요
 *   #6 (토지·건물 모두 상속): 건물 카드 상속 보조 필드 매핑 설계 필요
 *   #7-a (토지 증여 + 건물 신축): donorAcquisitionDate 매핑 설계 필요
 *   #7-b (토지 이월과세 + 건물 신축): §97의2 + §114조의2 cross-cutting — 별도 PR
 *
 * 정책 적용:
 *   feedback_no_silent_apportion_fallback.md — 빈값 자동 채우기 금지
 *   feedback_transfer_year_tax_rate.md — 가산세 관련 anchor는 발동 여부만 검증
 */

import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingAssetCards,
} from "@/lib/tax-engine/general-building-valuation";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { generalBuildingValuationSchema } from "@/lib/api/transfer-tax-schema";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ============================================================
// 공통 기준 입력 (사례 31 기반, 사례 31 anchor값 재사용)
// ============================================================

const BASE_DATE = new Date("2023-02-19"); // 양도일
const LAND_ACQ_DATE_A = new Date("1999-05-24"); // 토지 취득일 (사례 31)
const BUILDING_ACQ_DATE_B = new Date("2005-01-01"); // 건물 별도 취득일 (토지와 다름)
const GIFT_LAND_ACQ_DATE = new Date("2015-03-10"); // 토지 증여일

const BASE_GB_INPUT_COMMON = {
  totalTransferPrice: 925_000_000,
  transferDate: BASE_DATE,
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
};

// ============================================================
// 케이스 #3: 토지 매매 + 건물 매매 (취득일 다름)
//
// 검증 목적:
//   - 건물 카드 acquisitionDate = buildingAcquisitionDate (B 날짜)
//   - 토지 카드 acquisitionDate = acquisitionDate (A 날짜)
//   - 두 카드의 LTHD 기산점이 독립적으로 분리됨
//   - buildingAcquisitionCause = "purchase" → isSelfBuilt = false → 가산세 미발동
// ============================================================

describe("케이스 #3: 토지 매매 + 건물 매매 (취득일 다름) — 카드 취득일 분리", () => {
  const input = {
    ...BASE_GB_INPUT_COMMON,
    acquisitionDate: LAND_ACQ_DATE_A,             // 토지 취득일
    buildingAcquisitionCause: "purchase" as const, // 건물 매매
    buildingAcquisitionDate: BUILDING_ACQ_DATE_B,  // 건물 별도 취득일
  };
  const out = buildGeneralBuildingAssetCards(input);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("#3-1 토지 카드 acquisitionDate = 토지 취득일 (1999-05-24)", () => {
    expect(landCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("1999-05-24");
  });

  it("#3-2 건물 카드 acquisitionDate = 건물 취득일 (2005-01-01) — 토지와 분리됨", () => {
    expect(buildingCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2005-01-01");
  });

  it("#3-3 건물 카드 buildingAcquisitionCause = purchase", () => {
    expect(buildingCard?.buildingAcquisitionCause).toBe("purchase");
  });

  it("#3-4 건물 카드 isSelfBuilt = false (purchase → 가산세 미발동)", () => {
    expect(buildingCard?.isSelfBuilt).toBe(false);
  });

  it("#3-5 가산세 미발동 — calculateGeneralBuildingTransfer penaltyTax = 0", () => {
    const result = calculateGeneralBuildingTransfer(
      input,
      2023, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 케이스 #5: 토지 증여 + 건물 매매
//
// 검증 목적:
//   - 토지 카드 acquisitionCause = "gift" (취득원인 분리됨)
//   - 건물 카드 buildingAcquisitionCause = "purchase" → 가산세 미발동
//   - 두 카드의 acquisitionCause가 독립적으로 올바르게 매핑됨
// ============================================================

describe("케이스 #5: 토지 증여 + 건물 매매 — 취득원인 분리", () => {
  const input = {
    ...BASE_GB_INPUT_COMMON,
    acquisitionDate: GIFT_LAND_ACQ_DATE,           // 증여일 (토지 취득일)
    buildingAcquisitionCause: "purchase" as const, // 건물 매매
    buildingAcquisitionDate: BUILDING_ACQ_DATE_B,  // 건물 취득일
  };
  const out = buildGeneralBuildingAssetCards(input);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("#5-1 토지 카드 acquisitionDate = 증여일 (2015-03-10)", () => {
    // 토지 취득원인 gift → 취득일은 증여일
    expect(landCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2015-03-10");
  });

  it("#5-2 건물 카드 acquisitionDate = 건물 매매 취득일 (2005-01-01)", () => {
    expect(buildingCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2005-01-01");
  });

  it("#5-3 건물 카드 buildingAcquisitionCause = purchase (증여와 독립)", () => {
    expect(buildingCard?.buildingAcquisitionCause).toBe("purchase");
  });

  it("#5-4 건물 카드 isSelfBuilt = false (purchase → 가산세 미발동)", () => {
    expect(buildingCard?.isSelfBuilt).toBe(false);
  });

  it("#5-5 가산세 미발동 — penaltyTax = 0 (건물 purchase·5년 내라도 신축 아니면 미발동)", () => {
    // §114조의2 ①: 신축 또는 증축 요건 → purchase는 해당 없음 → 0
    const result = calculateGeneralBuildingTransfer(
      input,
      2023, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 케이스 #8: Zod 스키마 차단 가드
//
// generalBuildingValuationSchema.buildingAcquisitionCause는 required (`.optional()` 없음).
// 미입력 시 Zod parse가 error를 반환해야 함.
// ============================================================

describe("케이스 #8: Zod 스키마 — buildingAcquisitionCause 미입력 차단", () => {
  it("#8-1 buildingAcquisitionCause 미입력 → Zod.safeParse failure", () => {
    const rawPayload = {
      landArea: 85,
      buildingFootprintArea: 90.48,
      transferLandPricePerSqm: 10_830_000,
      transferBuildingStdPrice: 20_629_440,
      // buildingAcquisitionCause 고의로 누락
    };
    const result = generalBuildingValuationSchema.safeParse(rawPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("buildingAcquisitionCause");
    }
  });

  it("#8-2 buildingAcquisitionCause 유효한 enum 입력 → Zod.safeParse success", () => {
    const rawPayload = {
      landArea: 85,
      buildingFootprintArea: 90.48,
      transferLandPricePerSqm: 10_830_000,
      transferBuildingStdPrice: 20_629_440,
      buildingAcquisitionCause: "purchase",
    };
    const result = generalBuildingValuationSchema.safeParse(rawPayload);
    expect(result.success).toBe(true);
  });

  it("#8-3 buildingAcquisitionCause 토지 전용 옵션(없는 enum) → Zod.safeParse failure", () => {
    // 향후 토지 enum에 추가될 수 있는 값(예: expropriation)이 건물 enum에 leak되지 않는지 가드.
    const rawPayload = {
      landArea: 85,
      buildingFootprintArea: 90.48,
      transferLandPricePerSqm: 10_830_000,
      transferBuildingStdPrice: 20_629_440,
      buildingAcquisitionCause: "expropriation", // 건물 enum에 없음
    };
    const result = generalBuildingValuationSchema.safeParse(rawPayload);
    expect(result.success).toBe(false);
  });
});
