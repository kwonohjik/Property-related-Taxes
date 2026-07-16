/**
 * 공익수용·협의매수 단일 입력 통합 — Phase 1 anchor
 *
 * 설계: docs/02-design/features/transfer-public-expropriation-unified.engine.design.md
 * 케이스 인벤토리 E1~E8. 여기선 Phase 1 배선(고시일 fallback) 핵심 anchor.
 */
import { describe, it, expect } from "vitest";
import { buildUnconditionalExemption } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { applyExpropriationValuation } from "@/lib/tax-engine/transfer-tax-expropriation-valuation";
import { calcTransferGain } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const pd = (s: string) => (s ? new Date(s) : undefined);

/** checkUnconditionalExemption이 실제로 읽는 필드만 채운 최소 입력 (buildMinimalInput 패턴) */
function nblInput(uncond: ReturnType<typeof buildUnconditionalExemption>, acq: string, transfer: string): NonBusinessLandInput {
  return {
    unconditionalExemption: uncond,
    acquisitionDate: new Date(acq),
    transferDate: new Date(transfer),
    zoneType: "undesignated",
  } as unknown as NonBusinessLandInput;
}

describe("공익수용 통합 Phase 1 — NBL 고시일 fallback", () => {
  it("expr-notice-fallback: NBL 고시일 미입력 시 expropriationNoticeDate로 fallback (단일 소스)", () => {
    const uncond = buildUnconditionalExemption(
      {
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "", // NBL 섹션 고시일 미입력
        expropriationNoticeDate: "2005-03-10", // Step1 단일 소스
        transferCause: "public_expropriation",
      },
      pd,
    );
    expect(uncond?.publicNoticeDate).toEqual(new Date("2005-03-10"));
  });

  it("expr-notice-section-override: NBL 섹션 고시일 입력 시 그 값 우선(override)", () => {
    const uncond = buildUnconditionalExemption(
      {
        nblExemptPublicExpropriation: true,
        nblExemptPublicNoticeDate: "2004-01-01", // 섹션 override
        expropriationNoticeDate: "2005-03-10",
        transferCause: "public_expropriation",
      },
      pd,
    );
    expect(uncond?.publicNoticeDate).toEqual(new Date("2004-01-01"));
  });

  it("expr-cause-only: 섹션 토글 미설정이어도 transferCause=수용이면 isPublicExpropriation=true", () => {
    const uncond = buildUnconditionalExemption(
      { transferCause: "public_expropriation", expropriationNoticeDate: "2005-03-10" },
      pd,
    );
    expect(uncond?.isPublicExpropriation).toBe(true);
    expect(uncond?.publicNoticeDate).toEqual(new Date("2005-03-10"));
  });
});

describe("공익수용 통합 Phase 1 — 판정 분기(취득-시점 조건 독립)", () => {
  const uncond = buildUnconditionalExemption(
    { nblExemptPublicExpropriation: true, expropriationNoticeDate: "2015-01-01" },
    pd,
  );

  it("E3 expr-acq-5y-before: 고시일 후이나 취득 5년 이전 → 사업용 의제 O(나목)", () => {
    // 고시일 2015 − 5 = 2010; 취득 2009-12-31 ≤ 2010 → 의제 성립
    const res = checkUnconditionalExemption(nblInput(uncond, "2009-12-31", "2020-01-01"), "farmland");
    expect(res.isExempt).toBe(true);
  });

  it("E4 expr-acq-3y-mixed: 취득 3년 전 + 고시일 2006 이후 → 사업용 의제 X(중과)", () => {
    // 취득 2012 > 2010(5년 경계), 고시일 2015 > 2006.12.31 → 가·나목 모두 불성립
    const res = checkUnconditionalExemption(nblInput(uncond, "2012-01-01", "2020-01-01"), "farmland");
    expect(res.isExempt).toBe(false);
  });
});

