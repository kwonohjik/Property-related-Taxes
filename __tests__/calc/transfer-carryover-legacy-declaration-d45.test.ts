// D45 · Q-3 — 옛 이력의 「②2호 자기선언」 → 레거시 플래그 (③ normalize · ④ API 변환).
// 판별은 값 비교가 아니라 **옛 필드의 존재**로만 한다 — 새 폼에는 옛 필드도, 플래그를 세우는 UI도 없다.
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { buildCarryoverPayload } from "@/lib/calc/transfer-tax-api-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

/** 옛 record의 자산 — `exclusionDeclared.oneHouseExemptionApplies`가 있던 시절의 모양 */
function oldAsset(oneHouseExemptionApplies: boolean) {
  return {
    assetId: "a1",
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    carryover: {
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2000-06-01",
      donorAcquisitionPrice: "10,000,000",
      giftTaxAmount: "0",
      giftDateValuation: "1,500,000,000",
      donorRelation: "spouse",
      donorDeceased: false,
      exclusionDeclared: {
        expropriationWithin2Years: false,
        oneHouseExemptionApplies,
        isFamilyBusinessInheritedAsset: false,
      },
    },
  };
}

/** ④ 결과 중 이 테스트가 보는 두 축만 — 반환 타입이 `object`라 좁혀 읽는다. */
const payload = (a: ReturnType<typeof migrateAsset>) =>
  buildCarryoverPayload(a, "2026-02-16", 1)!.carryoverTaxation as {
    spouseGiftOneHouseAtGiftDate?: boolean;
    exclusionDeclared: { legacyOneHouseExemptionDeclared?: boolean };
  };

describe("D45 레거시 선언 — ③·④", () => {
  it("D45-L1 옛 record(true) → 레거시 플래그 true → ④가 엔진에 싣는다", () => {
    const a = migrateAsset(oldAsset(true));
    expect(a.carryover?.exclusionDeclared.legacyOneHouseExemptionDeclared).toBe(true);
    expect(payload(a).exclusionDeclared.legacyOneHouseExemptionDeclared).toBe(true);
  });

  it("D45-L2 「자동 판정으로 전환」(false) 후 재저장·재로드해도 다시 붙지 않는다", () => {
    const a = migrateAsset(oldAsset(true));
    a.carryover!.exclusionDeclared = { ...a.carryover!.exclusionDeclared, legacyOneHouseExemptionDeclared: false };
    // 재저장 = 새 폼 모양 그대로 저장 → 재로드 = migrate 재통과
    const reloaded = migrateAsset(JSON.parse(JSON.stringify(a)));
    expect(reloaded.carryover?.exclusionDeclared.legacyOneHouseExemptionDeclared).toBe(false);
    expect(payload(reloaded).exclusionDeclared.legacyOneHouseExemptionDeclared).toBeUndefined();
  });

  it("D45-L3 음성 짝 — 옛 record(false)·새 폼 기본값은 플래그가 생기지 않는다", () => {
    expect(migrateAsset(oldAsset(false)).carryover?.exclusionDeclared.legacyOneHouseExemptionDeclared).toBe(false);
    expect(CARRYOVER_DEFAULTS.exclusionDeclared.legacyOneHouseExemptionDeclared).toBe(false);
    expect("oneHouseExemptionApplies" in CARRYOVER_DEFAULTS.exclusionDeclared).toBe(false);
  });
});

describe("D45 배우자 예외 사실 — ③·④", () => {
  it("D45-S1 ③ 옛 record에는 없으므로 false · ④는 배우자 + true일 때만 싣는다(관계 stale 가드)", () => {
    const a = migrateAsset(oldAsset(false));
    expect(a.carryover?.spouseGiftOneHouseAtGiftDate).toBe(false);

    a.carryover!.spouseGiftOneHouseAtGiftDate = true;
    expect(payload(a).spouseGiftOneHouseAtGiftDate).toBe(true);

    a.carryover!.donorRelation = "lineal";
    expect(payload(a).spouseGiftOneHouseAtGiftDate).toBeUndefined();
  });
});
