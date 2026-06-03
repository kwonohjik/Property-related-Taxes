/**
 * M-9 회귀 가드 — 상속세 result 직렬화 보존 (Map→Record 소실 방어)
 *
 * 검증 대상:
 *   1. 엔진 result를 JSON.parse(JSON.stringify(result))한 뒤 결과뷰가 의존하는 키들이
 *      빈 객체/배열로 소실되지 않고 보존되는지 확인한다.
 *   2. result 타입에 Map이 추가되면 RED가 되도록 구조적 가드를 제공한다.
 *   3. perHeir, summaryTable, creditDetail 등 핵심 Record 필드가 유지됨을 anchor로 고정.
 *
 * 회귀 잡는 방법 (RED→GREEN):
 *   - perHeir에 Map<string, HeirTaxBreakdown>을 사용하면 JSON.stringify 후 {} → RED
 *   - Record<string, HeirTaxBreakdown>이면 키·값 보존 → GREEN
 *   - 새 Map 필드가 result에 추가되면 "키 없음" 또는 "{}" 검증이 RED가 된다.
 *
 * 참고: memory `feedback_engine_result_map_json_loss` (perHeir Map→Record 수정 71f3cfd)
 *
 * 법령 근거:
 *   §26: 산출세액 (computedTax)
 *   §28: 사전증여세액공제 (creditDetail)
 *   상속인별 배부: HeirAllocationResult.perHeir
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type {
  InheritanceTaxInput,
  InheritanceTaxResult,
  Heir,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────────────────────────────────
// 헬퍼: result JSON round-trip
// ────────────────────────────────────────────────────────────────────────────

/**
 * NextResponse.json(result) → fetch 응답 → client 경로 재현.
 * Map 필드는 {}로 소실되고, Record/배열은 보존된다.
 */
function jsonRoundTripResult(result: InheritanceTaxResult): InheritanceTaxResult {
  return JSON.parse(JSON.stringify(result)) as InheritanceTaxResult;
}

// ────────────────────────────────────────────────────────────────────────────
// 기준 입력 — 상속인별 배부 결과(perHeir)가 생성되는 시나리오
// ────────────────────────────────────────────────────────────────────────────

