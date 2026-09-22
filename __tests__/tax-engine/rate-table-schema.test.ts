/**
 * rate-table.schema — 누진세율 bracket 정렬 강제 회귀 테스트.
 *
 * calculateProgressiveTax(tax-utils)·calcTax(transfer-tax-rate-calc)는 brackets를
 * `taxBase <= max` 순회 첫 매칭으로 사용하므로 max 오름차순 정렬이 전제다.
 * DB seed가 정렬 안 된 brackets를 주입해도 progressiveRateSchema.transform이
 * 파싱 시점에 정렬해 silent 세액 오류를 차단해야 한다.
 */

import { describe, it, expect } from "vitest";
import {
  parseProgressiveRate,
  parseHouseCountExclusion,
} from "@/lib/tax-engine/schemas/rate-table.schema";

describe("progressiveRateSchema — bracket 오름차순 정렬 강제", () => {
  it("역순 입력 brackets를 max 오름차순으로 정렬 (최상위 max 없음 = Infinity 후순위)", () => {
    const parsed = parseProgressiveRate({
      brackets: [
        { min: 0, rate: 0.45, deduction: 65_400_000 },                // 최상위 (max 생략)
        { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },        // 최하위
        { min: 0, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
      ],
    });
    const maxes = parsed.brackets.map((b) => b.max ?? Infinity);
    expect(maxes).toEqual([14_000_000, 50_000_000, Infinity]);
  });

  it("정렬 후 순회 첫 매칭이 정확 — taxBase 10,000,000은 6% 구간 (역순 입력 방어)", () => {
    const parsed = parseProgressiveRate({
      brackets: [
        { min: 0, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
        { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 }, // 역순
      ],
    });
    const first = parsed.brackets.find((b) => 10_000_000 <= (b.max ?? Infinity));
    // 정렬 안 됐으면 50M(15%)이 먼저 매칭되어 틀림 → 정렬 후 14M(6%)이 정답
    expect(first?.rate).toBe(0.06);
  });

  it("이미 정렬된 입력은 순서 보존 (동작 불변)", () => {
    const parsed = parseProgressiveRate({
      brackets: [
        { min: 0, max: 14_000_000, rate: 0.06, deduction: 0 },
        { min: 0, max: 50_000_000, rate: 0.15, deduction: 1_260_000 },
        { min: 0, rate: 0.45, deduction: 65_400_000 },
      ],
    });
    expect(parsed.brackets.map((b) => b.rate)).toEqual([0.06, 0.15, 0.45]);
  });
});

// ============================================================
// houseCountExclusionSchema — 폐기 키 제거 하위호환 (2026-09-22)
// ============================================================

/**
 * `rentalHousingExempt`·`inheritedHouseYears`를 타입·Zod·seed에서 **제거**했다.
 * 둘 다 같은 D16(`60225941`)에서 같은 방식으로 끊긴 형제다. D16이 종전
 * `countEffectiveHouses`의 「배제 2: 장기임대 등록주택 (말소 전)」 블록을 옮길 때 그 게이트를
 * 함께 옮기지 않아 프로덕션 소비처가 0건이 됐고, seed 값이 항상 `true`라 동작 변화는 없었지만
 * **DB에서 바꿔도 아무 일이 없는 침묵 no-op 노브**였다(`inheritedHouseYears`의 정본은
 * 엔진 상수 `INHERITED_HOUSE_SURCHARGE_YEARS`다).
 *
 * 🔑 제거의 위험은 **파싱**에 있다 — `parseHouseCountExclusion`은 `safeParse` 실패 시
 *   `TaxRateValidationError`를 **throw**한다(계산 전체가 죽는다). Supabase `tax_rates`의
 *   기존 row는 아직 이 키를 **갖고 있으므로**, 스키마가 그 여분 키를 거부하면 안 된다.
 *   `z.object`는 기본 non-strict라 strip하지만, 나중에 누가 `.strict()`를 붙이면 조용히 깨진다
 *   ⇒ HC-1이 그 경계를 고정한다.
 */
const HOUSE_COUNT_RULES = {
  type: "house_count_exclusion",
  lowPriceThreshold: { capital: null, non_capital: 300_000_000 },
  presaleRightStartDate: "2021-01-01",
  officetelStartDate: "2022-01-01",
} as const;

describe("houseCountExclusionSchema — 폐기 키 하위호환", () => {
  it("HC-1 레거시 DB row(폐기 키를 아직 가진 row)도 파싱된다 — strip, 거부 아님", () => {
    const parsed = parseHouseCountExclusion({
      ...HOUSE_COUNT_RULES,
      rentalHousingExempt: true,
      inheritedHouseYears: 5,
    });
    expect(parsed.presaleRightStartDate).toBe("2021-01-01");
    expect(parsed.lowPriceThreshold.non_capital).toBe(300_000_000);
    // 스키마에서 빠졌으므로 파싱 결과에 남지 않는다(살아 있는 노브로 오인 방지)
    expect("rentalHousingExempt" in parsed).toBe(false);
    expect("inheritedHouseYears" in parsed).toBe(false);
  });

  it("HC-2 폐기 키가 없는 새 row도 파싱된다 (제거는 느슨해지는 방향)", () => {
    expect(parseHouseCountExclusion(HOUSE_COUNT_RULES).presaleRightStartDate).toBe("2021-01-01");
  });

  it("HC-3 살아 있는 키가 빠지면 여전히 throw한다 (게이트가 죽지 않았다)", () => {
    const { presaleRightStartDate: _omit, ...missing } = HOUSE_COUNT_RULES;
    expect(() => parseHouseCountExclusion(missing)).toThrow();
  });
});
