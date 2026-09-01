// D5-03 anchor — 조특법 §98의3② 자기건설 신축주택에는 §98의3① 미분양 요건이 적용되지 않는다
//
// 법 §98의3②: 「제1항을 적용할 때 자기가 건설한 신축주택으로서 2009.2.12~2010.2.11 기간 중에
//   공사에 착공하고 사용승인·사용검사를 받은 주택을 포함한다」 — 미분양 확인 요건 없음.
// 령 §98의3①: 「대통령령으로 정하는 미분양주택」 = 1~8호(전부 사업주체 등이 「공급하는」 주택).
//   자기건설 주택은 어느 호에도 해당할 수 없다. 같은 항 단서(과밀 660㎡·149㎡ 한정)도
//   「다음 각 호의 어느 하나에 해당하는 주택」을 한정하는 문언이므로 ②주택에는 적용 대상이 없다.
// 령 §98의3⑤ 단서: 「법 제98조의3제2항의 주택에 대하여는 … 건축착공신고서 사본과 사용검사 또는
//   사용승인 사실을 확인할 수 있는 서류를 제출하여야 한다」 — 본문의 「미분양주택임을 확인하는
//   날인을 받은 매매계약서」를 ②주택에 대해 명시적으로 대체한다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  evaluateUnsold983,
  type Unsold983Input,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(s);

/** 법 §98의3② 자기건설 신축주택 — 조문이 요구하는 요건만 충족시킨 기준선 */
function selfBuilt(overrides: Partial<Unsold983Input> = {}): Unsold983Input {
  return {
    transferDate: D("2013-06-01"),
    acquisitionDate: D("2009-12-01"),
    residencyType: "resident",
    houseType: "self_built",
    constructionStartDate: D("2009-03-01"),
    usageApprovalDate: D("2009-12-01"),
    isOutsideSeoulNotDesignated: true,
    isOverconcentration: false,
    isNotExcludedSelfBuilt: true,
    // isUnsoldConfirmed 미선언 — 법·령 어디에도 ②주택에 요구되지 않는다
    transferIncome: 100_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...overrides,
  };
}

/** 법 §98의3① 사업주체 취득 주택 — 미분양 확인이 실제로 요구되는 대조군 */
function purchased(overrides: Partial<Unsold983Input> = {}): Unsold983Input {
  return {
    transferDate: D("2013-06-01"),
    acquisitionDate: D("2009-12-01"),
    residencyType: "resident",
    houseType: "purchased",
    contractDate: D("2009-06-15"),
    isOutsideSeoulNotDesignated: true,
    isOverconcentration: false,
    isUnsoldConfirmed: true,
    isFirstContract: true,
    isNotOccupiedAtContract: true,
    isNotRecontract: true,
    transferIncome: 100_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...overrides,
  };
}

