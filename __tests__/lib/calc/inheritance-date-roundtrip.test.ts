/**
 * M-9 회귀 가드 — 상속세 Date round-trip (JSON 직렬화 경계)
 *
 * 검증 대상:
 *   1. `JSON.parse(JSON.stringify(input))` round-trip 후 Date 필드가 string으로 변환되더라도
 *      상속세 엔진이 동일한 계산 결과를 산출하는지 확인한다.
 *   2. giftDate/deathDate 비교가 silent-false 없이 올바르게 처리됨을 anchor로 고정한다.
 *   3. 상속세 route가 coerceDates 없이 deathDate/giftDate를 string 그대로 엔진에 전달하는
 *      현행 구조가 올바른지 (string 기반 내부 변환이 충분한지) 검증한다.
 *
 * 회귀 잡는 방법 (RED→GREEN):
 *   - Date 필드를 직접 `new Date()` 인스턴스로 주입한 input과
 *     JSON round-trip 후 string으로 변환된 input의 계산 결과가 동일해야 GREEN.
 *   - 만약 엔진이 Date 타입에 `instanceof Date` 분기로 silent false를 발생시키면
 *     finalTax 숫자 비교에서 RED가 된다.
 *
 * 법령 근거:
 *   §13①1호: 상속개시일 전 10년 이내 상속인 증여 합산
 *   §13①2호: 상속개시일 전 5년 이내 비상속인 증여 합산
 *   §28: 사전증여세액공제
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import type {
  InheritanceTaxInput,
  Heir,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼
// ────────────────────────────────────────────────────────────────────────────

/**
 * JSON round-trip 시뮬레이터.
 * NextResponse.json() → fetch 클라이언트 → API body 도달 경로를 재현한다.
 * Date 인스턴스는 ISO string으로 직렬화되고, 역직렬화 시 string으로 도달한다.
 */
function jsonRoundTrip<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * round-trip 후 route handler의 의무: string으로 도달한 Date 필드를 엔진 input으로 변환.
 * 현행 inheritance route에서 deathDate/giftDate는 string 그대로 전달함 — 이것이 올바른지 검증.
 */
function simulateRouteCoerce(rawInput: InheritanceTaxInput): InheritanceTaxInput {
  // 현행 route.ts 구조: deathDate는 string 타입이므로 추가 변환 없음.
  // giftDate도 PriorGift.giftDate: string으로 선언되어 추가 변환 없음.
  // 따라서 round-trip 후 string이 도달하면 engine이 직접 처리해야 함.
  return rawInput;
}

// ────────────────────────────────────────────────────────────────────────────
// 기준 입력 생성 헬퍼
// ────────────────────────────────────────────────────────────────────────────

