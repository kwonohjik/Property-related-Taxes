/**
 * G1 — 일반건물 **건물만** 이월과세: 증여 사건 정보의 출처 (2026-09-30)
 *
 * 토지가 이월과세가 아니면 화면에 토지 이월과세 블록이 없다. 사용자가 등기접수일·산출세액·
 * 과세가액·관계를 넣을 수 있는 곳은 건물 블록 하나뿐이고, 그 편집은 `buildingCarryover`로 간다.
 * 종전 ⑧은 `carryover`(토지)만 읽어 「증여 등기접수일을 입력하세요」로 영구 차단했고,
 * ④도 같은 곳만 읽어 검증을 풀어도 이월과세가 조용히 미발동했다.
 *
 * ⇒ ④·⑧이 `gbCarryoverEventSource` **한 함수**로 출처를 정한다.
 * E2E 짝: `e2e/transfer-dead-end-defects.spec.ts` G1.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  buildGbCarryoverPayload,
  gbCarryoverEventSource,
} from "@/lib/calc/transfer-tax-api-gb-carryover";
import { validateGbCarryover } from "@/lib/calc/transfer-tax-validate-gb-carryover";

const part = (over: Record<string, unknown> = {}) => ({
  ...CARRYOVER_DEFAULTS,
  donorAcquisitionDate: "2010-01-01",
  donorRelation: "spouse" as const,
  giftDateValuation: "300000000",
  donorAcquisitionPrice: "200000000",
  ...over,
});

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "carryover_gift",
    // 토지가 이월과세가 아니면 세션 복원이 `carryover`를 기본값으로 되돌린다(`migrateCarryoverFields`)
    carryover: { ...CARRYOVER_DEFAULTS },
    buildingCarryover: part({ giftRegistryDate: "2020-01-01" }),
    ...over,
  } as AssetForm;
}

describe("출처 — gbCarryoverEventSource", () => {
  it("건물만 이월과세면 건물 블록(buildingCarryover)", () => {
    const a = asset();
    expect(gbCarryoverEventSource(a)).toBe(a.buildingCarryover);
  });

  it("토지도 이월과세면 토지 블록(carryover) — 건물 블록의 같은 칸은 쓰지 않는다", () => {
    const a = asset({
      acquisitionCause: "carryover_gift",
      carryover: part({ giftRegistryDate: "2019-05-05" }),
      buildingCarryover: part({ giftRegistryDate: "2001-01-01" }),
    });
    expect(gbCarryoverEventSource(a)).toBe(a.carryover);
  });
});

describe("⑧ validateGbCarryover — 건물만 이월과세", () => {
  it("건물 블록에 사건 정보가 다 있으면 통과", () => {
    expect(validateGbCarryover(asset(), "자산")).toBeNull();
  });

  it("건물 블록의 등기접수일이 비면 그 칸을 요구한다 (긍정 짝)", () => {
    const a = asset({ buildingCarryover: part({ giftRegistryDate: "" }) });
    expect(validateGbCarryover(a, "자산")).toMatch(/증여 등기접수일을 입력하세요/);
  });

  it("건물 블록의 관계 「그 외」는 §97의2① 요건으로 막는다", () => {
    const a = asset({ buildingCarryover: part({ giftRegistryDate: "2020-01-01", donorRelation: "other" }) });
    expect(validateGbCarryover(a, "자산")).toMatch(/배우자 또는 직계존비속/);
  });

  it("Σ 검증도 건물 블록의 과세가액을 분모로 쓴다", () => {
    const a = asset({
      buildingCarryover: part({ giftRegistryDate: "2020-01-01", giftTaxCalculated: "10000000", giftTaxBase: "100000000" }),
    });
    expect(validateGbCarryover(a, "자산")).toMatch(/증여세 과세가액\(100,000,000원\)을 초과/);
  });
});

describe("④ buildGbCarryoverPayload — 건물만 이월과세", () => {
  it("legacy 경로 — 건물 서브객체가 실린다 (종전: {} → 조용히 미발동)", () => {
    const p = buildGbCarryoverPayload(asset());
    expect(p.buildingCarryoverTaxation?.giftRegistryDate).toBe("2020-01-01");
    expect(p.buildingCarryoverTaxation?.donorRelation).toBe("spouse");
    expect(p.landCarryoverTaxation).toBeUndefined();
  });

  it("안분 경로 — 사건 1벌이 건물 블록 값으로 만들어진다", () => {
    const p = buildGbCarryoverPayload(
      asset({
        buildingCarryover: part({ giftRegistryDate: "2020-01-01", giftTaxCalculated: "30000000", giftTaxBase: "300000000" }),
      }),
    );
    expect(p.carryoverGiftEvent).toMatchObject({
      giftRegistryDate: "2020-01-01",
      giftTaxCalculated: 30000000,
      giftTaxBase: 300000000,
      donorRelation: "spouse",
    });
    expect(p.buildingCarryoverPart?.giftDateAssetValue).toBe(300000000);
    expect(p.landCarryoverPart).toBeUndefined();
  });
});
