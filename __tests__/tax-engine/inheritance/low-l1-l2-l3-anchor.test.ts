/**
 * LOW 3건 수정 Pre-Do anchor
 *
 * L-1: §19 배우자 법정지분 분모 coheirCount — 상속포기(isHeir=false) 미제외 dual-truth 수정
 *   - 정정: isHeir=false 자녀가 있을 때 분모에서 제외 → 배우자공제 증가
 *   - 불변: 정상 입력(isHeir 미설정) 흐름에서 결과 동일
 *
 * L-2: 협의분할 추정상속재산(§15) floor 잔액 흡수 누락 수정
 *   - 정정: added ≠ totalAlloc 케이스에서 Σshare == added 보장
 *   - 불변: added == totalAlloc 통상 케이스 결과 동일
 *
 * L-3: 레거시 세대생략 denominator 표시 드리프트 — prorationActive echo 추가
 *   - echo: per-heir 경로는 prorationActive=true, 레거시 경로는 prorationActive=false
 *   - 세액 불변: 두 경로 모두 surcharge 값은 변경 없음
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  calcHeirAllocation,
  type HeirAllocationParams,
} from "@/lib/tax-engine/inheritance-allocation";
import type {
  InheritanceTaxInput,
  Heir,
  PresumedInheritanceItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { EXAMPLE_INPUT, HEIR_ID } from "./fixtures/comprehensive-case-pdf.fixture";

// ─────────────────────────────────────────────────────────────────
// L-1 전용 최소 입력 팩토리 (EXAMPLE_INPUT 오염 없음)
// ─────────────────────────────────────────────────────────────────

/**
 * 과세가액 10억(시가 직접 지정), 배우자+자녀 구성만 단순 테스트용 최소 입력.
 * 장례비 최소 500만이 자동 적용되어 과세가액 = 10억 - 500만 = 9.95억.
 * (엔진이 장례비 500만 최소 보장 — legacy funeralExpense=0 이면 5,000,000 적용)
 * 따라서 배우자 법정상속분 계산의 numerator = 9.95억 (장례비 분 포함 산식으로 보정됨).
 */
function makeMinimalInput(heirs: Heir[]): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2024-01-01",
    estateItems: [
      {
        id: "e1",
        category: "real_estate_land", // 유효한 AssetCategory
        name: "테스트 토지",
        marketValue: 1_000_000_000,   // 시가 10억 직접 지정
      },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    debtItems: [],
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: {
      heirs,
      spouseLegalShareOverride: undefined, // 자동 산정 경로
      netFinancialAssets: 0,
      cohabitHouseStdPrice: 0,
      farmingAssetValue: 0,
      familyBusinessValue: 0,
      legateeAmountNonHeir: 0,
    },
    creditInput: {
      priorGifts: [],
      isFiledOnTime: true,
    },
    isGenerationSkip: false,
  };
}

