/**
 * DD 배선 — 이월과세 증여자 사망 배제(§97의2①)의 ④⑧⑫ 동기화 지점.
 *
 * 엔진 판정은 `__tests__/tax-engine/transfer-tax/carryover-donor-death.anchor.test.ts`.
 * 여기서는 **값이 엔진까지 도달하는가**만 본다 — ⑫ Zod가 strip하면 세액이 조용히 안 바뀐다
 * (memory `feedback_api_zod_schema_sync`).
 */

import { describe, it, expect } from "vitest";
import { buildCarryoverPayload } from "@/lib/calc/transfer-tax-api-carryover";
import { buildGbCarryoverPayload } from "@/lib/calc/transfer-tax-api-gb-carryover";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/** payload 반환 타입이 `object`라 키 접근을 위해 좁힌다. */
const rec = (v: unknown) => (v ?? {}) as Record<string, unknown>;

function makeCarryoverForm(over: Partial<CarryoverTaxationForm> = {}): CarryoverTaxationForm {
  return {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2023-06-01",
    donorAcquisitionDate: "2010-01-01",
    donorAcquisitionPrice: "300000000",
    giftDateValuation: "700000000",
    ...over,
  };
}

/** 이월과세 폼이 채워진 자산 — 관계·사망만 케이스별로 갈아끼운다. */
function makeCarryoverAsset(over: Partial<CarryoverTaxationForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    acquisitionCause: "carryover_gift",
    carryover: makeCarryoverForm(over),
  };
}

// ────────────────────────────────────────────────────────────
// ④ API 변환 — 일반 경로
// ────────────────────────────────────────────────────────────

