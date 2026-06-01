/**
 * Pre-Do anchor — 상속세 3개 서식 어댑터 (R-1·R-2·R-C1 확정)
 * 계획 §6 / 설계 §5~6.
 */
import { describe, it, expect } from "vitest";
import {
  buildBuppyo3Data,
  buildBesshi5Data,
  buildBesshi1Data,
  DEBT_CATEGORY_LABEL,
  FAMILY_BUSINESS_CATEGORY_LABEL,
} from "@/lib/calc/deduction-besshi-data";
import type { InheritanceTaxResult, DebtItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function mkResult(deductionDetail: unknown, valuationResults: unknown[] = []): InheritanceTaxResult {
  return { deductionDetail, valuationResults } as unknown as InheritanceTaxResult;
}
const baseDeduction = {
  basicDeduction: 0,
  spouseDeduction: 0,
  personalDeductionTotal: 0,
  lumpSumDeduction: 0,
  financialDeduction: 0,
  cohabitationDeduction: 0,
  farmingDeduction: 0,
  familyBusinessDeduction: 0,
  totalDeduction: 0,
  chosenMethod: "lump_sum" as const,
};

describe("buildBuppyo3Data — 부표3 (가·나·다·라)", () => {
  it("E-1 채무/공과금/장례비 carve-out + 합계 + 봉안 병기 (이미지1)", () => {
    const debts: DebtItem[] = [
      { id: "1", category: "financial", name: "은행채무", amount: 745_000_000, incurredDate: "2021-06-20", creditorAddress: "강남구 역삼동" },
      { id: "2", category: "financial", name: "은행채무", amount: 400_000_000 },
      { id: "3", category: "tax", name: "종합소득세", amount: 55_000_000 },
      { id: "4", category: "funeral", name: "장례비(식대 등)", amount: 10_000_000 },
      { id: "5", category: "funeral", name: "봉안시설 사용료", amount: 5_000_000, isBongan: true },
    ];
    const d = buildBuppyo3Data(mkResult(baseDeduction), debts);
    expect(d.debtRows.length).toBe(2);
    expect(d.debtTotal).toBe(1_145_000_000);
    expect(d.utilityTotal).toBe(55_000_000);
    expect(d.funeralRows.length).toBe(2);
    expect(d.funeralTotal).toBe(15_000_000);
    expect(d.funeralRows[1].detail).toContain("봉안시설");
    expect(d.debtRows[0].kindLabel).toBe("은행채무"); // R-5 name 우선
    expect(d.debtRows[0].creditorAddress).toBe("강남구 역삼동");
  });

  it("E-2 일괄공제 채택 → ⑱ null, ㉓ = lumpSumDeduction (R-1)", () => {
    const d = buildBuppyo3Data(
      mkResult({ ...baseDeduction, basicDeduction: 200_000_000, lumpSumDeduction: 500_000_000, totalDeduction: 500_000_000, chosenMethod: "lump_sum", lumpSumComparisonDetail: { selectedMethod: "lump_sum" } }),
      [],
    );
    expect(d.deduction.basic).toBeNull();
    expect(d.deduction.lumpSum).toBe(500_000_000);
    expect(d.deduction.total).toBe(500_000_000);
  });

  it("E-3 항목별 채택 → ⑱ = basicDeduction, ㉓ null, 인적공제 4칸 null (R-1)", () => {
    const d = buildBuppyo3Data(
      mkResult({ ...baseDeduction, basicDeduction: 200_000_000, lumpSumDeduction: 0, totalDeduction: 200_000_000, chosenMethod: "itemized", lumpSumComparisonDetail: { selectedMethod: "itemized" } }),
      [],
    );
    expect(d.deduction.basic).toBe(200_000_000);
    expect(d.deduction.lumpSum).toBeNull();
    expect(d.deduction.child).toBeNull();
    expect(d.deduction.disabled).toBeNull();
  });

  it("E-4 deductionLimitDetail undefined → ㉘=0, ㉚=null (R-2)", () => {
    const d = buildBuppyo3Data(mkResult(baseDeduction), []);
    expect(d.deduction.disaster).toBe(0);
    expect(d.deduction.ceiling).toBeNull();
  });

  it("E-5 deductionLimitDetail 존재 → ㉘·㉚ 채움 (R-2)", () => {
    const d = buildBuppyo3Data(
      mkResult({ ...baseDeduction, deductionLimitDetail: { ceiling: 5_965_000_000, disasterLossDeduction: 0 } }),
      [],
    );
    expect(d.deduction.ceiling).toBe(5_965_000_000);
  });

  it("E-9b legacy fallback (debtItems 미입력)", () => {
    const d = buildBuppyo3Data(mkResult(baseDeduction), undefined, { funeralExpense: 12_000_000, funeralIncludesBongan: true, debts: 30_000_000 });
    expect(d.funeralRows.length).toBe(1);
    expect(d.funeralRows[0].detail).toContain("봉안시설");
    expect(d.debtRows.length).toBe(1);
    expect(d.debtTotal).toBe(30_000_000);
  });
});

describe("buildBesshi5Data — 별지5호 (금융재산공제)", () => {
  function mk(rows: { label: string; amount: number }[], netFinancial: number, cappedDeduction: number, financialDeduction: number) {
    return mkResult({ ...baseDeduction, financialDeduction, financialDeductionDetail: { rows, netFinancial, cappedDeduction, bracket: "tier3", rate: 0.2, rawDeduction: 0, cap: 200_000_000 } });
  }
  it("E-6 계산사례 라 (11억→2억) + 자기일관 ①−②=③ (R-C1)", () => {
    const b5 = buildBesshi5Data(mk([{ label: "예금", amount: 1_200_000_000 }, { label: "금융채무", amount: 100_000_000 }], 1_100_000_000, 200_000_000, 200_000_000));
    expect(b5).not.toBeNull();
    expect(b5!.assetTotal).toBe(1_200_000_000); // ①
    expect(b5!.debtTotal).toBe(100_000_000); // ②
    expect(b5!.netFinancial).toBe(1_100_000_000); // ③
    expect(b5!.capLimit).toBe(200_000_000); // ④
    expect(b5!.deduction).toBe(200_000_000); // ⑤
    expect(b5!.assetTotal - b5!.debtTotal).toBe(b5!.netFinancial); // 자기일관
  });
  it("E-7 계산사례 다 (1.2억→2,400만)", () => {
    const b5 = buildBesshi5Data(mk([{ label: "예금", amount: 140_000_000 }, { label: "금융채무", amount: 20_000_000 }], 120_000_000, 24_000_000, 24_000_000));
    expect(b5!.netFinancial).toBe(120_000_000);
    expect(b5!.capLimit).toBe(24_000_000);
    expect(b5!.deduction).toBe(24_000_000);
  });
  it("E-9 financialDeductionDetail 없음 → null (렌더 가드)", () => {
    expect(buildBesshi5Data(mkResult({ ...baseDeduction, financialDeduction: 0 }))).toBeNull();
  });
  it("R-C1 rows label 분리: 자산 4종 / 채무 금융채무 1행", () => {
    const b5 = buildBesshi5Data(mk(
      [{ label: "예금", amount: 100 }, { label: "상장주식", amount: 200 }, { label: "보험금", amount: 50 }, { label: "기타금융", amount: 10 }, { label: "금융채무", amount: 60 }],
      300, 60, 60,
    ));
    expect(b5!.assetRows.length).toBe(4);
    expect(b5!.debtRows.length).toBe(1);
    expect(b5!.debtRows[0].kindLabel).toBe("금융채무");
  });
});

describe("buildBesshi1Data — 별지1호 (가업상속공제)", () => {
  it("E-11 가업 적용 + 평가액 valuationResults + 중소/상장 (R-B2)", () => {
    const r = mkResult(
      { ...baseDeduction, familyBusinessDeduction: 500_000_000, familyBusinessDetail: { deduction: 500_000_000, operatingYears: 25, appliedCap: 40_000_000_000, eligible: true } },
      [{ estateItemId: "s1", valuatedAmount: 500_000_000 }],
    );
    const b1 = buildBesshi1Data(
      r,
      [{ id: "s1", category: "unlisted_stock", name: "M사 주식", familyBusinessCategory: "corporate_stock" }] as never,
      { enterpriseSize: "sme", isListedOnExchange: false, operatingYears: 25 } as never,
    );
    expect(b1).not.toBeNull();
    expect(b1!.declaredAmount).toBe(500_000_000);
    expect(b1!.operatingYears).toBe(25);
    expect(b1!.isSme).toBe(true);
    expect(b1!.isMedium).toBe(false);
    expect(b1!.isListed).toBe(false);
    expect(b1!.assetRows[0].kindLabel).toBe("법인 주식");
    expect(b1!.assetRows[0].amount).toBe(500_000_000); // valuatedAmount (not marketValue)
  });
  it("E-12 가업 미적용(deduction=0) → null (렌더 가드)", () => {
    expect(buildBesshi1Data(mkResult({ ...baseDeduction, familyBusinessDetail: { deduction: 0 } }), [], undefined)).toBeNull();
  });
  it("E-13 familyBusinessInput 미전달 → 나·다 일부 undefined, 영위기간·신고액 채움", () => {
    const b1 = buildBesshi1Data(
      mkResult({ ...baseDeduction, familyBusinessDeduction: 300_000_000, familyBusinessDetail: { deduction: 300_000_000, operatingYears: 15, appliedCap: 30_000_000_000, eligible: true } }),
      [],
      undefined,
    );
    expect(b1!.isSme).toBeUndefined();
    expect(b1!.operatingYears).toBe(15);
    expect(b1!.declaredAmount).toBe(300_000_000);
  });
});

describe("코드 매핑 (E-14)", () => {
  it("DEBT_CATEGORY_LABEL · FAMILY_BUSINESS_CATEGORY_LABEL 전수", () => {
    expect(DEBT_CATEGORY_LABEL.financial).toBe("금융채무");
    expect(DEBT_CATEGORY_LABEL.funeral).toBe("장례비");
    expect(Object.keys(FAMILY_BUSINESS_CATEGORY_LABEL).length).toBe(6);
    expect(FAMILY_BUSINESS_CATEGORY_LABEL.corporate_stock).toBe("법인 주식");
  });
});
