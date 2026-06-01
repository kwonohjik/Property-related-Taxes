/**
 * §27 세대생략 할증 자동 도출 — Pre-Do Anchor A (실패 실증 후 구현)
 *
 * anchor A: EXAMPLE_INPUT에서 전역 3필드(isGenerationSkip·isMinorHeir·generationSkipAssetAmount) 제거,
 *           손녀 isGenerationSkipBeneficiary:true + heirAllocations 500M 유지
 *           → result.generationSkipSurcharge === 30,232,198 (현재 0 — 버그 실증)
 *
 * 구현 완료 후 anchor A~E 전부 PASS.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  EXAMPLE_HEIRS,
  EXAMPLE_ESTATE_ITEMS,
  EXAMPLE_PRIOR_GIFTS,
  EXAMPLE_INPUT,
  HEIR_ID,
} from "./fixtures/comprehensive-case-pdf.fixture";

// ============================================================
// Pre-Do anchor A — 실패 실증 후 구현
// ============================================================
describe("§27 세대생략 할증 자동 도출", () => {
  /**
   * Anchor A (C-1): 전역 3필드 없이 손녀 isGenerationSkipBeneficiary:true + 500M 유증만으로
   * 30,232,198 자동 도출 (현재 0 — dual-truth 버그 실증)
   *
   * 산식: floor(1,627,500,000 × 500,000,000 × 0.30 / (8,775,000,000 − 700,000,000))
   *      = floor(244,125,000,000,000,000 / 8,075,000,000) = 30,232,198
   */
  it("A: 전역 3필드 제거 후 손녀 플래그 자동 도출 → 30,232,198", () => {
    // 전역 3필드 제거한 입력 (isGenerationSkip·isMinorHeir·generationSkipAssetAmount 없음)
    const inputWithoutGlobalFlags: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(inputWithoutGlobalFlags);

    // 자동 도출 후 30,232,198 기대 (현재 0 — 구현 완료 후 PASS)
    expect(result.generationSkipSurcharge).toBe(30_232_198);
  });

  /**
   * Anchor B (C-3): 손자(6세, 21억=20억 초과 → 40%) + 손녀(30세, 5억 → 30%)
   * per-heir 독립 계산 — 이중과세 방지
   *
   * 설정: adjustedDenominator = 80억 (numerator 합 26억 < 80억)
   *   손자: floor(computedTax × 2,100,000,000 × 0.40 / 8,000,000,000)
   *   손녀: floor(computedTax × 500,000,000 × 0.30 / 8,000,000,000)
   *   합 ≠ (floor(ct × 2,600,000,000 / 8,000,000,000)) × 0.30 (글로벌 2배 배부 방지)
   */
  it("B: 복수 수유자(손자 40%·손녀 30%) per-heir 독립 계산 — 이중과세 방지", () => {
    // computedTax는 taxBase에서 도출 — 단순 케이스로 직접 세율 산정
    // 과세표준 = 10억 → computedTax = 10억×40% - 1.6억 = 2.4억 (§26 4구간)
    const computedTaxFor10B = 10_000_000_000 * 0.4 - 160_000_000; // 3,840,000,000

    // 손자 수유자 (6세, 21억 유증)
    const grandson: Heir = {
      id: "heir-grandson",
      relation: "legatee",
      name: "손자",
      birthDate: "2020-01-01", // 6세 (미성년)
      isHeir: false,
      isGenerationSkipBeneficiary: true,
    };

    // 손녀 수유자 (30세, 5억 유증)
    const granddaughter: Heir = {
      id: "heir-granddaughter",
      relation: "legatee",
      name: "손녀",
      birthDate: "1995-01-01", // 30세
      isHeir: false,
      isGenerationSkipBeneficiary: true,
    };

    // 자녀 1명 (법정상속인 — 법정상속분 계산을 위해 필요)
    const child: Heir = {
      id: "heir-child",
      relation: "child",
      name: "자녀",
      birthDate: "1970-01-01",
      isHeir: true,
      isGenerationSkipBeneficiary: false,
    };

    // 손자 유증: 21억 (20억 초과 미성년 → 40%)
    // 손녀 유증: 5억 (30% 기본)
    // 나머지 54억: 자녀에게
    // 과세가액 = 손자 21억 + 손녀 5억 + 자녀 54억 = 80억
    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      deathDate: "2024-01-01",
      heirs: [child, grandson, granddaughter],
      estateItems: [
        {
          id: "estate-child",
          category: "financial",
          name: "예금",
          marketValue: 8_000_000_000,
          heirAllocations: [
            { heirId: "heir-child", amount: 5_400_000_000 },
            { heirId: "heir-grandson", amount: 2_100_000_000 },
            { heirId: "heir-granddaughter", amount: 500_000_000 },
          ],
        },
      ],
      preGiftsWithin10Years: [],
      debtItems: [],
      presumedItems: [],
      exemptions: [],
      deductionInput: {
        ...EXAMPLE_INPUT.deductionInput,
        spouseActualAmount: undefined,
        cohabitHouseStdPrice: 0,
        farmingAssetValue: undefined,
        familyBusinessValue: undefined,
      },
      creditInput: {
        priorGifts: [],
        isFiledOnTime: false,
      },
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(input);

    // 자동 도출 확인
    expect(result.generationSkipSurcharge).toBeGreaterThan(0);

    // per-heir detail 확인 (구현 후 존재)
    expect(result.generationSkipDetail).not.toBeNull();

    if (result.generationSkipDetail) {
      const rows = result.generationSkipDetail.rows;
      expect(rows).toHaveLength(2);

      const grandsonRow = rows.find((r) => r.heirId === "heir-grandson");
      const granddaughterRow = rows.find(
        (r) => r.heirId === "heir-granddaughter",
      );

      // 손자: 미성년 + 21억 > 20억 → 40%
      expect(grandsonRow).toBeDefined();
      expect(grandsonRow?.rate).toBe(0.4);
      expect(grandsonRow?.isMinor).toBe(true);
      expect(grandsonRow?.numerator).toBe(2_100_000_000);

      // 손녀: 30세 → 30%
      expect(granddaughterRow).toBeDefined();
      expect(granddaughterRow?.rate).toBe(0.3);
      expect(granddaughterRow?.isMinor).toBe(false);
      expect(granddaughterRow?.numerator).toBe(500_000_000);

      // 합계 = Σ per-heir (이중과세 아님)
      const expectedTotal =
        (grandsonRow?.surcharge ?? 0) + (granddaughterRow?.surcharge ?? 0);
      expect(result.generationSkipDetail.total).toBe(expectedTotal);
      expect(result.generationSkipSurcharge).toBe(expectedTotal);

      // 분모 확인 (사전증여 없으므로 과세가액 = 80억)
      expect(result.generationSkipDetail.denominator).toBe(
        result.taxableEstateValue,
      );
    }
  });

  /**
   * Anchor C (C-2): 손녀(legatee=비상속인) 유증 300M + 사망 5년내 §13 가산 증여 100M
   * → 분자 = 400M (사전증여 합산 확인)
   *
   * D5: legatee는 비상속인 → cutoff 5년
   */
  it("C: 손녀 유증 300M + 5년내 사전증여 100M → 분자 400M", () => {
    const granddaughter: Heir = {
      id: "heir-granddaughter-c",
      relation: "legatee",
      name: "손녀",
      birthDate: "1993-01-01", // 30세
      isHeir: false,
      isGenerationSkipBeneficiary: true,
    };

    const child: Heir = {
      id: "heir-child-c",
      relation: "child",
      name: "자녀",
      birthDate: "1970-01-01",
      isHeir: true,
      isGenerationSkipBeneficiary: false,
    };

    // 사망일: 2024-01-01 → 5년내 = 2019-01-01 이후
    // 손녀에게 2021-06-01 증여 100M (5년내 → §13 가산)
    const priorGift = {
      id: "prior-gift-c",
      giftDate: "2021-06-01", // 사망 3년전 — 5년내
      giftAmount: 100_000_000,
      giftTaxBase: 100_000_000,
      giftTaxPaid: 0,
      doneeId: "heir-granddaughter-c",
      isHeir: false, // legatee → 5년 cutoff
      beneficiaryType: "legatee" as const,
    };

    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      deathDate: "2024-01-01",
      heirs: [child, granddaughter],
      estateItems: [
        {
          id: "estate-c",
          category: "financial",
          name: "예금",
          marketValue: 5_000_000_000,
          heirAllocations: [
            { heirId: "heir-child-c", amount: 4_700_000_000 },
            { heirId: "heir-granddaughter-c", amount: 300_000_000 },
          ],
        },
      ],
      preGiftsWithin10Years: [priorGift],
      debtItems: [],
      presumedItems: [],
      exemptions: [],
      deductionInput: {
        ...EXAMPLE_INPUT.deductionInput,
        spouseActualAmount: undefined,
        cohabitHouseStdPrice: 0,
        farmingAssetValue: undefined,
        familyBusinessValue: undefined,
      },
      creditInput: {
        priorGifts: [priorGift],
        isFiledOnTime: false,
      },
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(input);

    // generationSkipDetail 있어야 함
    expect(result.generationSkipDetail).not.toBeNull();
    expect(result.generationSkipSurcharge).toBeGreaterThan(0);

    if (result.generationSkipDetail) {
      const granddaughterRow = result.generationSkipDetail.rows.find(
        (r) => r.heirId === "heir-granddaughter-c",
      );
      // 분자 = 유증 300M + §13 가산 사전증여 100M = 400M
      expect(granddaughterRow?.numerator).toBe(400_000_000);
    }
  });

  /**
   * Anchor D (C-4): birthDate 자동 미성년 판정 + isMinorOverride 전환
   * - 17세 (미성년) → 자동 판정: isMinor=true
   * - isMinorOverride=false 설정 시 → isMinor=false (30% 적용)
   * - 미성년 + 21억 초과 → 40% / 미성년 + 19억 이하 → 30%
   */
  it("D: birthDate 자동 미성년 + isMinorOverride false 전환", () => {
    const child: Heir = {
      id: "heir-child-d",
      relation: "child",
      name: "자녀",
      birthDate: "1970-01-01",
      isHeir: true,
      isGenerationSkipBeneficiary: false,
    };

    // 미성년 손자 (17세)
    const minorGrandson: Heir = {
      id: "heir-minor-grandson",
      relation: "legatee",
      name: "미성년 손자",
      birthDate: "2007-01-01", // 2024 기준 17세 — 미성년
      isHeir: false,
      isGenerationSkipBeneficiary: true,
      // isMinorOverride: undefined → birthDate 자동 판정
    };

    // 성년 override 손자 (동일, 단 isMinorOverride=false)
    const overriddenGrandson: Heir = {
      ...minorGrandson,
      id: "heir-override-grandson",
      name: "성년 override 손자",
      isMinorOverride: false, // 수동 override → 성년 처리
    };

    const estateItems = [
      {
        id: "estate-d",
        category: "financial" as const,
        name: "예금",
        marketValue: 5_000_000_000,
        heirAllocations: [
          { heirId: "heir-child-d", amount: 2_000_000_000 },
          { heirId: "heir-minor-grandson", amount: 1_500_000_000 }, // 15억 (미성년이지만 20억 이하 → 30%)
        ],
      },
    ];

    const baseInput: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      deathDate: "2024-01-01",
      heirs: [child, minorGrandson],
      estateItems,
      preGiftsWithin10Years: [],
      debtItems: [],
      presumedItems: [],
      exemptions: [],
      deductionInput: {
        ...EXAMPLE_INPUT.deductionInput,
        spouseActualAmount: undefined,
        cohabitHouseStdPrice: 0,
        farmingAssetValue: undefined,
        familyBusinessValue: undefined,
      },
      creditInput: { priorGifts: [], isFiledOnTime: false },
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    // D-1: 미성년 자동 판정 (15억 이하 → 30%)
    const resultAuto = calcInheritanceTax(baseInput);
    expect(resultAuto.generationSkipDetail).not.toBeNull();
    if (resultAuto.generationSkipDetail) {
      const row = resultAuto.generationSkipDetail.rows.find(
        (r) => r.heirId === "heir-minor-grandson",
      );
      expect(row?.isMinor).toBe(true); // birthDate 자동 판정
      expect(row?.rate).toBe(0.3); // 미성년이지만 15억 ≤ 20억 → 30%
    }

    // D-2: isMinorOverride=false → 30% (성년으로 처리)
    const inputOverride: InheritanceTaxInput = {
      ...baseInput,
      heirs: [child, overriddenGrandson],
      estateItems: [
        {
          ...estateItems[0],
          heirAllocations: [
            { heirId: "heir-child-d", amount: 2_000_000_000 },
            { heirId: "heir-override-grandson", amount: 1_500_000_000 },
          ],
        },
      ],
    };
    const resultOverride = calcInheritanceTax(inputOverride);
    expect(resultOverride.generationSkipDetail).not.toBeNull();
    if (resultOverride.generationSkipDetail) {
      const row = resultOverride.generationSkipDetail.rows.find(
        (r) => r.heirId === "heir-override-grandson",
      );
      expect(row?.isMinor).toBe(false); // isMinorOverride=false 우선
      expect(row?.rate).toBe(0.3);
    }

    // D-3: 미성년 + 21억 초과 → 40% (numerator > 20억)
    const minorGrandsonOverThreshold: Heir = {
      ...minorGrandson,
      id: "heir-minor-over",
    };
    const inputOver: InheritanceTaxInput = {
      ...baseInput,
      heirs: [child, minorGrandsonOverThreshold],
      estateItems: [
        {
          id: "estate-d-over",
          category: "financial" as const,
          name: "예금",
          marketValue: 5_100_000_000,
          heirAllocations: [
            { heirId: "heir-child-d", amount: 2_000_000_000 },
            { heirId: "heir-minor-over", amount: 2_100_000_000 }, // 21억 → 40%
          ],
        },
      ],
    };
    const resultOver = calcInheritanceTax(inputOver);
    expect(resultOver.generationSkipDetail).not.toBeNull();
    if (resultOver.generationSkipDetail) {
      const row = resultOver.generationSkipDetail.rows.find(
        (r) => r.heirId === "heir-minor-over",
      );
      expect(row?.isMinor).toBe(true);
      expect(row?.rate).toBe(0.4); // 미성년 + 21억 > 20억 → 40%
    }
  });

  /**
   * Anchor E (C-5): isGenerationSkipBeneficiary=true 이나 받은 재산 0
   * → 분자 0 → 할증 0 (오배부 없음)
   */
  it("E: 플래그 true·재산 0 → surcharge 0", () => {
    const child: Heir = {
      id: "heir-child-e",
      relation: "child",
      name: "자녀",
      birthDate: "1970-01-01",
      isHeir: true,
      isGenerationSkipBeneficiary: false,
    };

    // 세대생략 플래그 있지만 유증 없음 (heirAllocations 없음, 사전증여 없음)
    const granddaughter: Heir = {
      id: "heir-granddaughter-e",
      relation: "legatee",
      name: "손녀",
      birthDate: "1993-01-01",
      isHeir: false,
      isGenerationSkipBeneficiary: true, // 플래그 true
    };

    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      deathDate: "2024-01-01",
      heirs: [child, granddaughter],
      estateItems: [
        {
          id: "estate-e",
          category: "financial",
          name: "예금",
          marketValue: 3_000_000_000,
          heirAllocations: [
            { heirId: "heir-child-e", amount: 3_000_000_000 }, // 자녀만 수령
            // 손녀는 유증 없음 (amount 0)
          ],
        },
      ],
      preGiftsWithin10Years: [], // 사전증여도 없음
      debtItems: [],
      presumedItems: [],
      exemptions: [],
      deductionInput: {
        ...EXAMPLE_INPUT.deductionInput,
        spouseActualAmount: undefined,
        cohabitHouseStdPrice: 0,
        farmingAssetValue: undefined,
        familyBusinessValue: undefined,
      },
      creditInput: { priorGifts: [], isFiledOnTime: false },
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(input);

    // 분자 0 → 할증 0 (오배부 없음)
    expect(result.generationSkipSurcharge).toBe(0);
  });

  /**
   * 회귀 검증: 전역 3필드 제거 후 EXAMPLE_INPUT (손녀 플래그 포함) 기존 30,232,198 동일
   * G-02·I-21·AN-4 자동 도출 대체 확인
   */
  it("회귀: EXAMPLE_INPUT 전역 3필드 제거 후 30,232,198 자동 도출", () => {
    const inputAutoDerive: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(inputAutoDerive);
    expect(result.generationSkipSurcharge).toBe(30_232_198);

    // per-heir detail 존재 확인
    expect(result.generationSkipDetail).not.toBeNull();
    if (result.generationSkipDetail) {
      // 손녀 1명 row
      expect(result.generationSkipDetail.rows).toHaveLength(1);
      const row = result.generationSkipDetail.rows[0];
      expect(row.heirId).toBe(HEIR_ID.granddaughter);
      expect(row.numerator).toBe(500_000_000);
      expect(row.rate).toBe(0.3);
      expect(row.isMinor).toBe(false); // 1993년생 → 30세 이상
      expect(row.surcharge).toBe(30_232_198);
      // 분모 = 8,075,000,000
      expect(result.generationSkipDetail.denominator).toBe(8_075_000_000);
    }
  });
});
