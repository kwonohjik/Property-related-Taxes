/**
 * anchor: 자산 종류를 주택에서 다른 것으로 바꾸면 주택 전용 플래그가 남지 않는다 — UI 리뷰 高.
 *
 * `isMixedUseHouse`·`hasNonHousingConversion`의 **유일한 쓰기 지점**인 두 토글은
 * `AssetSectionBasic.tsx:201`의 `assetKind === "housing"` 게이트 안에 있다 — 전환 즉시
 * 끄는 수단이 사라진다. 반면 ⑧은 자산 종류를 보지 않는다
 * (`transfer-tax-validate-acquisition.ts:305`).
 *
 * 실측(2026-09-07) — 주택에서 토지로 바꾼 뒤 플래그가 남으면:
 *   `isMixedUseHouse`        → 「주택 연면적(㎡)을 입력하세요」
 *   `hasNonHousingConversion` → 「사실상 주거용 사용 개시일을 입력하세요」
 * 둘 다 입력칸이 **housing 전용 패널** 안이라 화면에 없다 ⇒ 계산이 영구 차단됐다.
 */
import { describe, it, expect } from "vitest";
import { housingFlagResetPatchForAssetKind } from "@/components/calc/transfer/asset-sections/housing-flag-reset";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 계산 가능한 최소 입력을 갖춘 자산 — 남는 오류는 플래그 잔존 때문임을 격리한다. */
function ready(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    acquisitionDate: "2015-01-01",
    acquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
    acquisitionArea: "300",
    ...over,
  } as AssetForm;
}

describe("자산 종류 전환 — 주택 전용 플래그 정리", () => {
  it("🔑 K-1: 비주택으로 바꾸면 겸용·용도변경 플래그와 종속 필드를 비운다", () => {
    const patch = housingFlagResetPatchForAssetKind("land");
    // ⚠️ `toEqual`을 쓰지 않는다 — 이 patch는 축이 늘어난다(§155⑳ 특례 초기화가
    //    2026-09-07에 합류했다). 전체 일치를 고정하면 축이 추가될 때마다 무관한 anchor가
    //    깨지고, 그 수정 과정에서 진짜 회귀를 놓치기 쉽다. **이 축의 키만** 본다.
    expect(patch).toMatchObject({
      isMixedUseHouse: false,
      hasPartialUsageChange: false,
      partialChangeDirection: "",
      hasNonHousingConversion: false,
      residentialUseStartDate: "",
    });
  });

  it("K-2: 주택으로 바꿀 때는 이 축을 건드리지 않는다 (되돌리면 다시 켤 수 있다)", () => {
    const patch = housingFlagResetPatchForAssetKind("housing");
    for (const k of [
      "isMixedUseHouse",
      "hasPartialUsageChange",
      "partialChangeDirection",
      "hasNonHousingConversion",
      "residentialUseStartDate",
    ]) {
      expect(patch).not.toHaveProperty(k);
    }
  });

  it("🔑 K-3: 전환 patch를 적용하면 겸용 dead-end가 사라진다", () => {
    const stale = ready({ assetKind: "land", isMixedUseHouse: true });
    // 종전: 화면에 없는 「주택 연면적」을 요구한다.
    expect(validateAssetAcquisition(stale, "자산 1", "2024-06-01")).toContain("주택 연면적");

    const cleaned = { ...stale, ...housingFlagResetPatchForAssetKind("land") } as AssetForm;
    expect(validateAssetAcquisition(cleaned, "자산 1", "2024-06-01")).not.toContain("주택 연면적");
  });

  it("🔑 K-4: 용도변경 dead-end도 사라진다", () => {
    const stale = ready({ assetKind: "land", hasNonHousingConversion: true });
    expect(validateAssetAcquisition(stale, "자산 1", "2024-06-01")).toContain(
      "주거용 사용 개시일",
    );

    const cleaned = { ...stale, ...housingFlagResetPatchForAssetKind("land") } as AssetForm;
    expect(validateAssetAcquisition(cleaned, "자산 1", "2024-06-01")).not.toContain(
      "주거용 사용 개시일",
    );
  });

  it("K-5: 주택 자산의 겸용 검증은 그대로다 (회귀 가드 — 축을 죽인 게 아니다)", () => {
    const housing = ready({ assetKind: "housing", isMixedUseHouse: true });
    expect(validateAssetAcquisition(housing, "자산 1", "2024-06-01")).toContain("주택 연면적");
  });
});
