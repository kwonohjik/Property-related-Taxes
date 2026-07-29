/**
 * A2 anchor — P2b 통합 migration: 상속 취득가액 manual 모드 폐지 → auto 전환.
 * 계획 docs/02-design/features/inherited-acquisition-ui-unification.plan.md §8 P2b.
 * 기존 세션의 manual 취득가액(fixedAcquisitionPrice)을 신고가액(publishedValueAtInheritance)으로 무손실 이전.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

describe("[A2] P2b 통합 migration — 상속 manual → auto", () => {
  it("manual 상속 → auto + fixedAcquisitionPrice를 publishedValueAtInheritance로 이전", () => {
    const stale = {
      assetKind: "housing",
      acquisitionCause: "inheritance",
      inheritanceValuationMode: "manual",
      fixedAcquisitionPrice: "400000000",
      publishedValueAtInheritance: "",
    };
    const m = migrateAsset(stale) as unknown as Record<string, unknown>;
    expect(m.publishedValueAtInheritance).toBe("400000000");
    expect(m.fixedAcquisitionPrice).toBe("");
    expect(m.inheritanceValuationMode).toBeUndefined(); // P2c: mode 필드 폐기
  });

  it("manual 상속 + publishedValue 이미 있음 → 기존 신고가액 보존, fixedAcq만 클리어", () => {
    const stale = {
      assetKind: "housing",
      acquisitionCause: "inheritance",
      inheritanceValuationMode: "manual",
      fixedAcquisitionPrice: "500000000",
      publishedValueAtInheritance: "400000000",
    };
    const m = migrateAsset(stale) as unknown as Record<string, unknown>;
    expect(m.publishedValueAtInheritance).toBe("400000000"); // 기존 보존
    expect(m.fixedAcquisitionPrice).toBe("");
  });

  it("비상속(매매)은 fixedAcquisitionPrice 보존 (mode만 auto 통일)", () => {
    const stale = {
      assetKind: "housing",
      acquisitionCause: "purchase",
      inheritanceValuationMode: "manual",
      fixedAcquisitionPrice: "300000000",
    };
    const m = migrateAsset(stale) as unknown as Record<string, unknown>;
    expect(m.fixedAcquisitionPrice).toBe("300000000"); // 비상속 취득가액 보존
    expect(m.inheritanceValuationMode).toBeUndefined(); // P2c: mode 필드 폐기
  });
});
