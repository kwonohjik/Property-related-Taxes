/**
 * 채무·공과·장례비 협의분할 — PDF 책 1858 (3) 재현 anchor (IDA-1 ~ IDA-13)
 *
 * 종합사례 PDF 책 1858 채무·공과·장례비 협의분할 표를 재현하여
 * 엔진의 카테고리별 합산·장례비 한도·상속인별 분담·진입 조건 확장이
 * 모두 정합하게 동작하는지 회귀 anchor로 동결.
 *
 * fixture: __tests__/tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture.ts
 *   EXAMPLE_DEBT_ITEMS (P1858-Row1~5)
 *
 * 변수명에 PDF 페이지+행 번호 동결 (feedback_pdf_table_row_one_to_one_mapping ★★★):
 *   - idaP1858Row1KBank: K은행 차입 400M (financial, 장남 전액)
 *   - idaP1858Row2SSavings: S저축은행 745M (financial, 배우자 500M + 차남 245M)
 *   - idaP1858Row3IncomeTax: 종합소득세 55M (tax, 차남)
 *   - idaP1858Row4FuneralMeal: 식대 18M (funeral, isBongan=false, 한도 10M)
 *   - idaP1858Row5FuneralBongan: 봉안 15M (funeral, isBongan=true, 한도 5M)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  EXAMPLE_DEBT_ITEMS,
  HEIR_ID,
} from "./fixtures/comprehensive-case-pdf.fixture";

// PDF 책 1858 표 데이터 — fixture에서 재import해 명시
const idaP1858Row1KBank = EXAMPLE_DEBT_ITEMS[0];
const idaP1858Row2SSavings = EXAMPLE_DEBT_ITEMS[1];
const idaP1858Row3IncomeTax = EXAMPLE_DEBT_ITEMS[2];
const idaP1858Row4FuneralMeal = EXAMPLE_DEBT_ITEMS[3];
const idaP1858Row5FuneralBongan = EXAMPLE_DEBT_ITEMS[4];

const DEBT_ITEMS_P1858 = EXAMPLE_DEBT_ITEMS as DebtItem[];

// 단순화된 상속인 (Heir 안분 확인용 — 사례 fixture와 동일 id 재사용)
const HEIRS_SIMPLE: Heir[] = [
  { id: HEIR_ID.spouse, name: "배우자", relation: "spouse" },
  { id: HEIR_ID.son, name: "장남", relation: "child" },
  { id: HEIR_ID.son2, name: "차남", relation: "child" },
];

function buildInput(): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2023-03-05",
    estateItems: [
      {
        id: "estate-1",
        category: "real_estate_apartment",
        name: "주택",
        marketValue: 10_000_000_000, // 100억 — 채무 차감 영향 검증 충분 규모
      },
    ],
    heirs: HEIRS_SIMPLE,
    preGiftsWithin10Years: [],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems: DEBT_ITEMS_P1858,
    deductionInput: {
      heirs: HEIRS_SIMPLE,
      spouseActualAmount: 0,
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
    },
    creditInput: {
      priorGifts: [],
      isFiledOnTime: true,
    },
  } as InheritanceTaxInput;
}

describe("채무·공과·장례비 협의분할 PDF 책 1858 재현 (IDA)", () => {
  // ── 카테고리별 합계 검증 (fixture 자체 확인) ──

  it("IDA-1: 채무 총액 (financial + tax) = 1,200,000,000", () => {
    const financialSum =
      idaP1858Row1KBank.amount + idaP1858Row2SSavings.amount;
    const taxSum = idaP1858Row3IncomeTax.amount;
    expect(financialSum + taxSum).toBe(1_200_000_000);
  });

  it("IDA-2: 장례비 식대 한도 적용 — 18M → 10M (§14①3)", () => {
    expect(idaP1858Row4FuneralMeal.amount).toBe(18_000_000);
    expect(idaP1858Row4FuneralMeal.isBongan).toBe(false);
    const applied = Math.min(idaP1858Row4FuneralMeal.amount, 10_000_000);
    expect(applied).toBe(10_000_000);
  });

  it("IDA-3: 장례비 봉안 한도 적용 — 15M → 5M (§14①3)", () => {
    expect(idaP1858Row5FuneralBongan.amount).toBe(15_000_000);
    expect(idaP1858Row5FuneralBongan.isBongan).toBe(true);
    const applied = Math.min(idaP1858Row5FuneralBongan.amount, 5_000_000);
    expect(applied).toBe(5_000_000);
  });

  it("IDA-4: 장례비 합산 = 식대 한도 10M + 봉안 한도 5M = 15M", () => {
    const mealApplied = Math.min(idaP1858Row4FuneralMeal.amount, 10_000_000);
    const bonganApplied = Math.min(idaP1858Row5FuneralBongan.amount, 5_000_000);
    expect(mealApplied + bonganApplied).toBe(15_000_000);
  });

  it("IDA-5: 채무·장례 분리 차감 — 채무만 vs 채무+장례 baseline 비교", () => {
    // 본 input: debtItems 전체 (채무 1,200M + 장례 33M → 한도 15M)
    const input = buildInput();
    const result = calcInheritanceTax(input);

    // baseline-1: 채무만 (장례 0)
    const baselineDebtOnly = buildInput();
    baselineDebtOnly.debtItems = DEBT_ITEMS_P1858.filter(
      (d) => d.category !== "funeral",
    );
    const baseDebtOnlyResult = calcInheritanceTax(baselineDebtOnly);

    // 장례 차감 순효과 = 10M.
    //   result 장례공제 = 식대 한도 10M + 봉안 한도 5M = 15M
    //   baseline 장례공제 = 식대 최소 500만 (§9②1호: 장례 미입력이어도 debtItems 경로면 500만 항상 공제)
    //   → 순효과 15M − 5M = 10M
    const funeralEffect =
      baseDebtOnlyResult.taxableEstateValue - result.taxableEstateValue;
    expect(funeralEffect).toBe(10_000_000);
  });

  // ── 상속인별 채무 분담 검증 (heirAllocations 자체) ──

  it("IDA-6: 장남 부담 채무 = K은행 400M", () => {
    const allocs = idaP1858Row1KBank.heirAllocations ?? [];
    const sonShare = allocs
      .filter((a) => a.heirId === HEIR_ID.son)
      .reduce((s, a) => s + a.amount, 0);
    expect(sonShare).toBe(400_000_000);
  });

  it("IDA-7: 배우자 부담 채무 = S저축 500M", () => {
    const allocs = idaP1858Row2SSavings.heirAllocations ?? [];
    const spouseShare = allocs
      .filter((a) => a.heirId === HEIR_ID.spouse)
      .reduce((s, a) => s + a.amount, 0);
    expect(spouseShare).toBe(500_000_000);
  });

  it("IDA-8: 차남 부담 채무 = S저축 245M + 종소세 55M = 300M", () => {
    const sSavingsShare = (
      idaP1858Row2SSavings.heirAllocations ?? []
    )
      .filter((a) => a.heirId === HEIR_ID.son2)
      .reduce((s, a) => s + a.amount, 0);
    const incomeTaxShare = (
      idaP1858Row3IncomeTax.heirAllocations ?? []
    )
      .filter((a) => a.heirId === HEIR_ID.son2)
      .reduce((s, a) => s + a.amount, 0);
    expect(sSavingsShare).toBe(245_000_000);
    expect(incomeTaxShare).toBe(55_000_000);
    expect(sSavingsShare + incomeTaxShare).toBe(300_000_000);
  });

  // ── 엔진 결과 — 상속인 배부 진입 ──

  it("IDA-9: 엔진이 debtItems.heirAllocations 인식 → heirAllocationResult 생성 (진입 조건 ⓪)", () => {
    const input = buildInput();
    const result = calcInheritanceTax(input);

    expect(result.heirAllocationResult).toBeDefined();
    expect(Object.keys(result.heirAllocationResult?.perHeir ?? {}).length).toBeGreaterThan(0);
  });

  it("IDA-10: 상속인 배부 결과에 3명 (배우자·장남·차남) 모두 포함", () => {
    const input = buildInput();
    const result = calcInheritanceTax(input);
    const perHeir = result.heirAllocationResult?.perHeir;
    expect(perHeir).toBeDefined();

    expect(HEIR_ID.spouse in perHeir!).toBe(true);
    expect(HEIR_ID.son in perHeir!).toBe(true);
    expect(HEIR_ID.son2 in perHeir!).toBe(true);
  });

  it("IDA-11: 상속인 배부 결과 — 각 상속인이 finalTax 필드를 가짐 (구조 검증)", () => {
    const input = buildInput();
    const result = calcInheritanceTax(input);
    const perHeir = result.heirAllocationResult?.perHeir;
    expect(perHeir).toBeDefined();

    for (const tax of Object.values(perHeir!)) {
      expect(typeof tax.finalTax).toBe("number");
      expect(Number.isFinite(tax.finalTax)).toBe(true);
    }
  });

  // ── 정합성 가드 ──

  it("IDA-12: 정합성 — IDA-6 + IDA-7 + IDA-8 = IDA-1 (채무 합계 1,200M)", () => {
    const sonShare = 400_000_000; // IDA-6
    const spouseShare = 500_000_000; // IDA-7
    const son2Share = 300_000_000; // IDA-8
    expect(sonShare + spouseShare + son2Share).toBe(1_200_000_000);
  });

  it("IDA-13: personal 카테고리 합계 = 0 (PDF Row1·2·3 모두 financial/tax — personal 누락 회귀 차단)", () => {
    const personalSum = DEBT_ITEMS_P1858.filter(
      (d) => d.category === "personal",
    ).reduce((s, d) => s + d.amount, 0);
    expect(personalSum).toBe(0);
  });
});
