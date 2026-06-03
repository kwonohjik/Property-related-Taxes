/**
 * M-5 Pre-Do Anchor: §22 금융재산 rows↔base dual-truth 수정 전 실패 증거 + 수정 후 정합 검증
 *
 * 이슈: lib/tax-engine/inheritance-tax-financial-rows.ts buildPhaseDFinancialRows
 *   - unlisted_stock + isFinancialAssetForDeduction=undefined → rows 누락 (=== true만 포함)
 *   - deemedCategory=trust + trustType=cash_trust → else 분기 (=== true만) → rows 누락
 * 반면 실제 §22 공제 base(resolveFinancialEligibility):
 *   - unlisted_stock undefined → CATEGORY_DEFAULT true → 포함
 *   - cash_trust → deemedCategory override → 포함
 *
 * 목표: 수정 후 rows 합 == base self-consistency (numeric 영향 0)
 */

import { describe, expect, it } from "vitest";
import { buildPhaseDFinancialRows } from "@/lib/tax-engine/inheritance-tax-financial-rows";
import { resolveFinancialEligibility } from "@/lib/calc/financial-deduction-resolver";
import { resolveEstateItemValue } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

function asset(over: Partial<EstateItem>): EstateItem {
  return {
    id: over.id ?? "a1",
    category: over.category ?? "financial",
    name: over.name ?? "테스트 자산",
    ...over,
  };
}

/**
 * resolveFinancialEligibility 기반 base 계산 (단일 진실 기준값)
 * 부채·담보 없이 자산 합만 계산.
 */
function calcBase(items: EstateItem[]): number {
  return items.reduce((sum, item) => {
    if (!resolveFinancialEligibility(item)) return sum;
    const val = resolveEstateItemValue(item);
    return sum + Math.max(0, val);
  }, 0);
}

/** rows에서 자산 합계 (채무 rows 제외) */
function calcRowsAssetSum(rows: ReturnType<typeof buildPhaseDFinancialRows>): number {
  return rows
    .filter((r) => r.label !== "금융채무" && r.label !== "담보 금융저당")
    .reduce((s, r) => s + r.amount, 0);
}

// ============================================================
// M5-A: unlisted_stock, isFinancialAssetForDeduction=undefined
// Pre-Do: 수정 전 rows에 누락됨을 드러내는 케이스
// ============================================================

describe("[M5-A] unlisted_stock undefined → rows↔base 정합", () => {
  const items = [
    asset({
      id: "u1",
      category: "unlisted_stock",
      name: "비상장주식",
      marketValue: 100_000_000,
      // isFinancialAssetForDeduction: undefined (명시 없음 — CATEGORY_DEFAULT true)
    }),
  ];

  it("A-1: resolveFinancialEligibility(unlisted_stock, undefined) === true (base 포함)", () => {
    expect(resolveFinancialEligibility(items[0])).toBe(true);
  });

  it("A-2: buildPhaseDFinancialRows — rows 자산 합 == base (self-consistency)", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    const rowsSum = calcRowsAssetSum(rows);
    const base = calcBase(items);
    // 수정 전: rowsSum=0 (=== true 조건 miss), base=1억 → FAIL
    // 수정 후: rowsSum=1억 == base → PASS
    expect(rowsSum).toBe(base);
  });

  it("A-3: rows에 '기타금융' row 포함 (비상장주식 표시 레이블)", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    const financialRow = rows.find(
      (r) => r.label === "기타금융" || r.label === "비상장주식"
    );
    expect(financialRow?.amount).toBe(100_000_000);
  });
});

// ============================================================
// M5-B: deemedCategory=trust + trustType=cash_trust
// Pre-Do: 수정 전 else 분기 === true 조건으로 누락됨
// ============================================================

describe("[M5-B] deemedCategory=trust + trustType=cash_trust → rows↔base 정합", () => {
  const items = [
    asset({
      id: "t1",
      category: "other",
      name: "금전신탁",
      marketValue: 200_000_000,
      deemedCategory: "trust",
      trustType: "cash_trust",
      // isFinancialAssetForDeduction: undefined
    }),
  ];

  it("B-1: resolveFinancialEligibility(cash_trust, undefined) === true", () => {
    expect(resolveFinancialEligibility(items[0])).toBe(true);
  });

  it("B-2: rows 자산 합 == base (self-consistency)", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    const rowsSum = calcRowsAssetSum(rows);
    const base = calcBase(items);
    // 수정 전: rowsSum=0 (else 분기 === true 누락), base=2억 → FAIL
    // 수정 후: rowsSum=2억 == base → PASS
    expect(rowsSum).toBe(base);
  });

  it("B-3: cash_trust row가 '기타금융' 또는 '신탁' 레이블로 포함됨", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    const trustRow = rows.find(
      (r) => r.label === "기타금융" || r.label === "신탁"
    );
    expect(trustRow?.amount).toBe(200_000_000);
  });
});

// ============================================================
// M5-C: trust + real_estate → base 제외, rows도 제외 (회귀)
// ============================================================

describe("[M5-C] deemedCategory=trust + trustType=real_estate → 양쪽 모두 제외 (회귀)", () => {
  const items = [
    asset({
      id: "t2",
      category: "other",
      name: "부동산신탁",
      marketValue: 300_000_000,
      deemedCategory: "trust",
      trustType: "real_estate",
    }),
  ];

  it("C-1: resolveFinancialEligibility(real_estate trust) === false", () => {
    expect(resolveFinancialEligibility(items[0])).toBe(false);
  });

  it("C-2: rows 자산 합 == base == 0 (양쪽 제외 일관)", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    const rowsSum = calcRowsAssetSum(rows);
    const base = calcBase(items);
    expect(base).toBe(0);
    expect(rowsSum).toBe(0);
  });
});

