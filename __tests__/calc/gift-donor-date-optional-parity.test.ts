/**
 * anchor: 단순 증여의 **증여자 취득일 선택 입력** — UI validate ↔ API zod 정합 (14지점 ⑧·⑩)
 *
 * 계획서: docs/02-design/features/transfer-104-2-2-gift-carryover-scope.plan.md Phase 4
 *
 * §104②2호의 대상은 「§97의2제1항에 **해당하는 자산**」(= 이월과세)뿐이므로 단순 증여의
 * 세율 보유기간은 「증여받은 날」부터다(법 §98 + 영 §162①5호). 따라서 `gift`에서
 * 증여자 취득일은 **필수가 아니다**.
 *
 * ⚠️ **한쪽만 풀면 실사용이 막힌다** — UI validate만 풀고 API zod에 필수가 남으면
 * 「입력 없이 다음 단계로 진행 → 계산 요청 400」이 된다. 반대면 UI가 먼저 차단한다.
 * 이 파일은 **두 계층이 같은 기준**임을 고정한다(루트 CLAUDE.md ⑧ 규칙).
 *
 * ⚠️ 이월과세(`carryover_gift`)의 `carryoverTaxation.donorAcquisitionDate`는 **여전히 필수**다
 *    (§104②2호·§95④ 단서가 그 날짜로 기산하므로). 아래 C 케이스가 그것을 지킨다.
 */
import { describe, it, expect } from "vitest";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import {
  validateAssetAcquisition,
  getAssetDateOrderError,
} from "@/lib/calc/transfer-tax-validate-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

/** propertySchema 필수 필드를 채운 최소 body */
function parseProperty(body: Record<string, unknown>) {
  return propertySchema.safeParse({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    transferDate: "2026-01-01",
    acquisitionDate: "2025-01-01",
    expenses: 0,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isOneHousehold: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...body,
  });
}

function giftAsset(o: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(),
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "2025-01-01",
    fixedAcquisitionPrice: "500000000",
    salePrice: "1000000000",
    ...o,
  } as AssetForm;
}

describe("증여자 취득일 — 단순 증여에서는 선택 입력 (⑧ UI validate)", () => {
  it("미입력이어도 UI validate를 통과한다", () => {
    expect(validateAssetAcquisition(giftAsset(), "자산 1")).toBeNull();
  });

  it("입력하면 순서 검증(증여일보다 이전)은 그대로 걸린다", () => {
    // 순서 검증은 별도 함수 — 필수 해제가 이쪽까지 풀어버리면 안 된다.
    const err = getAssetDateOrderError(giftAsset({ donorAcquisitionDate: "2025-06-01" }), "2026-01-01");
    expect(err).toContain("증여자 취득일");
  });

  it("정상 순서면 두 검증 모두 통과한다", () => {
    const asset = giftAsset({ donorAcquisitionDate: "2010-01-01" });
    expect(validateAssetAcquisition(asset, "자산 1")).toBeNull();
    expect(getAssetDateOrderError(asset, "2026-01-01")).toBeNull();
  });

  it("미입력이면 순서 검증도 걸리지 않는다", () => {
    expect(getAssetDateOrderError(giftAsset(), "2026-01-01")).toBeNull();
  });
});

describe("증여자 취득일 — API zod도 같은 기준이어야 한다 (⑩ 정합)", () => {
  it("gift + 증여자 취득일 미입력 → zod 통과", () => {
    const r = parseProperty({ acquisitionCause: "gift" });
    expect(r.success).toBe(true);
  });

  it("gift + 증여자 취득일 입력 → zod 통과", () => {
    const r = parseProperty({ acquisitionCause: "gift", donorAcquisitionDate: "2010-01-01" });
    expect(r.success).toBe(true);
  });

  it("gift + 증여자 취득일이 증여일 이후 → zod 차단 (순서 검증 유지)", () => {
    const r = parseProperty({ acquisitionCause: "gift", donorAcquisitionDate: "2025-06-01" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("donorAcquisitionDate"))).toBe(true);
    }
  });

  const companionGift = (o: Record<string, unknown> = {}) => ({
    assetId: "c1",
    assetLabel: "동반자산 1",
    assetKind: "land",
    acquisitionCause: "gift",
    acquisitionDate: "2025-01-01",
    fixedAcquisitionPrice: 300_000_000,
    allocatedSalePrice: 400_000_000,
    standardPriceAtTransfer: 350_000_000, // apportioned 모드 필수 (증여자 취득일 축과 무관)
    ...o,
  });

  /** companion이 있으면 일괄양도 모드라 총액·안분 기준시가가 함께 필요하다. */
  const bundled = (companion: Record<string, unknown>) => ({
    totalSalePrice: 1_400_000_000,
    standardPriceAtTransferForApportion: 900_000_000,
    companionAssets: [companion],
  });

  it("companion 증여 자산도 증여자 취득일 없이 통과한다", () => {
    const r = parseProperty(bundled(companionGift()));
    expect(r.success).toBe(true);
  });

  /**
   * **mutation probe** — 위 단언이 「companion 블록에 애초에 도달하지 못해서」 통과하는 것이
   * 아님을 증명한다. 같은 블록의 살아 있는 검증(증여일 필수)을 깨뜨리면 반드시 막혀야 한다
   * (메모리 `feedback_negative_assertion_needs_mutation_probe` ★★★).
   */
  it("probe — companion 증여 자산의 증여일을 빼면 같은 블록이 막는다", () => {
    const r = parseProperty(bundled(companionGift({ acquisitionDate: undefined })));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.join(".").includes("acquisitionDate")),
      ).toBe(true);
    }
  });
});

describe("이월과세는 여전히 필수 — 완화가 번지지 않았는가", () => {
  it("carryoverTaxation에 donorAcquisitionDate가 없으면 zod가 막는다", () => {
    const r = parseProperty({
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: "2025-01-01",
        // donorAcquisitionDate 누락
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 500_000_000,
      },
    });
    expect(r.success).toBe(false);
  });
});