function buildFullInput(): InheritanceTaxInput {
  const heirs: Heir[] = [
    {
      id: "spouse",
      relation: "spouse",
      name: "배우자",
      isHeir: true,
      actualShareRatio: 1,
    },
    {
      id: "child1",
      relation: "child",
      name: "장남",
      isHeir: true,
      actualShareRatio: 1,
    },
    {
      id: "child2",
      relation: "child",
      name: "차남",
      isHeir: true,
      actualShareRatio: 1,
    },
  ];
  const estateItems: EstateItem[] = [
    {
      id: "apt",
      category: "real_estate_apartment",
      name: "아파트",
      marketValue: 3_000_000_000,
      heirAllocations: [
        { heirId: "spouse", amount: 1_500_000_000 },
        { heirId: "child1", amount: 1_000_000_000 },
        { heirId: "child2", amount: 500_000_000 },
      ],
    },
    {
      id: "cash",
      category: "cash",
      name: "현금",
      marketValue: 1_000_000_000,
      heirAllocations: [
        { heirId: "spouse", amount: 500_000_000 },
        { heirId: "child1", amount: 300_000_000 },
        { heirId: "child2", amount: 200_000_000 },
      ],
    },
  ];
  const priorGifts: PriorGift[] = [
    {
      giftDate: "2023-03-15",
      giftAmount: 200_000_000,
      giftTaxBase: 150_000_000,
      giftTaxPaid: 8_000_000,
      isHeir: true,
      doneeId: "child1",
      beneficiaryType: "heir",
    },
  ];
  return {
    decedentType: "resident",
    deathDate: "2026-01-01",
    estateItems,
    funeralExpense: 15_000_000,
    funeralIncludesBongan: true,
    debts: 200_000_000,
    preGiftsWithin10Years: priorGifts,
    heirs,
    deductionInput: { heirs },
    creditInput: { isFiledOnTime: true },
    isGenerationSkip: false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SER-1: perHeir Record 필드 JSON 보존 — Map 사용 시 RED 가드
// ────────────────────────────────────────────────────────────────────────────

describe("SER-1: perHeir Record 필드 — JSON round-trip 후 소실 방지", () => {
  /**
   * 핵심 회귀 가드:
   *   HeirAllocationResult.perHeir가 Record<string, HeirTaxBreakdown>이면 보존 → GREEN
   *   Map<string, HeirTaxBreakdown>이면 {} 소실 → RED
   *
   * 이 테스트가 RED가 되면 perHeir가 Map으로 선언되었거나
   * 새 Map 필드가 HeirAllocationResult에 추가된 것이다 — 즉시 Record로 수정 필요.
   */
  const result = calcInheritanceTax(buildFullInput());
  const roundTripped = jsonRoundTripResult(result);

  it("SER-1-A: heirAllocationResult 존재 (배부 계산 완료)", () => {
    expect(result.heirAllocationResult).toBeDefined();
  });

  it("SER-1-B: perHeir가 JSON 후에도 존재 (소실되지 않음)", () => {
    const perHeir = roundTripped.heirAllocationResult?.perHeir;
    expect(perHeir).toBeDefined();
    // Map이면 JSON.stringify({}) → {}로 소실 → Object.keys([]).length=0 → RED
    expect(Object.keys(perHeir ?? {}).length).toBeGreaterThan(0);
  });

  it("SER-1-C: perHeir 모든 heir 키 보존 (spouse, child1, child2)", () => {
    const perHeir = roundTripped.heirAllocationResult?.perHeir;
    expect(perHeir).toBeDefined();
    // 3명 상속인의 키가 모두 보존되어야 함
    expect(perHeir!["spouse"]).toBeDefined();
    expect(perHeir!["child1"]).toBeDefined();
    expect(perHeir!["child2"]).toBeDefined();
  });

  it("SER-1-D: perHeir 값 필드 보존 (finalTax, computedTaxShare)", () => {
    const perHeir = roundTripped.heirAllocationResult?.perHeir;
    // 숫자 필드가 보존되어야 함
    expect(typeof perHeir!["spouse"].finalTax).toBe("number");
    expect(typeof perHeir!["child1"].computedTaxShare).toBe("number");
    expect(typeof perHeir!["child2"].taxBaseShare).toBe("number");
  });

  it("SER-1-E: perHeir 값이 원본과 동일 (소실 없이 완전 복원)", () => {
    const origPerHeir = result.heirAllocationResult!.perHeir;
    const rtPerHeir = roundTripped.heirAllocationResult!.perHeir;
    // spouse, child1, child2 finalTax가 모두 동일해야 함
    for (const id of ["spouse", "child1", "child2"]) {
      expect(rtPerHeir[id].finalTax).toBe(origPerHeir[id].finalTax);
      expect(rtPerHeir[id].computedTaxShare).toBe(origPerHeir[id].computedTaxShare);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SER-2: 최상위 result 스칼라 필드 — round-trip 후 보존
// ────────────────────────────────────────────────────────────────────────────

describe("SER-2: 최상위 result 스칼라 필드 — round-trip 보존", () => {
  const result = calcInheritanceTax(buildFullInput());
  const roundTripped = jsonRoundTripResult(result);

  it("SER-2-A: grossEstateValue 보존", () => {
    expect(roundTripped.grossEstateValue).toBe(result.grossEstateValue);
    expect(result.grossEstateValue).toBeGreaterThan(0);
  });

  it("SER-2-B: taxableEstateValue 보존", () => {
    expect(roundTripped.taxableEstateValue).toBe(result.taxableEstateValue);
  });

  it("SER-2-C: computedTax 보존 (§26 누진세율 결과)", () => {
    expect(roundTripped.computedTax).toBe(result.computedTax);
    expect(result.computedTax).toBeGreaterThan(0);
  });

  it("SER-2-D: finalTax 보존 (결정세액)", () => {
    expect(roundTripped.finalTax).toBe(result.finalTax);
    expect(result.finalTax).toBeGreaterThan(0);
  });

  it("SER-2-E: generationSkipSurcharge 보존 (0이어도 보존)", () => {
    expect(roundTripped.generationSkipSurcharge).toBe(result.generationSkipSurcharge);
  });

  it("SER-2-F: priorGiftAggregated 보존 (사전증여 합산액)", () => {
    expect(roundTripped.priorGiftAggregated).toBe(result.priorGiftAggregated);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SER-3: deductionDetail — round-trip 후 공제 상세 보존
// ────────────────────────────────────────────────────────────────────────────

describe("SER-3: deductionDetail — round-trip 후 공제 내역 보존", () => {
  const result = calcInheritanceTax(buildFullInput());
  const roundTripped = jsonRoundTripResult(result);

  it("SER-3-A: deductionDetail 존재", () => {
    expect(roundTripped.deductionDetail).toBeDefined();
  });

  it("SER-3-B: basicDeduction 보존", () => {
    expect(roundTripped.deductionDetail.basicDeduction).toBe(
      result.deductionDetail.basicDeduction,
    );
  });

  it("SER-3-C: spouseDeduction 보존", () => {
    expect(roundTripped.deductionDetail.spouseDeduction).toBe(
      result.deductionDetail.spouseDeduction,
    );
  });

  it("SER-3-D: totalDeduction 보존", () => {
    expect(roundTripped.totalDeduction).toBe(result.totalDeduction);
    expect(result.totalDeduction).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SER-4: valuationResults 배열 — round-trip 후 배열 보존
// ────────────────────────────────────────────────────────────────────────────

describe("SER-4: valuationResults 배열 — round-trip 후 보존", () => {
  const result = calcInheritanceTax(buildFullInput());
  const roundTripped = jsonRoundTripResult(result);

  it("SER-4-A: valuationResults 배열 존재 (소실 없음)", () => {
    expect(Array.isArray(roundTripped.valuationResults)).toBe(true);
  });

  it("SER-4-B: valuationResults 항목 수 동일", () => {
    expect(roundTripped.valuationResults.length).toBe(result.valuationResults.length);
    // 자산 2개 → 평가 결과 2개 이상이어야 함 (비trivial)
    expect(result.valuationResults.length).toBeGreaterThan(0);
  });

  it("SER-4-C: valuationResults 첫 항목 valuatedAmount 보존", () => {
    const firstOrig = result.valuationResults[0];
    const firstRt = roundTripped.valuationResults[0];
    expect(firstRt.valuatedAmount).toBe(firstOrig.valuatedAmount);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SER-5: 구조적 Map 소실 탐지기 — result 전체 순환하여 Map 인스턴스 없음 확인
// ────────────────────────────────────────────────────────────────────────────

describe("SER-5: result 직렬화 구조 가드 — Map 인스턴스 전수 탐지", () => {
  /**
   * 회귀 방어: result 객체 트리를 순환하여 Map 인스턴스를 발견하면 RED.
   * 새로운 필드가 Map 타입으로 추가되면 이 테스트가 RED가 되어 즉시 알림.
   *
   * 이 테스트가 GREEN이면 result가 JSON.stringify에 의해 완전히 직렬화 가능함을 보장한다.
   */

  function collectMaps(
    obj: unknown,
    path: string,
    found: string[],
    seen: WeakSet<object>,
  ): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== "object") return;
    if (seen.has(obj as object)) return; // 순환 참조 방지
    seen.add(obj as object);

    if (obj instanceof Map) {
      found.push(path);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) =>
        collectMaps(item, `${path}[${idx}]`, found, seen),
      );
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      collectMaps(value, `${path}.${key}`, found, seen);
    }
  }

  const result = calcInheritanceTax(buildFullInput());

  it("SER-5-A: InheritanceTaxResult에 Map 인스턴스 없음 (JSON 직렬화 가능)", () => {
    const mapPaths: string[] = [];
    const seen = new WeakSet<object>();
    collectMaps(result, "result", mapPaths, seen);

    // Map이 발견되면 경로 목록과 함께 실패 → 즉시 Record로 수정 필요
    expect(mapPaths).toEqual([]);
  });

  it("SER-5-B: JSON.parse(JSON.stringify(result)) 후 finalTax 보존 (직렬화 완전성)", () => {
    const rt = JSON.parse(JSON.stringify(result)) as InheritanceTaxResult;
    expect(rt.finalTax).toBe(result.finalTax);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SER-6: generationSkipDetail — round-trip 후 보존 (할증 없는 케이스)
// ────────────────────────────────────────────────────────────────────────────

describe("SER-6: generationSkipDetail — round-trip 후 null 또는 객체 보존", () => {
  const result = calcInheritanceTax(buildFullInput());
  const roundTripped = jsonRoundTripResult(result);

  it("SER-6-A: generationSkipDetail null 보존 (할증 없는 케이스)", () => {
    // 할증이 없는 경우 null이어야 하며 round-trip 후에도 null 유지
    if (result.generationSkipDetail === null) {
      expect(roundTripped.generationSkipDetail).toBeNull();
    } else {
      // 할증이 있는 경우 rows 배열 보존
      expect(Array.isArray(roundTripped.generationSkipDetail?.rows)).toBe(true);
    }
  });

  it("SER-6-B: generationSkipSurcharge 숫자 보존", () => {
    expect(roundTripped.generationSkipSurcharge).toBe(result.generationSkipSurcharge);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SER-7: 비어있는 input으로 계산한 result — 최소 케이스 round-trip
// ────────────────────────────────────────────────────────────────────────────

describe("SER-7: 최소 케이스(사전증여 없음) — round-trip 후 결과 보존", () => {
  /**
   * 가장 단순한 케이스: 자산 5억, 자녀 1명, 사전증여 없음
   * 일괄공제(5억)로 과세표준=0 → finalTax=0
   * round-trip 후에도 0이 보존되어야 함 (undefined로 소실되지 않음)
   */
  const minHeirs: Heir[] = [
    { id: "h1", relation: "child", name: "자녀", isHeir: true },
  ];
  const minInput: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2026-06-01",
    estateItems: [
      { id: "e1", category: "cash", name: "현금", marketValue: 500_000_000 },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs: minHeirs,
    deductionInput: { heirs: minHeirs },
    creditInput: { isFiledOnTime: true },
  };

  const result = calcInheritanceTax(minInput);
  const roundTripped = jsonRoundTripResult(result);

  it("SER-7-A: 과세표준 0원 케이스 finalTax=0 (일괄공제 5억)", () => {
    expect(result.finalTax).toBe(0);
  });

  it("SER-7-B: round-trip 후 finalTax=0 보존 (undefined로 소실 없음)", () => {
    expect(roundTripped.finalTax).toBe(0);
  });

  it("SER-7-C: round-trip 후 grossEstateValue=5억 보존", () => {
    expect(roundTripped.grossEstateValue).toBe(500_000_000);
  });
});