// ============================================================
// M5-D: unlisted_stock + isFinancialAssetForDeduction=false → 양쪽 제외 (회귀)
// ============================================================

describe("[M5-D] unlisted_stock + 명시 false → 양쪽 제외 (회귀)", () => {
  const items = [
    asset({
      id: "u2",
      category: "unlisted_stock",
      name: "비상장주식(제외)",
      marketValue: 150_000_000,
      isFinancialAssetForDeduction: false,
    }),
  ];

  it("D-1: resolveFinancialEligibility(unlisted_stock, false) === false", () => {
    expect(resolveFinancialEligibility(items[0])).toBe(false);
  });

  it("D-2: rows 자산 합 == base == 0", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    expect(calcRowsAssetSum(rows)).toBe(0);
    expect(calcBase(items)).toBe(0);
  });
});

// ============================================================
// M5-E: §22② 최대주주 → 양쪽 제외 (기존 회귀)
// ============================================================

describe("[M5-E] §22② 최대주주 → rows↔base 양쪽 제외 (기존 회귀)", () => {
  const items = [
    asset({
      id: "ms1",
      category: "unlisted_stock",
      name: "비상장주식(최대주주)",
      marketValue: 500_000_000,
      isSection22MajorShareholder: true,
    }),
  ];

  it("E-1: resolveFinancialEligibility(최대주주) === false", () => {
    expect(resolveFinancialEligibility(items[0])).toBe(false);
  });

  it("E-2: rows 자산 합 == base == 0", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    expect(calcRowsAssetSum(rows)).toBe(0);
    expect(calcBase(items)).toBe(0);
  });
});

// ============================================================
// M5-F: 복합 — 혼합 자산 rows↔base 전체 정합
// ============================================================

describe("[M5-F] 복합 혼합 자산 — rows↔base 전체 self-consistency", () => {
  const items = [
    // financial (기존 정상 케이스)
    asset({ id: "f1", category: "financial", name: "예금", marketValue: 100_000_000 }),
    // listed_stock (기존 정상)
    asset({ id: "s1", category: "listed_stock", name: "상장주식", marketValue: 50_000_000 }),
    // insurance (deemedCategory=insurance — 기존 정상)
    asset({ id: "i1", category: "cash", name: "보험금", marketValue: 30_000_000, deemedCategory: "insurance" }),
    // unlisted_stock undefined (M5-A — 버그 케이스)
    asset({ id: "u1", category: "unlisted_stock", name: "비상장", marketValue: 80_000_000 }),
    // cash_trust (M5-B — 버그 케이스)
    asset({ id: "t1", category: "other", name: "금전신탁", marketValue: 40_000_000, deemedCategory: "trust", trustType: "cash_trust" }),
    // real_estate_trust (제외)
    asset({ id: "t2", category: "other", name: "부동산신탁", marketValue: 20_000_000, deemedCategory: "trust", trustType: "real_estate" }),
    // 최대주주 (제외)
    asset({ id: "ms1", category: "unlisted_stock", name: "비상장주식(최대)", marketValue: 200_000_000, isSection22MajorShareholder: true }),
    // 토지 (제외)
    asset({ id: "re1", category: "real_estate_land", name: "토지", marketValue: 300_000_000 }),
  ];

  const expectedBase = 100_000_000 + 50_000_000 + 30_000_000 + 80_000_000 + 40_000_000;
  // = 300,000,000

  it("F-1: base 계산값 = 3억 (unlisted_stock + cash_trust 포함, 나머지 제외)", () => {
    expect(calcBase(items)).toBe(expectedBase);
  });

  it("F-2: rows 자산 합 == base (3억, self-consistency)", () => {
    const rows = buildPhaseDFinancialRows(items, [], []);
    const rowsSum = calcRowsAssetSum(rows);
    // 수정 전: rowsSum = 1억(예금)+5천(상장)+3천(보험) = 1.8억 (비상장·신탁 누락)
    // 수정 후: rowsSum = 3억 == base
    expect(rowsSum).toBe(expectedBase);
  });
});

// ============================================================
// M5-G: 세액 불변 검증 — rows는 표시 전용, 세액 영향 없음
// (scalar netFinancialAssets는 resolveFinancialEligibility 기반 — 변경 없음)
// ============================================================

describe("[M5-G] 세액 불변 검증 (rows=표시 전용, 세액 scalar 변경 없음)", () => {
  /**
   * buildPhaseDFinancialRows는 표시용 rows만 반환.
   * 실제 §22 공제액은 inheritance-tax.ts → suggestNetFinancialAssets → scalar 경로.
   * rows 수정은 scalar에 영향 없음 → 세액 불변.
   *
   * 이 테스트는 resolveFinancialEligibility가 buildPhaseDFinancialRows 수정 전후
   * 동일한 결과를 반환함(scalar base 불변)을 확인.
   */
  it("G-1: resolveFinancialEligibility 결과는 rows 수정과 무관하게 불변", () => {
    const unlisted = asset({ id: "u1", category: "unlisted_stock", marketValue: 100_000_000 });
    const cashTrust = asset({
      id: "t1", category: "other", marketValue: 50_000_000,
      deemedCategory: "trust", trustType: "cash_trust",
    });
    // resolveFinancialEligibility는 rows가 아닌 엔진 scalar 경로에서만 사용
    // rows 수정 여부와 무관하게 true (이 케이스들은 항상 포함)
    expect(resolveFinancialEligibility(unlisted)).toBe(true);
    expect(resolveFinancialEligibility(cashTrust)).toBe(true);
  });
});
