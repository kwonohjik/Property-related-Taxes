/**
 * anchor ④ — 일반건물 × 지분 분할 **API 변환** 계약.
 *
 * 설계: `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md` D2·D3
 *
 * 고정 계약:
 *   GBF-05  파트별 실가 취득가액·직접경비가 **× 지분율**로 축소된다 (100% 기준 입력 전제)
 *   GBF-16  **기준시가·면적은 스케일하지 않는다** — 개산공제 이중 축소 방지
 *   GBF-17  물건-수준 필드가 primary에서 복사돼 **전 지분 동일**해진다 (Zod superRefine 통과 조건)
 *   GBF-18  진입 조건 미충족 시 `undefined` — 기존 경로 회귀 0
 *   GBF-19  폼 필드 ↔ payload 키 **매핑 개수 가드**
 *
 * ⚠️ ×r 계약이 **여기**에 있는 이유: 변환은 ④ API 계층이 한다(설계 D3).
 *    UI 안내문 「모든 금액을 100% 기준으로 입력하세요」와 같은 계층이어야 3중 mirror가 성립하고,
 *    기존 지분 경로(`transfer-tax-api-helpers.ts:548,607`)도 클라에서 스케일한다.
 *    route는 받은 값을 그대로 쓴다 — `__tests__/api/transfer.route.gb-fractional.predo.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingShares,
  applyShareScale,
  mergeGbPropertyLevel,
  GB_PROPERTY_LEVEL_FORM_FIELD_COUNT,
} from "@/lib/calc/transfer-tax-api-gb-shares";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2024-03-01";

function gbShare(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    // 물건-수준
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    // 지분-수준 취득측
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

const A = gbShare({ assetId: "a", ownershipNumerator: "60", ownershipDenominator: "100" });
const B = gbShare({
  assetId: "b",
  acquisitionDate: "2015-03-01",
  ownershipNumerator: "40",
  ownershipDenominator: "100",
  gbAcqLandPricePerSqm: "1,500,000",
  gbAcqBuildingValue: "150,000,000",
});

describe("④ 일반건물 지분 분할 — API 변환 anchor", () => {
  // ══════════════════════════════════════════════════════════════════
  // GBF-05 — 파트별 실가 취득가액 × 지분율
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-05: 100% 기준 입력값이 지분율만큼 축소된다", () => {
    const B_ACTUAL = gbShare({
      assetId: "b",
      acquisitionDate: "2015-03-01",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
      gbAcqLandPricePerSqm: "1,500,000",
      gbAcqBuildingValue: "150,000,000",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: "300,000,000", // 물건 전체(100%) 기준
      buildingAcquisitionPrice: "200,000,000",
    });

    it("토지 실가 300,000,000 × 40% → 120,000,000", () => {
      const shares = buildGeneralBuildingShares([A, B_ACTUAL], TRANSFER_DATE);
      expect(shares).toBeDefined();
      expect(shares![1].valuation.landAcquisitionPrice).toBe(120_000_000);
    });

    it("건물 실가 200,000,000 × 40% → 80,000,000", () => {
      const shares = buildGeneralBuildingShares([A, B_ACTUAL], TRANSFER_DATE);
      expect(shares![1].valuation.buildingAcquisitionPrice).toBe(80_000_000);
    });

    it("지분율 1(단독)이면 스케일하지 않는다 — 회귀 0", () => {
      const v = { landAcquisitionPrice: 300_000_000 };
      expect(applyShareScale(v, 1).landAcquisitionPrice).toBe(300_000_000);
    });

    it("floor 절사 — 1/3 지분에서 원 단위 내림", () => {
      const v = { landAcquisitionPrice: 1_000_000_000 };
      expect(applyShareScale(v, 1 / 3).landAcquisitionPrice).toBe(333_333_333);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-16 — 🔴 기준시가·면적은 스케일 **금지**
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-16: 기준시가·면적 스케일 금지 (개산공제 이중 축소 방지)", () => {
    /**
     * 🔑 **부정 단언에는 양성 대조군이 필요하다**
     * (메모리 `feedback_negative_assertion_needs_mutation_probe`).
     * 같은 호출에서 파트 취득가액은 **줄어야** 하므로, 스케일 자체는 동작하고 있다.
     */
    const v = {
      landArea: 100,
      buildingArea: 200,
      buildingFootprintArea: 50,
      transferLandPricePerSqm: 2_000_000,
      transferBuildingStdPrice: 200_000_000,
      acquisitionLandPricePerSqm: 1_000_000,
      acquisitionBuildingStdPrice: 100_000_000,
      landAcquisitionPrice: 300_000_000, // 양성 대조군 — 이건 줄어야 한다
    };
    const scaled = applyShareScale(v, 0.6);

    it("양성 대조군 — 파트 취득가액은 줄어든다", () => {
      expect(scaled.landAcquisitionPrice).toBe(180_000_000);
    });

    it("면적 3종은 그대로", () => {
      expect(scaled.landArea).toBe(100);
      expect(scaled.buildingArea).toBe(200);
      expect(scaled.buildingFootprintArea).toBe(50);
    });

    it("양도시·취득시 기준시가는 그대로 (환산 산식에서 약분 + 개산공제 base는 ownershipRatio가 담당)", () => {
      expect(scaled.transferLandPricePerSqm).toBe(2_000_000);
      expect(scaled.transferBuildingStdPrice).toBe(200_000_000);
      expect(scaled.acquisitionLandPricePerSqm).toBe(1_000_000);
      expect(scaled.acquisitionBuildingStdPrice).toBe(100_000_000);
    });

    it("증축 — 기준시가 2필드는 그대로, 실가 2필드만 축소", () => {
      const withExt = applyShareScale(
        {
          extensionInfo: {
            transferExtensionBuildingStdPrice: 50_000_000,
            acquisitionExtensionBuildingStdPrice: 30_000_000,
            actualAcquisitionPrice: 100_000_000,
            actualExpenses: 10_000_000,
          },
        },
        0.6,
      );
      const ext = withExt.extensionInfo as Record<string, number>;
      expect(ext.transferExtensionBuildingStdPrice).toBe(50_000_000);
      expect(ext.acquisitionExtensionBuildingStdPrice).toBe(30_000_000);
      expect(ext.actualAcquisitionPrice).toBe(60_000_000);
      expect(ext.actualExpenses).toBe(6_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-17 — 물건-수준 병합 (Zod superRefine 통과 조건)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-17: 물건-수준 필드가 primary에서 복사된다", () => {
    it("지분 카드가 자기 값을 갖고 있어도 primary 값으로 덮인다", () => {
      const dirty = gbShare({
        assetId: "b",
        ownershipNumerator: "40",
        ownershipDenominator: "100",
        gbLandArea: "999", // 지분 카드에 남아 있던 stale 값
        gbTransferBuildingValue: "1",
      });
      const merged = mergeGbPropertyLevel(dirty, A);
      expect(merged.gbLandArea).toBe("100");
      expect(merged.gbTransferBuildingValue).toBe("200,000,000");
    });

    it("취득측(지분 고유)은 병합하지 않는다", () => {
      const merged = mergeGbPropertyLevel(B, A);
      expect(merged.acquisitionDate).toBe("2015-03-01");
      expect(merged.gbAcqLandPricePerSqm).toBe("1,500,000");
      expect(merged.gbAcqBuildingValue).toBe("150,000,000");
    });

    it("전 지분의 물건-수준 payload가 동일해진다 (superRefine 통과 조건)", () => {
      const shares = buildGeneralBuildingShares([A, B], TRANSFER_DATE)!;
      for (const k of [
        "landArea",
        "buildingArea",
        "buildingFootprintArea",
        "transferLandPricePerSqm",
        "transferBuildingStdPrice",
        "zoneType",
      ]) {
        expect(shares[1].valuation[k], k).toEqual(shares[0].valuation[k]);
      }
    });

    it("지분-수준 payload는 달라진다 — 병합이 과하지 않았다는 대조군", () => {
      const shares = buildGeneralBuildingShares([A, B], TRANSFER_DATE)!;
      expect(shares[1].valuation.acquisitionLandPricePerSqm).not.toBe(
        shares[0].valuation.acquisitionLandPricePerSqm,
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-18 — 진입 조건 (회귀 0)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-18: 진입 조건 미충족 시 undefined", () => {
    it("자산 1건 → undefined (기존 단건 경로)", () => {
      expect(buildGeneralBuildingShares([A], TRANSFER_DATE)).toBeUndefined();
    });

    it("일반건물이 아니면 → undefined", () => {
      const h = gbShare({ assetKind: "housing", ownershipNumerator: "60", ownershipDenominator: "100" });
      const h2 = gbShare({ assetKind: "housing", ownershipNumerator: "40", ownershipDenominator: "100" });
      expect(buildGeneralBuildingShares([h, h2], TRANSFER_DATE)).toBeUndefined();
    });

    it("전 자산이 fractional이 아니면(함께양도) → undefined", () => {
      const full = gbShare({ assetId: "x", ownershipNumerator: "100", ownershipDenominator: "100" });
      expect(buildGeneralBuildingShares([full, B], TRANSFER_DATE)).toBeUndefined();
    });

    it("정상 조합 → 배열 2건 (양성 대조군)", () => {
      expect(buildGeneralBuildingShares([A, B], TRANSFER_DATE)).toHaveLength(2);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-19 — 매핑 개수 가드
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-19: 물건-수준 필드 목록 개수 가드", () => {
    /**
     * 목록에서 필드가 조용히 빠지면 그 값이 지분마다 달라져 **Zod superRefine이 400을 던지거나**,
     * 반대로 검증이 약해진다. 필드를 늘리면 이 숫자도 함께 갱신할 것
     * (메모리 `project_non_housing_to_housing_conversion`의 Pick 계약 개수 가드).
     */
    it("32개", () => {
      // 2026-08-11: §104③ 미등기 2필드(gbLandUnregistered·gbBuildingUnregistered) 추가 → 30 → 32
      expect(GB_PROPERTY_LEVEL_FORM_FIELD_COUNT).toBe(32);
    });
  });
});