// ─────────────────────────────────────────────────────────────────
// L-1: §19 배우자 법정지분 분모 coheirCount 상속포기 필터
// ─────────────────────────────────────────────────────────────────
describe("L-1: coheirCount 상속포기(isHeir=false) 제외 (민법 §1042·§1043)", () => {
  /**
   * 케이스: 배우자 + 자녀 2명 중 1명 상속포기(isHeir=false).
   * 상속포기자는 처음부터 상속인 아님 → 분모는 배우자+자녀1명 = 1.5+1 = 2.5.
   * 수정 후: spouseRatio = 1.5/2.5 = 0.6
   *
   * 전체 과세가액 10억(채무·비과세·사전증여 없음). 장례비 없음.
   * inheritance-tax.ts coheirCount 자동 산정 경로(spouseLegalShareOverride=undefined).
   * 정정: computedSpouseLegalShare = floor(10억 × 1.5/2.5) = 6억
   *        → 배우자공제 max(5억, min(6억, 30억)) = 6억
   * 포기 전(buggy): computedSpouseLegalShare = floor(10억 × 1.5/3.5) = 428,571,428
   *        → 배우자공제 max(5억, ...) = 5억 (5억 최소 보장)
   */
  it("L-1-A [정정]: 자녀1 상속포기 시 coheirCount=1 → 배우자 법정상속분 6억 (5억 최소 미적용)", () => {
    const heirs: Heir[] = [
      { id: "sp", relation: "spouse", name: "배우자" },
      { id: "c1", relation: "child", name: "자녀1", isHeir: true },
      { id: "c2", relation: "child", name: "자녀2", isHeir: false }, // 상속포기
    ];
    const result = calcInheritanceTax(makeMinimalInput(heirs));

    // 수정 후: coheirCount = 1 (상속포기 자녀2 제외)
    // spouseRatio = 1.5 / (1.5 + 1) = 0.6
    // computedSpouseLegalShare = floor(10억 × 0.6) = 6억
    // 배우자공제 = max(5억, min(6억, 30억)) = 6억
    expect(result.deductionDetail.spouseDeduction).toBe(600_000_000);
  });

  /**
   * L-1-B [불변]: 정상 입력(isHeir 미설정 / undefined)에서는 결과 동일.
   * 상속포기 토글이 UI에 없어 실사용에서 isHeir=undefined가 기본 → 결과 불변 보장.
   */
  it("L-1-B [불변]: isHeir 미설정(undefined) 자녀 포함 시 정상 결과 불변 — EXAMPLE_INPUT 기준값 유지", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);

    // EXAMPLE_INPUT의 기준 최종납부세액 (기존 anchor 값)
    // comprehensive-case-pdf.test.ts의 D-10에서 확인: 1,033,760,232
    expect(result.finalTax).toBe(1_033_760_232);
  });

  /**
   * L-1-C [정합]: coheirCount 0 (배우자 단독) 케이스는 spouseRatio = 1.5/(1.5+0) = 1.
   * 이미 맞는 동작이지만 필터 추가 후에도 동일 확인.
   */
  it("L-1-C [불변]: 배우자 단독 상속(자녀 전원 포기) 시 spouseRatio = 1 → 법정상속분 = 과세가액", () => {
    const heirs: Heir[] = [
      { id: "sp", relation: "spouse", name: "배우자" },
      { id: "c1", relation: "child", name: "자녀1", isHeir: false }, // 전원 포기
      { id: "c2", relation: "child", name: "자녀2", isHeir: false },
    ];
    const result = calcInheritanceTax(makeMinimalInput(heirs));

    // coheirCount = 0 (자녀 전원 포기), spouseRatio = 1.5/1.5 = 1
    // computedSpouseLegalShare = floor(10억 × 1) = 10억
    // 배우자공제 = max(5억, min(10억, 30억)) = 10억
    expect(result.deductionDetail.spouseDeduction).toBe(1_000_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────
// L-2: 협의분할 추정상속재산 floor 잔액 흡수
// ─────────────────────────────────────────────────────────────────
describe("L-2: 협의분할 추정상속재산 floor 잔액 흡수 (added ≠ totalAlloc)", () => {
  function makeParams(
    presumedItems: PresumedInheritanceItem[],
    addedMap: Map<string, number>,
  ): HeirAllocationParams {
    return {
      heirs: [
        { id: "sp", relation: "spouse", name: "배우자" },
        { id: "c1", relation: "child", name: "자녀1" },
      ],
      estateItems: [],
      presumedItems,
      debtItems: [],
      funeralDeduction: 0,
      priorGifts: [],
      presumedAddedById: addedMap,
      valuatedAmountById: new Map(),
      taxBase: 0,
      computedTax: 0,
      generationSkipSurcharge: 0,
      corporateExemption: 0,
      corporateGiftTaxBase: 0,
      grossEstateWithGifts: 0,
      isFiledOnTime: true,
      filingCreditRate: 0.03,
    };
  }

  /**
   * L-2-A [정정]: added(100,000,003) ≠ totalAlloc(100,000,000) — 잔액 3원 발생.
   * 2명 상속인(sp, c1), alloc = [sp: 60M, c1: 40M] (totalAlloc=100M),
   * added = 100,000,003 → 정정 전: sp=floor(100,000,003×60/100)=60,000,001, c1=floor(100,000,003×40/100)=40,000,001
   * 합=100,000,002 ≠ 100,000,003 → -1원 손실.
   * 정정 후: sp=60,000,001, c1(마지막)=100,000,003-60,000,001=40,000,002
   * 합=100,000,003 == added ✓
   */
  it("L-2-A [정정]: added ≠ totalAlloc 시 마지막 항목 잔액 흡수 → Σ == added", () => {
    const item: PresumedInheritanceItem = {
      id: "p1",
      category: "deposit",
      amountWithin1Y: 0,
      amountWithin2Y: 0,
      verifiedUseAmount: 0,
      heirAllocations: [
        { heirId: "sp", amount: 60_000_000 },
        { heirId: "c1", amount: 40_000_000 },
      ],
    };
    // added가 totalAlloc보다 3원 더 큰 케이스
    const r = calcHeirAllocation(makeParams([item], new Map([["p1", 100_000_003]])));

    const sp = r.perHeir["sp"]?.presumedAmount ?? 0;
    const c1 = r.perHeir["c1"]?.presumedAmount ?? 0;

    // 총합은 added(100,000,003)와 정확히 일치해야 함
    expect(sp + c1).toBe(100_000_003);
    // sp는 floor(100,000,003 × 60 / 100) = 60,000,001
    expect(sp).toBe(60_000_001);
    // c1(마지막)은 잔액 흡수 = 100,000,003 - 60,000,001 = 40,000,002
    expect(c1).toBe(40_000_002);
  });

  /**
   * L-2-B [불변]: added == totalAlloc 통상 케이스 — 결과 동일.
   * alloc=[sp:60M, c1:40M], added=100M → sp=60M, c1=40M (잔액 흡수 = 마지막 floor와 동일)
   */
  it("L-2-B [불변]: added == totalAlloc 통상 케이스 — 결과 동일", () => {
    const item: PresumedInheritanceItem = {
      id: "p1",
      category: "deposit",
      amountWithin1Y: 0,
      amountWithin2Y: 0,
      verifiedUseAmount: 0,
      heirAllocations: [
        { heirId: "sp", amount: 60_000_000 },
        { heirId: "c1", amount: 40_000_000 },
      ],
    };
    const r = calcHeirAllocation(makeParams([item], new Map([["p1", 100_000_000]])));

    expect(r.perHeir["sp"]?.presumedAmount ?? 0).toBe(60_000_000);
    expect(r.perHeir["c1"]?.presumedAmount ?? 0).toBe(40_000_000);
    expect((r.perHeir["sp"]?.presumedAmount ?? 0) + (r.perHeir["c1"]?.presumedAmount ?? 0)).toBe(100_000_000);
  });

  /**
   * L-2-C [정정]: added < totalAlloc 케이스 (희귀하나 방어적 처리).
   * alloc=[sp:70M, c1:30M](totalAlloc=100M), added=99,999,999.
   * floor(99,999,999×70/100)=69,999,999, c1(마지막)=99,999,999-69,999,999=30,000,000.
   * 합=99,999,999 == added ✓
   */
  it("L-2-C [정정]: added < totalAlloc 케이스도 Σ == added 보장", () => {
    const item: PresumedInheritanceItem = {
      id: "p1",
      category: "deposit",
      amountWithin1Y: 0,
      amountWithin2Y: 0,
      verifiedUseAmount: 0,
      heirAllocations: [
        { heirId: "sp", amount: 70_000_000 },
        { heirId: "c1", amount: 30_000_000 },
      ],
    };
    const r = calcHeirAllocation(makeParams([item], new Map([["p1", 99_999_999]])));

    const sp = r.perHeir["sp"]?.presumedAmount ?? 0;
    const c1 = r.perHeir["c1"]?.presumedAmount ?? 0;
    expect(sp + c1).toBe(99_999_999);
  });
});

// ─────────────────────────────────────────────────────────────────
// L-3: 세대생략 denominator 표시 — prorationActive echo
// ─────────────────────────────────────────────────────────────────
describe("L-3: generationSkipDetail.prorationActive echo 분기", () => {
  /**
   * L-3-A: per-heir 경로(isGenerationSkipBeneficiary 플래그) → prorationActive=true.
   * EXAMPLE_INPUT의 손녀(granddaughter)가 isGenerationSkipBeneficiary:true 설정됨.
   */
  it("L-3-A: per-heir 경로 → prorationActive=true (안분 산식 적용)", () => {
    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      isGenerationSkip: undefined,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(input);

    expect(result.generationSkipSurcharge).toBeGreaterThan(0);
    expect(result.generationSkipDetail).not.toBeNull();
    expect(result.generationSkipDetail?.prorationActive).toBe(true);
  });

  /**
   * L-3-B: 레거시 경로(isGenerationSkip=true, 전역 3필드) → prorationActive=false.
   * 실제 surcharge = applyRate(computedTax, rate) — 분모 미사용.
   */
  it("L-3-B: 레거시 경로 → prorationActive=false (전액 할증, 분모 미사용)", () => {
    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      // per-heir 플래그 모두 제거
      heirs: EXAMPLE_INPUT.heirs.map((h) => ({
        ...h,
        isGenerationSkipBeneficiary: undefined,
      })),
      // 레거시 전역 3필드 설정
      isGenerationSkip: true,
      isMinorHeir: false,
      generationSkipAssetAmount: 500_000_000,
    };

    const result = calcInheritanceTax(input);

    expect(result.generationSkipSurcharge).toBeGreaterThan(0);
    expect(result.generationSkipDetail).not.toBeNull();
    expect(result.generationSkipDetail?.prorationActive).toBe(false);
  });

  /**
   * L-3-C [세액 불변]: 레거시 경로 세액은 이전과 동일 (echo 필드 추가만, 산식 변경 없음).
   * 레거시 surcharge = applyRate(computedTax × rate) 전액.
   * EXAMPLE_INPUT의 산출세액: 1,627,500,000, 세대생략 30% → 488,250,000
   * (단, isGenerationSkip으로만 입력 시 per-heir 분기로 가지 않으므로 별도 계산)
   */
  it("L-3-C [세액 불변]: 레거시 경로 surcharge = computedTax × rate (분모 영향 없음)", () => {
    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      heirs: EXAMPLE_INPUT.heirs.map((h) => ({
        ...h,
        isGenerationSkipBeneficiary: undefined,
      })),
      isGenerationSkip: true,
      isMinorHeir: false,
      generationSkipAssetAmount: undefined, // 안분 미적용 → 전액 30%
    };

    const result = calcInheritanceTax(input);

    // surcharge = floor(computedTax × 0.30) = floor(1,627,500,000 × 0.30) = 488,250,000
    expect(result.generationSkipSurcharge).toBe(488_250_000);
    // prorationActive는 false (분모 미사용 전액 할증)
    expect(result.generationSkipDetail?.prorationActive).toBe(false);
  });

  /**
   * L-3-D: 세대생략 없음 → generationSkipDetail = null (prorationActive 무관).
   */
  it("L-3-D: 세대생략 없음 → generationSkipDetail null", () => {
    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      heirs: EXAMPLE_INPUT.heirs.map((h) => ({
        ...h,
        isGenerationSkipBeneficiary: undefined,
      })),
      isGenerationSkip: false,
      isMinorHeir: undefined,
      generationSkipAssetAmount: undefined,
    };

    const result = calcInheritanceTax(input);

    expect(result.generationSkipSurcharge).toBe(0);
    expect(result.generationSkipDetail).toBeNull();
  });
});
