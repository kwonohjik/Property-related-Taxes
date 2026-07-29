/**
 * A-land anchor — 상속 취득가액 UI 통합(B1) 계획 §5.3·§7.
 * C2 면적곱 지뢰(엔진 계약) + P1 reportedMethod 매핑·공란 가드(API 계약) 회귀 고정.
 * pre-do probe 승격 (2026-07-20).
 */
import { describe, it, expect } from "vitest";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import { buildInheritedAcquisitionPayload } from "@/lib/calc/transfer-tax-api-inheritance";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

describe("A-land 엔진 계약 — C2 면적곱 지뢰 (post-deemed 토지)", () => {
  const base = {
    inheritanceDate: new Date("2017-09-15"), // post-deemed (≥ 1985-01-01)
    assetKind: "land" as const,
    reportedValue: 400_000_000, // 신고가액(총액)
    publishedValueAtInheritance: 400_000_000, // post-deemed payload가 총액을 여기 넣음
    landAreaM2: 100,
  };

  it("method='supplementary' → 신고가액 총액 그대로 (현행 정상 경로)", () => {
    const r = calculateInheritanceAcquisitionPrice({ ...base, reportedMethod: "supplementary" });
    expect(r.acquisitionPrice).toBe(400_000_000);
    expect(r.method).toBe("supplementary");
  });

  it("method 공란 → legacyFallback computeSupplementary(land) 면적곱 폭증 (100배)", () => {
    // 지뢰 존재 확인: API/마이그가 reportedMethod를 반드시 채워야 하는 근거.
    const r = calculateInheritanceAcquisitionPrice({ ...base, reportedMethod: undefined });
    expect(r.acquisitionPrice).toBe(40_000_000_000); // 400,000,000 × 100
  });
});

describe("P1 API 계약 — reportedMethod 매핑 + C2 공란 가드", () => {
  function postDeemedLandAsset(method: string): AssetForm {
    return {
      acquisitionCause: "inheritance",
      inheritanceValuationMode: "auto",
      inheritanceAssetKind: "land",
      inheritanceStartDate: "2017-09-15",
      acquisitionDate: "2017-09-15",
      publishedValueAtInheritance: "400000000",
      inheritanceValuationMethod: method,
      acquisitionArea: "100",
    } as unknown as AssetForm;
  }

  it("사용자 선택 평가방법이 reportedMethod로 전달 (H7 정본화)", () => {
    const p = buildInheritedAcquisitionPayload(postDeemedLandAsset("appraisal"), 1, false) as {
      inheritedAcquisition?: { reportedMethod?: string };
    };
    expect(p.inheritedAcquisition?.reportedMethod).toBe("appraisal");
  });

  it("평가방법 공란 → 'supplementary' 강제 (C2 지뢰 차단)", () => {
    const p = buildInheritedAcquisitionPayload(postDeemedLandAsset(""), 1, false) as {
      inheritedAcquisition?: { reportedMethod?: string };
    };
    expect(p.inheritedAcquisition?.reportedMethod).toBe("supplementary");
  });
});
