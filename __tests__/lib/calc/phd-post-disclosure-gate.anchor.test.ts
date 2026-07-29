/**
 * Pre-Do 앵커 — PHD 3-시점 환산(§164⑦) 취득일 게이트
 *
 * 계획서: docs/02-design/features/transfer-phd-post-disclosure-gate.plan.md
 * 버그: 취득일(의제취득일 반영) ≥ 최초고시일이면 취득당시 고시분이 존재하므로
 *       3-시점 환산 대상이 아닌데(소령 §164⑦ "취득 당시 고시되지 아니한 경우" 한정),
 *       현행은 UI·validate·Zod 어디에서도 차단하지 않음.
 */
import { describe, it, expect } from "vitest";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { addPropertyRefines } from "@/lib/api/transfer-tax-schema-refines";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// 사례 23 기반 PHD 완전 입력 (환산 모드 + 3-시점 11필드)
function phdAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "1992-01-30",
    useEstimatedAcquisition: true,
    usePreHousingDisclosure: true,
    acquisitionArea: "65.49",
    phdFirstDisclosureDate: "2022-04-29", // 사례 23 — 취득 후 최초고시 (적용가능)
    phdFirstDisclosureHousingPrice: "1,525,000,000",
    phdLandPricePerSqmAtAcq: "600,000",
    phdBuildingStdPriceAtAcq: "50,000,000",
    phdLandPricePerSqmAtFirst: "5,930,000",
    phdBuildingStdPriceAtFirst: "200,000,000",
    phdTransferHousingPrice: "1,525,000,000",
    phdLandPricePerSqmAtTransfer: "5,930,000",
    phdBuildingStdPriceAtTransfer: "200,000,000",
    ...over,
  };
}
const V = (a: AssetForm) => validateAssetAcquisition(a, "자산 1", "2023-02-19");

describe("isPhdEligible (게이트 술어 단위)", () => {
  it("M1 취득 1992 < 최초고시 2022 → 적용가능", () => {
    expect(isPhdEligible("1992-01-30", "2022-04-29")).toBe(true);
  });
  it("M2 취득 1992 ≥ 최초고시 1983 → 적용불가", () => {
    expect(isPhdEligible("1992-01-30", "1983-01-01")).toBe(false);
  });
  it("M3 취득 1980(의제 1985-01-01) ≥ 최초고시 1983 → 적용불가", () => {
    expect(isPhdEligible("1980-05-01", "1983-01-01")).toBe(false);
  });
  it("M4 취득 1980(의제 1985-01-01) < 최초고시 1993-02-01 → 적용가능", () => {
    expect(isPhdEligible("1980-05-01", "1993-02-01")).toBe(true);
  });
  it("M5 취득일 = 최초고시일(당일) → 적용불가 (결정공시일 기준 고시 존재)", () => {
    expect(isPhdEligible("1993-02-01", "1993-02-01")).toBe(false);
  });
  it("M6 최초고시일 미입력 → 게이트 미발동(true)", () => {
    expect(isPhdEligible("1992-01-30", "")).toBe(true);
  });
});

describe("validateAssetAcquisition ⑧ 게이트 (앵커)", () => {
  it("A2 (M1 회귀): 사례 23 구성 — 게이트 통과 (오류 없음)", () => {
    expect(V(phdAsset())).toBeNull();
  });

  it("★ A1 (M2): 취득 1992 ≥ 최초고시 1983 → 차단 오류 (RED→GREEN)", () => {
    const err = V(phdAsset({ phdFirstDisclosureDate: "1983-01-01" }));
    expect(err).toContain("3-시점 환산");
    expect(err).toContain("최초 고시일 이후");
  });

  it("★ A3 (M3): 의제취득일 1985-01-01 ≥ 최초고시 1983 → 차단 (RED→GREEN)", () => {
    const err = V(phdAsset({ acquisitionDate: "1980-05-01", phdFirstDisclosureDate: "1983-01-01" }));
    expect(err).toContain("3-시점 환산");
  });

  it("A3b (M4): 의제취득일 1985-01-01 < 최초고시 1993-02-01 → 통과", () => {
    expect(
      V(phdAsset({ acquisitionDate: "1980-05-01", phdFirstDisclosureDate: "1993-02-01" })),
    ).toBeNull();
  });

  // 이월과세(§97의2) — 비교일 = 증여자 취득일 (수증일 아님). carryover 전용 검증 블록 경유.
  function carryoverPhdAsset(donorAcqDate: string, firstDisclosure: string): AssetForm {
    const base = phdAsset({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2010-06-01", // 수증일(등기접수일) — 고시일 이후지만 비교 대상 아님
      phdFirstDisclosureDate: firstDisclosure,
    });
    return {
      ...base,
      carryover: {
        ...base.carryover!,
        giftRegistryDate: "2010-06-01",
        donorAcquisitionDate: donorAcqDate,
        useEstimatedAcquisition: true,
        estimationMode: "phd",
        giftDateValuation: "500,000,000",
        giftTaxAmount: "0",
      },
    };
  }

  it("A5 이월과세: 증여자 취득 1990 < 최초고시 1993 → 통과 (수증일 2010 무관)", () => {
    expect(V(carryoverPhdAsset("1990-01-01", "1993-02-01"))).toBeNull();
  });

  it("★ A5b 이월과세: 증여자 취득 2000 ≥ 최초고시 1993 → 차단 (RED→GREEN)", () => {
    const err = V(carryoverPhdAsset("2000-01-01", "1993-02-01"));
    expect(err).toContain("증여자 취득일");
    expect(err).toContain("3-시점 환산");
  });
});

describe("addPropertyRefines ⑩ Zod 게이트 (A4 앵커)", () => {
  function runRefine(data: Parameters<typeof addPropertyRefines>[0]): string[] {
    const issues: string[] = [];
    const ctx = {
      addIssue: (i: { message?: string }) => issues.push(i.message ?? ""),
    } as unknown as Parameters<typeof addPropertyRefines>[1];
    addPropertyRefines(data, ctx);
    return issues;
  }
  const base = {
    useEstimatedAcquisition: true,
    acquisitionDate: "1992-01-30",
    transferDate: "2023-02-19",
  };

  it("★ A4 (M2): 취득 1992 ≥ 최초고시 1983 → refine 오류", () => {
    const issues = runRefine({
      ...base,
      preHousingDisclosure: { firstDisclosureDate: "1983-01-01" },
    });
    expect(issues.some((m) => m.includes("§164⑦"))).toBe(true);
  });

  it("A4b (M1 회귀): 취득 1992 < 최초고시 2022 → 오류 없음", () => {
    const issues = runRefine({
      ...base,
      preHousingDisclosure: { firstDisclosureDate: "2022-04-29" },
    });
    expect(issues.some((m) => m.includes("§164⑦"))).toBe(false);
  });

  it("A4c 이월과세: 증여자 취득 < 고시일 → 오류 없음 (비교일 = donorAcquisitionDate)", () => {
    const issues = runRefine({
      ...base,
      acquisitionDate: "2010-06-01",
      acquisitionCause: "carryover_gift",
      carryoverTaxation: { donorAcquisitionDate: "1990-01-01" },
      preHousingDisclosure: { firstDisclosureDate: "1993-02-01" },
    });
    expect(issues.some((m) => m.includes("§164⑦"))).toBe(false);
  });
});
