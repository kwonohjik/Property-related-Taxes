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

  it("다자산 일괄양도 경로 (통일 후) — reportedValue=총액 + method → 총액 그대로", () => {
    // R0″ 통일: route.ts:459-490이 publishedValueAtInheritance(총액)를 reportedValue+method로 직수용
    // (기존 단가×면적 computeSupplementary 경로 폐기 — 단건과 동일 총액 경로).
    const r = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED,
      assetKind: "land",
      reportedValue: TOTAL,
      reportedMethod: "supplementary",
      landAreaM2: AREA,
    });
    expect(r.acquisitionPrice).toBe(TOTAL);
  });

  it("두 경로 최종 취득가액 동일 (통일 후 — 둘 다 총액 직수용)", () => {
    const single = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED, assetKind: "land",
      reportedValue: TOTAL, reportedMethod: "supplementary",
      publishedValueAtInheritance: TOTAL, landAreaM2: AREA,
    });
    const bundled = calculateInheritanceAcquisitionPrice({
      inheritanceDate: POST_DEEMED, assetKind: "land",
      reportedValue: TOTAL, reportedMethod: "supplementary", landAreaM2: AREA,
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