describe("DD-W ④: 일반 경로 payload", () => {
  it("DD-W-01: 관계·사망이 payload에 실린다", () => {
    const r = buildCarryoverPayload(
      makeCarryoverAsset({ donorRelation: "spouse", donorDeceased: true }),
      "2030-05-31",
    );
    expect(rec(r?.carryoverTaxation).donorRelation).toBe("spouse");
    expect(rec(r?.carryoverTaxation).donorDeceased).toBe(true);
  });

  it("DD-W-02: 미선택·미사망은 전송하지 않는다 (엔진 기본값과 동치)", () => {
    const r = buildCarryoverPayload(makeCarryoverAsset(), "2030-05-31");
    expect(rec(r?.carryoverTaxation).donorRelation).toBeUndefined();
    expect(rec(r?.carryoverTaxation).donorDeceased).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// ④ API 변환 — 일반건물(GB). 진입점이 둘이라 **양쪽 모두** 본다.
// ────────────────────────────────────────────────────────────

describe("DD-W ④GB: 일반건물 두 진입점", () => {
  function makeGbAsset(over: Partial<CarryoverTaxationForm>, withEvent: boolean): AssetForm {
    return {
      ...makeCarryoverAsset(
        withEvent
          ? { ...over, giftTaxCalculated: "100000000", giftTaxBase: "1000000000" }
          : over,
      ),
      assetKind: "general_building",
      gbBuildingAcquisitionCause: "carryover_gift",
    };
  }

  it("DD-W-03: 사건-수준 경로 — carryoverGiftEvent에 관계·사망이 실린다", () => {
    const p = buildGbCarryoverPayload(
      makeGbAsset({ donorRelation: "spouse", donorDeceased: true }, true),
    );
    expect(p.carryoverGiftEvent).toMatchObject({
      donorRelation: "spouse",
      donorDeceased: true,
    });
  });

  it("DD-W-04: legacy 경로(신규 2칸 미입력)에도 실린다", () => {
    const p = buildGbCarryoverPayload(
      makeGbAsset({ donorRelation: "lineal", donorDeceased: true }, false),
    );
    expect(p.landCarryoverTaxation).toMatchObject({
      donorRelation: "lineal",
      donorDeceased: true,
    });
  });

  it("DD-W-05: 🔑 건물 파트도 **토지 쪽 관계**를 따른다 (증여 사건의 사실)", () => {
    // 건물 전용 폼에는 관계 입력이 없다 — 그대로 두면 건물만 배제되지 않는다.
    const asset = makeGbAsset({ donorRelation: "spouse", donorDeceased: true }, false);
    const withBuildingForm: AssetForm = {
      ...asset,
      buildingCarryover: makeCarryoverForm({
        donorAcquisitionDate: "2012-01-01",
        donorAcquisitionPrice: "200000000",
        giftDateValuation: "300000000",
      }),
    };
    const p = buildGbCarryoverPayload(withBuildingForm);
    expect(p.buildingCarryoverTaxation).toMatchObject({
      donorRelation: "spouse",
      donorDeceased: true,
    });
  });
});

// ────────────────────────────────────────────────────────────
// ⑫ Zod — strip되면 세액이 조용히 안 바뀐다
// ────────────────────────────────────────────────────────────

describe("DD-W ⑫: Zod가 관계·사망을 통과시킨다", () => {
  const base = {
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 700_000_000,
    transferDate: "2030-05-31",
    acquisitionDate: "2010-01-01",
    expenses: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2010-01-01",
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: 700_000_000,
      donorRelation: "spouse",
      donorDeceased: true,
    },
  };

  it("DD-W-06: parse 후에도 두 필드가 살아남는다", () => {
    const parsed = propertySchema.parse(base) as typeof base;
    expect(parsed.carryoverTaxation.donorRelation).toBe("spouse");
    expect(parsed.carryoverTaxation.donorDeceased).toBe(true);
  });

  it("DD-W-07: 정의되지 않은 관계값은 거부된다", () => {
    const bad = {
      ...base,
      carryoverTaxation: { ...base.carryoverTaxation, donorRelation: "sibling" },
    };
    expect(() => propertySchema.parse(bad)).toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// ⑧ validate — 관계는 **단독 필수화하지 않는다**
// ────────────────────────────────────────────────────────────

describe("DD-W ⑧: validation", () => {
  it("DD-W-08: 사망 선언 + 관계 미선택 → 차단", () => {
    const err = validateAssetAcquisition(
      makeCarryoverAsset({ donorDeceased: true }),
      "자산 1",
      "2030-05-31",
    );
    expect(err).toContain("증여자와의 관계");
  });

  it("DD-W-09: 🔑 관계 미선택이어도 사망 미선언이면 통과 [회귀 방어]", () => {
    // 구형 sessionStorage에는 이 필드가 없다 — 필수화하면 기존 이월과세가 전부 막힌다.
    const err = validateAssetAcquisition(makeCarryoverAsset(), "자산 1", "2030-05-31");
    expect(err).toBeNull();
  });

  it("DD-W-10: 관계까지 고르면 통과", () => {
    const err = validateAssetAcquisition(
      makeCarryoverAsset({ donorRelation: "spouse", donorDeceased: true }),
      "자산 1",
      "2030-05-31",
    );
    expect(err).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// RS: 대상 관계 범위 (§97의2① 본문) — 「그 외」는 이월과세가 성립하지 않는다
// ────────────────────────────────────────────────────────────

describe("RS-W: 「그 외」 관계 차단", () => {
  it("RS-W-01: 일반 경로 ⑧ — 취득원인 변경을 안내하며 차단", () => {
    const err = validateAssetAcquisition(
      makeCarryoverAsset({ donorRelation: "other" }),
      "자산 1",
      "2030-05-31",
    );
    expect(err).toContain("배우자 또는 직계존비속");
    expect(err).toContain("증여");
  });

  it("RS-W-02: 일반건물 ⑧도 같은 조건으로 차단한다 [두 경로 동기화]", () => {
    const asset: AssetForm = {
      ...makeCarryoverAsset({ donorRelation: "other" }),
      assetKind: "general_building",
      gbBuildingAcquisitionCause: "carryover_gift",
    };
    const err = validateGeneralBuildingAsset(asset, "자산 1", "2030-05-31");
    expect(err).toContain("배우자 또는 직계존비속");
  });

  it("RS-W-03: ⑫ Zod가 'other'를 통과시킨다 (엔진이 판정한다)", () => {
    const parsed = propertySchema.parse({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 700_000_000,
      transferDate: "2030-05-31",
      acquisitionDate: "2010-01-01",
      expenses: 0,
      useEstimatedAcquisition: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: false,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: "2023-06-01",
        donorAcquisitionDate: "2010-01-01",
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 700_000_000,
        donorRelation: "other",
      },
    }) as { carryoverTaxation: { donorRelation?: string } };
    expect(parsed.carryoverTaxation.donorRelation).toBe("other");
  });

  it("RS-W-04: 배우자는 두 경로 모두 통과 [양성 대조군]", () => {
    const spouse = makeCarryoverAsset({ donorRelation: "spouse" });
    expect(validateAssetAcquisition(spouse, "자산 1", "2030-05-31")).toBeNull();
  });
});
