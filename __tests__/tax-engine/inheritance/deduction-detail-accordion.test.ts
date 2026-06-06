/**
 * 상속공제 항목별 계산 근거 detail 노출 anchor (A-1~A-12)
 *
 * 계획: docs/00-pm/inheritance-deduction-breakdown-expandable.plan.md
 * 설계: docs/02-design/features/inheritance-deduction-breakdown.engine.design.md
 *
 * 교재 종합사례 (책 1852~1877) 원단위 toBe anchor.
 * EXAMPLE_INPUT 재사용 + A-7b 분해용 보강 fixture 별도 구성.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { calcInheritanceDeductions } from "@/lib/tax-engine/deductions/inheritance-deductions";
import {
  EXAMPLE_INPUT,
  EXAMPLE_HEIRS,
  EXAMPLE_ESTATE_ITEMS,
  EXAMPLE_DEBT_ITEMS,
  EXAMPLE_PRIOR_GIFTS,
  EXAMPLE_PRESUMED,
  HEIR_ID,
  DEATH_DATE,
} from "./fixtures/comprehensive-case-pdf.fixture";
import type {
  EstateItem,
  InheritanceTaxInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// A-7b 보강 fixture — estate_listed_h를 listed_stock으로 교정
// ============================================================
// 교재 §22 금융 4행 분해: 예금 2,100M + 상장주식 150M + 보험금 50M − 금융채무 1,145M = 순 1,155M
// 기존 fixture의 estate_listed_h는 category="other" → listed_stock으로 보강.
// court_deposit(공탁금 5M)은 교재에서 예금 합계에서 분리되어 표시되지 않으므로
// isFinancialAssetForDeduction=false로 지정해 집계 제외.

const ESTATE_ITEMS_WITH_LISTED_STOCK: EstateItem[] = EXAMPLE_ESTATE_ITEMS.map((item) => {
  if (item.id === "estate_listed_h") {
    return {
      ...item,
      category: "listed_stock" as const,
      name: "H사 상장주식 (소액주주, 2개월 평균종가 시가)",
    };
  }
  if (item.id === "estate_court_deposit") {
    // 공탁금: 교재 예금 합계에서 분리 — §22 금융 집계 제외
    return { ...item, isFinancialAssetForDeduction: false as const };
  }
  return item;
});

const EXAMPLE_INPUT_WITH_LISTED: InheritanceTaxInput = {
  ...EXAMPLE_INPUT,
  estateItems: ESTATE_ITEMS_WITH_LISTED_STOCK,
};

// ============================================================
// A-12 단순케이스 — Phase D 미발동(배우자만·자녀만·legatee 없음)
// ============================================================
const SIMPLE_INPUT: InheritanceTaxInput = {
  ...EXAMPLE_INPUT,
  heirs: [
    { id: "sp", relation: "spouse", isHeir: true, isGenerationSkipBeneficiary: false },
    { id: "ch1", relation: "child", isHeir: true, isGenerationSkipBeneficiary: false },
  ],
  preGiftsWithin10Years: [],
  presumedItems: [],
  debtItems: [],
  deductionInput: {
    heirs: [
      { id: "sp", relation: "spouse", isHeir: true, isGenerationSkipBeneficiary: false },
      { id: "ch1", relation: "child", isHeir: true, isGenerationSkipBeneficiary: false },
    ],
    spouseActualAmount: 1_000_000_000,
    netFinancialAssets: 0,
    cohabitHouseStdPrice: 0,
    farmingAssetValue: 0,
    familyBusinessValue: 0,
    // spouseLegalShareOverride 미설정 → Phase D 발동 조건 확인
    // 단순 케이스는 배우자 있고 legateeNonHeir=0, priorGiftDeductionTotal=0, 영리법인 없음
    // → wantsAutoSpouseLegalShare = true이지만 legalShareTable 조립은 여전히 됨
    // A-12는 "legatee 없음 단순 케이스" — legalShareTable은 Phase D 발동 시 항상 생성됨
    // 즉 A-12는 "spouseLegalShareOverride 명시 시 legalShareTable=undefined" 케이스로 재해석
    spouseLegalShareOverride: 2_000_000_000, // 명시 override → Phase D 미발동
  },
  creditInput: { priorGifts: [], isFiledOnTime: true },
  isGenerationSkip: false,
  isMinorHeir: false,
};

// ============================================================
// 테스트
// ============================================================

describe("상속공제 detail 노출 anchor (A-1~A-12)", () => {

  // ────────────────────────────────────────────
  // [A-1] 일괄공제 vs 항목별 비교 (§21)
  // ────────────────────────────────────────────
  describe("A-1: lumpSumComparisonDetail — 일괄 선택", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const d = result.deductionDetail.lumpSumComparisonDetail;

    it("A-1-1 detail 존재", () => {
      expect(d).toBeDefined();
    });

    it("A-1-2 itemizedSubtotal = 300,000,000 (기초2억+자녀2명1억; 배우자 연로자공제 제외 §20①3호)", () => {
      // 기초 200M + 자녀공제 2명×50M=100M = 300M
      // 배우자(85세)는 §20①3호 "배우자는 제외한다" → 연로자공제 0 (G2 정정, 종전 버그 350M).
      // 일괄공제 500M > 300M → 일괄 선택 (결론 불변).
      expect(d?.itemizedSubtotal).toBe(300_000_000);
    });

    it("A-1-3 selectedAmount = 500,000,000 (일괄공제 선택)", () => {
      expect(d?.selectedAmount).toBe(500_000_000);
    });

    it("A-1-4 selectedMethod = lump_sum", () => {
      expect(d?.selectedMethod).toBe("lump_sum");
    });

    it("A-1-5 spouseSoleHeirExclusion = false (배우자+자녀 혼재)", () => {
      expect(d?.spouseSoleHeirExclusion).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // [A-2~A-6] 배우자공제 §19 — Phase D 발동 (교재 종합사례)
  // ────────────────────────────────────────────
  describe("A-2~A-6: spouseDeductionDetail — Phase D 발동", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const d = result.deductionDetail.spouseDeductionDetail;
    const lt = d?.legalShareTable;

    it("A-2 numerator (상속재산가액 분자) = 7,590,000,000", () => {
      // 교재 ③㉮ 분자
      // grossEstateValue(6,680M) + presumedTotal(350M)
      //   + heirGiftAmount(배우자 760M + 장남 1,500M = 2,260M)
      //   - legateeNonHeir(500M)
      //   - nonFuneralDebts(채무: K은행400M + S저축은행745M + 소득세55M = 1,200M)
      //   - exemptAmount(0)
      //   + funeralAmount(15M)
      // = 6,680M + 350M + 2,260M - 500M - 1,200M - 0 + 15M - 장례비 되돌림
      // 실제: deductedBeforeAggregation = funeralDeduction(15M) + nonFuneralDebts(1,200M) = 1,215M
      //   numerator = (6,680M + 350M) + 2,260M - 500M - 1,215M - 0 = 7,575M
      //   + funeralAmount(15M) = 7,590M ✓
      expect(lt?.numerator).toBe(7_590_000_000);
    });

    it("A-3 spouseRatio = 1.5/3.5", () => {
      // 자녀 2명 → coheirCount=2 → ratio = 1.5/(1.5+2) = 1.5/3.5
      expect(lt?.spouseRatio).toBeCloseTo(1.5 / 3.5, 10);
    });

    it("A-3b spouseLegalShareRaw = 3,252,857,142", () => {
      // floor(7,590M × 1.5/3.5) = floor(3,252,857,142.857) = 3,252,857,142
      expect(lt?.spouseLegalShareRaw).toBe(3_252_857_142);
    });

    it("A-4 legalShare = 3,092,857,142 (raw − 배우자 사전증여 과세표준 160M)", () => {
      // 3,252,857,142 − 160,000,000 = 3,092,857,142
      expect(lt?.legalShare).toBe(3_092_857_142);
    });

    it("A-5 spouseGiftTaxBaseDeducted = 160,000,000", () => {
      expect(lt?.spouseGiftTaxBaseDeducted).toBe(160_000_000);
    });

    it("A-6 배우자공제 = 2,800,000,000", () => {
      // min(실제2800M, 법정3093M) = 2,800M → floor 불발동 (>5억)
      expect(d?.deduction).toBe(2_800_000_000);
    });

    it("A-6b floorApplied = false (기준액 2,800M > 5억 최소보장)", () => {
      expect(d?.floorApplied).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // [A-7] 금융재산공제 §22 — tier3 20%·한도
  // ────────────────────────────────────────────
  describe("A-7: financialDeductionDetail — tier3", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const d = result.deductionDetail.financialDeductionDetail;

    it("A-7-1 detail 존재", () => {
      expect(d).toBeDefined();
    });

    it("A-7-2 netFinancial = 1,155,000,000 (입력값 그대로)", () => {
      expect(d?.netFinancial).toBe(1_155_000_000);
    });

    it("A-7-3 bracket = tier3", () => {
      expect(d?.bracket).toBe("tier3");
    });

    it("A-7-4 rawDeduction = 231,000,000 (1,155M × 20% = floor(231M))", () => {
      // applyRate(1,155,000,000, 0.2) = floor(231,000,000) = 231,000,000
      expect(d?.rawDeduction).toBe(231_000_000);
    });

    it("A-7-5 cappedDeduction = 200,000,000 (한도 2억 적용)", () => {
      expect(d?.cappedDeduction).toBe(200_000_000);
    });

    it("A-7-6 cap = 200,000,000", () => {
      expect(d?.cap).toBe(200_000_000);
    });
  });

  // ────────────────────────────────────────────
  // [A-7b] 금융재산 4행 분해 rows[] — estateItems 자동 집계
  // ────────────────────────────────────────────
  describe("A-7b: financialDeductionDetail.rows[] — 종류별 자동 집계", () => {
    // listed_stock 보강 fixture 사용
    const result = calcInheritanceTax(EXAMPLE_INPUT_WITH_LISTED);
    const rows = result.deductionDetail.financialDeductionDetail?.rows ?? [];

    const depositRow = rows.find((r) => r.label === "예금");
    const listedRow = rows.find((r) => r.label === "상장주식");
    const insuranceRow = rows.find((r) => r.label === "보험금");
    const debtRow = rows.find((r) => r.label === "금융채무");

    it("A-7b-1 예금 = 2,100,000,000 (bank_oo 1,100M + bank_savings 1,000M)", () => {
      // court_deposit(5M)은 isFinancialAssetForDeduction=false로 제외
      expect(depositRow?.amount).toBe(2_100_000_000);
    });

    it("A-7b-2 상장주식 = 150,000,000 (estate_listed_h, category=listed_stock)", () => {
      expect(listedRow?.amount).toBe(150_000_000);
    });

    it("A-7b-3 보험금 = 50,000,000 (deemed_insurance)", () => {
      expect(insuranceRow?.amount).toBe(50_000_000);
    });

    it("A-7b-4 금융채무 = 1,145,000,000 (K은행 400M + S저축은행 745M)", () => {
      expect(debtRow?.amount).toBe(1_145_000_000);
    });

    it("A-7b-5 순금융재산 = 1,155,000,000 (입력 netFinancialAssets 반영)", () => {
      // rows는 집계용 — netFinancial은 calcFinancialDeduction(input.netFinancialAssets)
      expect(result.deductionDetail.financialDeductionDetail?.netFinancial).toBe(1_155_000_000);
    });
  });

  // ────────────────────────────────────────────
  // [A-8] 동거주택공제 §23의2
  // ────────────────────────────────────────────
  describe("A-8: cohabitDeductionDetail — directAmount 모드", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const d = result.deductionDetail.cohabitDeductionDetail;

    it("A-8-1 detail 존재", () => {
      expect(d).toBeDefined();
    });

    it("A-8-2 cappedDeduction = 600,000,000 (직접입력 600M → 한도 6억 적용 = 600M)", () => {
      // cohabitDirectAmount = 600M → min(600M, 6억) = 600M ✓
      expect(d?.cappedDeduction).toBe(600_000_000);
    });

    it("A-8-3 cap = 600,000,000", () => {
      expect(d?.cap).toBe(600_000_000);
    });

    it("A-8-4 rate = 1.0 (2020.1.1. 이후, 100%)", () => {
      expect(d?.rate).toBe(1.0);
    });
  });

  // ────────────────────────────────────────────
  // [A-9, A-10] §24 종합한도 — ceiling 분해
  // ────────────────────────────────────────────
  describe("A-9/A-10: deductionLimitDetail — §24 ceiling 분해", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const d = result.deductionDetail.deductionLimitDetail;

    it("A-9-1 detail 존재", () => {
      expect(d).toBeDefined();
    });

    it("A-9-2 ceiling = 5,965,000,000", () => {
      // 8,775M − 500M − max(0, 2,960M − 650M) = 8,775M − 500M − 2,310M = 5,965M
      expect(d?.ceiling).toBe(5_965_000_000);
    });

    it("A-9-3 rawTotalDeduction = 4,600,000,000", () => {
      // 배우자2,800M + 일괄500M + 금융200M + 동거600M + 가업500M = 4,600M
      expect(d?.rawTotalDeduction).toBe(4_600_000_000);
    });

    it("A-9-4 wasCapped = false (rawTotal 4,600M < ceiling 5,965M)", () => {
      expect(d?.wasCapped).toBe(false);
    });

    it("A-9-5 limitedDeduction = 4,600,000,000", () => {
      expect(d?.limitedDeduction).toBe(4_600_000_000);
    });

    it("A-10-1 legateeAmountNonHeir = 500,000,000 (손녀 유증)", () => {
      expect(d?.legateeAmountNonHeir).toBe(500_000_000);
    });

    it("A-10-2 totalPriorGiftAmount = 2,960,000,000 (영리법인700M + 배우자760M + 장남1500M)", () => {
      expect(d?.totalPriorGiftAmount).toBe(2_960_000_000);
    });

    it("A-10-3 priorGiftDeductionTotal = 650,000,000 (배우자600M + 장남50M)", () => {
      expect(d?.priorGiftDeductionTotal).toBe(650_000_000);
    });

    it("A-10-4 disasterLossDeduction = 0 (fixture 미입력)", () => {
      // fixture deductionInput에 disasterLossDeduction 미입력 → 0
      expect(d?.disasterLossDeduction).toBe(0);
    });

    it("A-10-5 netPriorGiftDeducted = 2,310,000,000 (max(0, 2960M−650M))", () => {
      expect(d?.netPriorGiftDeducted).toBe(2_310_000_000);
    });
  });

  // ────────────────────────────────────────────
  // [A-11] 배우자 실제상속액 채무분리 (D-2 A)
  // ────────────────────────────────────────────
  describe("A-11: spouseDeductionDetail.actualAmountTable", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const at = result.deductionDetail.spouseDeductionDetail?.actualAmountTable;

    it("A-11-1 actualAmountTable 존재 (heirAllocations 입력됨)", () => {
      expect(at).toBeDefined();
    });

    it("A-11-2 spouseEstateValue = 3,300,000,000", () => {
      // 배우자 귀속 자산: bank_oo(1,100M) + farmland_icheon(1,150M) + factory_land(500M)
      //   + golf_membership(80M) + car(30M) + lease(20M) + cash(35M) + court_deposit(5M)
      //   + pottery(20M) + loan_to_m(30M) + salary(6M) + retirement(124M) + insurance(50M)
      //   + presumed(108M+42M=150M)
      // = 1100+1150+500+80+30+20+35+5+20+30+6+124+50 = 3,150M 본래
      // + 사전증여는 estateItems 아님 → 제외
      // + 추정상속재산 heirAllocations: 부동산108M + 채무42M = 150M (EXAMPLE_PRESUMED)
      // BUT calcInheritanceTax에서 actualAmountTable 집계는 estateItems만
      // EXAMPLE_ESTATE_ITEMS 배우자 귀속분:
      //   bank_oo: 1,100M, farmland_icheon: 1,150M, factory_land: 500M (areaM2=2500)
      //   listed_h: 150M, golf: 80M, car: 30M, lease: 20M, cash: 35M
      //   court_deposit: 5M, pottery: 20M, loan: 30M, salary: 6M
      //   deemed_retirement: 124M, deemed_insurance: 50M
      // 합계: 1100+1150+500+150+80+30+20+35+5+20+30+6+124+50 = 3,300M ✓
      expect(at?.spouseEstateValue).toBe(3_300_000_000);
    });

    it("A-11-3 spouseDebtDeducted = 500,000,000 (S저축은행 배우자 승계분)", () => {
      // EXAMPLE_DEBT_ITEMS: S저축은행 배우자 500M (장례비 제외)
      expect(at?.spouseDebtDeducted).toBe(500_000_000);
    });

    it("A-11-4 actualAmount = 2,800,000,000 (3,300M − 500M)", () => {
      expect(at?.actualAmount).toBe(2_800_000_000);
    });
  });

  // ────────────────────────────────────────────
  // [A-12] 단순케이스 — spouseLegalShareOverride 명시 시 legalShareTable undefined
  // ────────────────────────────────────────────
  describe("A-12: 단순케이스 — Phase D 미발동 시 legalShareTable undefined", () => {
    const result = calcInheritanceTax(SIMPLE_INPUT);
    const lt = result.deductionDetail.spouseDeductionDetail?.legalShareTable;

    it("A-12-1 legalShareTable = undefined (spouseLegalShareOverride 명시 → Phase D 미발동)", () => {
      // wantsAutoSpouseLegalShare = false (override 명시) → phaseDLegalShareTable 미조립
      expect(lt).toBeUndefined();
    });

    it("A-12-2 spouseDeductionDetail 자체는 존재", () => {
      expect(result.deductionDetail.spouseDeductionDetail).toBeDefined();
    });
  });

  // ────────────────────────────────────────────
  // [rawTotalDeduction 노출] E6 직접 검증
  // ────────────────────────────────────────────
  describe("rawTotalDeduction 노출 (E6)", () => {
    it("rawTotalDeduction = totalDeduction (한도 미초과 케이스)", () => {
      const result = calcInheritanceTax(EXAMPLE_INPUT);
      // wasCapped=false 이므로 rawTotalDeduction === limitedDeduction === totalDeduction
      expect(result.deductionDetail.rawTotalDeduction).toBe(
        result.deductionDetail.totalDeduction,
      );
    });

    it("rawTotalDeduction = 4,600,000,000", () => {
      const result = calcInheritanceTax(EXAMPLE_INPUT);
      expect(result.deductionDetail.rawTotalDeduction).toBe(4_600_000_000);
    });
  });

  // ────────────────────────────────────────────
  // [기존 회귀] calcInheritanceDeductions 직접 호출 — 결과값 불변
  // ────────────────────────────────────────────
  describe("기존 회귀 — totalDeduction 불변", () => {
    it("EXAMPLE_INPUT totalDeduction = 4,600,000,000 (회귀 방어)", () => {
      const result = calcInheritanceTax(EXAMPLE_INPUT);
      expect(result.deductionDetail.totalDeduction).toBe(4_600_000_000);
    });

    it("과세표준 = 4,175,000,000 (회귀 방어)", () => {
      const result = calcInheritanceTax(EXAMPLE_INPUT);
      expect(result.taxBase).toBe(4_175_000_000);
    });
  });
});