describe("공익수용 — 환산 양도당시 기준시가 min[] (소득세법 시행령 §164⑨ 1호)", () => {
  const base = {
    // §164⑨은 법 §99①1호 가목~라목만 대상 → 적격 자산 명시 필수(2026-07-16 게이트 확대).
    propertyType: "land" as const,
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation" as const,
    transferDate: new Date("2020-01-01"),
    standardPricePerSqmAtTransfer: 1_000_000, // 원/㎡
    transferArea: 300, // ㎡
    compensationPerSqm: 600_000, // 최솟값
    compensationBasisStdPrice: 800_000,
  };

  it("E6 expr-valuation-min-applies: min(1,000,000·600,000·800,000)=600,000 × 300 = 180,000,000", () => {
    const r = applyExpropriationValuation(base);
    expect(r).not.toBeNull();
    expect(r!.detail.chosenPerSqm).toBe(600_000);
    expect(r!.denominator).toBe(180_000_000);
  });

  it("E6b 소수 면적 floor: 600,000 × 300.55 = 180,330,000", () => {
    const r = applyExpropriationValuation({ ...base, transferArea: 300.55 });
    expect(r!.denominator).toBe(180_330_000);
  });

  it("E7 게이트 OFF — 실지취득가(환산 아님) → null(현행 총액 유지)", () => {
    expect(applyExpropriationValuation({ ...base, useEstimatedAcquisition: false })).toBeNull();
  });

  it("E7b 게이트 OFF — 양도 2009.02.04 이전 → null", () => {
    expect(applyExpropriationValuation({ ...base, transferDate: new Date("2009-02-03") })).toBeNull();
  });

  it("E7c 게이트 OFF — 수용 아님 → null", () => {
    expect(applyExpropriationValuation({ ...base, transferCause: "general" })).toBeNull();
  });

  it("E7d 게이트 OFF — 보상필드 미입력 → null", () => {
    expect(applyExpropriationValuation({ ...base, compensationPerSqm: 0 })).toBeNull();
  });
});

describe("공익수용 통합 Phase 2 — calcTransferGain 통합(#3 환산취득가 override)", () => {
  const gainInput = {
    propertyType: "land" as const,
    transferPrice: 1_000_000_000,
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 100_000_000, // 취득 총액 기준시가
    standardPriceAtTransfer: 300_000_000, // 현행 양도 총액(= 1,000,000 × 300)
    transferDate: new Date("2020-01-01"),
    transferCause: "public_expropriation" as const,
    standardPricePerSqmAtTransfer: 1_000_000,
    transferArea: 300,
    compensationPerSqm: 600_000,
    compensationBasisStdPrice: 800_000,
  } as unknown as TransferTaxInput;

  it("H #3 적용: 환산취득가 = 10억 × 1억 / min분모(1.8억) = 555,555,555 (특례 미적용 3.33억보다↑)", () => {
    const r = calcTransferGain(gainInput);
    expect(r.estimatedBase).toBe(Math.floor((1_000_000_000 * 100_000_000) / 180_000_000)); // 555,555,555
    expect(r.expropriationValuationDetail?.chosenPerSqm).toBe(600_000);
    expect(r.expropriationValuationDetail?.denominator).toBe(180_000_000);
  });

  it("H2 특례 미적용(수용 아님) → 현행 분모(3억) = 333,333,333, detail undefined", () => {
    const r = calcTransferGain({ ...gainInput, transferCause: "general" } as TransferTaxInput);
    expect(r.estimatedBase).toBe(Math.floor((1_000_000_000 * 100_000_000) / 300_000_000)); // 333,333,333
    expect(r.expropriationValuationDetail).toBeUndefined();
  });
});

describe("공익수용 통합 Phase 1 — §77 고시일 fallback", () => {
  it("expr-77-notice-fallback: reduction 고시일 미입력 시 expropriationNoticeDate로 businessApprovalDate 채움", () => {
    const r: AssetReductionForm = {
      type: "public_expropriation",
      expropriationCash: "1000000",
      expropriationBond: "0",
      expropriationBondHoldingYears: "none",
      expropriationApprovalDate: "",
    };
    const out = toEngineReductions([r], "purchase", "2015-03-10");
    expect((out[0] as { businessApprovalDate?: string }).businessApprovalDate).toBe("2015-03-10");
  });
});
