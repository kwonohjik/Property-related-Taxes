/**
 * anchor: §155⑳ 장기임대 거주주택 특례가 ⑤·⑧·④에서 **같은 자산 종류 술어**를 쓴다 — UI 리뷰 高.
 *
 * 종전에는 술어가 ⑤에만 있었다(`AssetSectionExtras.tsx:28`). ⑧·④는 자산 종류를 보지 않아,
 * 주택에서 특례를 켠 뒤 종류를 바꾸면 두 갈래로 갈렸다:
 *
 * - 임대주택 행이 **비어 있으면** → 「임대주택 정보를 1호 이상 입력하세요」로 계산이 영구
 *   차단된다. 그 입력 카드는 ⑤ 게이트 밖이라 **화면에 없다**(dead-end).
 * - 행이 **채워져 있으면** → 검증을 통과해 **주택이 아닌 자산에 §155⑳ 비과세가 적용된
 *   payload**가 엔진까지 도달한다(세액 오류).
 */
import { describe, it, expect } from "vitest";
import { isRentalHousingExceptionApplicable } from "@/lib/calc/rental-housing-exception-scope";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { housingFlagResetPatchForAssetKind } from "@/components/calc/transfer/asset-sections/housing-flag-reset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 특례 ON + 임대주택 1호(요건 미완) — ⑧이 반응하는 최소 상태. */
function withException(assetKind: AssetForm["assetKind"], units: unknown[] = []): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind,
    rentalHousingException: {
      ...makeDefaultAsset(1).rentalHousingException,
      applyException: true,
      rentalUnits: units,
    },
  } as unknown as AssetForm;
}

describe("§155⑳ 자산 종류 술어", () => {
  it("S-1: 주택·입주권만 대상이다", () => {
    expect(isRentalHousingExceptionApplicable("housing")).toBe(true);
    expect(isRentalHousingExceptionApplicable("right_to_move_in")).toBe(true);
    for (const k of ["land", "building", "general_building", "commercial_building"] as const) {
      expect(isRentalHousingExceptionApplicable(k)).toBe(false);
    }
  });

  it("🔑 S-2: (a) 비주택 + 행 비어 있음 → 화면에 없는 카드를 요구하지 않는다", () => {
    const form = { transferDate: "2024-06-01" } as never;
    // 주택이면 종전대로 요구한다(축을 죽인 게 아니다).
    expect(
      validateRentalHousingException(
        withException("housing").rentalHousingException,
        withException("housing"),
        "자산 1",
        "2024-06-01",
      ),
    ).toContain("임대주택 정보를 1호 이상");
    void form;
    // 비주택이면 검증 자체가 해당 없음 — dead-end가 사라진다.
    expect(
      validateRentalHousingException(
        withException("land").rentalHousingException,
        withException("land"),
        "자산 1",
        "2024-06-01",
      ),
    ).toBeNull();
  });

  it("🔑 S-3: (b) 비주택 + 행 채워짐 → payload를 보내지 않는다 (세액 오류 차단)", () => {
    const unit = {
      businessRegistrationDate: "2018-01-01",
      rentalRegistrationDate: "2018-01-01",
      rentalCategory: "long_general",
      rentalAcquisitionType: "purchase",
      rentalInputMode: "direct",
    };
    expect(toRentalHousingExceptionApi(withException("land", [unit]))).toBeUndefined();
    // 주택이면 종전대로 payload가 나간다.
    expect(toRentalHousingExceptionApi(withException("housing", [unit]))).toBeDefined();
  });

  it("S-4: 자산 종류 전환 patch가 특례 값을 초기화한다 (입주권은 유지)", () => {
    expect(housingFlagResetPatchForAssetKind("land")).toHaveProperty("rentalHousingException");
    expect(housingFlagResetPatchForAssetKind("right_to_move_in")).not.toHaveProperty(
      "rentalHousingException",
    );
    expect(housingFlagResetPatchForAssetKind("housing")).not.toHaveProperty(
      "rentalHousingException",
    );
  });
});
