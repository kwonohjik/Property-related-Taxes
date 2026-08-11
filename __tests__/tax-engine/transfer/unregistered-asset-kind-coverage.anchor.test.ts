/**
 * anchor U-1 / U-2 — 미등기양도자산(「소득세법」 §104③) 자산 종류별 엔진 도달 검증.
 *
 * 계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §6
 *
 * §104③은 미등기양도자산을 「제94조제1항제1호 및 제2호에서 규정하는 자산」으로 정의한다 —
 * 1호가 토지·건물이므로 **자산 종류를 가리지 않는다**. UI는 종전에 주택·토지·건물 3종만
 * 토글을 띄웠고(`Step4.tsx`), 그 게이트를 열기 전에 각 종류가 엔진에서 실제로 처리되는지
 * 확인하는 것이 이 anchor의 목적이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  buildGeneralBuildingAssetCards,
  type GeneralBuildingInput,
} from "@/lib/tax-engine/general-building-valuation";
import { buildProperties } from "@/app/api/calc/transfer/general-building-route-cards";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/**
 * 재개발/재건축 APT — 관리처분인가 전후 3분할(시행령 §166).
 *
 * ⚠️ **비과세 미해당 조건을 명시적으로 고정한다.** 재개발 APT는 주택이므로 1세대1주택 요건을
 *    충족하는 픽스처를 쓰면 비과세로 세액이 0이 되어 아래 단언이 전부 무의미해진다
 *    (§91① 배선 전에는 미등기여도 0이 나왔다 — `unregistered-91-1-exemption-bar.anchor.test.ts`).
 */
function redevApt(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_200_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2014-06-01"),
    acquisitionPrice: 600_000_000,
    // 비과세 미해당 — 다주택
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("anchor U-1 — 재개발/재건축 APT × 미등기", () => {
  it("대조군: 등기 → 누진세율 · 장특공제 적용", () => {
    const r = calculateTransferTax(redevApt({ isUnregistered: false }), rates);
    expect(r.appliedRate).not.toBe(0.7);
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("U-1: 미등기 → 70% 단일세율 · 장특공제 0 · 기본공제 0", () => {
    const r = calculateTransferTax(redevApt({ isUnregistered: true }), rates);
    expect(r.appliedRate).toBe(0.7);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("unregistered");
    expect(r.basicDeduction).toBe(0);
  });

  it("U-1b: 미등기 세액 > 등기 세액 (중과가 실제로 반영된다)", () => {
    const unreg = calculateTransferTax(redevApt({ isUnregistered: true }), rates);
    const reg = calculateTransferTax(redevApt({ isUnregistered: false }), rates);
    expect(unreg.totalTax).toBeGreaterThan(reg.totalTax);
  });
});

/**
 * U-2 — 일반건물(토지+건물 일괄)은 **bundled 경로**이고, 등기 여부를 **토지·건물 각각** 판단한다.
 *
 * 둘은 별개 부동산이고 등기부도 별도라, 건물만 미등기(무허가 신축)이고 토지는 등기된 조합이
 * 실무에서 흔하다. 그래서 자산 단위 단일 boolean이 아니라 축을 둘로 나눴다
 * (`unregisteredLand`·`unregisteredBuilding`).
 *
 * 종전에는 `general-building-route-cards.ts`가 `isUnregistered: false`를 **하드코딩**해
 * 폼에서 켜도 엔진에 도달하지 못했다(세액 변화 0의 no-op). 2026-08-11에 배선했다.
 *
 * 이 anchor가 잠그는 것 둘:
 *   ① 개산공제율(§163⑥1호 단서) — 파트별로 갈린다
 *   ② 카드→엔진 `isUnregistered` 매핑 — 토지 카드는 토지 축, 건물 카드는 건물 축
 */
describe("anchor U-2 — 일반건물 미등기: 토지·건물 축 분리", () => {
  const gbInput = (o: Partial<GeneralBuildingInput> = {}): GeneralBuildingInput => ({
    totalTransferPrice: 1_500_000_000,
    transferDate: D("2024-06-01"),
    acquisitionDate: D("2014-06-01"),
    landArea: 200,
    buildingArea: 300,
    buildingFootprintArea: 100,
    transferLandPricePerSqm: 3_000_000,
    transferBuildingStdPrice: 200_000_000,
    acquisitionLandPricePerSqm: 1_000_000,
    acquisitionBuildingStdPrice: 100_000_000,
    zoneType: "commercial",
    buildingAcquisitionCause: "purchase" as const,
    ...o,
  });

  // 취득시 base: 토지 = 1,000,000 × 200 = 200,000,000 · 건물 = 100,000,000
  const LAND_DED_REGISTERED = 6_000_000; //  200,000,000 × 3%
  const LAND_DED_UNREGISTERED = 600_000; //  200,000,000 × 0.3%
  const BLDG_DED_REGISTERED = 3_000_000; //  100,000,000 × 3%
  const BLDG_DED_UNREGISTERED = 300_000; //  100,000,000 × 0.3%

  it("U-2a: 둘 다 등기 → 토지·건물 모두 3% (종전 동작)", () => {
    const out = buildGeneralBuildingAssetCards(gbInput());
    expect(out.estimatedDeduction.land).toBe(LAND_DED_REGISTERED);
    expect(out.estimatedDeduction.building).toBe(BLDG_DED_REGISTERED);
  });

  it("U-2b: **토지만** 미등기 → 토지만 0.3%, 건물은 3% 유지", () => {
    const out = buildGeneralBuildingAssetCards(gbInput({ unregisteredLand: true }));
    expect(out.estimatedDeduction.land).toBe(LAND_DED_UNREGISTERED);
    // 축이 섞이면 이 단언이 깨진다 — 단일 율로 되돌아가는 회귀를 잡는 지점이다.
    expect(out.estimatedDeduction.building).toBe(BLDG_DED_REGISTERED);
  });

  it("U-2c: **건물만** 미등기 → 건물만 0.3%, 토지는 3% 유지", () => {
    const out = buildGeneralBuildingAssetCards(gbInput({ unregisteredBuilding: true }));
    expect(out.estimatedDeduction.land).toBe(LAND_DED_REGISTERED);
    expect(out.estimatedDeduction.building).toBe(BLDG_DED_UNREGISTERED);
  });

  it("U-2d: 카드→엔진 매핑이 축을 지킨다 — 토지 카드만 isUnregistered", () => {
    const out = buildGeneralBuildingAssetCards(gbInput({ unregisteredLand: true }));
    const properties = buildProperties(out.assetCards, out.nonBusinessRatio, undefined, {
      land: true,
      building: false,
    });
    for (const p of properties) {
      const isLand = p.propertyType === "land";
      // 종전 하드코딩(`isUnregistered: false`)이면 토지 카드가 false로 떨어져 깨진다.
      expect(p.isUnregistered, `${p.propertyId} 축 불일치`).toBe(isLand);
    }
    // 대조군 — 카드가 실제로 둘 다 존재해야 위 루프가 의미를 갖는다(빈 배열 통과 방지).
    expect(properties.some((p) => p.propertyType === "land")).toBe(true);
    expect(properties.some((p) => p.propertyType === "general_building_unit")).toBe(true);
  });
});