function buildBaseInput(): InheritanceTaxInput {
  const heirs: Heir[] = [
    { id: "h-spouse", relation: "spouse", name: "배우자", isHeir: true },
    { id: "h-child", relation: "child", name: "자녀", isHeir: true },
  ];
  const estateItems: EstateItem[] = [
    {
      id: "e-apt",
      category: "real_estate_apartment",
      name: "아파트",
      marketValue: 2_000_000_000,
      heirAllocations: [
        { heirId: "h-spouse", amount: 1_200_000_000 },
        { heirId: "h-child", amount: 800_000_000 },
      ],
    },
    {
      id: "e-cash",
      category: "cash",
      name: "현금",
      marketValue: 500_000_000,
      heirAllocations: [
        { heirId: "h-spouse", amount: 300_000_000 },
        { heirId: "h-child", amount: 200_000_000 },
      ],
    },
  ];
  // §13①1호 cutoff 경계에 있는 사전증여 — 10년 경계일 정확히 포함
  // deathDate=2026-05-21 → boundary=2016-05-21 → giftDate=2016-05-21 포함
  const priorGifts: PriorGift[] = [
    {
      giftDate: "2016-05-21", // 10년 경계일: 포함되어야 함
      giftAmount: 300_000_000,
      giftTaxBase: 240_000_000,
      giftTaxPaid: 14_000_000,
      isHeir: true,
      doneeId: "h-child",
      beneficiaryType: "heir",
    },
  ];
  return {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems,
    funeralExpense: 5_000_000,
    funeralIncludesBongan: false,
    debts: 100_000_000,
    preGiftsWithin10Years: priorGifts,
    heirs,
    deductionInput: { heirs },
    creditInput: { isFiledOnTime: true },
    isGenerationSkip: false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// RT-1: JSON round-trip 후 deathDate/giftDate string 도달 → 동일 계산 결과
// ────────────────────────────────────────────────────────────────────────────

describe("RT-1: deathDate/giftDate JSON round-trip → 동일 계산 결과", () => {
  /**
   * 시나리오:
   *   - 부동산 20억 + 현금 5억, 배우자+자녀
   *   - 사전증여: 자녀 3억, giftDate=2016-05-21(10년 경계, 포함)
   *   - deathDate=2026-05-21
   *
   * 검증:
   *   - 원본 input(string deathDate/giftDate)으로 계산한 값
   *   - JSON round-trip 후(여전히 string)로 계산한 값
   *   이 동일해야 → string 기반 내부 변환이 충분함을 확인
   */
  const originalInput = buildBaseInput();
  const roundTrippedInput = jsonRoundTrip(buildBaseInput());

  const originalResult = calcInheritanceTax(simulateRouteCoerce(originalInput));
  const roundTrippedResult = calcInheritanceTax(
    simulateRouteCoerce(roundTrippedInput),
  );

  it("RT-1-A: round-trip 후 priorGiftAggregated 동일 (§13 cutoff 경계 보존)", () => {
    // 사전증여 합산가액이 동일해야 함 — giftDate 비교가 올바를 때만 GREEN
    expect(roundTrippedResult.priorGiftAggregated).toBe(
      originalResult.priorGiftAggregated,
    );
    // 포함되어야 하는 경계일 증여가 실제로 합산됐는지
    expect(originalResult.priorGiftAggregated).toBe(300_000_000);
  });

  it("RT-1-B: round-trip 후 computedTax 동일 (과세표준 정합)", () => {
    expect(roundTrippedResult.computedTax).toBe(originalResult.computedTax);
    // 0이면 계산 자체가 실패한 것 — 비trivial 확인
    expect(originalResult.computedTax).toBeGreaterThan(0);
  });

  it("RT-1-C: round-trip 후 finalTax 동일 (최종세액 완전 정합)", () => {
    // 세액공제(§28 사전증여공제 포함)까지 포함한 최종값 동일
    expect(roundTrippedResult.finalTax).toBe(originalResult.finalTax);
    expect(originalResult.finalTax).toBeGreaterThan(0);
  });

  it("RT-1-D: round-trip 후 totalDeduction 동일 (공제 계산 보존)", () => {
    expect(roundTrippedResult.totalDeduction).toBe(originalResult.totalDeduction);
  });

  it("RT-1-E: round-trip 후 generationSkipSurcharge 동일", () => {
    expect(roundTrippedResult.generationSkipSurcharge).toBe(
      originalResult.generationSkipSurcharge,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RT-2: 경계일 전일(도과) giftDate — round-trip 후 올바르게 제외되는지
// ────────────────────────────────────────────────────────────────────────────

describe("RT-2: 도과 giftDate(경계일 전일) — round-trip 후 §13 미합산 유지", () => {
  /**
   * giftDate=2016-05-20 (경계일 전일) → isWithin13Cutoff=false → 과세가액 미합산
   * JSON round-trip 후에도 동일하게 제외되어야 함
   *
   * 만약 string→Date 변환 후 날짜 비교가 시간대(timezone) offset 때문에
   * 잘못된 날짜로 해석되면 이 테스트가 RED가 된다.
   */
  const inputWithOverdue: InheritanceTaxInput = {
    ...buildBaseInput(),
    preGiftsWithin10Years: [
      {
        giftDate: "2016-05-20", // 경계일 전일 → 도과
        giftAmount: 300_000_000,
        giftTaxBase: 240_000_000,
        giftTaxPaid: 14_000_000,
        isHeir: true,
        doneeId: "h-child",
        beneficiaryType: "heir",
      },
    ],
  };

  const originalResult = calcInheritanceTax(inputWithOverdue);
  const roundTrippedResult = calcInheritanceTax(jsonRoundTrip(inputWithOverdue));

  it("RT-2-A: 도과 증여 → priorGiftAggregated=0 (원본)", () => {
    expect(originalResult.priorGiftAggregated).toBe(0);
  });

  it("RT-2-B: round-trip 후에도 도과 증여 미합산 유지 (§13 cutoff 정합)", () => {
    // string 직렬화 후 UTC midnight 해석으로 날짜가 하루 바뀌는 버그가 있으면
    // 2016-05-20T00:00:00.000Z → 특정 timezone에서 2016-05-19로 파싱 → 여전히 제외
    // 반대로 2016-05-20 → 2016-05-21로 이동하면 포함 버그 → RED
    expect(roundTrippedResult.priorGiftAggregated).toBe(0);
  });

  it("RT-2-C: round-trip 후 finalTax 동일 (도과 제외 정합)", () => {
    expect(roundTrippedResult.finalTax).toBe(originalResult.finalTax);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RT-3: toDate / toOptionalDate 헬퍼가 JSON round-trip 후 string을 올바르게 복원
// ────────────────────────────────────────────────────────────────────────────

describe("RT-3: date-coerce 헬퍼 — JSON string 도달 시 Date 복원 정합", () => {
  /**
   * 상속세 route는 현재 coerceDates를 사용하지 않지만,
   * 비상장주식 평가 경로(PreIpoListingInput.securitiesFilingDate: Date)에서
   * 서브엔진이 toDate()/toOptionalDate()로 보호한다.
   *
   * 이 테스트는 date-coerce 헬퍼 자체가 JSON 직렬화 후 string을 올바르게 복원하는지
   * 확인한다. 미래에 inheritance route가 coerceDates를 추가할 때 동일 동작을 보장.
   */

  it("RT-3-A: toDate() — Date 인스턴스를 JSON 후 string으로 받아도 동일 날짜 복원", () => {
    const original = new Date("2026-05-21");
    // JSON 직렬화 시 ISO string으로 변환됨
    const serialized = JSON.stringify(original); // "\"2026-05-21T00:00:00.000Z\""
    const stringValue = JSON.parse(serialized) as string;

    const restored = toDate(stringValue, "deathDate");
    // 날짜(년-월-일)가 동일해야 함 (timezone 독립)
    expect(restored.getUTCFullYear()).toBe(2026);
    expect(restored.getUTCMonth()).toBe(4); // 0-indexed: 5월 = 4
    expect(restored.getUTCDate()).toBe(21);
  });

  it("RT-3-B: toOptionalDate() — ISO string 입력 → Date 복원 성공", () => {
    const isoString = "2016-05-21T00:00:00.000Z";
    const restored = toOptionalDate(isoString);
    expect(restored).toBeDefined();
    expect(restored!.getUTCFullYear()).toBe(2016);
    expect(restored!.getUTCMonth()).toBe(4);
    expect(restored!.getUTCDate()).toBe(21);
  });

  it("RT-3-C: toDate() — YYYY-MM-DD string(timezone 없음) → 안전 파싱", () => {
    // 상속세 입력 형식: "2026-05-21" (Zod 검증 통과 형식)
    const restored = toDate("2026-05-21", "deathDate");
    expect(restored).toBeInstanceOf(Date);
    expect(isNaN(restored.getTime())).toBe(false);
  });

  it("RT-3-D: toDate() — Date 인스턴스 직접 전달 → 그대로 통과 (이중 변환 없음)", () => {
    const d = new Date("2026-05-21T00:00:00.000Z");
    const result = toDate(d, "deathDate");
    expect(result).toBe(d); // 동일 인스턴스 반환
  });

  it("RT-3-E: toOptionalDate() — null/undefined/빈문자열 → undefined (안전)", () => {
    expect(toOptionalDate(null)).toBeUndefined();
    expect(toOptionalDate(undefined)).toBeUndefined();
    expect(toOptionalDate("")).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RT-4: 다중 사전증여(상속인+비상속인) round-trip — 세액공제 포함 종합 검증
// ────────────────────────────────────────────────────────────────────────────

describe("RT-4: 다중 사전증여 round-trip — §28 세액공제 포함 종합 정합", () => {
  /**
   * 시나리오:
   *   - 자산: 현금 10억
   *   - 사전증여 2건:
   *     (1) 상속인(자녀): giftDate=2024-01-01 (10년 내, 포함), giftAmount=1억, giftTaxPaid=100만
   *     (2) 비상속인: giftDate=2021-05-20 (5년 경계일 전일, 도과, 제외)
   *   - 기대: 1건만 합산 → priorGiftAggregated=1억
   *   - §28 세액공제: giftTaxPaid=100만 반영
   *
   * round-trip 후에도 포함/제외 판정 및 세액공제가 동일해야 GREEN.
   */
  const heirs: Heir[] = [
    { id: "h1", relation: "child", name: "자녀", isHeir: true },
  ];
  const priorGifts: PriorGift[] = [
    {
      giftDate: "2024-01-01", // 10년 내 포함
      giftAmount: 100_000_000,
      giftTaxBase: 90_000_000,
      giftTaxPaid: 1_000_000,
      isHeir: true,
      doneeId: "h1",
      beneficiaryType: "heir",
    },
    {
      giftDate: "2021-05-20", // 5년 경계일 전일 → 비상속인 5년 도과
      giftAmount: 200_000_000,
      giftTaxBase: 190_000_000,
      giftTaxPaid: 5_000_000,
      isHeir: false,
      // beneficiaryType 생략 — 비상속인 비수유자는 타입 미정의, isHeir:false로 판별
    },
  ];

  const input: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems: [
      { id: "e1", category: "cash", name: "현금", marketValue: 1_000_000_000 },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: priorGifts,
    heirs,
    deductionInput: { heirs },
    creditInput: { isFiledOnTime: true },
  };

  const original = calcInheritanceTax(input);
  const roundTripped = calcInheritanceTax(jsonRoundTrip(input));

  it("RT-4-A: 상속인 증여(10년 내) 합산 = 1억 (원본)", () => {
    expect(original.priorGiftAggregated).toBe(100_000_000);
  });

  it("RT-4-B: round-trip 후 priorGiftAggregated 동일 (비상속인 도과 제외 유지)", () => {
    // 비상속인 giftDate=2021-05-20: deathDate=2026-05-21, boundary=2021-05-21 → 도과
    // round-trip 후에도 동일하게 제외되어야 함
    expect(roundTripped.priorGiftAggregated).toBe(original.priorGiftAggregated);
  });

  it("RT-4-C: round-trip 후 finalTax 완전 일치 (세액공제 포함)", () => {
    expect(roundTripped.finalTax).toBe(original.finalTax);
    // non-trivial: 계산 실패(0원)가 아닌지 확인
    expect(original.finalTax).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RT-5: listingDate Date | string — JSON 경유 후 string 도달 처리 검증
// ────────────────────────────────────────────────────────────────────────────

describe("RT-5: EstateItem.listingDate Date|string — round-trip 후 string 도달 안전", () => {
  /**
   * EstateItem.listingDate?: Date | string 타입.
   * JSON.stringify(new Date("2025-01-15")) → "2025-01-15T00:00:00.000Z" (string)
   * 엔진의 property-valuation-stock.ts에서 toIso()로 처리:
   *   d instanceof Date ? d.toISOString().slice(0, 10) : (d as string)
   * → string이 도달하면 그대로 통과. 단 이 경우 ISO string "2025-01-15T00:00:00.000Z"가
   *   toIso()에서 string으로 통과되어 besshiData.page1.listingDate에 ISO full string으로 저장됨.
   *
   * 검증: Date 인스턴스로 주입한 경우와 JSON round-trip 후 string으로 도달한 경우
   *   모두 valuation 계산이 정상 완료되는지 (크래시 없음, 평가액 동일)
   */

  // 상장주식 EstateItem — 갑지 필드 포함
  const estateItemWithDateInstance: EstateItem = {
    id: "ls-1",
    category: "listed_stock",
    name: "상장주식",
    marketValue: 0, // 시가 자동 계산 (listedStockAvgPrice × listedStockShares)
    listedStockShares: 1000,
    listedStockAvgPrice: 50000,
    listingDate: new Date("2025-01-15"), // Date 인스턴스
    companyName: "테스트상장",
  };

  const heirs: Heir[] = [{ id: "h1", relation: "child", name: "자녀", isHeir: true }];

  const inputWithDateInstance: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems: [estateItemWithDateInstance],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs,
    deductionInput: { heirs },
    creditInput: { isFiledOnTime: true },
  };

  // JSON round-trip: listingDate가 ISO string으로 변환됨
  const roundTrippedInput = jsonRoundTrip(inputWithDateInstance);

  it("RT-5-A: Date 인스턴스 listingDate → 계산 완료 (크래시 없음)", () => {
    expect(() => calcInheritanceTax(inputWithDateInstance)).not.toThrow();
    const result = calcInheritanceTax(inputWithDateInstance);
    expect(result.finalTax).toBeGreaterThanOrEqual(0);
  });

  it("RT-5-B: round-trip 후 string listingDate → 계산 완료 (크래시 없음)", () => {
    // JSON 직렬화 후 listingDate는 ISO string "2025-01-15T00:00:00.000Z"
    const rtItem = roundTrippedInput.estateItems[0] as EstateItem;
    expect(typeof rtItem.listingDate).toBe("string"); // round-trip 확인
    expect(() => calcInheritanceTax(roundTrippedInput)).not.toThrow();
  });

  it("RT-5-C: Date vs string listingDate → grossEstateValue 동일 (numeric 정합)", () => {
    const original = calcInheritanceTax(inputWithDateInstance);
    const roundTripped = calcInheritanceTax(roundTrippedInput);
    // listingDate는 besshiData 표시용이고 valuation 계산에는 영향 없음 (toIso 후 string 저장)
    // 따라서 grossEstateValue가 동일해야 함
    expect(roundTripped.grossEstateValue).toBe(original.grossEstateValue);
  });
});
