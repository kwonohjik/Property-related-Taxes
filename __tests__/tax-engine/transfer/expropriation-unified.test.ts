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
