/**
 * P2b baseline anchor — 상속 취득가액 UI 통합(B1) 계획 §9 R0″.
 * 토지 상속 취득가액이 두 route 경로에서 같은 최종 취득가액을 내는 현행 동작을 고정한다.
 *   - 단건: inheritedAcquisition 경로 → reportedValue=총액, method → 총액 그대로 (calcPostDeemed)
 *   - 다자산 일괄양도: inheritanceValuation 경로(route.ts:459-490) → publishedValue=단가 × 면적
 *     (reportedValue/reportedMethod 없이 호출 → legacyFallback computeSupplementary)
 * route 통일(다자산도 총액 직수용) + 통합 셸 후에도 **최종 취득가액 불변**임을 보장하는 baseline.
 */
import { describe, it, expect } from "vitest";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";

const POST_DEEMED = new Date("2017-09-15"); // 의제취득일 이후
const AREA = 100;
const UNIT_PRICE = 4_000_000; // 원/㎡
const TOTAL = UNIT_PRICE * AREA; // 400,000,000

describe("P2b baseline — 토지 상속 취득가액 경로별 현행 고정 (R0″)", () => {
  it("단건 경로 (inheritedAcquisition) — reportedValue=총액 + method → 총액 그대로", () => {
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED,
      assetKind: "land",
      reportedValue: TOTAL,
      reportedMethod: "supplementary",
      publishedValueAtInheritance: TOTAL,
      landAreaM2: AREA,
    });
    expect(r.acquisitionPrice).toBe(TOTAL);
  });

  it("다자산 일괄양도 경로 (inheritanceValuation) — publishedValue=단가 × 면적 = 총액", () => {
    // route.ts:459-490은 reportedValue/reportedMethod 없이 호출 → legacyFallback computeSupplementary(land)
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED,
      assetKind: "land",
      publishedValueAtInheritance: UNIT_PRICE, // 단가(원/㎡)
      landAreaM2: AREA,
    });
    expect(r.acquisitionPrice).toBe(TOTAL);
  });

  it("두 경로 최종 취득가액 동일 — route 통일 후에도 불변 baseline", () => {
    const single = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED, assetKind: "land",
      reportedValue: TOTAL, reportedMethod: "supplementary",
      publishedValueAtInheritance: TOTAL, landAreaM2: AREA,
    });
    const bundled = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED, assetKind: "land",
      publishedValueAtInheritance: UNIT_PRICE, landAreaM2: AREA,
    });
    expect(single.acquisitionPrice).toBe(bundled.acquisitionPrice);
    expect(single.acquisitionPrice).toBe(TOTAL);
  });

  it("주택 대조군 — 두 경로 모두 총액 (단가/총액 충돌 없음)", () => {
    const HOUSE = 500_000_000;
    const single = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED, assetKind: "house_apart",
      reportedValue: HOUSE, reportedMethod: "supplementary",
    });
    const bundled = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED, assetKind: "house_apart",
      publishedValueAtInheritance: HOUSE,
    });
    expect(single.acquisitionPrice).toBe(HOUSE);
    expect(bundled.acquisitionPrice).toBe(HOUSE);
  });
});
