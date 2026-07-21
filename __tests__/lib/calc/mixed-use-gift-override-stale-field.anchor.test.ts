/**
 * anchor: 겸용 §163⑨ reported override는 **현재 취득원인에 종속** 선택된다(stale 필드 우선 방지).
 *
 * 배경(코드리뷰 High #1): 상속↔증여 취득원인 전환 시 반대편 override 폼필드는 클리어되지 않는다
 * (CompanionAcquisitionCauseSection의 onChange는 acquisitionCause만 변경). 초기 구현의 blind
 * `||` merge(`mixedHousingInheritedValueOverride || mixedHousingGiftValueOverride`)는 항상 앞의
 * 상속 값을 먼저 채택 → 실제 취득원인(증여)과 무관하게 stale 상속 신고가액이 조용히 소비되어 무증상 오세액.
 *
 * 수정: acquisitionCause === "gift"면 gift 필드, 아니면 상속 필드를 명시 선택.
 */
import { describe, it, expect } from "vitest";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    acquisitionDate: "2020-06-01",
    ...over,
  };
}
const form = { transferDate: "2026-06-01", assets: [] } as unknown as TransferFormData;
const payload = (a: AssetForm) =>
  buildMixedUsePayload(a, form) as Record<string, unknown> | undefined;

describe("겸용 §163⑨ reported override 취득원인 종속 선택 (stale 필드 방지)", () => {
  it("증여 + stale 상속필드 잔존 → gift 필드(600M) 채택, stale 상속값(550M) 무시", () => {
    const p = payload(
      asset({
        acquisitionCause: "gift",
        mixedHousingGiftValueOverride: "600000000",
        mixedCommercialGiftValueOverride: "300000000",
        // 이전 상속 선택 시 입력했던 stale 값 (클리어 안 됨)
        mixedHousingInheritedValueOverride: "550000000",
        mixedCommercialInheritedValueOverride: "250000000",
      }),
    );
    expect(p?.acquisitionByGift).toBe(true);
    expect(p?.acquisitionByInheritance).toBe(false);
    expect(p?.housingInheritedValue).toBe(600_000_000);
    expect(p?.commercialInheritedValue).toBe(300_000_000);
  });

  it("상속 + stale 증여필드 잔존 → 상속 필드(550M) 채택, stale 증여값(600M) 무시", () => {
    const p = payload(
      asset({
        acquisitionCause: "inheritance",
        mixedHousingInheritedValueOverride: "550000000",
        mixedHousingGiftValueOverride: "600000000", // stale
      }),
    );
    expect(p?.acquisitionByInheritance).toBe(true);
    expect(p?.acquisitionByGift).toBe(false);
    expect(p?.housingInheritedValue).toBe(550_000_000);
  });
});
