/**
 * anchor: 의제취득일 전(pre-deemed) 상속·증여 ① 상증법 평가액(reportedValue) 배관.
 *
 * Phase 2: publishedValueAtInheritance → inheritedAcquisition.reportedValue 송신
 * (엔진 max(①,③) 후보 ① 도달). 물가상승률(피상속인 실가) 필드 미송신.
 *
 * 계획서: docs/02-design/features/inheritance-pre-deemed-max-123-correction.plan.md
 */
import { describe, it, expect } from "vitest";
import { buildInheritedAcquisitionPayload } from "../../lib/calc/transfer-tax-api-inheritance";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

function preDeemedAsset(overrides = {}) {
  return {
    ...makeDefaultAsset(1),
    acquisitionCause: "inheritance" as const,
    inheritanceValuationMode: "auto" as const,
    inheritanceAssetKind: "land" as const,
    inheritanceStartDate: "1983-07-26", // < 1985-01-01 → pre-deemed
    publishedValueAtInheritance: "500,000,000",
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = { inheritedAcquisition?: any };

describe("pre-deemed ① 상증법 평가액(reportedValue) 배관", () => {
  it("publishedValueAtInheritance → reportedValue 송신, 물가상승률 필드 미송신", () => {
    const p = buildInheritedAcquisitionPayload(preDeemedAsset(), 1, false) as Payload;
    expect(p.inheritedAcquisition.mode).toBe("pre-deemed");
    expect(p.inheritedAcquisition.reportedValue).toBe(500_000_000);
    expect(p.inheritedAcquisition.hasDecedentActualPrice).toBeUndefined();
    expect(p.inheritedAcquisition.decedentActualPrice).toBeUndefined();
  });

  it("신고가액 미입력 → reportedValue 생략 (③ 환산 단독)", () => {
    const p = buildInheritedAcquisitionPayload(
      preDeemedAsset({ publishedValueAtInheritance: "" }),
      1,
      false,
    ) as Payload;
    expect(p.inheritedAcquisition.mode).toBe("pre-deemed");
    expect(p.inheritedAcquisition.reportedValue).toBeUndefined();
  });

  it("지분(60%) 모드 → reportedValue × ratio 안분", () => {
    const p = buildInheritedAcquisitionPayload(preDeemedAsset(), 0.6, true) as Payload;
    // 500,000,000 × 0.6 = 300,000,000
    expect(p.inheritedAcquisition.reportedValue).toBe(300_000_000);
  });
});
