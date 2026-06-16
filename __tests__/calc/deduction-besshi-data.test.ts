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

  it("E-1b 장례비 한도 초과 → 행별 한도내 공제액만 출력 (식대 18M→10M, 봉안 15M→5M, ⑰계 15M)", () => {
    const debts: DebtItem[] = [
      { id: "1", category: "funeral", name: "장례식대", amount: 18_000_000 },
      { id: "2", category: "funeral", name: "봉안시설 사용료", amount: 15_000_000, isBongan: true },
    ];
    const d = buildBuppyo3Data(mkResult(baseDeduction), debts);
    expect(d.funeralRows.length).toBe(2);
    expect(d.funeralRows[0].amount).toBe(10_000_000); // 식대 한도 1,000만
    expect(d.funeralRows[1].amount).toBe(5_000_000); // 봉안 한도 500만
    expect(d.funeralTotal).toBe(15_000_000); // ⑰ 계 = funeralDeduction
  });

  it("E-1c 식대 복수행 합계 한도 초과 → 카테고리 합 기준 1,000만 (8M+6M→10M)", () => {
    const debts: DebtItem[] = [
      { id: "1", category: "funeral", name: "장례식대", amount: 8_000_000 },
      { id: "2", category: "funeral", name: "음식 접대비", amount: 6_000_000 },
    ];
    const d = buildBuppyo3Data(mkResult(baseDeduction), debts);
    expect(d.funeralRows[0].amount).toBe(8_000_000);
    expect(d.funeralRows[1].amount).toBe(2_000_000); // 잔여 한도 소진
    expect(d.funeralTotal).toBe(10_000_000);
  });

  it("E-1d 식대 500만 미만 → 마지막 식대 행에 최소 500만 보정 (300만→500만, ⑰계 500만)", () => {
    const debts: DebtItem[] = [
      { id: "1", category: "funeral", name: "장례식장", amount: 3_000_000 },
    ];
    const d = buildBuppyo3Data(mkResult(baseDeduction), debts);
    expect(d.funeralRows.length).toBe(1);
    expect(d.funeralRows[0].amount).toBe(5_000_000); // §9②1호 최소 500만
    expect(d.funeralTotal).toBe(5_000_000);
  });

  it("E-1e 봉안만 입력(식대 행 없음) → 식대 최소 500만 합성 행 + 봉안 (200만), ⑰계 700만", () => {
    const debts: DebtItem[] = [
      { id: "1", category: "funeral", name: "봉안당", amount: 2_000_000, isBongan: true },
    ];
    const d = buildBuppyo3Data(mkResult(baseDeduction), debts);
    expect(d.funeralRows.length).toBe(2); // 합성 식대 행 + 봉안 행
    expect(d.funeralRows[0].amount).toBe(5_000_000); // 합성 식대 최소
    expect(d.funeralTotal).toBe(7_000_000);
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

  // ── §14 담보채무 자동도출분 「가. 채무」 표시 (설계 §6 A1~A4) ──
  const withCollateral = (
    deductionDetail: unknown,
    collateral: { estateItemId: string; creditorName: string; amount: number; financialDebtAmount: number }[],
  ): InheritanceTaxResult =>
    ({ ...mkResult(deductionDetail), collateralDebtDetail: collateral }) as InheritanceTaxResult;

  it("A1 담보만 입력(debtItems 빈) → 「가.채무」에 자동도출분 표시", () => {
    const d = buildBuppyo3Data(
      withCollateral(baseDeduction, [
        { estateItemId: "e1", creditorName: "담보된 토지 담보채무", amount: 500_000_000, financialDebtAmount: 0 },
      ]),
      [],
    );
    expect(d.debtRows.length).toBe(1);
    expect(d.debtRows[0].kindLabel).toBe("담보된 토지 담보채무");
    expect(d.debtRows[0].amount).toBe(500_000_000);
    expect(d.debtTotal).toBe(500_000_000);
  });

  it("A2 수동 financial + 담보 자동도출 합산", () => {
    const d = buildBuppyo3Data(
      withCollateral(baseDeduction, [
        { estateItemId: "e1", creditorName: "담보된 토지 담보채무", amount: 500_000_000, financialDebtAmount: 0 },
      ]),
      [{ id: "d1", category: "financial", name: "은행대출", amount: 300_000_000 }],
    );
    expect(d.debtRows.length).toBe(2);
    expect(d.debtTotal).toBe(800_000_000);
  });

  it("A3 legacy 회귀 — debtItems·담보 모두 없음 → legacy 행 유지", () => {
    const d = buildBuppyo3Data(
      withCollateral(baseDeduction, []),
      undefined,
      { funeralExpense: 0, funeralIncludesBongan: false, debts: 100_000_000 },
    );
    expect(d.debtRows.length).toBe(1);
    expect(d.debtTotal).toBe(100_000_000);
    expect(d.debtRows[0].kindLabel).toBe("채무·공과금");
  });

  it("A4 공과금(tax) + 담보 자동도출 — 가.채무엔 담보만, 나.공과금 불변", () => {
    const d = buildBuppyo3Data(
      withCollateral(baseDeduction, [
        { estateItemId: "e1", creditorName: "담보된 토지 담보채무", amount: 500_000_000, financialDebtAmount: 0 },
      ]),
      [{ id: "d1", category: "tax", name: "재산세", amount: 25_000_000 }],
    );
    expect(d.debtRows.length).toBe(1);
    expect(d.debtRows[0].amount).toBe(500_000_000);
    expect(d.utilityRows.length).toBe(1);
    expect(d.utilityTotal).toBe(25_000_000);
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

  // ── §14 담보 금융저당분 §22 「채무」 표시 (설계 §5 B5-A1~A3) ──
  it("B5-A1 항목별 모드 — fdd.rows 담보 금융저당분이 debtRows에 포함 → 자기일관 ①−②=③", () => {
    const estateItems = [
      { id: "a1", category: "financial", name: "신한은행 예금", marketValue: 1_200_000_000 },
    ] as unknown as Parameters<typeof buildBesshi5Data>[1];
    const debtItems: DebtItem[] = [
      { id: "d1", category: "financial", name: "은행대출", amount: 100_000_000 },
    ];
    const result = mk(
      [
        { label: "예금", amount: 1_200_000_000 },
        { label: "금융채무", amount: 100_000_000 },
        { label: "담보 금융저당", amount: 50_000_000 },
      ],
      1_050_000_000, // ③ netFinancial = 12억 − 1억 − 5천만
      200_000_000,
      200_000_000,
    );
    const b5 = buildBesshi5Data(result, estateItems, debtItems);
    expect(b5!.assetTotal).toBe(1_200_000_000); // ① 저당분 무관(자산가치 불변)
    expect(b5!.debtTotal).toBe(150_000_000); // ② 금융채무 1억 + 담보 금융저당 5천만
    expect(b5!.debtRows.map((r) => r.kindLabel)).toContain("담보 금융저당");
    expect(b5!.assetTotal - b5!.debtTotal).toBe(b5!.netFinancial); // 자기일관 ①−②=③
  });

  it("B5-A2 legacy 모드 — 담보 금융저당분이 assetRows 아닌 debtRows로 분류", () => {
    const b5 = buildBesshi5Data(
      mk(
        [
          { label: "예금", amount: 1_200_000_000 },
          { label: "담보 금융저당", amount: 50_000_000 },
        ],
        1_150_000_000, // ③ = 12억 − 5천만
        200_000_000,
        200_000_000,
      ),
    );
    expect(b5!.assetRows.map((r) => r.kindLabel)).not.toContain("담보 금융저당");
    expect(b5!.debtRows.map((r) => r.kindLabel)).toContain("담보 금융저당");
    expect(b5!.assetTotal).toBe(1_200_000_000); // ① 예금만
    expect(b5!.debtTotal).toBe(50_000_000); // ② 담보 금융저당
    expect(b5!.assetTotal - b5!.debtTotal).toBe(b5!.netFinancial); // ①−②=③
  });

  it("B5-A3 저당분 없음 → 회귀 (debtRows 불변)", () => {
    const b5 = buildBesshi5Data(
      mk([{ label: "예금", amount: 140_000_000 }, { label: "금융채무", amount: 20_000_000 }], 120_000_000, 24_000_000, 24_000_000),
    );
    expect(b5!.debtRows.length).toBe(1);
    expect(b5!.debtRows[0].kindLabel).toBe("금융채무");
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

  it("E-8 항목별 기재: estateItems·debtItems 제공 시 합계 1행 금지 — 입력한 대로 (금융채무 2건)", () => {
    const estateItems = [
      { id: "a1", category: "financial", name: "신한은행 예금", marketValue: 1_200_000_000 },
      { id: "a2", category: "financial", name: "국민은행 예금", marketValue: 900_000_000 },
      { id: "a3", category: "listed_stock", name: "삼성전자", marketValue: 150_000_000 },
    ] as unknown as Parameters<typeof buildBesshi5Data>[1];
    const debtItems: DebtItem[] = [
      { id: "d1", category: "financial", name: "은행대출1", amount: 745_000_000 },
      { id: "d2", category: "financial", name: "은행대출2", amount: 400_000_000 },
    ];
    const result = mk([{ label: "예금", amount: 2_100_000_000 }, { label: "금융채무", amount: 1_145_000_000 }], 1_105_000_000, 200_000_000, 200_000_000);
    const heirs = [
      { id: "h1", relation: "child", name: "김자녀", residentNumber: "900202-2000000" },
      { id: "h2", relation: "spouse", name: "김 마누라", residentNumber: "550303-2000000" },
    ] as unknown as Parameters<typeof buildBesshi5Data>[3];
    const b5 = buildBesshi5Data(result, estateItems, debtItems, heirs, "홍길동", "400101-1234567");
    // 상속인 성명·주민번호 = 대표 상속인(sortHeirs 1순위 = 배우자)
    expect(b5!.heirName).toBe("김 마누라");
    expect(b5!.heirResidentNumber).toBe("550303-2000000");
    // 피상속인 인적사항 (Step1 입력 pass-through)
    expect(b5!.decedentName).toBe("홍길동");
    expect(b5!.decedentResidentNumber).toBe("400101-1234567");
    // 자산: 합계 1행이 아니라 입력 3건 그대로
    expect(b5!.assetRows.length).toBe(3);
    expect(b5!.assetRows[0].kindLabel).toBe("신한은행 예금");
    expect(b5!.assetRows[1].amount).toBe(900_000_000);
    // 채무: 합계 1행이 아니라 입력 2건 그대로
    expect(b5!.debtRows.length).toBe(2);
    expect(b5!.debtRows.map((r) => r.kindLabel)).toEqual(["은행대출1", "은행대출2"]);
    expect(b5!.debtTotal).toBe(1_145_000_000); // ② 합계는 동일
    // ③④⑤는 엔진 fdd 단일출처 유지
    expect(b5!.netFinancial).toBe(1_105_000_000);
    expect(b5!.deduction).toBe(200_000_000);
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
  it("B1-LISTED-1 상장여부 자동 판정 — fbi 미입력+비상장주식 가업자산 → isListed=false (자동 비상장)", () => {
    const r = mkResult(
      { ...baseDeduction, familyBusinessDeduction: 500_000_000, familyBusinessDetail: { deduction: 500_000_000, operatingYears: 25, appliedCap: 40_000_000_000, eligible: true } },
      [{ estateItemId: "s1", valuatedAmount: 500_000_000 }],
    );
    const b1 = buildBesshi1Data(
      r,
      [{ id: "s1", category: "unlisted_stock", name: "M 주식회사", familyBusinessCategory: "corporate_stock" }] as never,
      undefined,
    );
    expect(b1!.isListed).toBe(false);
  });
  it("B1-LISTED-2 상장여부 자동 판정 — 상장주식 가업자산 → isListed=true (자동 상장)", () => {
    const r = mkResult(
      { ...baseDeduction, familyBusinessDeduction: 500_000_000, familyBusinessDetail: { deduction: 500_000_000, operatingYears: 25, appliedCap: 40_000_000_000, eligible: true } },
      [{ estateItemId: "s1", valuatedAmount: 500_000_000 }],
    );
    const b1 = buildBesshi1Data(
      r,
      [{ id: "s1", category: "listed_stock", name: "M 주식회사", companyName: "M 주식회사", familyBusinessCategory: "corporate_stock" }] as never,
      undefined,
    );
    expect(b1!.isListed).toBe(true);
    expect(b1!.businessName).toBe("M 주식회사"); // companyName fallback
  });
  it("B1-LISTED-3 명시 입력 override — 자산은 비상장이나 isListedOnExchange:true 우선", () => {
    const r = mkResult(
      { ...baseDeduction, familyBusinessDeduction: 500_000_000, familyBusinessDetail: { deduction: 500_000_000, operatingYears: 25, appliedCap: 40_000_000_000, eligible: true } },
      [{ estateItemId: "s1", valuatedAmount: 500_000_000 }],
    );
    const b1 = buildBesshi1Data(
      r,
      [{ id: "s1", category: "unlisted_stock", name: "M사 주식", familyBusinessCategory: "corporate_stock" }] as never,
      { enterpriseSize: "sme", isListedOnExchange: true, operatingYears: 25 } as never,
    );
    expect(b1!.isListed).toBe(true);
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

  // ── Phase 1 (Group A): 다 피상속인 · 라 가업상속인 인적사항 ──
  const fbR = () =>
    mkResult(
      { ...baseDeduction, familyBusinessDeduction: 500_000_000, familyBusinessDetail: { deduction: 500_000_000, operatingYears: 25, appliedCap: 40_000_000_000, eligible: true } },
      [{ estateItemId: "s1", valuatedAmount: 500_000_000 }],
    );
  const fbHeirs = [
    { id: "h1", relation: "child", name: "김자녀", residentNumber: "900101-1000000" },
    { id: "h2", relation: "spouse", name: "김배우", residentNumber: "600202-2000000" },
  ] as never;

  it("B1-A1 다 피상속인(Step1) + 라 가업상속인(heirAllocations 수령자 = 자녀 ≠ sortHeirs 1순위 배우자)", () => {
    const estate = [{
      id: "s1", category: "unlisted_stock", name: "M사 주식", familyBusinessCategory: "corporate_stock",
      heirAllocations: [{ heirId: "h1", amount: 500_000_000 }],
    }] as never;
    const b1 = buildBesshi1Data(fbR(), estate, undefined, fbHeirs, "홍피상", "350303-1000000");
    expect(b1!.decedentName).toBe("홍피상");
    expect(b1!.decedentResidentId).toBe("350303-1000000");
    // 가업자산 수령자 h1(자녀) — sortHeirs 1순위 배우자가 아님 → C-1 식별 검증
    expect(b1!.heirName).toBe("김자녀");
    expect(b1!.heirResidentNumber).toBe("900101-1000000");
  });

  it("B1-A2 라 가업상속인 — heirAllocations 미입력 시 대표 상속인(sortHeirs[0]) fallback", () => {
    const estate = [{ id: "s1", category: "unlisted_stock", name: "M사 주식", familyBusinessCategory: "corporate_stock" }] as never;
    const b1 = buildBesshi1Data(fbR(), estate, undefined, fbHeirs);
    expect(b1!.heirName).toBe("김배우"); // sortHeirs 1순위 = 배우자
    expect(b1!.heirResidentNumber).toBe("600202-2000000");
  });

  // ── Phase 2 (Group B): 가 상호 · 마 수량/단가 ──
  it("B1-B1 마 주식 수량/단가 + 가 상호 — 비상장 ownedShares·1주당 가액(가액÷수량 역산)", () => {
    const estate = [{
      id: "s1", category: "unlisted_stock", name: "M사 주식", familyBusinessCategory: "corporate_stock",
      unlistedStockValuationV2: { ownedShares: 10_000, corpName: "M 주식회사" },
    }] as never;
    const b1 = buildBesshi1Data(fbR(), estate, undefined, fbHeirs);
    expect(b1!.assetRows[0].quantity).toBe("10,000주");
    expect(b1!.assetRows[0].unitPrice).toBe(50_000); // floor(500,000,000 / 10,000)
    expect(b1!.businessName).toBe("M 주식회사"); // corpName 우선
  });

  it("B1-B2 마 부동산 수량(면적)/단가 — areaSqm·㎡단가", () => {
    const r = mkResult(
      { ...baseDeduction, familyBusinessDeduction: 400_000_000, familyBusinessDetail: { deduction: 400_000_000, operatingYears: 20, appliedCap: 40_000_000_000, eligible: true } },
      [{ estateItemId: "l1", valuatedAmount: 400_000_000 }],
    );
    const estate = [{ id: "l1", category: "real_estate_land", name: "공장용지", familyBusinessCategory: "business_real_estate", areaSqm: 200 }] as never;
    const b1 = buildBesshi1Data(r, estate, undefined, fbHeirs);
    expect(b1!.assetRows[0].quantity).toBe("200㎡");
    expect(b1!.assetRows[0].unitPrice).toBe(2_000_000); // 400,000,000 / 200
    expect(b1!.businessName).toBe("공장용지"); // corpName 없으면 name
  });

  // ── Phase 3 (Group C): familyBusinessInput 표시 전용 9필드 매핑 ──
  it("B1-C1 가·다·라 식별정보 — familyBusinessInput 표시 필드 → Besshi1Data 매핑", () => {
    const estate = [{ id: "s1", category: "unlisted_stock", name: "M사 주식", familyBusinessCategory: "corporate_stock" }] as never;
    const fbi = {
      enterpriseSize: "sme", isListedOnExchange: false, operatingYears: 25,
      businessRegistrationNumber: "123-45-67890",
      representativeName: "대표갑",
      representativeResidentNumber: "550101-1000000",
      openingDate: "2000-03-15",
      industryName: "제조업",
      decedentCeoTenure: "20년",
      decedentShareRatio: "60%",
      heirEngagementPeriod: "5년",
      heirOfficerAppointDate: "2023-09-30",
    } as never;
    const b1 = buildBesshi1Data(fbR(), estate, fbi, fbHeirs);
    expect(b1!.bizNo).toBe("123-45-67890");
    expect(b1!.representativeName).toBe("대표갑");
    expect(b1!.residentId).toBe("550101-1000000");
    expect(b1!.openDate).toBe("2000-03-15");
    expect(b1!.industry).toBe("제조업");
    expect(b1!.ceoTenure).toBe("20년");
    expect(b1!.shareRatio).toBe("60%");
    expect(b1!.heirEngagement).toBe("5년");
    expect(b1!.officerAppointDate).toBe("2023-09-30");
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