describe("D5-03 §98의3② 자기건설 신축주택 — 미분양 확인 요건 비적용", () => {
  it("D5-03-1: 자기건설 + 미분양 확인 미선언 → 적격 (NOT_UNSOLD_CONFIRMED 없음)", () => {
    const r = evaluateUnsold983(selfBuilt());
    expect(r.ineligibleReasons?.map((x) => x.code) ?? []).not.toContain("NOT_UNSOLD_CONFIRMED");
    expect(r.isEligible).toBe(true);
    // 5년 이내 양도 — 비과밀 100% 세액감면
    expect(r.effectCategory).toBe("tax_amount");
    expect(r.taxReductionRate).toBe(1.0);
  });

  it("D5-03-2: 자기건설 + 미분양 확인을 false로 명시해도 적격 (요건 자체가 비적용)", () => {
    const r = evaluateUnsold983(selfBuilt({ isUnsoldConfirmed: false }));
    expect(r.isEligible).toBe(true);
  });

  it("D5-03-3 대조군: 사업주체 취득은 미분양 확인이 여전히 필수", () => {
    const r = evaluateUnsold983(purchased({ isUnsoldConfirmed: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("NOT_UNSOLD_CONFIRMED");
  });

  it("D5-03-4: 자기건설 고유 요건(법②단서)은 그대로 유지 — 조합원·멸실 재건축 배제", () => {
    const r = evaluateUnsold983(selfBuilt({ isNotExcludedSelfBuilt: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("SELF_BUILT_EXCLUDED");
  });

  it("D5-03-5: 자기건설 착공일 기간 외(법②)는 그대로 차단", () => {
    const r = evaluateUnsold983(selfBuilt({ constructionStartDate: D("2008-12-01") }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("OUT_OF_CONTRACT_PERIOD");
  });
});

describe("D5-03 령 §98의3① 단서(과밀 660㎡·149㎡) — 각 호 주택에만 적용", () => {
  it("D5-03-6: 자기건설 + 과밀 + 면적 미입력 → 적격 (MISSING_AREA 없음), 감면율 60%", () => {
    const r = evaluateUnsold983(selfBuilt({ isOverconcentration: true }));
    expect(r.ineligibleReasons?.map((x) => x.code) ?? []).not.toContain("MISSING_AREA");
    expect(r.isEligible).toBe(true);
    expect(r.taxReductionRate).toBe(0.6);
  });

  it("D5-03-7: 자기건설 + 과밀 + 대지 1,000㎡·연면적 200㎡ → 적격 (AREA_LIMIT_EXCEEDED 없음)", () => {
    const r = evaluateUnsold983(
      selfBuilt({ isOverconcentration: true, landAreaSqm: 1000, floorAreaSqm: 200 }),
    );
    expect(r.ineligibleReasons?.map((x) => x.code) ?? []).not.toContain("AREA_LIMIT_EXCEEDED");
    expect(r.isEligible).toBe(true);
  });

  it("D5-03-8 대조군: 사업주체 취득 + 과밀 + 면적 초과 → AREA_LIMIT_EXCEEDED", () => {
    const r = evaluateUnsold983(
      purchased({ isOverconcentration: true, landAreaSqm: 1000, floorAreaSqm: 200 }),
    );
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("AREA_LIMIT_EXCEEDED");
  });

  it("D5-03-9 대조군: 사업주체 취득 + 과밀 + 면적 미입력 → MISSING_AREA", () => {
    const r = evaluateUnsold983(purchased({ isOverconcentration: true }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons?.map((x) => x.code)).toContain("MISSING_AREA");
  });
});

describe("D5-03 풀 파이프라인 — calculateTransferTax 진입", () => {
  const SELF_BUILT_REDUCTION = {
    type: "unsold_98_3" as const,
    residencyType983: "resident" as const,
    houseType983: "self_built" as const,
    constructionStartDate983: new Date("2009-03-01"),
    usageApprovalDate983: new Date("2009-12-01"),
    isOutsideSeoulNotDesignated983: true,
    isOverconcentration983: false,
    isNotExcludedSelfBuilt983: true,
    // isUnsoldConfirmed983 미선언 (폼 기본값 false와 동치)
    standardPriceAtAcquisition983: 200_000_000,
    standardPriceAt5Years983: 300_000_000,
    standardPriceAtTransfer983: 400_000_000,
  };

  it("D5-03-10: 자기건설 신축주택 5년 내 양도 — 미분양 확인 미선언에도 100% 세액감면", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2009-12-01"),
        transferDate: new Date("2013-06-01"),
        householdHousingCount: 2,
        reductions: [SELF_BUILT_REDUCTION],
      }),
      makeMockRates(),
    );
    expect(r.unsold983Detail?.isEligible).toBe(true);
    expect(r.reductionTypeApplied).toBe("unsold_98_3");
    expect(r.reductionAmount).toBe(r.calculatedTax);
    expect(r.determinedTax).toBe(0);
  });

  it("D5-03-11 대조군: 자기건설 확인 토글(법②단서) 미선언이면 여전히 불적격", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2009-12-01"),
        transferDate: new Date("2013-06-01"),
        householdHousingCount: 2,
        reductions: [{ ...SELF_BUILT_REDUCTION, isNotExcludedSelfBuilt983: false }],
      }),
      makeMockRates(),
    );
    expect(r.unsold983Detail?.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
  });
});

describe("D5-03 ⑧ validate — 면적 필수 규칙도 사업주체 취득분에만", () => {
  const form = (over: Record<string, unknown>): TransferFormData => {
    const reduction = {
      ...getReductionDefault("unsold_98_3"),
      residencyType983: "resident",
      isOutsideSeoulNotDesignated983: true,
      isOverconcentration983: true,
      standardPriceAtAcquisition983: "200000000",
      standardPriceAt5Years983: "300000000",
      standardPriceAtTransfer983: "400000000",
      ...over,
    } as AssetReductionForm;
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionDate: "2009-12-01",
      reductions: [reduction],
    };
    return { assets: [asset], transferDate: "2013-06-01" } as unknown as TransferFormData;
  };

  it("D5-03-12: 자기건설 + 과밀 + 면적 미입력 → validate 통과 (엔진과 대칭)", () => {
    const issue = validateStep2Reductions(
      2,
      form({
        houseType983: "self_built",
        constructionStartDate983: "2009-03-01",
        usageApprovalDate983: "2009-12-01",
        isNotExcludedSelfBuilt983: true,
      }),
    );
    expect(issue?.message ?? "").not.toContain("대지면적");
  });

  it("D5-03-13 대조군: 사업주체 취득 + 과밀 + 면적 미입력 → validate 차단", () => {
    const issue = validateStep2Reductions(
      2,
      form({
        houseType983: "purchased",
        contractDate983: "2009-06-15",
        isUnsoldConfirmed983: true,
        isFirstContract983: true,
        isNotOccupiedAtContract983: true,
        isNotRecontract983: true,
      }),
    );
    expect(issue?.message).toContain("대지면적");
  });
});
